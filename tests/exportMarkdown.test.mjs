// 結果のマークダウン書き出しのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildResultMarkdown, resultFileName } from '../public/js/logic/exportMarkdown.js';
import { deriveTournament } from '../public/js/derive.js';
import { buildTournament, resultsFor } from '../e2e/helpers.js';

const toList = (results) => Object.entries(results).map(([id, r]) => ({ id, ...r }));

function finished() {
  const t = buildTournament();
  t.data.schedule['7'] = [
    { label: 'A', players: ['p1', 'p2', 'p3', 'p4'] },
    { label: 'B', players: ['p5', 'p6', 'p7', 'p8'] },
  ];
  t.data.venueFee = 48000;
  const results = { ...resultsFor(t, [1, 2, 3, 4, 5, 6]), ...resultsFor(t, [7], [10000, 20000, 30000, 40000]) };
  return { t, d: deriveTournament(t.data, toList(results)) };
}

// 見出しの下の表を、行ごとのセル配列で取り出す
function sectionRows(md, heading) {
  const lines = md.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `${heading} がない`);
  const rows = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i += 1) {
    if (lines[i].startsWith('|') && !lines[i].includes('---')) rows.push(lines[i].slice(2, -2).split(' | '));
  }
  return rows;
}

test('集計表と同じ見出しがそろう', () => {
  const { t, d } = finished();
  const md = buildResultMarkdown(t.data, d, {});
  for (const h of ['大会情報', '回戦ごとのポイント', '最終結果', 'ポイントランキング・精算', '対戦組み合わせ', '素点（参考）']) {
    assert.ok(md.includes(`## ${h}`), h);
  }
  assert.ok(md.startsWith('# E2E 大会 結果'));
});

test('回戦ごとのポイントは参加者の登録順の列で、縦集計の合計は 0', () => {
  const { t, d } = finished();
  const rows = sectionRows(buildResultMarkdown(t.data, d, { p1: 3, p2: -3 }), '回戦ごとのポイント');
  assert.deepEqual(rows[0], ['半荘数', '池尻', '山田', '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺']);
  assert.equal(rows[1][0], '予選1回');
  assert.equal(rows[7][0], '決勝');
  const totals = rows.find((r) => r[0] === '縦集計').slice(1).map(Number);
  assert.equal(totals.reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(rows.find((r) => r[0] === 'チップ枚数').slice(1, 3), ['+3', '-3']);
});

test('最終結果は決勝卓の着順', () => {
  const { t, d } = finished();
  const rows = sectionRows(buildResultMarkdown(t.data, d, {}), '最終結果');
  // A 卓は北家（鈴木）がトップ
  assert.deepEqual(rows[1].slice(0, 4), ['優勝', '鈴木', 'A卓', '1着']);
  assert.deepEqual(rows[2].slice(0, 2), ['準優勝', '佐藤']);
  assert.deepEqual(rows[5].slice(0, 4), ['5位', '渡辺', 'B卓', '1着']);
});

test('精算は pt × レート ＋ チップ − 場代', () => {
  const { t, d } = finished();
  const rows = sectionRows(buildResultMarkdown(t.data, d, { p1: 2 }), 'ポイントランキング・精算');
  assert.deepEqual(rows[0], ['順位', '名前', 'ポイント', '4位からの差', '集計', 'チップ', '集計+チップ', '場代', '最終支払']);
  const ikejiri = rows.find((r) => r[1] === '池尻');
  const total = Number(ikejiri[2]);
  assert.equal(Number(ikejiri[4]), total * 100);
  assert.equal(Number(ikejiri[5]), 1000);
  assert.equal(ikejiri[7], '-6000'); // 48000 ÷ 8
});

test('場代を事前徴収にすると「徴収済み」と書く', () => {
  const { t } = finished();
  t.data.rules.feeMode = 'prepaid';
  const d2 = deriveTournament(t.data, []);
  const md = buildResultMarkdown(t.data, d2, {});
  assert.ok(md.includes('事前に徴収済み（精算に含めない）'));
  assert.ok(sectionRows(md, 'ポイントランキング・精算').slice(1).every((r) => r[7] === '徴収済み'));
});

test('対戦組み合わせは実際に座った決勝卓のまま', () => {
  const { t, d } = finished();
  const rows = sectionRows(buildResultMarkdown(t.data, d, {}), '対戦組み合わせ');
  const final = rows.find((r) => r[0] === '決勝');
  assert.deepEqual(final.slice(1, 5), ['池尻', '山田', '佐藤', '鈴木']);
});

test('途中経過でも書き出せる', () => {
  const t = buildTournament();
  const d = deriveTournament(t.data, toList(resultsFor(t, [1])));
  const md = buildResultMarkdown(t.data, d, {});
  assert.ok(md.includes('途中経過です'));
  assert.ok(!md.includes('## 最終結果'));
  assert.ok(sectionRows(md, '対戦組み合わせ').find((r) => r[0] === '決勝').includes('未定'));
});

test('ファイル名に使えない文字は _ にする', () => {
  assert.equal(resultFileName({ name: '第11回 大会/秋' }), '第11回_大会_秋_結果.md');
});
