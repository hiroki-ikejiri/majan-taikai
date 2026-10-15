// 卓割り。予選は全員となるべく 1 回以上当たり、同じ人とは何度も当たらないように組み、決勝は成績順に組む

export const TABLE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// 再現できる乱数（テストで結果を固定するため）
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// 1 回戦ぶんの卓の偏り。同じ人とまた当たる回数の合計（小さいほど良い）。
// どのグループを A 卓にするかは同卓の相手に関係ないので、ここでは見ない（あとで assignTableLabels で決める）
function roundCost(tables, meets) {
  let cost = 0;
  tables.forEach((table) => {
    for (let i = 0; i < table.length; i += 1) {
      for (let j = i + 1; j < table.length; j += 1) cost += meets.get(pairKey(table[i], table[j])) || 0;
    }
  });
  return cost;
}

// 1 回戦ぶんの卓を作る。ランダムに 4 人ずつ分けたあと、
// 別の卓の 2 人を入れ替えて偏りが減るなら入れ替える、を減らなくなるまで繰り返す
function buildRound(playerIds, meets, random) {
  const shuffled = shuffle(playerIds, random);
  const tables = [];
  for (let i = 0; i < shuffled.length; i += 4) tables.push(shuffled.slice(i, i + 4));
  let cost = roundCost(tables, meets);
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < tables.length; a += 1) {
      for (let b = a + 1; b < tables.length; b += 1) {
        for (let i = 0; i < 4; i += 1) {
          for (let j = 0; j < 4; j += 1) {
            [tables[a][i], tables[b][j]] = [tables[b][j], tables[a][i]];
            const c = roundCost(tables, meets);
            if (c < cost) {
              cost = c;
              improved = true;
            } else {
              [tables[a][i], tables[b][j]] = [tables[b][j], tables[a][i]];
            }
          }
        }
      }
    }
  }
  return { tables, cost };
}

function addMeets(meets, tables) {
  tables.forEach((table) => {
    for (let i = 0; i < table.length; i += 1) {
      for (let j = i + 1; j < table.length; j += 1) {
        const k = pairKey(table[i], table[j]);
        meets.set(k, (meets.get(k) || 0) + 1);
      }
    }
  });
}

function addSeatCounts(seatCounts, tables) {
  tables.forEach((table, k) => {
    table.forEach((p) => {
      const counts = seatCounts.get(p) || [];
      counts[k] = (counts[k] || 0) + 1;
      seatCounts.set(p, counts);
    });
  });
}

// 予選の卓割りのたたき台を 1 通り作る。1 回戦ずつ、何通りか試して一番偏りの少ない組み方を選ぶ。
// A 卓・B 卓…の割り当てはまだしない（全体を見直したあとで assignTableLabels で決める）
function buildSchedule(playerIds, roundCount, random, tries) {
  const meets = new Map();
  const schedule = [];
  for (let r = 0; r < roundCount; r += 1) {
    let best = null;
    for (let t = 0; t < tries; t += 1) {
      const candidate = buildRound(playerIds, meets, random);
      if (!best || candidate.cost < best.cost) best = candidate;
      if (best.cost === 0) break;
    }
    addMeets(meets, best.tables);
    schedule.push(best.tables);
  }
  return schedule;
}

// 同じ 2 人が同卓した回数ごとの罰点。
// 3 回以上はとても重く、一度も当たらないのは 1 点、2 回目は少しだけ（ほかの人と当たる機会を減らすので）
function pairPenalty(v) {
  if (v === 0) return 1;
  if (v === 1) return 0;
  return 0.3 + 20 * (v - 2) ** 2;
}

// 「当たらない相手の数」が人によって偏らないようにするための重み（当たらない相手の数の 2 乗にかける）
const UNMET_SPREAD_WEIGHT = 0.05;

