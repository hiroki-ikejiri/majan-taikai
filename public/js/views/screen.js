// 会場表示。会場のモニターに出しっぱなしにする画面
// （今の回戦・残り時間・各卓の状態・参加用 QR コード・ポイントランキング）
import { h, fmtPt, ptClass, qrCode } from '../ui.js';
import { shareUrlOf } from './organizer.js';
import { statusBadge } from './resultEditor.js';
import { timerDisplay, enableSound, isSoundEnabled } from './timerView.js';

const FINAL_LINE = 4;

const roundTitle = (d, r) => (d.rules.hasFinal && r === d.rules.rounds ? `第${r}回戦（決勝）` : `第${r}回戦`);

export function renderScreen(ctx) {
  const { state } = ctx;
  const t = state.t;
  const d = state.d;
  const r = d.currentRound;

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

  // ポイントランキング。人数が多いときは、左の列に上半分、右の列に下半分を並べる
  const showLine = d.rules.hasFinal && !d.prelimDone && d.players.length > FINAL_LINE;
  const rankRow = (row) =>
    h(
      'div',
      { class: 'screen-rank-row' },
      h('span', { class: `rank-badge r${row.rank}` }, row.rank),
      h('span', { class: 'screen-rank-name' }, row.name),
      h('span', { class: `screen-rank-total ${ptClass(row.total)}` }, fmtPt(row.total)),
    );
  const column = (list, offset) =>
    h(
      'div',
      { class: 'screen-rank-col' },
      list.flatMap((row, i) => [rankRow(row), showLine && offset + i === FINAL_LINE - 1 ? h('div', { class: 'final-line' }, '▲ 決勝 A 卓 ▲') : null]),
    );
  const twoColumns = d.standings.length > 12;
  const half = Math.ceil(d.standings.length / 2);
  const rankList = twoColumns
    ? h('div', { class: 'screen-rank-list two' }, column(d.standings.slice(0, half), 0), column(d.standings.slice(half), half))
    : h('div', { class: 'screen-rank-list' }, column(d.standings, 0));

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
        h('a', { class: 'btn small', href: `#/t/${t.id}/admin` }, '主催者メニューへ'),
      ),
    ),
    h(
      'main',
      { class: 'screen-grid' },
      h(
        'section',
        { class: 'screen-main' },
        h('div', { class: 'screen-round' }, roundLabel),
        !d.allDone && timerDisplay('big'),
        tableBox,
      ),
      h(
        'section',
        { class: 'screen-side' },
        h('div', { class: 'screen-qr' }, qrCode(url), h('div', { class: 'screen-qr-text' }, 'スマホで読み取って参加')),
        h('div', { class: 'screen-rank' }, h('h2', {}, 'ポイントランキング'), rankList),
      ),
    ),
  );
}
