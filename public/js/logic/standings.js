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
