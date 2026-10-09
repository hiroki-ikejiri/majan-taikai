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
