// 主催者の画面（進行・設定・共有・精算）
import { h, fmtPt, toast, copyText, errorText } from '../ui.js';
import { buildResultMarkdown, resultFileName } from '../logic/exportMarkdown.js';
import { DEFAULT_RULES } from '../logic/scoring.js';
import { makeFinalTables, TABLE_LABELS } from '../logic/seating.js';
import { chipStatus, feeReady, isFeePrepaid } from '../logic/settlement.js';
import { openResultEditor, statusBadge } from './resultEditor.js';
import { timerDisplay } from './timerView.js';
import { startTimer, pauseTimer, resumeTimer } from '../logic/timer.js';
import { rulesEditor, shareCard, feeModeSwitch, rulesProblem } from './organizer.js';

const roundTitle = (d, r) => (d.rules.hasFinal && r === d.rules.rounds ? `第${r}回戦（決勝）` : `第${r}回戦`);

export function renderAdmin(ctx, tab = 'progress') {
  const { state } = ctx;
  const t = state.t;

  if (!state.user?.isOrganizer || state.user.uid !== t.ownerUid) {
    return h(
      'div',
      { class: 'page' },
      h('section', { class: 'card' }, h('p', {}, 'この画面は大会を作った主催者だけが使えます。'), h('a', { class: 'btn', href: `#/t/${t.id}` }, '参加者画面へ')),
    );
  }

  const body = h('main', { class: 'tab-body' });
  if (tab === 'settings') body.append(renderSettings(ctx));
  else if (tab === 'share') body.append(shareCard(t.id));
  else if (tab === 'settle') body.append(renderAdminSettle(ctx));
  else body.append(renderProgress(ctx));

  const nav = (key, label) => h('a', { href: `#/t/${t.id}/admin/${key}`, class: `nav-item ${tab === key ? 'on' : ''}` }, label);
  return h(
    'div',
    { class: 'page with-nav admin' },
    h(
      'header',
      { class: 'app-header' },
      h('a', { href: '#/', class: 'back' }, '‹ 一覧'),
      h('div', { class: 'title-block' }, h('h1', {}, t.name), h('span', { class: 'muted' }, '主催者メニュー')),
      h('a', { class: 'btn small', href: `#/t/${t.id}` }, '参加者画面'),
    ),
    body,
    h('nav', { class: 'bottom-nav' }, nav('progress', '進行'), nav('settings', '設定'), nav('share', '共有'), nav('settle', '精算')),
  );
}

// ===== 進行 =====
function renderProgress(ctx) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  const wrap = h('div', {});

  wrap.append(timerCard(ctx));

  if (d.allDone) {
    wrap.append(
      h('section', { class: 'card hero done' },
        h('h2', {}, '全回戦が終わりました'),
        h('a', { class: 'btn primary big', href: `#/t/${t.id}/admin/settle` }, '精算・結果の書き出しへ'),
      ),
    );
  }

  // 決勝の卓割り
  if (d.rules.hasFinal) {
    const finalRound = d.rules.rounds;
    const hasFinalTables = Boolean(d.tablesOf(finalRound));
    const finalStarted = hasFinalTables && d.tablesOf(finalRound).some((tb) => d.resultOf(finalRound, tb.label));
    if (d.prelimDone && !finalStarted) {
      const proposal = makeFinalTables(d.standings.map((s) => s.id));
      const current = hasFinalTables ? d.tablesOf(finalRound).map((tb) => tb.players) : null;
      // 確定後に予選の結果を直して順位が変わると、確定済みの卓と今の順位の案がずれる
      const changed = current && JSON.stringify(current) !== JSON.stringify(proposal);
      const rankOf = (id) => d.standings.find((s) => s.id === id)?.rank;
      const confirmTables = async () => {
        if (hasFinalTables && !window.confirm('決勝の卓を今の順位で作り直します。参加者に発表済みの卓が変わりますが、よろしいですか？')) return;
        const schedule = { ...t.schedule, [String(finalRound)]: proposal.map((ids, i) => ({ label: TABLE_LABELS[i], players: ids })) };
        try {
          await store.updateTournament(t.id, { schedule });
          toast(hasFinalTables ? '決勝の卓を作り直しました' : '決勝の卓を確定しました', 'ok');
        } catch (e) {
          toast(`確定できませんでした。${errorText(e)}`, 'error');
        }
      };
      wrap.append(
        h(
          'section',
          { class: 'card hero' },
          h('h2', {}, hasFinalTables ? '決勝の卓割り（確定済み）' : '予選終了！決勝の卓を確定'),
          h('p', { class: 'muted' }, hasFinalTables ? '参加者に発表している決勝の卓です。' : '予選の順位で、上位 4 人から A 卓・B 卓…に入ります。同点のときは名前順です。'),
          h(
            'div',
            { class: 'table-grid' },
            (current || proposal).map((ids, i) =>
              h('div', { class: 'table-card' }, h('strong', {}, `${TABLE_LABELS[i]}卓`), ids.map((id) => h('div', {}, `${rankOf(id)}位 ${d.nameOf(id)}`))),
            ),
          ),
          changed && h('p', { class: 'error-line' }, '確定したあとに予選の結果が直され、今の順位とずれています。'),
          (!hasFinalTables || changed) &&
            h('button', { class: 'btn primary big', onClick: confirmTables }, hasFinalTables ? '今の順位で作り直す' : 'この卓割りで確定'),
        ),
      );
    }
  }

  // 回戦ごとの入力状況
  for (let r = 1; r <= d.rules.rounds; r += 1) {
    const tables = d.tablesOf(r);
    const section = h('section', { class: `card ${r === d.currentRound ? 'current' : ''}` }, h('h2', {}, roundTitle(d, r)));
    if (!tables) {
      section.append(h('p', { class: 'muted' }, '予選終了後に確定します'));
    } else {
      section.append(
        h(
          'div',
          { class: 'table-grid' },
          tables.map((tb) => {
            const res = d.resultOf(r, tb.label);
            return h(
              'button',
              {
                class: `table-card ${res ? 'done' : ''}`,
                onClick: () =>
                  d.settled
                    ? toast('精算を確定済みのため直せません。直すときは「精算」タブで「確定を取り消す」を押してください', 'error')
                    : openResultEditor(ctx, r, tb),
              },
              h('div', { class: 'row between' }, h('strong', {}, `${tb.label}卓`), statusBadge(d, r, tb.label)),
              tb.players.map((pid) => {
                const pr = d.standings.find((s) => s.id === pid)?.perRound[r];
                return h('div', { class: 'row between' }, h('span', {}, d.nameOf(pid)), pr ? h('span', {}, fmtPt(pr.point)) : null);
              }),
            );
          }),
        ),
      );
    }
    wrap.append(section);
  }
  return wrap;
}

