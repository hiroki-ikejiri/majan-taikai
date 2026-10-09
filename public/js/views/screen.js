// 会場表示。会場のモニターに出しっぱなしにする画面
// （今の回戦・残り時間・各卓の状態・参加用 QR コード・ポイントランキング）。
// スクロールしなくても全員の順位が入るように、画面の高さに合わせて文字の大きさを変える
import { h, fmtPt, ptClass, qrCode } from '../ui.js';
import { shareUrlOf } from './organizer.js';
import { statusBadge } from './resultEditor.js';
import { timerDisplay, enableSound, isSoundEnabled } from './timerView.js';
import { timerControls } from './admin.js';

const FINAL_LINE = 4;

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
  const showLine = d.rules.hasFinal && !d.prelimDone && n > FINAL_LINE;
  const rankRow = (row, index) =>
    h(
      'div',
      { class: `screen-rank-row ${showLine && index === FINAL_LINE - 1 ? 'line-after' : ''}` },
      h('span', { class: `rank-badge r${row.rank}` }, row.rank),
      h('span', { class: 'screen-rank-name' }, row.name),
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
  const soundBtn = h(
    'button',
    {
      class: 'btn small',
      onClick: (e) => {
        enableSound();
        e.currentTarget.textContent = '音あり';
        e.currentTarget.disabled = true;
      },
      disabled: isSoundEnabled(),
    },
    isSoundEnabled() ? '音あり' : '音を有効にする',
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
          { class: 'screen-top' },
          h(
            'div',
            { class: 'screen-clock' },
            h('div', { class: 'screen-round' }, roundLabel),
            !d.allDone && timerDisplay('big'),
            // タイマーの操作は主催者がログインしているときだけ出す
            isOwner && timerControls(ctx, { big: true }),
          ),
          h('div', { class: 'screen-qr' }, qrCode(url), h('div', { class: 'screen-qr-text' }, 'スマホで読み取って参加')),
        ),
        tableBox,
      ),
      h('section', { class: 'screen-side' }, h('h2', {}, 'ポイントランキング'), rankList),
    ),
  );
}
