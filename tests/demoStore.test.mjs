// デモ用ストアのテスト（二重入力の防止・チップ・過去参加者）
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Node には localStorage / window が無いので、テスト用に用意する
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.window = { addEventListener() {} };

const { createDemoStore } = await import('../public/js/store/demo.js');

beforeEach(() => memory.clear());

test('同じ卓の結果は 2 回目の保存がエラーになる', async () => {
  const store = createDemoStore();
  await store.submitResult('t', '1-A', { round: 1 });
  await assert.rejects(store.submitResult('t', '1-A', { round: 1 }), /exists/);
});

test('主催者の上書きと削除', async () => {
  const store = createDemoStore();
  await store.submitResult('t', '1-A', { round: 1, v: 1 });
  await store.overwriteResult('t', '1-A', { round: 1, v: 2 });
  const got = await new Promise((resolve) => store.watchResults('t', resolve));
  assert.equal(got[0].v, 2);
  await store.deleteResult('t', '1-A');
  await store.submitResult('t', '1-A', { round: 1, v: 3 });
});

test('チップは null で未入力に戻せる', async () => {
  const store = createDemoStore();
  await store.setChip('t', 'p1', 3);
  await store.setChip('t', 'p2', 0);
  await store.setChip('t', 'p1', null);
  const chips = await new Promise((resolve) => store.watchChips('t', resolve));
  assert.deepEqual(chips, { p2: 0 });
});

test('過去の参加者は回数つきで貯まる', async () => {
  const store = createDemoStore();
  await store.addPastPlayers('u', ['A', 'B']);
  await store.addPastPlayers('u', ['A']);
  assert.deepEqual(await store.getPastPlayers('u'), { A: 2, B: 1 });
});

test('自分の大会だけが一覧に出る', async () => {
  const store = createDemoStore();
  await store.createTournament({ name: 'mine', ownerUid: 'u' });
  await store.createTournament({ name: 'other', ownerUid: 'x' });
  const list = await store.listMyTournaments('u');
  assert.deepEqual(list.map((t) => t.name), ['mine']);
});