// 卓割り全体を見直して、全員となるべく当たるようにする（焼きなまし法）。
// 別の卓の 2 人を入れ替えてみて、罰点が減れば採用する。最初のうちは罰点が少し増える入れ替えも
// たまに採用し（行き詰まりから抜け出すため）、だんだん採用しにくくしていく。
// 1 回戦ずつ決めるやり方では後半の回戦で「まだ当たっていない人」が残りにくいので、全回戦まとめて見直す。
// 探す量は timeLimitMs（ミリ秒）があれば時間で、なければ iterations（入れ替えを試す回数）で決める。
// 時間で決めると端末の速さで結果が変わるので、テストでは iterations を使う
function improveSchedule(schedule, random, { iterations, timeLimitMs, goal }) {
  const tableCount = schedule[0]?.length || 0;
  if (tableCount < 2 || !(timeLimitMs > 0 || iterations > 0)) return { schedule, cost: 0, done: true };

  // 計算を速くするため、プレイヤーを 0, 1, 2… の番号に置き換える
  const ids = schedule[0].flat();
  const indexOf = new Map(ids.map((p, i) => [p, i]));
  const rounds = schedule.map((tables) => tables.map((t) => t.map((p) => indexOf.get(p))));
  const n = ids.length;
  const meets = Array.from({ length: n }, () => new Int32Array(n)); // meets[a][b] = a と b が同卓した回数
  const unmet = new Int32Array(n).fill(n - 1); // unmet[a] = a がまだ当たっていない相手の数
  let unmetPairs = (n * (n - 1)) / 2; // 一度も当たっていない組の数
  let overMeetPairs = 0; // 3 回以上当たっている組の数
  // 罰点の合計。最初は誰とも当たっていない状態から始めて、bump の増減を足していく
  let cost = unmetPairs * pairPenalty(0) + UNMET_SPREAD_WEIGHT * n * (n - 1) ** 2;

  // p の「当たっていない相手の数」を diff だけ変え、罰点の増減を返す
  const changeUnmet = (p, diff) => {
    const before = unmet[p];
    unmet[p] = before + diff;
    return UNMET_SPREAD_WEIGHT * (unmet[p] * unmet[p] - before * before);
  };
  // a と b の同卓回数を diff だけ変え、罰点の増減を返す
  const bump = (a, b, diff) => {
    const before = meets[a][b];
    const after = before + diff;
    meets[a][b] = after;
    meets[b][a] = after;
    let delta = pairPenalty(after) - pairPenalty(before);
    const unmetDiff = (after === 0 ? 1 : 0) - (before === 0 ? 1 : 0);
    if (unmetDiff !== 0) {
      delta += changeUnmet(a, unmetDiff) + changeUnmet(b, unmetDiff);
      unmetPairs += unmetDiff;
    }
    overMeetPairs += (after >= 3 ? 1 : 0) - (before >= 3 ? 1 : 0);
    cost += delta;
    return delta;
  };
  rounds.forEach((tables) => tables.forEach((t) => {
    for (let i = 0; i < t.length; i += 1) for (let j = i + 1; j < t.length; j += 1) bump(t[i], t[j], 1);
  }));

  // x を卓 from から卓 to へ、y を卓 to から卓 from へ動かしたときの同卓回数の変化を反映する。
  // sign に -1 を渡すと、反映した変化を取り消す（from・to の中身はどちらの場合もまだ入れ替える前のもの）
  const swapMeets = (from, to, x, y, sign = 1) => {
    let delta = 0;
    from.forEach((p) => {
      if (p === x) return;
      delta += bump(x, p, -sign);
      delta += bump(y, p, sign);
    });
    to.forEach((p) => {
      if (p === y) return;
      delta += bump(y, p, -sign);
      delta += bump(x, p, sign);
    });
    return delta;
  };

  const pick = (k) => Math.floor(random() * k);
  const tableOf = (tables, p) => tables.findIndex((t) => t.includes(p));

  // ランダムな入れ替えの候補。ある回戦の別々の卓から 1 人ずつ選ぶ
  const randomMove = () => {
    const tables = rounds[pick(rounds.length)];
    const ta = pick(tableCount);
    let tb = pick(tableCount - 1);
    if (tb >= ta) tb += 1;
    return { from: tables[ta], to: tables[tb], i: pick(4), j: pick(4) };
  };
  // まだ当たっていない 2 人（a と b）を、ある回戦で同じ卓にする入れ替えの候補。
  // a の卓の誰か（a 以外）と b を入れ替える。候補が作れないときは null
  const meetMove = () => {
    const a = pick(n);
    if (unmet[a] === 0) return null;
    const candidates = [];
    for (let b = 0; b < n; b += 1) if (b !== a && meets[a][b] === 0) candidates.push(b);
    const b = candidates[pick(candidates.length)];
    const tables = rounds[pick(rounds.length)];
    const ta = tableOf(tables, a);
    const tb = tableOf(tables, b);
    if (ta === tb) return null;
    let i = pick(3);
    if (i >= tables[ta].indexOf(a)) i += 1;
    return { from: tables[ta], to: tables[tb], i, j: tables[tb].indexOf(b) };
  };

  // 探索の途中で一番罰点が低かった状態を覚えておく（最後の状態がそれより悪いことがあるため）
  const snapshot = () => rounds.map((tables) => tables.map((t) => t.map((i) => ids[i])));
  let best = snapshot();
  let bestCost = cost;
  let done = false; // これ以上は良くならないところまで来たか

  // 探索がどこまで進んだか（0 から 1）。時間で決めるときは、時刻を見るのを 1024 回に 1 回にする（時刻の取得は遅いので）
  const startedAt = performance.now();
  const progressAt = (it) => (timeLimitMs > 0 ? (performance.now() - startedAt) / timeLimitMs : it / iterations);
  let progress = 0;
  let improvedAt = 0; // 最後に一番良い状態が更新されたときの進み具合

  const startTemp = 1;
  const endTemp = 0.02;
  let temp = startTemp;
  for (let it = 0; progress < 1; it += 1) {
    // 半分はランダムに、半分は「まだ当たっていない 2 人を同じ卓にする」入れ替えを試す
    const move = (random() < 0.5 && meetMove()) || randomMove();
    const { from, to, i, j } = move;
    const x = from[i];
    const y = to[j];
    const delta = swapMeets(from, to, x, y);
    if (delta <= 0 || random() < Math.exp(-delta / temp)) {
      from[i] = y;
      to[j] = x;
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = snapshot();
        improvedAt = progress;
        // 当たれない組も 3 回以上当たる組も下限まで減れば、これ以上は良くならない
        if (unmetPairs <= goal.unmetPairs && overMeetPairs <= goal.overMeetPairs) {
          done = true;
          break;
        }
      }
    } else {
      swapMeets(from, to, x, y, -1);
    }
    if (timeLimitMs > 0 && it % 1024 !== 0) continue;
    progress = progressAt(it + 1);
    // 全体の 4 分の 1 のあいだ良くならなければ打ち切る（人数が少なく、下限まで届かない場合など）
    if (progress - improvedAt > 0.25) break;
    temp = startTemp * (endTemp / startTemp) ** progress;
  }
  return { schedule: best, cost: bestCost, done };
}

