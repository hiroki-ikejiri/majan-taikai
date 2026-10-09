// 大会の進み具合（今の回戦・決勝待ち・全回戦終了）の判定テスト
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveTournament } from '../public/js/derive.js';
import { buildTournament, resultsFor } from '../e2e/helpers.js';

const toList = (results) => Object.entries(results).map(([id, r]) => ({ id, ...r }));

test('結果がなければ 1 回戦', () => {
  const t = buildTournament();
  const d = deriveTournament(t.data, []);
  assert.equal(d.currentRound, 1);
  assert.equal(d.waitingFinal, false);
  assert.equal(d.allDone, false);
});

test('1 卓だけ入力済みならまだ 1 回戦', () => {
  const t = buildTournament();
  const results = toList(resultsFor(t, [1])).slice(0, 1);
  assert.equal(deriveTournament(t.data, results).currentRound, 1);
});

test('予選がすべて終わると決勝の卓割り待ち', () => {
  const t = buildTournament();
  const d = deriveTournament(t.data, toList(resultsFor(t, [1, 2, 3, 4, 5, 6])));
  assert.equal(d.currentRound, 7);
  assert.equal(d.waitingFinal, true);
  assert.equal(d.prelimDone, true);
});

test('決勝まで終わると全回戦終了', () => {
  const t = buildTournament();
  t.data.schedule['7'] = [
    { label: 'A', players: ['p1', 'p2', 'p3', 'p4'] },
    { label: 'B', players: ['p5', 'p6', 'p7', 'p8'] },
  ];
  const d = deriveTournament(t.data, toList(resultsFor(t, [1, 2, 3, 4, 5, 6, 7])));
  assert.equal(d.allDone, true);
  assert.equal(d.currentRound, null);
  assert.equal(d.standings.reduce((s, r) => s + r.total, 0), 0);
  assert.ok(d.standings.every((r) => r.games === 7));
});

test('決勝なしの大会は最終回まで予選扱い', () => {
  const t = buildTournament({ rules: { rounds: 3, hasFinal: false } });
  const d = deriveTournament(t.data, toList(resultsFor(t, [1, 2, 3])));
  assert.equal(d.allDone, true);
  assert.equal(d.waitingFinal, false);
});

test('卓割りにない結果は集計しない', () => {
  const t = buildTournament();
  const stray = { id: '1-Z', round: 1, table: 'Z', seats: [{ playerId: 'p1', score: 100000 }, { playerId: 'p2', score: 0 }, { playerId: 'p3', score: 0 }, { playerId: 'p4', score: 0 }] };
  const d = deriveTournament(t.data, [stray]);
  assert.ok(d.standings.every((r) => r.total === 0));
});

test('ルールを変えると全体のポイントが再計算される', () => {
  const t = buildTournament();
  const results = toList(resultsFor(t, [1]));
  const before = deriveTournament(t.data, results).standings[0].total;
  t.data.rules = { ...t.data.rules, uma: [20, 10, -10, -20] };
  const after = deriveTournament(t.data, results).standings[0].total;
  assert.equal(before - after, 10);
});

// 決勝卓を「予選の成績順」で作り、決勝の結果を入れた大会
function finishedTournament(finalScores) {
  const t = buildTournament();
  const prelim = toList(resultsFor(t, [1, 2, 3, 4, 5, 6]));
  const ranked = deriveTournament(t.data, prelim).standings.map((s) => s.id);
  t.data.schedule['7'] = [
    { label: 'A', players: ranked.slice(0, 4) },
    { label: 'B', players: ranked.slice(4, 8) },
  ];
  const finals = t.data.schedule['7'].map((tb, k) => ({
    id: `7-${tb.label}`,
    round: 7,
    table: tb.label,
    seats: tb.players.map((playerId, i) => ({ playerId, score: finalScores[k][i] })),
  }));
  return { t, d: deriveTournament(t.data, [...prelim, ...finals]), ranked };
}

test('最終結果は A 卓の着順が 1〜4 位、B 卓の着順が 5〜8 位', () => {
  // A 卓は席の逆順で着順が付く（北家がトップ）、B 卓は席順どおり
  const { d } = finishedTournament([
    [10000, 20000, 30000, 40000],
    [40000, 30000, 20000, 10000],
  ]);
  const A = d.tablesOf(7)[0].players;
  const B = d.tablesOf(7)[1].players;
  assert.deepEqual(d.finalResult.map((r) => r.playerId), [A[3], A[2], A[1], A[0], B[0], B[1], B[2], B[3]]);
  assert.deepEqual(d.finalResult.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(d.finalResult[4].table, 'B');
  assert.equal(d.finalResult[4].rankInTable, 1);
});

test('A 卓 4 着と B 卓 1 着はポイントでは逆転しても、最終結果は卓順のまま', () => {
  // A 卓 4 着が大きく沈み、B 卓 1 着が大きく浮く
  const { d } = finishedTournament([
    [60000, 30000, 20000, -10000],
    [70000, 20000, 10000, 0],
  ]);
  const fourth = d.finalResult[3];
  const fifth = d.finalResult[4];
  const pt = new Map(d.standings.map((s) => [s.id, s]));
  assert.equal(fourth.table, 'A');
  assert.equal(fifth.table, 'B');
  // ポイントランキングでは B 卓 1 着の方が上
  assert.ok(pt.get(fifth.playerId).rank < pt.get(fourth.playerId).rank);
});

test('決勝なしの大会は、ポイントランキングが最終結果', () => {
  const t = buildTournament({ rules: { rounds: 3, hasFinal: false } });
  const d = deriveTournament(t.data, toList(resultsFor(t, [1, 2, 3])));
  assert.deepEqual(d.finalResult.map((r) => r.playerId), d.standings.map((s) => s.id));
});

test('全回戦が終わるまでは最終結果なし', () => {
  const t = buildTournament();
  assert.equal(deriveTournament(t.data, toList(resultsFor(t, [1, 2, 3, 4, 5, 6]))).finalResult, null);
});

test('優勝・準優勝の呼び名', async () => {
  const { placeLabel } = await import('../public/js/logic/standings.js');
  assert.deepEqual([1, 2, 3, 5].map(placeLabel), ['優勝', '準優勝', '3位', '5位']);
});
