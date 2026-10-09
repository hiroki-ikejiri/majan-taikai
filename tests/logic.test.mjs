// 計算ロジックのテスト。実行は `npm test`（node:test を使用）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RULES, calcHanchan, roundedBase, validateScores, okaOf } from '../public/js/logic/scoring.js';
import { makePrelimSchedule, makeFinalTables, countMeets, countSeats, seededRandom } from '../public/js/logic/seating.js';
import { computeStandings, finalLineGap } from '../public/js/logic/standings.js';
import { feePerPerson, chipStatus, computeSettlement } from '../public/js/logic/settlement.js';
import { parseNamesFromMarkdownTable } from '../public/js/logic/names.js';

const rules = { ...DEFAULT_RULES };

test('オカは 25000 持ち 30000 返しで +20', () => {
  assert.equal(okaOf(rules), 20);
});

test('五捨六入。マイナスは絶対値で丸める', () => {
  assert.equal(roundedBase(34500, 30000), 4); // +4.5 → 4
  assert.equal(roundedBase(34600, 30000), 5); // +4.6 → 5
  assert.equal(roundedBase(12500, 30000), -17); // -17.5 → -17
  assert.equal(roundedBase(12400, 30000), -18); // -17.6 → -18
  assert.equal(roundedBase(30000, 30000), 0);
  assert.equal(roundedBase(-5000, 30000), -35); // 箱下もそのまま計算
});

test('第 10 回集計表と同じ値になる（34000/33000/21000/12000 → +54/+13/-19/-48）', () => {
  const { points, ranks } = calcHanchan([34000, 33000, 21000, 12000], rules);
  assert.deepEqual(points, [54, 13, -19, -48]);
  assert.deepEqual(ranks, [1, 2, 3, 4]);
});

test('席順に関係なく順位どおりに計算される', () => {
  const { points, ranks } = calcHanchan([21000, 12000, 34000, 33000], rules);
  assert.deepEqual(points, [-19, -48, 54, 13]);
  assert.deepEqual(ranks, [3, 4, 1, 2]);
});

test('丸めでずれても合計は必ず 0 になる', () => {
  const { points } = calcHanchan([25600, 25600, 25600, 23200], rules);
  assert.equal(points.reduce((a, b) => a + b, 0), 0);
});

test('同点は起家（東）に近い方が上', () => {
  const { ranks } = calcHanchan([20000, 30000, 30000, 20000], rules);
  assert.deepEqual(ranks, [3, 1, 2, 4]);
});

test('合計 10 万点でないとエラー', () => {
  assert.deepEqual(validateScores([34000, 33000, 21000, 12000], rules), []);
  const errors = validateScores([34000, 33000, 21000, 11000], rules);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /100,000 点になるように直してください（-1,000 点ずれています）/);
  assert.equal(validateScores([34050, 32950, 21000, 12000], rules).length, 2);
});

test('予選の卓割りは全員を毎回 1 回ずつ入れ、同卓の重複を抑える', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `p${i}`);
  const schedule = makePrelimSchedule(ids, 6, { random: seededRandom(1) });
  assert.equal(schedule.length, 6);
  schedule.forEach((tables) => {
    assert.equal(tables.length, 4);
    assert.deepEqual(tables.flat().sort(), [...ids].sort());
  });
  // 16 人・6 回なら、同じ 2 人の同卓は最大 2 回までに収まる
  const maxMeet = Math.max(...countMeets(schedule).values());
  assert.ok(maxMeet <= 2, `最大同卓回数 ${maxMeet}`);
});

const maxSeat = (schedule) => Math.max(...[...countSeats(schedule).values()].flat().filter(Boolean));

test('同じ卓（A 卓・B 卓…）に座り続けないように組む', () => {
  for (let seed = 1; seed <= 5; seed += 1) {
    const random = seededRandom(seed);
    const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
    // 8 人・予選 4 回：同じ卓は 3 回まで（4 回とも同じ卓の人を出さない）、同じ人とは 2 回まで
    const s8 = makePrelimSchedule(ids(8), 4, { random });
    assert.ok(maxSeat(s8) <= 3, `8人 同じ卓 ${maxSeat(s8)} 回`);
    assert.ok(Math.max(...countMeets(s8).values()) <= 2);
    // 16 人・予選 6 回：同じ卓は 3 回まで、同じ人とは 2 回まで
    const s16 = makePrelimSchedule(ids(16), 6, { random });
    assert.ok(maxSeat(s16) <= 3, `16人 同じ卓 ${maxSeat(s16)} 回`);
    assert.ok(Math.max(...countMeets(s16).values()) <= 2);
    // 20 人・予選 6 回：同じ卓は 2 回まで
    assert.ok(maxSeat(makePrelimSchedule(ids(20), 6, { random })) <= 2);
  }
});

