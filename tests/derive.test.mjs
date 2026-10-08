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
