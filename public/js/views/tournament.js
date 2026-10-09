// 参加者の画面（名前選び・ホーム・結果入力・順位・精算・ルール）
import { h, fmtPt, ptClass, fmtYen, toast } from '../ui.js';
import { okaOf } from '../logic/scoring.js';
import { finalLineGap, placeLabel } from '../logic/standings.js';
import { compareNames } from '../logic/names.js';
import { chipStatus, computeSettlement, feePerPerson, feeReady, isFeePrepaid } from '../logic/settlement.js';
import { resultIdOf } from '../store/index.js';
import { scoreForm, newDraft } from './scoreForm.js';
import { resultTable, openResultEditor, statusBadge } from './resultEditor.js';
import { timerDisplay } from './timerView.js';

const FINAL_LINE = 4; // 決勝 A 卓に入れる人数

export const meKey = (tid) => `majan-me-${tid}`;
const HIDE_KEY = 'majan-hide-money';

const roundTitle = (d, r) => (d.rules.hasFinal && r === d.rules.rounds ? `第${r}回戦（決勝）` : `第${r}回戦`);

export function renderTournament(ctx, tab) {
  const { state } = ctx;
  const t = state.t;
  const d = state.d;
  const me = state.me && d.playerMap.has(state.me) ? state.me : null;

  if (!me) return renderPickName(ctx);

  const isOwner = state.user && state.user.uid === t.ownerUid;
  const body = h('main', { class: 'tab-body' });
  if (tab === 'input') body.append(renderInput(ctx, me));
  else if (tab === 'rank') body.append(renderRank(ctx, me));
  else if (tab === 'settle') body.append(renderSettle(ctx, me));
  else if (tab === 'rules') body.append(renderRules(ctx));
  else body.append(renderHome(ctx, me));

  const nav = (key, label) =>
    h('a', { href: `#/t/${t.id}/${key}`, class: `nav-item ${tab === key || (!tab && key === 'home') ? 'on' : ''}` }, label);

  return h(
    'div',
    { class: 'page with-nav' },
    h(
      'header',
      { class: 'app-header' },
      h('div', { class: 'title-block' }, h('h1', {}, t.name), h('span', { class: 'muted' }, `${d.nameOf(me)} さん`)),
      isOwner && h('a', { class: 'btn small', href: `#/t/${t.id}/admin` }, '主催者'),
    ),
    body,
    h('nav', { class: 'bottom-nav' }, nav('home', 'ホーム'), nav('input', '結果入力'), nav('rank', '全体順位'), nav('settle', '精算')),
  );
}

// ===== 名前を選ぶ =====
function renderPickName(ctx) {
  const { state } = ctx;
  const t = state.t;
  return h(
    'div',
    { class: 'page' },
    h('header', { class: 'app-header' }, h('h1', {}, t.name)),
    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'big-q' }, 'あなたはだれ？'),
      h('p', { class: 'muted' }, '自分の名前をタップしてください。この端末に記憶されます。'),
      h(
        'div',
        { class: 'name-grid' },
        [...t.players]
          .sort((a, b) => compareNames(a.name, b.name))
          .map((p) =>
            h(
              'button',
              {
                class: 'name-btn',
                onClick: () => {
                  try {
                    localStorage.setItem(meKey(t.id), p.id);
                  } catch {
                    /* 保存できない端末でもこの画面の間は使える */
                  }
                  state.me = p.id;
                  ctx.rerender();
                },
              },
              p.name,
            ),
          ),
      ),
    ),
  );
}

