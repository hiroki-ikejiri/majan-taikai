// 確定した結果から、全体順位・トップとの差・決勝ラインまでの差を出す
import { compareNames } from './names.js';

// 合計ポイントが同じ人の並べ方。上から順に比べて、差がついたところで決める。
// 全部同じなら決められない（同じ順位になり、決勝卓の境目なら主催者が選ぶ）
export const TIEBREAKS = [
  { key: 'firsts', label: '1 位の回数' },
  { key: 'bestScore', label: '1 半荘の最高素点' },
  { key: 'seconds', label: '2 位の回数' },
  { key: 'thirds', label: '3 位の回数' },
];

// 順位表で a を b より上にするなら負、下なら正、決められなければ 0
export function compareStanding(a, b) {
  if (a.total !== b.total) return b.total - a.total;
  for (const { key } of TIEBREAKS) {
    if (a[key] !== b[key]) return b[key] - a[key];
  }
  return 0;
}

// results は { round, table, seats: [{ playerId, score }] × 4 }（東南西北の順）の配列
export function computeStandings(players, results, rules, calcHanchan) {
  const rows = new Map(
    players.map((p) => [
      p.id,
      { id: p.id, name: p.name, total: 0, games: 0, perRound: {}, firsts: 0, seconds: 0, thirds: 0, bestScore: -Infinity },
    ]),
  );

  results.forEach((res) => {
    const scores = res.seats.map((s) => s.score);
    const { points, ranks } = calcHanchan(scores, rules);
    res.seats.forEach((seat, i) => {
      const row = rows.get(seat.playerId);
      if (!row) return;
      row.total += points[i];
      row.games += 1;
      row.perRound[res.round] = { point: points[i], rank: ranks[i], score: seat.score };
      if (ranks[i] === 1) row.firsts += 1;
      if (ranks[i] === 2) row.seconds += 1;
      if (ranks[i] === 3) row.thirds += 1;
      row.bestScore = Math.max(row.bestScore, seat.score);
    });
  });

  // 決められない人どうしは名前順で並べる（見た目のためだけ。順位は同じになる）
  const list = [...rows.values()].sort((a, b) => compareStanding(a, b) || compareNames(a.name, b.name));

  // 合計も同点の決め方も全部同じなら同じ順位にする（1, 2, 2, 4 …）
  list.forEach((row, i) => {
    row.rank = i > 0 && compareStanding(list[i - 1], row) === 0 ? list[i - 1].rank : i + 1;
  });

  const topTotal = list.length ? list[0].total : 0;
  list.forEach((row) => {
    row.diffToTop = row.total - topTotal;
  });
  return list;
}

// 決勝 A 卓（上位 4 人）に入るための差。
// 4 位以内の人は 5 位との差（リード）、5 位以下の人は 4 位との差（あと何 pt）
export function finalLineGap(standings, playerId, lineSize = 4) {
  if (standings.length <= lineSize) return null;
  const idx = standings.findIndex((r) => r.id === playerId);
  if (idx < 0) return null;
  const me = standings[idx];
  if (idx < lineSize) {
    return { inside: true, gap: me.total - standings[lineSize].total };
  }
  return { inside: false, gap: standings[lineSize - 1].total - me.total };
}

// 最終結果（大会の順位）。決勝卓の順（A 卓、B 卓…）に、卓の中の着順で並べる。
// A 卓の 1 着が優勝、2 着が準優勝…、B 卓の 1 着が 5 位…となる。
// finalTables は [{ label, players }]、resultOf(label) はその卓の結果（seats は東南西北の順）
export function computeFinalResult(finalTables, resultOf, rules, calcHanchan) {
  const out = [];
  finalTables.forEach((table, tableIndex) => {
    const res = resultOf(table.label);
    if (!res) return;
    const { ranks, points } = calcHanchan(
      res.seats.map((s) => s.score),
      rules,
    );
    res.seats
      .map((seat, i) => ({ playerId: seat.playerId, rankInTable: ranks[i], point: points[i], score: seat.score }))
      .sort((a, b) => a.rankInTable - b.rankInTable)
      .forEach((row) => {
        out.push({ ...row, table: table.label, place: tableIndex * 4 + row.rankInTable });
      });
  });
  return out.sort((a, b) => a.place - b.place);
}

// 最終結果の呼び名
export const placeLabel = (place) => (place === 1 ? '優勝' : place === 2 ? '準優勝' : `${place}位`);

// 決勝卓の境目（4 人ごとの区切り）をまたいでいる、同点の決め方でも決められない人たちのグループ。
// 戻り値は [{ rank, ids }]（ids は順位表の並び）。ここに入る人は、主催者にどちらを上の卓にするか選んでもらう
export function finalBoundaryTies(standings, tableSize = 4) {
  const groups = [];
  let start = 0;
  while (start < standings.length) {
    let end = start;
    while (end + 1 < standings.length && standings[end + 1].rank === standings[start].rank) end += 1;
    const crosses = Math.floor(start / tableSize) !== Math.floor(end / tableSize);
    if (crosses) groups.push({ rank: standings[start].rank, ids: standings.slice(start, end + 1).map((r) => r.id) });
    start = end + 1;
  }
  return groups;
}

// 決勝卓に入れる順番（上から）。主催者が選んだ順番（picks。先に選ばれた人ほど上）を、決められない人どうしの並びに使う
export function finalOrder(standings, picks = []) {
  const pickIndex = (id) => {
    const i = picks.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  return standings
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.rank - b.row.rank || pickIndex(a.row.id) - pickIndex(b.row.id) || a.i - b.i)
    .map(({ row }) => row.id);
}

// 境目をまたぐ同点のうち、主催者がまだ選び終わっていないもの。
// グループの中で選ばれていない人が 1 人以下になれば、並びは決まる
export function unresolvedFinalTies(standings, picks = [], tableSize = 4) {
  return finalBoundaryTies(standings, tableSize)
    .map((g) => ({ ...g, unpicked: g.ids.filter((id) => !picks.includes(id)) }))
    .filter((g) => g.unpicked.length > 1);
}

// 確定済みの決勝卓が今の順位と合っているか。上の卓から並べたときに順位が下がっていかなければ合っている
// （決められない同点の人どうしは、どちらが上の卓でもよい）
export function finalTablesMatchStandings(tables, standings) {
  const rankOf = new Map(standings.map((r) => [r.id, r.rank]));
  const ids = tables.flat();
  if (ids.length !== standings.length || ids.some((id) => !rankOf.has(id))) return false;
  const tableRanks = tables.map((t) => t.map((id) => rankOf.get(id)));
  // 卓の中の順番は関係ないので、卓ごとに「一番下の順位」と次の卓の「一番上の順位」を比べる
  return tableRanks.every((ranks, i) => i === 0 || Math.min(...ranks) >= Math.max(...tableRanks[i - 1]));
}
