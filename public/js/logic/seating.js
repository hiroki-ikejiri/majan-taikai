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

// 1 回戦ぶんの卓を、これまでの同卓回数（meets）が少なくなるように組む
function buildRound(playerIds, meets, random) {
  const rest = shuffle(playerIds, random);
  const tables = [];
  let cost = 0;
  while (rest.length) {
    const table = [rest.shift()];
    while (table.length < 4) {
      // 今の卓メンバーとの同卓回数の合計が最小の人を選ぶ
      let bestIdx = 0;
      let bestCost = Infinity;
      rest.forEach((p, idx) => {
        const c = table.reduce((sum, q) => sum + (meets.get(pairKey(p, q)) || 0), 0);
        if (c < bestCost) {
          bestCost = c;
          bestIdx = idx;
        }
      });
      cost += bestCost;
      table.push(rest.splice(bestIdx, 1)[0]);
    }
    tables.push(table);
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

// 予選の卓割りをまとめて作る。戻り値は [回戦][卓] = [プレイヤー ID × 4]
export function makePrelimSchedule(playerIds, roundCount, { random = Math.random, tries = 300 } = {}) {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error('参加人数は 4 の倍数にしてください');
  }
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