// ===== ホーム =====
function renderHome(ctx, me) {
  const { state } = ctx;
  const t = state.t;
  const d = state.d;
  const wrap = h('div', {});
  const row = d.standings.find((s) => s.id === me);

  // 今の回戦の卓
  if (d.allDone) {
    const myFinal = d.finalResult?.find((r) => r.playerId === me);
    wrap.append(
      h(
        'section',
        { class: 'card hero done' },
        h('div', { class: 'hero-sub' }, '全回戦 終了 ・ 最終結果'),
        myFinal
          ? h('div', { class: 'hero-main' }, 'あなたは ', h('span', { class: `table-label place p${myFinal.place}` }, placeLabel(myFinal.place)))
          : h('div', { class: 'hero-main' }, 'おつかれさま！'),
        row && h('p', { class: 'muted center' }, `ポイントランキングは ${row.rank} 位（${fmtPt(row.total)}）`),
        h('a', { class: 'btn big', href: `#/t/${t.id}/rank` }, '最終結果・ポイントを見る'),
        h('a', { class: 'btn primary big', href: `#/t/${t.id}/settle` }, 'チップ入力・精算へ'),
      ),
    );
  } else if (d.waitingFinal) {
    wrap.append(
      h(
        'section',
        { class: 'card hero' },
        h('div', { class: 'hero-sub' }, roundTitle(d, d.currentRound)),
        h('div', { class: 'hero-main small' }, '卓割りの発表待ち'),
        h('p', { class: 'muted' }, '予選の結果がそろったら、主催者が決勝の卓を確定します。'),
      ),
    );
  } else {
    const r = d.currentRound;
    const table = d.tableOfPlayer(r, me);
    const res = table && d.resultOf(r, table.label);
    wrap.append(
      h(
        'section',
        { class: 'card hero' },
        h('div', { class: 'hero-sub' }, roundTitle(d, r)),
        table
          ? [
              h('div', { class: 'hero-main' }, 'あなたは ', h('span', { class: 'table-label' }, `${table.label}卓`)),
              h('div', { class: 'members' }, table.players.map((pid) => h('span', { class: `member ${pid === me ? 'me' : ''}` }, d.nameOf(pid)))),
              // 主催者がこの回戦のタイマーを開始していれば、残り時間を出す
              !res && t.timer?.round === r && timerDisplay('small'),
              res
                ? h('div', { class: 'status ok' }, '結果入力済み ', h('strong', { class: ptClass(row.perRound[r]?.point || 0) }, fmtPt(row.perRound[r]?.point || 0)))
                : h('a', { class: 'btn primary big', href: `#/t/${t.id}/input` }, '結果を入力する'),
              !res && h('p', { class: 'muted center' }, '対局が終わったら、トップの人が入力してね'),
            ]
          : h('div', { class: 'hero-main small' }, 'この回戦はお休みです'),
      ),
    );
  }

  // 自分の成績（1 回戦の結果が出るまでと、全回戦が終わって最終結果を出しているときは出さない）
  if (row && row.games > 0 && !d.allDone) {
    const gap = d.rules.hasFinal && !d.prelimDone ? finalLineGap(d.standings, me, FINAL_LINE) : null;
    wrap.append(
      h(
        'section',
        { class: 'card stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, '現在の順位'), h('span', { class: 'stat-value' }, `${row.rank}`, h('small', {}, ` 位 / ${d.players.length}人`))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, '合計'), h('span', { class: `stat-value ${ptClass(row.total)}` }, fmtPt(row.total))),
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'stat-label' }, 'トップとの差'),
          row.diffToTop === 0
            ? h('span', { class: 'stat-value small top' }, 'トップ！')
            : h('span', { class: 'stat-value' }, `${row.diffToTop}`),
        ),
        gap &&
          h(
            'div',
            { class: `stat wide ${gap.inside ? 'inside' : 'outside'}` },
            h('span', { class: 'stat-label' }, '決勝 A 卓ライン'),
            h('span', { class: 'stat-value small' }, gap.inside ? `圏内（5 位と ${gap.gap}pt 差）` : `あと ${gap.gap}pt`),
          ),
        h('a', { class: 'btn big', href: `#/t/${t.id}/rank` }, '全体順位を見る'),
      ),
    );
  }

  // 自分の卓割りと成績
  wrap.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'あなたの予定と成績'),
      h(
        'table',
        { class: 'my-schedule' },
        Array.from({ length: d.rules.rounds }, (_, i) => i + 1).map((r) => {
          const table = d.tableOfPlayer(r, me);
          const pr = row?.perRound[r];
          return h(
            'tr',
            { class: r === d.currentRound ? 'current' : '' },
            h('td', {}, roundTitle(d, r)),
            h('td', {}, table ? `${table.label}卓` : d.tablesOf(r) ? '休み' : '未定'),
            h('td', { class: 'num' }, pr ? `${pr.rank}位` : ''),
            h('td', { class: `num ${pr ? ptClass(pr.point) : ''}` }, pr ? fmtPt(pr.point) : ''),
          );
        }),
      ),
    ),
    h(
      'div',
      { class: 'row center' },
      h('a', { class: 'btn link', href: `#/t/${t.id}/rules` }, 'ルールを見る'),
      h(
        'button',
        {
          class: 'btn link',
          onClick: () => {
            try {
              localStorage.removeItem(meKey(t.id));
            } catch {
              /* 無視 */
            }
            state.me = null;
            ctx.rerender();
          },
        },
        '名前を選び直す',
      ),
    ),
  );
  return wrap;
}

