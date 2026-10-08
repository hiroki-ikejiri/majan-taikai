// 大会データから、画面に出す値（順位・今の回戦・自分の卓など）を組み立てる
import { DEFAULT_RULES, calcHanchan } from './logic/scoring.js';
import { computeStandings } from './logic/standings.js';
import { resultIdOf } from './store/index.js';

export function deriveTournament(t, results) {
  const rules = { ...DEFAULT_RULES, ...(t.rules || {}) };
  const players = t.players || [];
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const schedule = t.schedule || {};
  const resultMap = new Map(results.map((r) => [r.id, r]));
  const prelimRounds = rules.hasFinal ? rules.rounds - 1 : rules.rounds;

  const tablesOf = (round) => schedule[String(round)] || null;
  const resultOf = (round, label) => resultMap.get(resultIdOf(round, label)) || null;
  const roundDone = (round) => {
    const tables = tablesOf(round);
    return Boolean(tables) && tables.every((tb) => resultOf(round, tb.label));
  };

  // 今の回戦。卓割りがまだ無い回戦に来たら「決勝の卓割り待ち」
  let currentRound = null;
  let waitingFinal = false;
  for (let r = 1; r <= rules.rounds; r += 1) {
    if (!tablesOf(r)) {
      waitingFinal = true;
      currentRound = r;
      break;
    }
    if (!roundDone(r)) {
      currentRound = r;
      break;
    }
  }
  const allDone = currentRound === null;
  const prelimDone = Array.from({ length: prelimRounds }, (_, i) => i + 1).every(roundDone);

  // 卓割りにない結果（決勝の作り直し前の残りなど）は集計に入れない
  const validResults = results.filter((r) => tablesOf(r.round)?.some((tb) => tb.label === r.table));
  const standings = computeStandings(players, validResults, rules, calcHanchan);

  const tableOfPlayer = (round, playerId) => tablesOf(round)?.find((tb) => tb.players.includes(playerId)) || null;
  const nameOf = (id) => playerMap.get(id)?.name || '（不明）';

  return {
    rules,
    players,
    playerMap,
    schedule,
    prelimRounds,
    tablesOf,
    resultOf,
    roundDone,
    currentRound,
    waitingFinal,
    allDone,
    prelimDone,
    standings,
    tableOfPlayer,
    nameOf,
    settled: t.status === 'settled',
  };
}