// ===== 設定 =====
function renderSettings(ctx) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  // 画面上で編集する作業用コピー（保存ボタンで反映）
  if (!state.adminEdit || state.adminEdit.tid !== t.id || !state.adminEdit.dirty) {
    state.adminEdit = {
      tid: t.id,
      rules: { ...DEFAULT_RULES, ...t.rules, uma: [...(t.rules?.uma || DEFAULT_RULES.uma)] },
      sections: (t.ruleSections || []).map((s) => ({ ...s })),
      // 参加者が自分で直した名前も反映した名前を、編集の出発点にする
      names: d.players.map((p) => p.name),
      dirty: false,
    };
  }
  const ed = state.adminEdit;
  const markDirty = () => {
    ed.dirty = true;
  };

  const save = async () => {
    const r = ed.rules;
    const problem = rulesProblem(r);
    if (problem) return toast(problem, 'error');
    // 結果が入ったあとに持ち点を変えると、入力済みの卓の合計と合わなくなる
    if (r.startPoints !== t.rules.startPoints && d.results.length > 0
      && !window.confirm('すでに結果が入っています。持ち点を変えると、入力済みの卓の合計と合わなくなります。それでも変えますか？')) return;
    const names = ed.names.map((n) => n.trim());
    const empty = names.findIndex((n) => !n);
    if (empty >= 0) return toast(`${empty + 1} 人目の名前が空です`, 'error');
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return toast(`「${dup}」が 2 人います。どちらかの名前を変えてください`, 'error');
    try {
      await store.updateTournament(t.id, {
        rules: r,
        ruleSections: ed.sections.filter((s) => s.title.trim() || s.body.trim()),
        players: t.players.map((p, i) => ({ ...p, name: names[i] })),
      });
      // 主催者が保存した名前を正とするので、参加者が直した名前は消す
      await Promise.all(Object.keys(state.names || {}).map((pid) => store.setName(t.id, pid, null)));
      ed.dirty = false;
      toast('設定を保存しました。ポイントは新しいルールで再計算されます', 'ok');
    } catch (e) {
      toast(`保存できませんでした。${errorText(e)}`, 'error');
    }
  };

  return h(
    'div',
    {},
    h(
      'section',
      { class: 'card' },
      h('h2', {}, '参加者の名前'),
      h('p', { class: 'muted' }, '名前の表記を直せます（卓割りはそのまま）'),
      ed.names.map((n, i) => h('input', { class: 'input', value: n, onInput: (e) => { ed.names[i] = e.target.value; markDirty(); } })),
    ),
    h('section', { class: 'card' }, h('h2', {}, 'ルール'), rulesEditor(ed.rules, ed.sections, { onChange: markDirty, roundsLocked: true })),
    h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary big', onClick: save }, '設定を保存')),
  );
}