// ===== 結果入力 =====
function renderInput(ctx, me) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  const sel = state.inputSel;

  if (d.settled) return h('section', { class: 'card' }, h('p', {}, '精算が確定したため、入力は締め切りました。'));

  // 入力する回戦と卓（既定は今の回戦の自分の卓）
  let round = sel?.round ?? d.currentRound;
  if (!round || !d.tablesOf(round)) {
    return h('section', { class: 'card' }, h('p', {}, d.allDone ? '全回戦の入力が終わりました。' : '入力できる卓がありません。'));
  }
  const tables = d.tablesOf(round);
  let table = (sel?.label && tables.find((tb) => tb.label === sel.label)) || d.tableOfPlayer(round, me) || tables[0];

  const picker = h(
    'div',
    { class: 'row picker' },
    h(
      'select',
      {
        class: 'input',
        onChange: (e) => {
          state.inputSel = { round: Number(e.target.value), label: null };
          ctx.rerender();
        },
      },
      Array.from({ length: d.rules.rounds }, (_, i) => i + 1)
        .filter((r) => d.tablesOf(r))
        .map((r) => h('option', { value: r, selected: r === round }, roundTitle(d, r))),
    ),
    h(
      'select',
      {
        class: 'input',
        onChange: (e) => {
          state.inputSel = { round, label: e.target.value };
          ctx.rerender();
        },
      },
      tables.map((tb) => h('option', { value: tb.label, selected: tb.label === table.label }, `${tb.label}卓${d.resultOf(round, tb.label) ? '（入力済み）' : ''}`)),
    ),
  );

  const rid = resultIdOf(round, table.label);
  const existing = d.resultOf(round, table.label);
  const section = h('section', { class: 'card' }, h('h2', {}, `${roundTitle(d, round)} ${table.label}卓`), picker);

  if (existing) {
    section.append(resultTable(d, existing), h('p', { class: 'muted' }, `入力: ${existing.enteredByName || '—'}。間違いがあれば主催者に修正を頼んでください。`));
    return section;
  }

  state.drafts[rid] = state.drafts[rid] || newDraft(table.players);
  section.append(
    scoreForm({
      draft: state.drafts[rid],
      tablePlayers: table.players,
      nameOf: d.nameOf,
      rules: d.rules,
      onSubmit: async (seats) => {
        try {
          await store.submitResult(t.id, rid, { round, table: table.label, seats, enteredBy: me, enteredByName: d.nameOf(me) });
          delete state.drafts[rid];
          state.inputSel = null;
          toast('保存しました', 'ok');
          ctx.navigate(`#/t/${t.id}/home`);
        } catch (e) {
          if (e.message === 'exists') toast('この卓はすでに別の人が入力済みです', 'error');
          else toast(`保存できませんでした。電波を確認してもう一度（${e.message}）`, 'error');
          ctx.rerender();
          return false;
        }
        return true;
      },
    }),
  );
  return section;
}

