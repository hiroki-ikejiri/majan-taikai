// アプリ本体。URL の # 以降で画面を切り替え、大会データの変化を受けて描き直す
//
//   #/                       主催者トップ
//   #/new                    大会作成
//   #/t/{id}[/{tab}]         参加者画面（home / input / rank / settle / rules）
//   #/t/{id}/admin[/{tab}]   主催者画面（progress / settings / share / settle）
import { h, toast } from './ui.js';
import { loadStore } from './store/index.js';
import { deriveTournament } from './derive.js';
import { renderOrganizerHome, renderWizard } from './views/organizer.js';
import { renderTournament, meKey } from './views/tournament.js';
import { renderAdmin } from './views/admin.js';
import { renderScreen } from './views/screen.js';
import { tickTimers } from './views/timerView.js';

const root = document.getElementById('app');

const state = {
  user: null,
  authReady: false,
  tid: null,
  t: null,
  tLoaded: false,
  results: [],
  chips: {},
  d: null,
  me: null,
  drafts: {},
  inputSel: null,
  rankAsOf: 'now', // ポイントランキングをどの時点で見るか
  rankMode: null, // null のときは、全回戦が終わっていれば「最終結果」、それまでは「ポイント」を開く
  openRow: null,
  chipDraft: null,
  adminEdit: null,
};

let store = null;
let unsubs = [];
let pendingRender = false;

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 't' && parts[1]) {
    if (parts[2] === 'admin') return { name: 'admin', tid: parts[1], tab: parts[3] || 'progress' };
    if (parts[2] === 'screen') return { name: 'screen', tid: parts[1] };
    return { name: 'tournament', tid: parts[1], tab: parts[2] || 'home' };
  }
  return { name: 'home' };
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// 入力中に他の人の更新が届いても、カーソルが飛ばないよう入力欄を離れるまで描き直さない
function rerender() {
  const a = document.activeElement;
  if (a && root.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') && a.type !== 'file') {
    pendingRender = true;
    return;
  }
  render();
}
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (pendingRender) {
      pendingRender = false;
      rerender();
    }
  }, 0);
});

const ctx = {
  state,
  get store() {
    return store;
  },
  rerender,
  navigate,
};

// 大会データの購読を切り替える
function watchTournament(tid) {
  if (state.tid === tid) return;
  unsubs.forEach((u) => u());
  unsubs = [];
  Object.assign(state, { tid, t: null, tLoaded: false, results: [], chips: {}, d: null, drafts: {}, inputSel: null, chipDraft: null, adminEdit: null });
  try {
    state.me = localStorage.getItem(meKey(tid));
  } catch {
    state.me = null;
  }
  const refreshDerived = () => {
    state.d = state.t ? deriveTournament(state.t, state.results) : null;
    rerender();
  };
  unsubs.push(
    store.watchTournament(tid, (t) => {
      state.t = t;
      state.tLoaded = true;
      refreshDerived();
    }),
    store.watchResults(tid, (results) => {
      state.results = results;
      refreshDerived();
    }),
    store.watchChips(tid, (chips) => {
      state.chips = chips;
      rerender();
    }),
  );
}

function render() {
  const route = parseRoute();
  let view;

  if (!state.authReady) {
    view = h('div', { class: 'page center' }, h('p', { class: 'muted' }, '読み込み中…'));
  } else if (route.name === 'home') {
    view = renderOrganizerHome(ctx);
  } else if (route.name === 'new') {
    view = renderWizard(ctx);
  } else {
    if (state.tid !== route.tid) {
      // 参加者はログイン操作なしで匿名ログインしてから読む
      if (!state.user) {
        store.ensureGuest().catch((e) => toast(`接続できませんでした（${e.message}）`, 'error'));
        view = h('div', { class: 'page center' }, h('p', { class: 'muted' }, '接続中…'));
        return mount(view);
      }
      watchTournament(route.tid);
    }
    if (!state.tLoaded) view = h('div', { class: 'page center' }, h('p', { class: 'muted' }, '大会を読み込み中…'));
    else if (!state.t) view = h('div', { class: 'page center' }, h('section', { class: 'card' }, h('p', {}, '大会が見つかりませんでした。URL を確認してください。')));
    else if (route.name === 'admin') view = renderAdmin(ctx, route.tab);
    else if (route.name === 'screen') view = renderScreen(ctx);
    else view = renderTournament(ctx, route.tab);
  }
  mount(view);
}

function mount(view) {
  const scrollY = window.scrollY;
  if (store?.isDemo) {
    view.prepend(h('div', { class: 'demo-banner' }, 'デモモード（データはこのブラウザの中だけに保存されます）'));
  }
  root.replaceChildren(view);
  window.scrollTo(0, scrollY);
  tickTimers(state);
}

// 残り時間の表示を 1 秒ごとに書き換える
setInterval(() => tickTimers(state), 1000);

// 画面（タブ）が変わったら一番上から表示する
window.addEventListener('hashchange', () => {
  state.chipDraft = null;
  render();
  window.scrollTo(0, 0);
});

(async () => {
  try {
    store = await loadStore();
  } catch (e) {
    root.replaceChildren(h('div', { class: 'page' }, h('section', { class: 'card' }, h('p', {}, `起動できませんでした（${e.message}）`))));
    return;
  }
  store.onAuthChange((user) => {
    state.user = user;
    state.authReady = true;
    // 主催者が入れ替わったら購読し直す
    if (state.tid) {
      const tid = state.tid;
      state.tid = null;
      if (user) watchTournament(tid);
    }
    render();
  });
})();
