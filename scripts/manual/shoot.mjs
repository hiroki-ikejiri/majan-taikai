// 説明書（docs/manual）用のキャプチャを撮り、PDF を作るスクリプト。
// デモモード（本番の Firebase に触らない）で実際の画面を動かして撮る。
//
//   node scripts/manual/shoot.mjs            キャプチャを撮り直して PDF を作る
//   node scripts/manual/shoot.mjs --pdf-only 説明書の文章だけ直したときに、PDF だけ作り直す
//
// できるもの
//   docs/manual/img/*.png            画面のキャプチャ
//   docs/manual/麻雀大会スコア_使い方.pdf   説明書（docs/manual/manual.html を PDF にしたもの）
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { buildTournament, DEMO_KEY } from '../../e2e/helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMG = path.join(ROOT, 'docs/manual/img');
const PORT = 5175;
const BASE = `http://localhost:${PORT}`;

const NAMES16 = ['池尻', '山田', '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '中村', '小林', '加藤', '吉田', '山本', '松本', '井上', '木村'];

// 卓ごとに少しずつ違う点数にして、それらしい結果にする
const PATTERNS = [
  [42300, 31200, 17800, 8700],
  [38100, 27400, 22000, 12500],
  [45600, 24900, 19300, 10200],
  [33400, 29800, 24100, 12700],
];
function resultsFor(t, rounds) {
  const results = {};
  rounds.forEach((r) => {
    t.data.schedule[String(r)].forEach((tb, k) => {
      const scores = PATTERNS[(r + k) % PATTERNS.length];
      // 誰がトップになるかも回戦ごとにずらす
      const shift = (r * 3 + k) % 4;
      const order = tb.players.map((_, i) => tb.players[(i + shift) % 4]);
      results[`${r}-${tb.label}`] = {
        round: r,
        table: tb.label,
        seats: order.map((playerId, i) => ({ playerId, score: scores[i] })),
        enteredBy: order[0],
        enteredByName: '',
        enteredAt: 1,
      };
    });
  });
  return results;
}

function tournament16(extra = {}) {
  const t = buildTournament({ names: NAMES16 });
  t.data.name = '第12回大会';
  t.data.date = '2026-10-18';
  t.data.ruleSections = [
    { title: '麻雀基本ルール', body: '東南戦、25000 点持ち 30000 点返し\n喰いタンあり、後付けあり\n箱割れ（飛び）による終了はなし' },
    { title: '罰符', body: '打牌前の誤ポン、誤チー、誤カンは 1000 点供託' },
  ];
  Object.assign(t.data, extra);
  return t;
}

// ===== 準備 =====
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', path.join(ROOT, 'public')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
// 日本語のブラウザとして動かす（ファイル選択や日付の表示を日本語にするため）
const browser = await chromium.launch({ args: ['--lang=ja-JP'] });

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.5 };

// 新しい端末（ブラウザ）を用意する。data があれば保存データを入れておく
async function device(opts, { tournament, results = {}, chips = {}, organizer = false, me = null } = {}) {
  const context = await browser.newContext({ ...opts, locale: 'ja-JP' });
  await context.addInitScript(
    ({ key, db, organizer, me, tid }) => {
      localStorage.setItem('majan-force-demo', '1');
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      if (db) localStorage.setItem(key, JSON.stringify(db));
      if (organizer) localStorage.setItem('majan-demo-auth', 'organizer');
      if (me && tid) localStorage.setItem(`majan-me-${tid}`, me);
    },
    {
      key: DEMO_KEY,
      db: tournament
        ? { tournaments: { [tournament.id]: tournament.data }, results: { [tournament.id]: results }, chips: { [tournament.id]: chips }, organizers: {} }
        : null,
      organizer,
      me,
      tid: tournament?.id,
    },
  );
  return context.newPage();
}

// デモモードの帯を消し、本番と同じ見た目にしてから撮る
async function shot(page, name, { fullPage = false, top = true } = {}) {
  await page.addStyleTag({ content: '.demo-banner{display:none!important} #toasts{display:none!important}' });
  // ページ全体を撮るときは、画面の下に固定しているタブやボタンを、ふつうの位置に戻す（途中に重ならないように）
  if (fullPage) await page.addStyleTag({ content: '.bottom-nav,.sticky-actions{position:static!important}' });
  // デモモード特有の文字を、本番と同じ文字にする
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach((b) => {
      if (b.textContent === 'デモ主催者として始める') b.textContent = 'Google でログイン';
    });
    document.querySelectorAll('span').forEach((el) => {
      if (el.textContent === 'デモ主催者 さん') el.textContent = '池尻 さん';
    });
    document.querySelectorAll('.url-box').forEach((el) => {
      el.textContent = el.textContent.replace(/^http:\/\/localhost:\d+\//, 'https://majan-taikai.pages.dev/');
    });
  });
  if (top) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(IMG, `${name}.png`), fullPage });
  console.log('撮影', name);
}

const pdfOnly = process.argv.includes('--pdf-only');

try {
  if (!pdfOnly) await shootAll();
  await makePdf();
} finally {
  await browser.close();
  server.kill();
}

