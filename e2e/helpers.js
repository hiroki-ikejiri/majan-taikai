// E2E テスト用の道具。デモモードの保存データ（localStorage）を直接用意する
import { DEFAULT_RULES } from '../public/js/logic/scoring.js';
import { makePrelimSchedule, seededRandom, TABLE_LABELS } from '../public/js/logic/seating.js';

export const DEMO_KEY = 'majan-demo-v1';
export const NAMES8 = ['池尻', '山田', '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺'];

// 8 人・予選 6 回 + 決勝 1 回の大会データを作る
export function buildTournament({ id = 't1', names = NAMES8, rules = {} } = {}) {
  const players = names.map((name, i) => ({ id: `p${i + 1}`, name }));
  const r = { ...DEFAULT_RULES, ...rules };
  const prelim = r.hasFinal ? r.rounds - 1 : r.rounds;
  const schedule = {};
  makePrelimSchedule(players.map((p) => p.id), prelim, { random: seededRandom(42) }).forEach((tables, i) => {
    schedule[String(i + 1)] = tables.map((ids, k) => ({ label: TABLE_LABELS[k], players: ids }));
  });
  return {
    id,
    data: {
      name: 'E2E 大会',
      date: '2026-10-08',
      ownerUid: 'demo-organizer',
      status: 'open',
      rules: r,
      ruleSections: [{ title: '罰符', body: '誤ポンは 1000 点供託' }],
      players,
      schedule,
      venueFee: null,
      createdAt: 1,
    },
  };
}

// 卓の素点を席順で決める（卓の 1 人目が必ずトップになる配点）
export const TOP_FIRST = [40000, 30000, 20000, 10000];

export function resultsFor(t, rounds, scores = TOP_FIRST) {
  const results = {};
  rounds.forEach((r) => {
    t.data.schedule[String(r)].forEach((tb) => {
      results[`${r}-${tb.label}`] = {
        round: r,
        table: tb.label,
        seats: tb.players.map((playerId, i) => ({ playerId, score: scores[i] })),
        enteredBy: tb.players[0],
        enteredByName: '',
        enteredAt: 1,
      };
    });
  });
  return results;
}

// ページを開く前に localStorage を仕込む
export async function seed(page, { tournament, results = {}, chips = {}, organizer = false, me = null }) {
  const db = {
    tournaments: { [tournament.id]: tournament.data },
    results: { [tournament.id]: results },
    chips: { [tournament.id]: chips },
    organizers: {},
  };
  await page.addInitScript(
    ({ key, db, organizer, me, tid }) => {
      // 2 回目以降の読み込み（リロード）では上書きしない
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key, JSON.stringify(db));
      if (organizer) localStorage.setItem('majan-demo-auth', 'organizer');
      if (me) localStorage.setItem(`majan-me-${tid}`, me);
    },
    { key: DEMO_KEY, db, organizer, me, tid: tournament.id },
  );
}

// 素点フォームに入力する（百点単位）。負の点数は ± ボタンで切り替える
export async function fillScores(page, scores) {
  const inputs = page.locator('.score-input');
  const signs = page.locator('.sign');
  for (let i = 0; i < 4; i += 1) {
    await inputs.nth(i).fill(String(Math.abs(scores[i]) / 100));
    if (scores[i] < 0) await signs.nth(i).click();
  }
}