// 並べ方をすべて列挙する（卓が 4 つ以下のときに使う）
function permutations(n) {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}

// 卓の偏りの点数。「同じ卓に最も多く座った回数」を一番重く見て、次に全体のばらつきを見る
function seatScore(schedule) {
  const seats = [...countSeats(schedule).values()].flat().filter(Boolean);
  return Math.max(0, ...seats) * 1e5 + seats.reduce((sum, v) => sum + v * v, 0);
}

// 1 回戦ぶんのグループの並べ方の候補（卓が 4 つ以下なら全通り、多ければ一部をランダムに）
function labelOrders(tableCount, random) {
  if (tableCount <= 4) return permutations(tableCount);
  return Array.from({ length: 60 }, () => shuffle(Array.from({ length: tableCount }, (_, i) => i), random));
}

// 各回戦のグループに A 卓・B 卓…を割り当て直して、同じ卓に座り続ける人が出ないようにする。
// どのグループを A 卓にしても同卓の相手は変わらないので、ここでは卓の偏りだけを見る。
// ほかの回戦を固定して 1 回戦ずつ一番良い並べ方を選ぶ、を何度か繰り返し、
// 行き詰まりを避けるために最初の並べ方を変えて何回かやり直す
function assignTableLabels(schedule, random) {
  const tableCount = schedule[0]?.length || 0;
  const orders = labelOrders(tableCount, random);
  let best = schedule;
  let bestScore = seatScore(schedule);
  for (let restart = 0; restart < 4; restart += 1) {
    let result = restart === 0 ? schedule.map((t) => [...t]) : schedule.map((t) => shuffle(t, random));
    let score = seatScore(result);
    for (let pass = 0; pass < 10; pass += 1) {
      let changed = false;
      for (let r = 0; r < result.length; r += 1) {
        const tables = result[r];
        orders.forEach((order) => {
          const trial = [...result];
          trial[r] = order.map((g) => tables[g]);
          const sc = seatScore(trial);
          if (sc < score) {
            score = sc;
            result = trial;
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (score < bestScore) {
      bestScore = score;
      best = result;
    }
  }
  return best;
}

// 一度も同卓しない 2 人の組の数
export function countUnmetPairs(schedule) {
  const n = schedule[0]?.flat().length || 0;
  return (n * (n - 1)) / 2 - countMeets(schedule).size;
}

// 見直しの目標（これ以上は良くならない下限）。
//   unmetPairs: 卓の席が足りずに、どう組んでも一度も当たれない組の数
//   overMeetPairs: 回数が多すぎて、どう組んでも 3 回以上当たってしまう組の数（人数が少ないときに出る）
function scheduleGoal(playerCount, roundCount) {
  const pairs = (playerCount * (playerCount - 1)) / 2;
  const meetSlots = roundCount * (playerCount / 4) * 6; // 1 卓で 6 組が当たる
  return {
    unmetPairs: Math.max(0, pairs - meetSlots),
    overMeetPairs: Math.max(0, meetSlots - pairs * 2),
  };
}

// 全員と 1 回以上同卓するのに最低限いる予選の回数（1 回戦で当たれるのは 3 人なので、相手の人数 ÷ 3 の切り上げ）
export function roundsToMeetAll(playerCount) {
  return Math.max(1, Math.ceil((playerCount - 1) / 3));
}

// 時間で決めるとき、やり直しが続けて何回良くならなければ終わるか
const MAX_RETRY_FAILURES = 2;

// 予選の卓割りをまとめて作る。戻り値は [回戦][卓] = [プレイヤー ID × 4]（卓の順が A 卓、B 卓…）。
// 全員となるべく 1 回以上当たり（回数が足りれば全員と当たる）、同じ人と何度も当たらず、
// 同じ卓に座り続けないように組む。手順は次のとおり
//   1. 1 回戦ずつ決めるやり方でたたき台を作る
//   2. たたき台を全回戦まとめて見直す（improveSchedule）
//   3. 各回戦のグループに A 卓・B 卓…を割り当てる
// 見直しに使う量は timeLimitMs（ミリ秒）か iterations（入れ替えを試す回数）で決める。
// 多いほど良い組み方が見つかりやすいが時間がかかる。全員と当たる組み方が見つかればその時点で終わる
export function makePrelimSchedule(
  playerIds,
  roundCount,
  { random = Math.random, tries = 20, iterations = 3_000_000, timeLimitMs } = {},
) {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error('参加人数は 4 の倍数にしてください');
  }
  const draft = buildSchedule(playerIds, roundCount, random, tries);
  const goal = scheduleGoal(playerIds.length, roundCount);
  if (!(timeLimitMs > 0)) {
    return assignTableLabels(improveSchedule(draft, random, { iterations, goal }).schedule, random);
  }
  // 時間で決めるときは、途中で行き詰まって打ち切られても時間が余っていれば、一番良かった状態からやり直す。
  // やり直しても続けて良くならないときは、それ以上は望めないとみて終わる（人数が少ないときなど）
  const deadline = performance.now() + timeLimitMs;
  let best = { schedule: draft, cost: Infinity, done: false };
  let failures = 0;
  while (!best.done && failures < MAX_RETRY_FAILURES) {
    const remaining = deadline - performance.now();
    if (remaining < 100) break;
    const result = improveSchedule(best.schedule, random, { timeLimitMs: remaining, goal });
    if (result.cost < best.cost - 1e-9) {
      best = result;
      failures = 0;
    } else {
      failures += 1;
    }
  }
  return assignTableLabels(best.schedule, random);
}

// 各プレイヤーが何番目の卓に何回座ったか（確認・テスト用）。戻り値は Map(プレイヤー → [A 卓の回数, B 卓の回数…])
export function countSeats(schedule) {
  const seatCounts = new Map();
  schedule.forEach((tables) => addSeatCounts(seatCounts, tables));
  return seatCounts;
}

// 決勝の卓割り。順位表（上位から並んだ ID）を 4 人ずつ A 卓、B 卓…に入れる
export function makeFinalTables(rankedPlayerIds) {
  const tables = [];
  for (let i = 0; i < rankedPlayerIds.length; i += 4) {
    tables.push(rankedPlayerIds.slice(i, i + 4));
  }
  return tables;
}

// 同じ 2 人が何回同卓したかの集計（確認・テスト用）
export function countMeets(schedule) {
  const meets = new Map();
  schedule.forEach((tables) => addMeets(meets, tables));
  return meets;
}
