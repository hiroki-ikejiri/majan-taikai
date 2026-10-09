// 素点入力の「残り 1 人を自動で入れる」処理のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newDraft, applyAutoFill } from '../public/js/views/scoreForm.js';

const TOTAL = 100000;

// 百点単位の文字列で手入力したことにする
function type(draft, i, hundreds) {
  draft.hundreds[i] = hundreds;
  if (draft.auto === i) draft.auto = null;
  applyAutoFill(draft, TOTAL);
}

test('3 人分を入れると残り 1 人が自動で入る', () => {
  const d = newDraft(['a', 'b', 'c', 'd']);
  type(d, 0, '420');
  type(d, 1, '330');
  assert.equal(d.auto, null);
  type(d, 2, '260');
  assert.equal(d.auto, 3);
  assert.equal(d.hundreds[3], '10');
  assert.equal(d.negative[3], true); // 100000 - 101000 = -1000
});

test('どの席が最後でも自動で入る', () => {
  const d = newDraft(['a', 'b', 'c', 'd']);
  type(d, 3, '120');
  type(d, 0, '340');
  type(d, 2, '210');
  assert.equal(d.auto, 1);
  assert.equal(d.hundreds[1], '330');
  assert.equal(d.negative[1], false);
});

test('ほかの人の点数を直すと自動の値も計算し直す', () => {
  const d = newDraft(['a', 'b', 'c', 'd']);
  type(d, 0, '400');
  type(d, 1, '300');
  type(d, 2, '200');
  assert.equal(d.hundreds[3], '100');
  type(d, 0, '450');
  assert.equal(d.hundreds[3], '50');
});

test('自動の欄を手で直すと手入力扱いになる', () => {
  const d = newDraft(['a', 'b', 'c', 'd']);
  type(d, 0, '400');
  type(d, 1, '300');
  type(d, 2, '200');
  type(d, 3, '90');
  assert.equal(d.auto, null);
  assert.equal(d.hundreds[3], '90');
  type(d, 0, '410');
  assert.equal(d.hundreds[3], '90'); // もう自動では変わらない
});

test('手入力が 3 人分を下回ると自動の値は消える', () => {
  const d = newDraft(['a', 'b', 'c', 'd']);
  type(d, 0, '400');
  type(d, 1, '300');
  type(d, 2, '200');
  type(d, 1, '');
  assert.equal(d.auto, null);
  assert.equal(d.hundreds[3], '');
});

test('主催者の修正（既存の結果）では自動入力しない', () => {
  const d = newDraft(['a', 'b', 'c', 'd'], {
    seats: [{ playerId: 'a', score: 40000 }, { playerId: 'b', score: 30000 }, { playerId: 'c', score: 20000 }, { playerId: 'd', score: 10000 }],
  });
  assert.equal(d.auto, null);
  type(d, 0, '410');
  assert.equal(d.hundreds[3], '100');
});

import { rankingOrder, unresolvedTies, tieGroups, seatsForSave } from '../public/js/views/scoreForm.js';

function filled(scores) {
  const d = newDraft(['a', 'b', 'c', 'd']);
  scores.forEach((s, i) => {
    d.hundreds[i] = String(Math.abs(s) / 100);
    d.negative[i] = s < 0;
  });
  return d;
}

test('同点がなければ、そのまま点数の高い順', () => {
  const d = filled([20000, 40000, 30000, 10000]);
  assert.deepEqual(rankingOrder(d), [1, 2, 0, 3]);
  assert.deepEqual(unresolvedTies(d), []);
  assert.deepEqual(seatsForSave(d).map((s) => s.playerId), ['b', 'c', 'a', 'd']);
});

test('2 人同点は、上にする人を選ぶまで決まらない', () => {
  const d = filled([30000, 30000, 25000, 15000]);
  assert.deepEqual(unresolvedTies(d), [[0, 1]]);
  d.tiePref.push('b');
  assert.deepEqual(unresolvedTies(d), []);
  assert.deepEqual(seatsForSave(d).map((s) => s.playerId), ['b', 'a', 'c', 'd']);
});

test('3 人同点は、上から順に 2 人選べば決まる', () => {
  const d = filled([25000, 25000, 25000, 25000 - 0]);
  // 4 人とも同点
  assert.equal(tieGroups(d)[0].all.length, 4);
  const d3 = filled([30000, 30000, 30000, 10000]);
  assert.deepEqual(unresolvedTies(d3), [[0, 1, 2]]);
  d3.tiePref.push('c');
  assert.deepEqual(unresolvedTies(d3), [[0, 1]]);
  d3.tiePref.push('a');
  assert.deepEqual(unresolvedTies(d3), []);
  assert.deepEqual(seatsForSave(d3).map((s) => s.playerId), ['c', 'a', 'b', 'd']);
});

test('保存済みの結果を直すときは、保存した順番を同点の決め手にする', () => {
  const d = newDraft(['a', 'b', 'c', 'd'], {
    seats: [{ playerId: 'c', score: 30000 }, { playerId: 'a', score: 30000 }, { playerId: 'b', score: 30000 }, { playerId: 'd', score: 10000 }],
  });
  assert.deepEqual(d.players, ['c', 'a', 'b', 'd']);
  assert.deepEqual(unresolvedTies(d), []);
  assert.deepEqual(seatsForSave(d).map((s) => s.playerId), ['c', 'a', 'b', 'd']);
});