// ===== 全体順位・卓割り =====
function renderRank(ctx, me) {
  const { state } = ctx;
  const d = state.d;
  const modes = d.finalResult ? ['final', 'rank', 'tables'] : ['rank', 'tables'];
  const mode = modes.includes(state.rankMode) ? state.rankMode : modes[0];
  const seg = h(
    'div',
    { class: 'segmented' },
    modes.map((m) =>
      h(
        'button',
        {
          class: mode === m ? 'on' : '',
          onClick: () => {
            state.rankMode = m;
            ctx.rerender();
          },
        },
        { final: '最終結果', rank: 'ポイント', tables: '卓・結果' }[m],
      ),
    ),
  );

  if (mode === 'tables') return h('div', {}, seg, renderTables(ctx, me));
  if (mode === 'final') return h('div', {}, seg, renderFinalResult(d, me));

  // どの時点の順位を見るか（'now' は今。数字はその回戦が終わった時点）
  const roundShort = (r) => (d.rules.hasFinal && r === d.rules.rounds ? '決勝' : `予選${r}回戦`);
  const partial = !d.allDone && d.results.some((res) => res.round > d.lastDoneRound);
  const nowLabel = d.allDone
    ? '現在（大会終了時）'
    : d.lastDoneRound === 0
      ? partial ? '現在（入力済みの卓まで）' : '現在'
      : `現在（${roundShort(d.lastDoneRound)}終了時${partial ? '＋入力済みの卓' : ''}）`;
  const options = [['now', nowLabel]];
  for (let r = d.lastDoneRound; r >= 1; r -= 1) {
    if (r === d.lastDoneRound && !partial) continue; // 「現在」と同じなので出さない
    options.push([String(r), `${roundShort(r)}終了時`]);
  }
  const asOf = options.some(([v]) => v === String(state.rankAsOf)) ? String(state.rankAsOf) : 'now';
  const asOfRound = asOf === 'now' ? null : Number(asOf);
  const standings = asOfRound ? d.standingsAt(asOfRound) : d.standings;
  const picker = h(
    'select',
    {
      class: 'input as-of',
      'aria-label': 'いつの時点の順位か',
      onChange: (e) => {
        state.rankAsOf = e.target.value;
        ctx.rerender();
      },
    },
    options.map(([v, label]) => h('option', { value: v, selected: v === asOf }, label)),
  );

  // 決勝 A 卓の帯は、予選の途中か予選終了時点の順位のときだけ出す（決勝の結果が入ったあとの順位では意味がないため）
  const finalStarted = d.results.some((res) => res.round === d.rules.rounds);
  const showLine =
    d.rules.hasFinal && d.players.length > FINAL_LINE && (asOfRound ? asOfRound <= d.prelimRounds : !finalStarted);
  const list = h('div', { class: 'rank-list' });
  standings.forEach((row, i) => {
    const open = state.openRow === row.id;
    list.append(
      h(
        'button',
        {
          class: `rank-row ${row.id === me ? 'me' : ''}`,
          onClick: () => {
            state.openRow = open ? null : row.id;
            ctx.rerender();
          },
        },
        h('span', { class: `rank-badge r${row.rank}` }, row.rank),
        h('span', { class: 'rank-name' }, row.name),
        h('span', { class: `rank-total ${ptClass(row.total)}` }, fmtPt(row.total)),
        h('span', { class: 'rank-diff muted' }, i === 0 ? '' : `${row.diffToTop}`),
      ),
    );
    if (open) {
      list.append(
        h(
          'div',
          { class: 'rank-detail' },
          Array.from({ length: asOfRound ?? d.rules.rounds }, (_, k) => k + 1).map((r) => {
            const pr = row.perRound[r];
            return h('span', { class: 'chip-mini' }, `${r}回 `, pr ? h('b', { class: ptClass(pr.point) }, fmtPt(pr.point)) : '—');
          }),
        ),
      );
    }
    if (showLine && i === FINAL_LINE - 1) list.append(h('div', { class: 'final-line' }, '▲ 決勝 A 卓 ▲'));
  });

  return h(
    'div',
    {},
    seg,
    picker,
    h('section', { class: 'card flush' }, h('div', { class: 'rank-head muted' }, h('span', {}, '順位'), h('span', {}, '名前'), h('span', {}, '合計'), h('span', {}, 'トップ差')), list),
  );
}