async function shootAll() {
  // ===== 主催者：大会を作る =====
  {
    const page = await device(PHONE);
    await page.goto(`${BASE}/`);
    await shot(page, '01-login');
    // 撮影のために文字を本番と同じにしているので、どちらの文字でも押せるようにする
    await page.getByRole('button', { name: /デモ主催者として始める|Google でログイン/ }).click();
    await shot(page, '02-organizer-home');
    await page.getByRole('button', { name: '＋ 新しい大会を作る' }).click();
    await page.getByRole('button', { name: '16人', exact: true }).click();
    await page.getByPlaceholder('第11回大会').fill('第12回大会');
    await shot(page, '03-count');
    await page.getByRole('button', { name: '次へ（参加者）' }).click();
    await page.locator('textarea').first().fill(NAMES16.slice(0, 13).join('、'));
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await shot(page, '04-names', { fullPage: true });
    await page.getByRole('button', { name: /仮の名前/ }).click();
    await page.getByRole('button', { name: '次へ（ルール）' }).click();
    await shot(page, '05-rules', { fullPage: true });
    await page.getByRole('button', { name: '次へ（確認）' }).click();
    await shot(page, '06-confirm');
    await page.getByRole('button', { name: 'この内容で大会を作る' }).click();
    await page.waitForSelector('.qr svg', { timeout: 20000 });
    await shot(page, '07-share');
    await page.context().close();
  }

  // ===== 対局中の大会（第2回戦まで終わり、第3回戦のタイマーが動いている） =====
  const playing = tournament16({ timer: { round: 3, startedAt: Date.now() - 17 * 60 * 1000, pausedAt: null, pausedTotal: 0 } });
  const playingResults = resultsFor(playing, [1, 2]);

  {
    // 主催者メニュー
    const page = await device(PHONE, { tournament: playing, results: playingResults, organizer: true });
    await page.goto(`${BASE}/#/t/${playing.id}/admin`);
    await shot(page, '08-admin-progress');
    await page.goto(`${BASE}/#/t/${playing.id}/admin/settings`);
    await shot(page, '09-admin-settings');
    await page.context().close();
  }
  {
    // 会場表示（PC・モニター）
    const page = await device(DESKTOP, { tournament: playing, results: playingResults, organizer: true });
    await page.goto(`${BASE}/#/t/${playing.id}/screen`);
    await page.waitForTimeout(800);
    await shot(page, '10-screen');
    await page.getByRole('button', { name: 'QR を表示' }).click();
    await page.waitForSelector('.qr svg', { timeout: 20000 });
    await shot(page, '11-screen-qr');
    await page.context().close();
  }
  {
    // 参加者
    const page = await device(PHONE, { tournament: playing, results: playingResults });
    await page.goto(`${BASE}/#/t/${playing.id}`);
    await shot(page, '12-pick-name');
    await page.getByRole('button', { name: '池尻' }).click();
    await shot(page, '13-home');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, '14-home-bottom', { top: false });
    await page.goto(`${BASE}/#/t/${playing.id}/input`);
    const inputs = page.locator('.score-input');
    await inputs.nth(0).fill('384');
    await inputs.nth(1).fill('291');
    await inputs.nth(2).fill('206');
    await page.locator('h2').first().click();
    await shot(page, '15-input', { fullPage: true });
    await inputs.nth(0).fill('300');
    await inputs.nth(1).fill('300');
    await inputs.nth(2).fill('300');
    await page.locator('h2').first().click();
    await shot(page, '16-tie', { fullPage: true });
    await page.goto(`${BASE}/#/t/${playing.id}/rank`);
    await page.getByRole('button', { name: 'ポイント順位' }).click();
    await shot(page, '17-rank');
    await page.getByRole('button', { name: '卓・結果' }).click();
    await shot(page, '18-tables');
    await page.context().close();
  }

  // ===== 全回戦が終わった大会 =====
  const done = tournament16({ venueFee: 64000 });
  const prelim = resultsFor(done, [1, 2, 3, 4, 5, 6]);
  // 決勝卓は予選の順位で決まるので、アプリと同じ計算で作る
  const { deriveTournament } = await import('../../public/js/derive.js');
  const ranked = deriveTournament(done.data, Object.entries(prelim).map(([id, r]) => ({ id, ...r }))).standings.map((s) => s.id);
  done.data.schedule['7'] = [0, 1, 2, 3].map((k) => ({ label: 'ABCD'[k], players: ranked.slice(k * 4, k * 4 + 4) }));
  const doneResults = { ...prelim, ...resultsFor(done, [7]) };
  const chips = { p1: 3, p2: -2, p3: 0, p4: 1, p5: -4, p6: 2, p7: 0, p8: -1, p9: 5, p10: -3, p11: 0, p12: 1, p13: -2, p14: 0, p15: 1, p16: -1 };
  {
    const page = await device(PHONE, { tournament: done, results: doneResults, chips, me: 'p1' });
    await page.goto(`${BASE}/#/t/${done.id}`);
    await shot(page, '19-final-home');
    await page.goto(`${BASE}/#/t/${done.id}/rank`);
    await shot(page, '20-final-result');
    await page.goto(`${BASE}/#/t/${done.id}/settle`);
    await shot(page, '21-settle', { fullPage: true });
    await page.context().close();
  }
  {
    const page = await device(PHONE, { tournament: done, results: doneResults, chips, organizer: true, me: 'p1' });
    await page.goto(`${BASE}/#/t/${done.id}/admin/settle`);
    await shot(page, '22-admin-settle', { fullPage: true });
    await page.context().close();
  }

}

// ===== PDF にする =====
async function makePdf() {
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'docs/manual/manual.html')).href);
    await page.waitForLoadState('networkidle');
    const out = path.join(ROOT, 'docs/manual/麻雀大会スコア_使い方.pdf');
    await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } });
    console.log('PDF', out);
    await context.close();
  }
}