test('4 の倍数でない人数はエラー', () => {
  assert.throws(() => makePrelimSchedule(['a', 'b', 'c', 'd', 'e'], 1));
});

test('決勝卓は順位順に 4 人ずつ', () => {
  assert.deepEqual(makeFinalTables(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), [
    ['a', 'b', 'c', 'd'],
    ['e', 'f', 'g', 'h'],
  ]);
});

const players = ['東', '南', '西', '北', '白', '発', '中', '赤'].map((name, i) => ({ id: `p${i}`, name }));
const results = [
  { round: 1, table: 'A', seats: [['p0', 34000], ['p1', 33000], ['p2', 21000], ['p3', 12000]].map(([playerId, score]) => ({ playerId, score })) },
  { round: 1, table: 'B', seats: [['p4', 40000], ['p5', 30000], ['p6', 20000], ['p7', 10000]].map(([playerId, score]) => ({ playerId, score })) },
];

test('全体順位とトップとの差', () => {
  const st = computeStandings(players, results, rules, calcHanchan);
  assert.equal(st[0].name, '白');
  assert.equal(st[0].total, 60);
  assert.equal(st[1].name, '東');
  assert.equal(st[1].diffToTop, -6);
  assert.equal(st.reduce((s, r) => s + r.total, 0), 0);
});

test('決勝ラインまでの差', () => {
  const st = computeStandings(players, results, rules, calcHanchan);
  // 4 位は 発 (+10)、5 位は 西 (-19)
  assert.deepEqual(finalLineGap(st, 'p1'), { inside: true, gap: 32 }); // 南 +13 は 5 位に 32 リード
  assert.deepEqual(finalLineGap(st, 'p6'), { inside: false, gap: 30 }); // 中 -20 は 4 位まであと 30
});

test('場代の割り勘は 100 円単位で切り上げ', () => {
  assert.equal(feePerPerson(50000, 16), 3200); // 3125 → 3200
  assert.equal(feePerPerson(48000, 16), 3000);
  assert.equal(feePerPerson(0, 16), 0);
});

test('チップは全員入力済みかつ合計 0 で確定できる', () => {
  const two = players.slice(0, 2);
  assert.equal(chipStatus(two, { p0: 3 }).ready, false);
  assert.equal(chipStatus(two, { p0: 3, p1: -2 }).ready, false);
  assert.equal(chipStatus(two, { p0: 3, p1: -3 }).ready, true);
});

test('第 10 回のチップ枚数列は合計 0', () => {
  const chips = [-10, -6, 6, -10, -5, 20, 3, -15, -16, -5, -1, 1, 30, 14, 1, -7];
  assert.equal(chips.reduce((a, b) => a + b, 0), 0);
});

test('精算額 = pt × レート + チップ × 単価 − 場代', () => {
  const st = [{ id: 'a', name: 'A', rank: 1, total: 360 }];
  const [row] = computeSettlement(st, { a: 20 }, rules, 3000);
  // 既定のレートは 1000 点（1pt）100 円。第 10 回集計表と同じく 360pt → 36,000 円
  assert.equal(row.pointYen, 36000);
  assert.equal(row.amount, 36000 + 10000 - 3000);
});

test('レート 50 円（点5）なら半分', () => {
  const st = [{ id: 'a', name: 'A', rank: 1, total: 360 }];
  const [row] = computeSettlement(st, {}, { ...rules, rate: 50 }, 0);
  assert.equal(row.pointYen, 18000);
});

test('場代を事前徴収済みにすると精算に含めない', async () => {
  const { feeReady } = await import('../public/js/logic/settlement.js');
  const prepaid = { ...rules, feeMode: 'prepaid' };
  const st = [{ id: 'a', name: 'A', rank: 1, total: 360 }];
  const [row] = computeSettlement(st, { a: 20 }, prepaid, 48000);
  assert.equal(row.fee, 0);
  assert.equal(row.amount, 36000 + 10000);
  assert.equal(feeReady(prepaid, null), true);
  assert.equal(feeReady(rules, null), false);
  assert.equal(feeReady(rules, 0), true);
});

test('マークダウン表の「名前」列を読む', () => {
  const md = `
| No | 名前 | 所属 |
|---:|------|------|
| 1 | 池尻 | 本社 |
| 2 | **山田** | 外部 |
| 3 |  | 外部 |
| 4 | 池尻 | 重複 |
`;
  assert.deepEqual(parseNamesFromMarkdownTable(md), ['池尻', '山田']);
});