// 最終結果。決勝卓の着順で決まる大会の順位と、ポイントランキングの順位を並べて見せる
function renderFinalResult(d, me) {
  const pointRank = new Map(d.standings.map((s) => [s.id, s]));
  const list = h('div', { class: 'rank-list' });
  d.finalResult.forEach((r, i) => {
    const st = pointRank.get(r.playerId);
    if (d.rules.hasFinal && i > 0 && i % 4 === 0) list.append(h('div', { class: 'table-divider' }, `${r.table}卓`));
    list.append(
      h(
        'div',
        { class: `rank-row final-row ${r.playerId === me ? 'me' : ''}` },
        h('span', { class: `rank-badge r${r.place}` }, r.place),
        h('span', { class: 'rank-name' }, d.nameOf(r.playerId), h('small', { class: 'muted place-label' }, ` ${placeLabel(r.place)}`)),
        h('span', { class: `rank-total ${ptClass(st?.total || 0)}` }, fmtPt(st?.total || 0)),
        h('span', { class: 'rank-diff muted' }, st ? `${st.rank}位` : ''),
      ),
    );
  });
  return h(
    'section',
    { class: 'card flush' },
    d.rules.hasFinal && h('p', { class: 'muted final-note' }, '決勝の A 卓の 1 着が優勝、2 着が準優勝…、B 卓の 1 着が 5 位…です。お金の精算はポイントで計算します。'),
    h('div', { class: 'rank-head muted' }, h('span', {}, '順位'), h('span', {}, '名前'), h('span', {}, '合計pt'), h('span', {}, 'pt順位')),
    d.rules.hasFinal && h('div', { class: 'table-divider' }, `${d.finalResult[0]?.table || 'A'}卓`),
    list,
  );
}

// 卓割りと各卓の結果。主催者には「修正」ボタンを出す
function renderTables(ctx, me) {
  const { state } = ctx;
  const d = state.d;
  const isOwner = state.user?.isOrganizer && state.user.uid === state.t.ownerUid;
  const ranks = new Map(d.standings.map((s) => [s.id, s]));
  return h(
    'div',
    {},
    Array.from({ length: d.rules.rounds }, (_, i) => i + 1).map((r) => {
      const tables = d.tablesOf(r);
      return h(
        'section',
        { class: `card ${r === d.currentRound ? 'current' : ''}` },
        h('h2', {}, roundTitle(d, r)),
        tables
          ? h(
              'div',
              { class: 'table-grid results' },
              tables.map((tb) => {
                const res = d.resultOf(r, tb.label);
                // 結果があれば着順で、なければ卓割りの順で並べる
                const lines = res
                  ? res.seats
                      .map((seat) => ({ pid: seat.playerId, score: seat.score, info: ranks.get(seat.playerId)?.perRound[r] }))
                      .sort((a, b) => (a.info?.rank || 9) - (b.info?.rank || 9))
                  : tb.players.map((pid) => ({ pid }));
                return h(
                  'div',
                  { class: `table-card ${tb.players.includes(me) ? 'mine' : ''} ${res ? 'done' : ''}` },
                  h('div', { class: 'row between' }, h('strong', {}, `${tb.label}卓`), statusBadge(d, r, tb.label)),
                  lines.map((l) =>
                    h(
                      'div',
                      { class: `table-line ${l.pid === me ? 'me' : ''}` },
                      h('span', { class: 'tl-name' }, l.info && h('small', { class: 'tl-rank' }, `${l.info.rank}着`), d.nameOf(l.pid)),
                      l.info && h('span', { class: 'tl-score muted' }, (l.score / 1000).toFixed(1)),
                      l.info && h('span', { class: `tl-pt ${ptClass(l.info.point)}` }, fmtPt(l.info.point)),
                    ),
                  ),
                  isOwner && !d.settled && h('button', { class: 'btn small edit-result', onClick: () => openResultEditor(ctx, r, tb) }, res ? '修正' : '入力'),
                );
              }),
            )
          : h('p', { class: 'muted' }, '予選終了後に成績順で決まります'),
      );
    }),
  );
}