// ===== 打ち切りタイマー =====
// 主催者が回戦ごとに開始する。開始時刻を大会データに保存するので、会場表示や参加者のスマホにも同じ残り時間が出る
// タイマーの操作ボタン（主催者メニューと会場表示で共用）。big は会場表示用の大きさ
export function timerControls(ctx, { big = false } = {}) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  const timer = t.timer || null;
  const r = d.currentRound;
  const save = async (next, message) => {
    try {
      await store.updateTournament(t.id, { timer: next });
      if (message) toast(message, 'ok');
    } catch (e) {
      toast(`保存できませんでした。${errorText(e)}`, 'error');
    }
  };
  const isCurrent = timer && timer.round === r;
  if (d.allDone) return null;
  if (!r || d.waitingFinal) return h('p', { class: 'muted' }, '決勝の卓を確定すると開始できます');
  if (!isCurrent) {
    return h('button', { class: `btn primary ${big ? 'screen-btn' : 'big'}`, onClick: () => save(startTimer(r, Date.now()), `${roundTitle(d, r)}のタイマーを開始しました`) }, `${roundTitle(d, r)} 開始`);
  }
  return h(
    'div',
    { class: `row timer-controls ${big ? 'center' : ''}` },
    timer.pausedAt
      ? h('button', { class: `btn primary ${big ? 'screen-btn' : ''}`, onClick: () => save(resumeTimer(timer, Date.now()), 'タイマーを再開しました') }, '再開')
      : h('button', { class: `btn ${big ? 'screen-btn' : ''}`, onClick: () => save(pauseTimer(timer, Date.now()), 'タイマーを一時停止しました') }, '一時停止'),
    h('button', {
      class: `btn ${big ? 'screen-btn' : ''}`,
      onClick: () => {
        if (window.confirm(`残り時間を ${timeLimitLabel(d)} に戻して、もう一度数え始めますか？`)) save(startTimer(r, Date.now()), 'タイマーを最初から数え直しています');
      },
    }, '最初から'),
    h('button', {
      class: 'btn link danger',
      onClick: () => {
        if (window.confirm('タイマーを止めて、開始前の状態に戻しますか？')) save(null, 'タイマーを開始前の状態に戻しました');
      },
    }, 'リセット'),
  );
}

function timerCard(ctx) {
  const { state } = ctx;
  const t = state.t;
  const d = state.d;
  const r = d.currentRound;
  const isCurrent = t.timer && t.timer.round === r;
  return h(
    'section',
    { class: 'card timer-card' },
    h('div', { class: 'row between' }, h('h2', {}, d.allDone ? '全回戦 終了' : r ? `${roundTitle(d, r)}の時間` : '時間'), h('a', { class: 'btn small', href: `#/t/${t.id}/screen`, target: '_blank', rel: 'noopener' }, '会場表示を開く')),
    !d.allDone && isCurrent && timerDisplay('small'),
    !d.allDone && !isCurrent && !d.waitingFinal && h('p', { class: 'muted' }, `打ち切り ${timeLimitLabel(d)}。全卓がそろったら開始を押してください`),
    timerControls(ctx),
  );
}

const timeLimitLabel = (d) => `${d.rules.timeLimitMin || 50} 分`;

// ===== 結果の書き出し =====
// 集計表と同じ並びのマークダウンを作り、ダウンロードかコピーで渡す（Claude に渡せば集計表に転記できる）
function exportCard(ctx) {
  const { state } = ctx;
  const t = state.t;
  const d = state.d;
  const markdown = () => buildResultMarkdown(t, d, state.chips);
  const download = () => {
    const blob = new Blob([markdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: resultFileName(t) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const preview = h('pre', { class: 'md-preview' });
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, '結果を書き出す（マークダウン）'),
    h('p', { class: 'muted' }, '集計表と同じ並び（回戦ごとのポイント・最終結果・ポイントランキングと精算・対戦組み合わせ・素点）で書き出します。Claude に渡せばスプレッドシートに転記できます。'),
    !d.allDone && h('p', { class: 'badge warn' }, 'まだ全回戦が終わっていないので、途中経過として書き出します'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onClick: download }, 'ファイルをダウンロード'),
      h('button', { class: 'btn', onClick: () => copyText(markdown()) }, 'コピー'),
    ),
    h('details', { onToggle: (e) => { if (e.currentTarget.open) preview.textContent = markdown(); } }, h('summary', {}, '中身を見る'), preview),
  );
}

// チップ一覧の入れ物。全員そろったあとは「チップ枚数を見る・直す」の中にたたむ
const chipTableWrap = (folded, table) => (folded ? h('details', {}, h('summary', {}, 'チップ枚数を見る・直す'), table) : table);

