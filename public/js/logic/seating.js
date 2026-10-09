// 卓割り。予選は同じ人となるべく当たらないように組み、決勝は成績順に組む

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

// 予選の卓割りを 1 通り作る。1 回戦ずつ、何通りか試して一番偏りの少ない組み方を選ぶ
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
  return assignTableLabels(schedule, random);
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

// 卓割り全体の偏りの点数（小さいほど良い）。
// 「同じ人と最も多く当たった回数」を一番重く見て、次に「同じ卓に最も多く座った回数」、最後に全体のばらつきを見る
export function scheduleScore(schedule) {
  const meets = [...countMeets(schedule).values()];
  const seats = [...countSeats(schedule).values()].flat().filter(Boolean);
  const sq = (list) => list.reduce((sum, v) => sum + v * v, 0);
  return Math.max(0, ...meets) * 1e8 + Math.max(0, ...seats) * 1e5 + sq(meets) * 4 + sq(seats);
}

// 予選の卓割りをまとめて作る。戻り値は [回戦][卓] = [プレイヤー ID × 4]（卓の順が A 卓、B 卓…）。
// 同じ人となるべく当たらず、同じ卓に座り続けないように組む。
// 1 回戦ずつ決めていくと後の回戦で行き詰まることがあるので、全体を何通りか作って一番偏りの少ないものを選ぶ
export function makePrelimSchedule(playerIds, roundCount, { random = Math.random, tries = 20, attempts } = {}) {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error('参加人数は 4 の倍数にしてください');
  }
  // 人数が多いほど 1 通り作るのに時間がかかるので、作る回数を減らす
  const n = attempts ?? Math.max(3, Math.min(30, Math.floor(3000 / (playerIds.length * playerIds.length))));
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < n; i += 1) {
    const schedule = buildSchedule(playerIds, roundCount, random, tries);
    const score = scheduleScore(schedule);
    if (score < bestScore) {
      bestScore = score;
      best = schedule;
    }
  }
  return best;
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