// ===== 精算 =====
function hideMoney() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function renderSettle(ctx, me) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  if (!d.allDone) {
    return h('section', { class: 'card' }, h('h2', {}, '精算'), h('p', { class: 'muted' }, '最終回の結果がそろうと、チップ入力と精算ができるようになります。'));
  }

  const chips = state.chips;
  const status = chipStatus(d.players, chips);
  const wrap = h('div', {});

  // 自分のチップ枚数
  const myChip = Number.isFinite(chips[me]) ? chips[me] : null;
  const chipDraft = state.chipDraft ?? myChip ?? 0;
  const draftLabel = h('span', { class: 'chip-count' }, fmtPt(chipDraft).replace('±0', '0'));
  const setDraft = (v) => {
    state.chipDraft = v;
    draftLabel.textContent = fmtPt(v).replace('±0', '0');
  };
  // 全員そろった後（または精算確定後）は 1 行に小さくまとめる。「直す」を押したときだけ入力欄を開く
  const compact = d.settled || (status.ready && !state.chipEditOpen);
  if (compact) {
    wrap.append(
      h(
        'section',
        { class: 'card my-chip-compact' },
        h('div', { class: 'row between' },
          h('span', {}, 'あなたのチップ ', h('strong', {}, `${fmtPt(myChip ?? 0).replace('±0', '0')} 枚`)),
          d.settled
            ? h('span', { class: 'badge' }, '確定済み')
            : h('button', { class: 'btn small', onClick: () => { state.chipEditOpen = true; ctx.rerender(); } }, '直す'),
        ),
      ),
    );
  } else {
    wrap.append(
      h(
        'section',
        { class: 'card center' },
        h('h2', {}, 'あなたのチップ枚数'),
        h(
          'div',
          { class: 'stepper-row' },
          h('button', { class: 'btn round', onClick: () => setDraft((state.chipDraft ?? myChip ?? 0) - 1) }, '−'),
          draftLabel,
          h('button', { class: 'btn round', onClick: () => setDraft((state.chipDraft ?? myChip ?? 0) + 1) }, '＋'),
        ),
        h('p', { class: 'muted' }, '増えた枚数はプラス、減った枚数はマイナス'),
        h(
          'button',
          {
            class: 'btn primary big',
            onClick: async () => {
              try {
                await store.setChip(t.id, me, state.chipDraft ?? myChip ?? 0);
                state.chipDraft = null;
                state.chipEditOpen = false;
                toast('チップ枚数を保存しました', 'ok');
                // 枚数が変わらなかったときはデータの更新が来ないので、ここで描き直す
                ctx.rerender();
              } catch (e) {
                toast(`保存できませんでした（${e.message}）`, 'error');
              }
            },
          },
          myChip === null ? '保存する' : `保存する（いま ${fmtPt(myChip)} 枚）`,
        ),
      ),
    );
  }

  // チップの集まり具合（全員が入れて合計 0 枚になったら、もう出さない）
  if (!status.ready) wrap.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'チップの入力状況'),
      h('div', { class: 'row between' }, h('span', {}, `入力済み ${d.players.length - status.missing.length} / ${d.players.length} 人`), h('span', { class: `badge ${status.total === 0 ? 'ok' : 'warn'}` }, `合計 ${fmtPt(status.total)} 枚`)),
      status.missing.length > 0 && h('p', { class: 'muted' }, `未入力: ${status.missing.map((p) => p.name).join('、')}`),
      status.missing.length === 0 && status.total !== 0 && h('p', { class: 'error-line' }, '合計が 0 枚になっていません。数え直してください。'),
    ),
  );

  // 精算結果
  if (!feeReady(d.rules, t.venueFee)) {
    wrap.append(h('section', { class: 'card' }, h('p', { class: 'muted' }, '主催者の場代入力を待っています。')));
    return wrap;
  }
  const rows = computeSettlement(d.standings, chips, d.rules, t.venueFee);
  const hidden = hideMoney();
  const mine = rows.find((r) => r.id === me);
  const money = (v) => (hidden ? '＊＊＊' : fmtYen(v));
  wrap.append(
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'row between' },
        h('h2', {}, status.ready ? '精算額' : '精算額（暫定）'),
        h(
          'button',
          {
            class: 'btn small',
            onClick: () => {
              try {
                localStorage.setItem(HIDE_KEY, hidden ? '0' : '1');
              } catch {
                /* 無視 */
              }
              ctx.rerender();
            },
          },
          hidden ? '金額を表示' : '金額を隠す',
        ),
      ),
      !status.ready && h('p', { class: 'muted' }, 'チップが全員分そろって合計 0 枚になると確定します。'),
      h(
        'p',
        { class: 'muted' },
        isFeePrepaid(d.rules)
          ? '場代は事前に徴収済みのため、精算には含めていません'
          : `場代 ${t.venueFee.toLocaleString()} 円 ÷ ${d.players.length} 人 → 1 人 ${feePerPerson(t.venueFee, d.players.length, d.rules.feeRoundUnit).toLocaleString()} 円`,
      ),
      mine &&
        h(
          'div',
          { class: `my-amount ${mine.amount >= 0 ? 'plus' : 'minus'}` },
          h('span', {}, mine.amount >= 0 ? 'あなたの受け取り' : 'あなたの支払い'),
          h('strong', {}, hidden ? '＊＊＊' : `${Math.abs(mine.amount).toLocaleString()}円`),
          h('small', {}, hidden ? '' : `pt ${fmtYen(mine.pointYen)} ／ チップ ${fmtYen(mine.chipYen)}${mine.fee ? ` ／ 場代 −${mine.fee.toLocaleString()}円` : ''}`),
        ),
      h(
        'table',
        { class: 'settle-table' },
        h('tr', {}, h('th', {}, '順位'), h('th', {}, '名前'), h('th', { class: 'num' }, 'pt'), h('th', { class: 'num' }, 'チップ'), h('th', { class: 'num' }, '精算')),
        rows.map((r) =>
          h(
            'tr',
            { class: r.id === me ? 'me' : '' },
            h('td', {}, r.rank),
            h('td', {}, r.name),
            h('td', { class: `num ${ptClass(r.total)}` }, fmtPt(r.total)),
            h('td', { class: 'num' }, fmtPt(r.chipCount)),
            h('td', { class: `num ${ptClass(r.amount)}` }, money(r.amount)),
          ),
        ),
      ),
    ),
  );
  return wrap;
}

