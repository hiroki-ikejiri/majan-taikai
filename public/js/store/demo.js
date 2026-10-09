// デモ用ストア。localStorage に保存し、同じブラウザの別タブにも変更を伝える。
// Firebase を準備する前に画面の動きを確かめるためのもの

const KEY = 'majan-demo-v1';
const AUTH_KEY = 'majan-demo-auth';
const DEMO_ORGANIZER = { uid: 'demo-organizer', isOrganizer: true, displayName: 'デモ主催者' };
const DEMO_GUEST = { uid: 'demo-guest', isOrganizer: false, displayName: '' };

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { tournaments: {}, results: {}, chips: {}, organizers: {} };
  } catch {
    return { tournaments: {}, results: {}, chips: {}, organizers: {} };
  }
}

export function createDemoStore() {
  let db = load();
  const listeners = new Set();
  let authCb = null;

  const notify = () => listeners.forEach((fn) => fn());
  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(db));
    notify();
  };
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      db = load();
      notify();
    }
  });

  const currentAuth = () => (localStorage.getItem(AUTH_KEY) === 'organizer' ? DEMO_ORGANIZER : DEMO_GUEST);

  function watch(read, cb) {
    const fn = () => cb(read());
    listeners.add(fn);
    setTimeout(fn, 0);
    return () => listeners.delete(fn);
  }

  const randomId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  return {
    isDemo: true,

    onAuthChange(cb) {
      authCb = cb;
      setTimeout(() => cb(currentAuth()), 0);
    },
    async ensureGuest() {
      return currentAuth();
    },
    async signInOrganizer() {
      localStorage.setItem(AUTH_KEY, 'organizer');
      authCb?.(currentAuth());
    },
    async signOut() {
      localStorage.removeItem(AUTH_KEY);
      authCb?.(currentAuth());
    },

    async createTournament(data) {
      const id = randomId();
      db.tournaments[id] = { ...clone(data), createdAt: Date.now() };
      save();
      return id;
    },
    async updateTournament(id, patch) {
      db.tournaments[id] = { ...db.tournaments[id], ...clone(patch) };
      save();
    },
    watchTournament(id, cb) {
      return watch(() => (db.tournaments[id] ? { id, ...clone(db.tournaments[id]) } : null), cb);
    },
    async listMyTournaments(uid) {
      return Object.entries(db.tournaments)
        .filter(([, t]) => t.ownerUid === uid)
        .map(([id, t]) => ({ id, ...clone(t) }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    watchResults(id, cb) {
      return watch(() => Object.entries(db.results[id] || {}).map(([rid, r]) => ({ id: rid, ...clone(r) })), cb);
    },
    async submitResult(id, resultId, data) {
      db.results[id] = db.results[id] || {};
      if (db.results[id][resultId]) throw new Error('exists');
      db.results[id][resultId] = { ...clone(data), enteredAt: Date.now() };
      save();
    },
    async overwriteResult(id, resultId, data) {
      db.results[id] = db.results[id] || {};
      db.results[id][resultId] = { ...clone(data), enteredAt: Date.now() };
      save();
    },
    async deleteResult(id, resultId) {
      delete db.results[id]?.[resultId];
      save();
    },

    watchChips(id, cb) {
      return watch(() => clone(db.chips[id] || {}), cb);
    },
    async setChip(id, playerId, count) {
      db.chips[id] = db.chips[id] || {};
      if (count === null) delete db.chips[id][playerId];
      else db.chips[id][playerId] = count;
      save();
    },

    watchNames(id, cb) {
      return watch(() => clone((db.names || {})[id] || {}), cb);
    },
    async setName(id, playerId, name) {
      db.names = db.names || {};
      db.names[id] = db.names[id] || {};
      if (name === null) delete db.names[id][playerId];
      else db.names[id][playerId] = name;
      save();
    },

    async getPastPlayers(uid) {
      return clone(db.organizers[uid]?.players || {});
    },
    async addPastPlayers(uid, names) {
      const org = db.organizers[uid] || { players: {} };
      names.forEach((n) => {
        org.players[n] = (org.players[n] || 0) + 1;
      });
      db.organizers[uid] = org;
      save();
    },
  };
}
