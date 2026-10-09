// 会場表示。会場のモニターに出しっぱなしにする画面
// （今の回戦・残り時間・各卓の状態・参加用 QR コード・ポイントランキング）。
// スクロールしなくても全員の順位が入るように、画面の高さに合わせて文字の大きさを変える
import { h, fmtPt, ptClass, qrCode } from '../ui.js';
import { shareUrlOf } from './organizer.js';
import { statusBadge } from './resultEditor.js';
import { timerDisplay, enableSound, disableSound, isSoundEnabled } from './timerView.js';
import { timerControls } from './admin.js';

const FINAL_LINE = 4;
// 会場表示で名前を出すのは上位だけにする（下位の人がさらされないように、それ以外は順位とポイントだけ）
const NAMED_RANKS = 8;

const roundTitle = (d, r) => (d.rules.hasFinal && r === d.rules.rounds ? `第${r}回戦（決勝）` : `第${r}回戦`);

export function renderScreen(ctx) {
  const { state } = ctx;
  const t = state.t;
  const d = state.d;
  const r = d.currentRound;
  const isOwner = state.user?.isOrganizer && state.user.uid === t.ownerUid;

  // 今の回戦の見出し
  const roundLabel = d.allDone
    ? '全回戦 終了'
    : d.waitingFinal
      ? `${roundTitle(d, r)}　卓割りの発表待ち`
      : roundTitle(d, r);

  // 今の回戦の卓
  const tables = r && d.tablesOf(r);
  const tableBox = tables
    ? h(
        'div',
        { class: 'screen-tables' },
        tables.map((tb) =>
          h(
            'div',
            { class: 'screen-table' },
            h('div', { class: 'row between' }, h('strong', {}, `${tb.label}卓`), statusBadge(d, r, tb.label)),
            h('div', { class: 'screen-table-names' }, tb.players.map((pid) => d.nameOf(pid)).join('・')),
          ),
        ),
      )
    : null;

  // ポイントランキング。人数に合わせて 1〜3 列にし、左の列から上位を並べる。
  // 1 列の行数（--rows）から文字の大きさを決めて、画面の高さにぴったり収める
  const n = d.standings.length;
  const cols = n > 24 ? 3 : n > 12 ? 2 : 1;
  const perCol = Math.ceil(n / cols);
  const noResults = d.results.length === 0;
  const showLine = d.rules.hasFinal && !d.prelimDone && n > FINAL_LINE && !noResults;
  const rankRow = (row, index) =>
    h(
      'div',
      { class: `screen-rank-row ${showLine && index === FINAL_LINE - 1 ? 'line-after' : ''}` },
      h('span', { class: `rank-badge r${row.rank}` }, row.rank),
      h('span', { class: `screen-rank-name ${index < NAMED_RANKS ? '' : 'hidden-name'}` }, index < NAMED_RANKS ? row.name : ''),
      h('span', { class: `screen-rank-total ${ptClass(row.total)}` }, fmtPt(row.total)),
    );
  const rankList = h(
    'div',
    { class: 'screen-rank-list', style: `--cols: ${cols}; --rows: ${perCol}` },
    Array.from({ length: cols }, (_, c) =>
      h('div', { class: 'screen-rank-col' }, d.standings.slice(c * perCol, (c + 1) * perCol).map((row, i) => rankRow(row, c * perCol + i))),
    ),
  );

  const url = shareUrlOf(t.id);
  // 音のオン・オフ（押すたびに切り替わる）
  const soundLabel = () => (isSoundEnabled() ? '音 オン' : '音 オフ');
  const soundBtn = h(
    'button',
    {
      class: `btn small ${isSoundEnabled() ? 'primary' : ''}`,
      'aria-pressed': isSoundEnabled() ? 'true' : 'false',
      onClick: (e) => {
        if (isSoundEnabled()) disableSound();
        else enableSound();
        e.currentTarget.textContent = soundLabel();
        e.currentTarget.classList.toggle('primary', isSoundEnabled());
        e.currentTarget.setAttribute('aria-pressed', isSoundEnabled() ? 'true' : 'false');
      },
    },
    soundLabel(),
  );

  return h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'screen-header' },
      h('h1', {}, t.name),
      h(
        'div',
        { class: 'row' },
        soundBtn,
        // 参加用 QR コードはふだん隠しておき、参加者に読み取ってもらうときだけ出す
        h(
          'button',
          {
            class: `btn small ${state.screenQr ? 'primary' : ''}`,
            onClick: () => {
              state.screenQr = !state.screenQr;
              ctx.rerender();
            },
          },
          state.screenQr ? 'QR を隠す' : 'QR を表示',
        ),
        h('button', { class: 'btn small', onClick: () => document.documentElement.requestFullscreen?.() }, '全画面'),
        isOwner && h('a', { class: 'btn small', href: `#/t/${t.id}/admin` }, '主催者メニューへ'),
      ),
    ),
    h(
      'main',
      { class: 'screen-grid' },
      h(
        'section',
        { class: 'screen-main' },
        h(
          'div',
          { class: `screen-top ${state.screenQr ? 'with-qr' : ''}` },
          h(
            'div',
            { class: 'screen-clock' },
            h('div', { class: 'screen-round' }, roundLabel),
            !d.allDone && timerDisplay('big'),
            // タイマーの操作は主催者がログインしているときだけ出す
            isOwner && timerControls(ctx, { big: true }),
          ),
          state.screenQr && h('div', { class: 'screen-qr' }, qrCode(url), h('div', { class: 'screen-qr-text' }, 'スマホで読み取って参加')),
        ),
        tableBox,
      ),
      h(
        'section',
        { class: 'screen-side' },
        h('h2', {}, 'ポイント順位'),
        noResults ? h('p', { class: 'screen-empty' }, '第1回戦の結果が入ると、ここに順位が出ます') : rankList,
        !noResults && n > NAMED_RANKS && h('p', { class: 'muted screen-rank-note' }, `名前は上位 ${NAMED_RANKS} 人まで表示しています`),
      ),
    ),
  );
}
