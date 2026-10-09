// Firebase（Firestore + Authentication）を使うストア。
// 主催者は Google ログイン、参加者は匿名ログイン（画面上はログイン操作なし）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const toUser = (u) =>
    u
      ? {
          uid: u.uid,
          isOrganizer: u.providerData.some((p) => p.providerId === 'google.com'),
          displayName: u.displayName || '',
        }
      : null;

  const tRef = (id) => doc(db, 'tournaments', id);

  return {
    isDemo: false,

    onAuthChange(cb) {
      onAuthStateChanged(auth, (u) => cb(toUser(u)));
    },
    async ensureGuest() {
      if (auth.currentUser) return toUser(auth.currentUser);
      const cred = await signInAnonymously(auth);
      return toUser(cred.user);
    },
    async signInOrganizer() {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    async signOut() {
      await fbSignOut(auth);
    },

    async createTournament(data) {
      const ref = await addDoc(collection(db, 'tournaments'), { ...data, createdAt: Date.now() });
      return ref.id;
    },
    async updateTournament(id, patch) {
      await updateDoc(tRef(id), patch);
    },
    watchTournament(id, cb) {
      return onSnapshot(
        tRef(id),
        (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        () => cb(null),
      );
    },
    async listMyTournaments(uid) {
      const snap = await getDocs(query(collection(db, 'tournaments'), where('ownerUid', '==', uid)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    },

    watchResults(id, cb) {
      return onSnapshot(collection(db, 'tournaments', id, 'results'), (snap) =>
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      );
    },
    // 同じ卓の二重入力を防ぐため、トランザクションで「まだ無いときだけ」作る
    async submitResult(id, resultId, data) {
      const ref = doc(db, 'tournaments', id, 'results', resultId);
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        if (cur.exists()) throw new Error('exists');
        tx.set(ref, { ...data, enteredAt: serverTimestamp() });
      });
    },
    async overwriteResult(id, resultId, data) {
      await setDoc(doc(db, 'tournaments', id, 'results', resultId), { ...data, enteredAt: serverTimestamp() });
    },
    async deleteResult(id, resultId) {
      await deleteDoc(doc(db, 'tournaments', id, 'results', resultId));
    },

    watchChips(id, cb) {
      return onSnapshot(collection(db, 'tournaments', id, 'chips'), (snap) => {
        const chips = {};
        snap.docs.forEach((d) => {
          chips[d.id] = d.data().count;
        });
        cb(chips);
      });
    },
    async setChip(id, playerId, count) {
      const ref = doc(db, 'tournaments', id, 'chips', playerId);
      if (count === null) await deleteDoc(ref);
      else await setDoc(ref, { count });
    },

    watchNames(id, cb) {
      return onSnapshot(collection(db, 'tournaments', id, 'names'), (snap) => {
        const names = {};
        snap.docs.forEach((d) => {
          names[d.id] = d.data().name;
        });
        cb(names);
      });
    },
    async setName(id, playerId, name) {
      const ref = doc(db, 'tournaments', id, 'names', playerId);
      if (name === null) await deleteDoc(ref);
      else await setDoc(ref, { name });
    },

    async getPastPlayers(uid) {
      const snap = await getDoc(doc(db, 'organizers', uid));
      return snap.exists() ? snap.data().players || {} : {};
    },
    async addPastPlayers(uid, names) {
      const ref = doc(db, 'organizers', uid);
      const snap = await getDoc(ref);
      const players = snap.exists() ? snap.data().players || {} : {};
      names.forEach((n) => {
        players[n] = (players[n] || 0) + 1;
      });
      await setDoc(ref, { players });
    },
  };
}