test('「名前」見出しがなければ 1 列目', () => {
  const md = '| 佐藤 | x |\n| 鈴木 | y |';
  assert.deepEqual(parseNamesFromMarkdownTable(md), ['佐藤', '鈴木']);
});

test('足りない人数をゲスト1、ゲスト2…で埋める', async () => {
  const { fillWithGuests, isGuestName } = await import('../public/js/logic/names.js');
  assert.deepEqual(fillWithGuests(['池尻', 'ゲスト1'], 4), ['池尻', 'ゲスト1', 'ゲスト2', 'ゲスト3']);
  assert.deepEqual(fillWithGuests(['a', 'b'], 2), ['a', 'b']);
  assert.equal(isGuestName('ゲスト12'), true);
  assert.equal(isGuestName('ゲストさん'), false);
});

test('名前はいろいろな区切りで読める', async () => {
  const { parseNames } = await import('../public/js/logic/names.js');
  assert.deepEqual(parseNames('田中、加藤、　'), ['田中', '加藤']);
  assert.deepEqual(parseNames('田中,加藤，佐藤;鈴木；高橋\t伊藤'), ['田中', '加藤', '佐藤', '鈴木', '高橋', '伊藤']);
  assert.deepEqual(parseNames('"田中","加藤", \'佐藤\''), ['田中', '加藤', '佐藤']);
  assert.deepEqual(parseNames('“田中”“加藤”'), ['田中', '加藤']);
  assert.deepEqual(parseNames('「田中」『加藤』（佐藤）【鈴木】'), ['田中', '加藤', '佐藤', '鈴木']);
  assert.deepEqual(parseNames('田中・加藤／佐藤|鈴木'), ['田中', '加藤', '佐藤', '鈴木']);
  assert.deepEqual(parseNames('- 田中\n* 加藤\n1. 佐藤\n2) 鈴木\n● 高橋'), ['田中', '加藤', '佐藤', '鈴木', '高橋']);
});

test('名前の中の空白では分けない', async () => {
  const { parseNames } = await import('../public/js/logic/names.js');
  assert.deepEqual(parseNames('山田 太郎、山田　花子'), ['山田 太郎', '山田 花子']);
});

test('マークダウンの表なら「名前」列を読む', async () => {
  const { parseNames } = await import('../public/js/logic/names.js');
  assert.deepEqual(parseNames('| No | 名前 |\n|---|---|\n| 1 | 田中 |\n| 2 | 加藤 |'), ['田中', '加藤']);
});

test('空白で 3 つ以上並んでいれば分ける。2 語はフルネーム扱い', async () => {
  const { parseNames } = await import('../public/js/logic/names.js');
  assert.deepEqual(parseNames('ikejiri sato tanaka yamaguti'), ['ikejiri', 'sato', 'tanaka', 'yamaguti']);
  assert.deepEqual(parseNames('田中　加藤　佐藤'), ['田中', '加藤', '佐藤']);
  assert.deepEqual(parseNames('山田 太郎'), ['山田 太郎']);
  assert.deepEqual(parseNames('山田 太郎、佐藤 花子'), ['山田 太郎', '佐藤 花子']);
});

test('「空白も区切りにする」なら 2 語でも分ける', async () => {
  const { parseNames } = await import('../public/js/logic/names.js');
  assert.deepEqual(parseNames('田中 加藤', { splitOnSpace: true }), ['田中', '加藤']);
  assert.deepEqual(parseNames('a b、c', { splitOnSpace: true }), ['a', 'b', 'c']);
});

test('名前は数字を数として並べる（ゲスト2 → ゲスト10）', async () => {
  const { compareNames } = await import('../public/js/logic/names.js');
  const names = ['ゲスト10', 'ゲスト2', 'ゲスト1', 'ゲスト20', '池尻', 'ゲスト3'];
  assert.deepEqual([...names].sort(compareNames).filter((n) => n.startsWith('ゲスト')), ['ゲスト1', 'ゲスト2', 'ゲスト3', 'ゲスト10', 'ゲスト20']);
});

test('エラーは日本語の案内にする', async () => {
  const { errorText } = await import('../public/js/ui.js');
  assert.match(errorText({ code: 'permission-denied' }), /権限がありません/);
  assert.match(errorText({ code: 'unavailable' }), /通信できませんでした/);
  assert.match(errorText({ code: 'auth/popup-blocked' }), /ポップアップを許可/);
  assert.match(errorText(new Error('exists')), /すでに入力済み/);
  assert.match(errorText(new Error('boom')), /思わぬエラー.*boom/);
});