// ===== 精算（主催者） =====
function renderAdminSettle(ctx) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  const status = chipStatus(d.players, state.chips);

  const feeInput = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', value: Number.isFinite(t.venueFee) ? t.venueFee : '', placeholder: '例 48000', disabled: d.settled });

  return h(
    'div',
    {},
    h(
      'section',
      { class: 'card' },
      h('h2', {}, '場代'),
      feeModeSwitch(d.rules, async (mode) => {
        try {
          await store.updateTournament(t.id, { rules: { ...t.rules, feeMode: mode } });
          toast(mode === 'prepaid' ? '場代は事前徴収済みにしました' : '場代は精算で割り勘にしました', 'ok');
        } catch (e) {
          toast(`保存できませんでした。${errorText(e)}`, 'error');
        }
      }),
      isFeePrepaid(d.rules)
        ? h('p', { class: 'muted' }, '場代は精算に含めません。チップがそろえば精算を確定できます。')
        : [
            !d.allDone && h('p', { class: 'muted' }, 'まだ全回戦が終わっていません（先に入力しても大丈夫です）'),
            h('div', { class: 'row' }, h('span', {}, '合計'), feeInput, h('span', {}, '円'), h('button', { class: 'btn primary', disabled: d.settled, onClick: async () => {
              const v = Number(feeInput.value);
              if (feeInput.value === '' || !Number.isFinite(v) || v < 0) return toast('場代の合計を 0 円以上の数字で入れてください', 'error');
              try {
                await store.updateTournament(t.id, { venueFee: v });
                toast('場代を保存しました', 'ok');
              } catch (e) {
                toast(`保存できませんでした。${errorText(e)}`, 'error');
              }
            } }, '保存')),
          ],
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'チップ枚数'),
      h('div', { class: 'row between' }, h('span', {}, `入力済み ${d.players.length - status.missing.length} / ${d.players.length} 人`), h('span', { class: `badge ${status.total === 0 ? 'ok' : 'warn'}` }, `合計 ${fmtPt(status.total)} 枚`)),
      h('p', { class: 'muted' }, status.ready ? '全員の入力がそろいました（合計 0 枚）' : '参加者が入力できないときは、ここで代わりに入れられます'),
      // 全員そろったら一覧はたたんでおく（直したいときだけ開く）
      chipTableWrap(status.ready, h(
        'table',
        { class: 'settle-table' },
        d.players.map((p) =>
          h(
            'tr',
            {},
            h('td', {}, p.name),
            h(
              'td',
              { class: 'num' },
              h('input', {
                class: 'input num small',
                disabled: d.settled,
                type: 'number',
                inputmode: 'numeric',
                value: Number.isFinite(state.chips[p.id]) ? state.chips[p.id] : '',
                placeholder: '未',
                onChange: async (e) => {
                  const raw = e.target.value.trim();
                  if (raw !== '' && !Number.isInteger(Number(raw))) {
                    toast('チップは整数（-3、0、5 など）で入れてください', 'error');
                    // 保存していない値が残らないように、元の値に戻す
                    e.target.value = Number.isFinite(state.chips[p.id]) ? state.chips[p.id] : '';
                    return;
                  }
                  try {
                    await store.setChip(t.id, p.id, raw === '' ? null : Number(raw));
                  } catch (err) {
                    toast(`保存できませんでした。${errorText(err)}`, 'error');
                  }
                },
              }),
            ),
          ),
        ),
      )),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, '精算の確定'),
      d.settled
        ? [
            h('p', {}, '精算は確定済みです。結果とチップの入力は締め切っています。'),
            h('button', {
              class: 'btn',
              onClick: async () => {
                if (!window.confirm('精算の確定を取り消して、結果・場代・チップを直せる状態に戻しますか？')) return;
                try {
                  await store.updateTournament(t.id, { status: 'open' });
                  toast('精算の確定を取り消しました。直したら、もう一度確定してください', 'ok');
                } catch (e) {
                  toast(`取り消せませんでした。${errorText(e)}`, 'error');
                }
              },
            }, '確定を取り消す'),
          ]
        : [
            h('p', { class: 'muted' }, '確定すると、参加者は結果とチップを入力できなくなります。'),
            h(
              'button',
              {
                class: 'btn primary big',
                disabled: !(d.allDone && status.ready && feeReady(d.rules, t.venueFee)),
                onClick: async () => {
                  try {
                    await store.updateTournament(t.id, { status: 'settled' });
                    toast('精算を確定しました', 'ok');
                  } catch (e) {
                    toast(`確定できませんでした。${errorText(e)}`, 'error');
                  }
                },
              },
              '精算を確定する',
            ),
            !(d.allDone && status.ready && feeReady(d.rules, t.venueFee)) &&
              h('p', { class: 'muted' }, '全回戦の結果・場代（事前徴収なら不要）・チップ（合計 0 枚）がそろうと押せます'),
          ],
    ),
    exportCard(ctx),
  );
}
