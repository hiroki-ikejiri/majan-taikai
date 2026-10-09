// 確定した結果から、全体順位・トップとの差・決勝ラインまでの差を出す

// results は { round, table, seats: [{ playerId, score }] × 4 }（東南西北の順）の配列
export function computeStandings(players, results, rules, calcHanchan) {
  const rows = new Map(
    players.map((p) => [p.id, { id: p.id, name: p.name, total: 0, games: 0, perRound: {} }]),
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
    });
  });

  const list = [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));

  // 同じ合計なら同じ順位にする（1, 2, 2, 4 …）
  list.forEach((row, i) => {
    row.rank = i > 0 && list[i - 1].total === row.total ? list[i - 1].rank : i + 1;
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
