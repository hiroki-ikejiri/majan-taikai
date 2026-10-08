// データの保存先を選ぶ。Firebase の設定があれば Firebase、なければデモ（端末内保存）
//
// どちらのストアも同じ関数をそろえる:
//   isDemo
//   onAuthChange(cb)            cb({ uid, isOrganizer, displayName } | null)
//   ensureGuest()               参加者用の匿名ログイン（画面上はログインなし）
//   signInOrganizer() / signOut()
//   createTournament(data) -> id
//   updateTournament(id, patch)
//   watchTournament(id, cb) -> unsubscribe
//   listMyTournaments(uid) -> [{ id, ...data }]
//   watchResults(id, cb) -> unsubscribe     cb([{ id, ...data }])
//   submitResult(id, resultId, data)        すでにあれば Error('exists')
//   overwriteResult(id, resultId, data) / deleteResult(id, resultId)
//   watchChips(id, cb) -> unsubscribe       cb({ playerId: count })
//   setChip(id, playerId, count)
//   getPastPlayers(uid) -> { name: count }
//   addPastPlayers(uid, names)
import { firebaseConfig } from '../config.js';

// URL に ?demo を付けるか、localStorage に majan-force-demo=1 があればデモモードにする
// （手元での画面確認と E2E テスト用。本番データには触らない）
function forceDemo() {
  try {
    return new URLSearchParams(location.search).has('demo') || localStorage.getItem('majan-force-demo') === '1';
  } catch {
    return false;
  }
}

export async function loadStore() {
  if (firebaseConfig && !forceDemo()) {
    const mod = await import('./firebase.js');
    return mod.createFirebaseStore(firebaseConfig);
  }
  const mod = await import('./demo.js');
  return mod.createDemoStore();
}

// 結果ドキュメントの ID（例 "3-B" は 3 回戦 B 卓）
export const resultIdOf = (round, table) => `${round}-${table}`;