// ===== ルール =====
function renderRules(ctx) {
  const d = ctx.state.d;
  const t = ctx.state.t;
  const r = d.rules;
  return h(
    'div',
    {},
    h(
      'section',
      { class: 'card' },
      h('h2', {}, '点数・精算'),
      h(
        'ul',
        { class: 'rule-list' },
        h('li', {}, `${r.startPoints.toLocaleString()} 点持ち ${r.returnPoints.toLocaleString()} 点返し（百の位は五捨六入）`),
        h('li', {}, `ウマ ${r.uma.map(fmtPt).join(' / ')}、オカ +${okaOf(r)}`),
        h('li', {}, '同点は起家に近い方が上'),
        h('li', {}, r.hasFinal ? `予選 ${r.rounds - 1} 回 ＋ 決勝 1 回（決勝は成績順の卓）` : `${r.rounds} 回戦`),
        h('li', {}, `1000 点（1pt）${r.rate} 円、チップ 1 枚 ${r.chipUnit} 円`),
        h('li', {}, isFeePrepaid(r) ? '場代は事前に徴収済み（精算には含めません）' : '場代は精算時に人数で割り勘'),
      ),
    ),
    (t.ruleSections || []).map((s) =>
      h(
        'section',
        { class: 'card' },
        h('h2', {}, s.title),
        h('ul', { class: 'rule-list' }, s.body.split('\n').filter((l) => l.trim()).map((l) => h('li', {}, l.replace(/^[・\-*]\s*/, '')))),
      ),
    ),
  );
}
