// 主催者の画面（進行・設定・共有・精算）
import { h, fmtPt, toast, modal } from '../ui.js';
import { DEFAULT_RULES } from '../logic/scoring.js';
import { makeFinalTables, TABLE_LABELS } from '../logic/seating.js';
import { chipStatus, feeReady, isFeePrepaid } from '../logic/settlement.js';
import { resultIdOf } from '../store/index.js';
import { scoreForm, newDraft } from './scoreForm.js';
import { resultTable } from './tournament.js';
import { rulesEditor, shareCard, feeModeSwitch } from './organizer.js';

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

  // 決勝の卓割り
  if (d.rules.hasFinal) {
    const finalRound = d.rules.rounds;
    const hasFinalTables = Boolean(d.tablesOf(finalRound));
    const finalStarted = hasFinalTables && d.tablesOf(finalRound).some((tb) => d.resultOf(finalRound, tb.label));
    if (d.prelimDone && !finalStarted) {
      const proposal = makeFinalTables(d.standings.map((s) => s.id));
      wrap.append(
        h(
          'section',
          { class: 'card hero' },
          h('h2', {}, hasFinalTables ? '決勝の卓割り（確定済み）' : '予選終了！決勝の卓を確定'),
          h('p', { class: 'muted' }, '今の順位で、上位 4 人から A 卓・B 卓…に入ります。'),
          h(
            'div',
            { class: 'table-grid' },
            proposal.map((ids, i) =>
              h('div', { class: 'table-card' }, h('strong', {}, `${TABLE_LABELS[i]}卓`), ids.map((id) => h('div', {}, `${d.standings.find((s) => s.id === id).rank}位 ${d.nameOf(id)}`))),
            ),
          ),
          h(
            'button',
            {
              class: 'btn primary big',
              onClick: async () => {
                const schedule = { ...t.schedule, [String(finalRound)]: proposal.map((ids, i) => ({ label: TABLE_LABELS[i], players: ids })) };
                try {
                  await store.updateTournament(t.id, { schedule });
                  toast('決勝の卓を確定しました', 'ok');
                } catch (e) {
                  toast(`確定できませんでした（${e.message}）`, 'error');
                }
              },
            },
            hasFinalTables ? '今の順位で作り直す' : 'この卓割りで確定',
          ),
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
              { class: `table-card ${res ? 'done' : ''}`, onClick: () => openResultEditor(ctx, r, tb) },
              h('div', { class: 'row between' }, h('strong', {}, `${tb.label}卓`), res ? h('span', { class: 'badge ok' }, '入力済') : h('span', { class: 'badge warn' }, '未入力')),
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

// 結果の入力・修正・削除（主催者用）
function openResultEditor(ctx, round, table) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  const rid = resultIdOf(round, table.label);
  const existing = d.resultOf(round, table.label);
  const draft = newDraft(table.players, existing);
  let closeModal = null;

  const body = h(
    'div',
    {},
    existing && h('div', {}, h('h3', {}, '現在の結果'), resultTable(d, existing), h('h3', {}, '修正する')),
    scoreForm({
      draft,
      tablePlayers: table.players,
      nameOf: d.nameOf,
      rules: d.rules,
      submitLabel: existing ? '確認して上書き' : '確認して保存',
      onSubmit: async (seats) => {
        try {
          await store.overwriteResult(t.id, rid, { round, table: table.label, seats, enteredBy: 'owner', enteredByName: '主催者' });
          toast('保存しました', 'ok');
          closeModal?.();
        } catch (e) {
          toast(`保存できませんでした（${e.message}）`, 'error');
          return false;
        }
        return true;
      },
    }),
  );
  const actions = [{ label: '閉じる' }];
  if (existing) {
    actions.unshift({
      label: '結果を削除',
      kind: 'danger',
      onClick: async () => {
        if (!window.confirm(`${roundTitle(d, round)} ${table.label}卓の結果を削除しますか？`)) return false;
        try {
          await store.deleteResult(t.id, rid);
          toast('削除しました', 'ok');
        } catch (e) {
          toast(`削除できませんでした（${e.message}）`, 'error');
          return false;
        }
        return true;
      },
    });
  }
  closeModal = modal({ title: `${roundTitle(d, round)} ${table.label}卓`, body, actions });
}

// ===== 設定 =====
function renderSettings(ctx) {
  const { state, store } = ctx;
  const t = state.t;
  // 画面上で編集する作業用コピー（保存ボタンで反映）
  if (!state.adminEdit || state.adminEdit.tid !== t.id) {
    state.adminEdit = {
      tid: t.id,
      rules: { ...DEFAULT_RULES, ...t.rules, uma: [...(t.rules?.uma || DEFAULT_RULES.uma)] },
      sections: (t.ruleSections || []).map((s) => ({ ...s })),
      names: t.players.map((p) => p.name),
      dirty: false,
    };
  }
  const ed = state.adminEdit;
  const markDirty = () => {
    ed.dirty = true;
  };

  const save = async () => {
    const r = ed.rules;
    if (r.uma.reduce((a, b) => a + b, 0) !== 0) return toast('ウマの合計を 0 にしてください', 'error');
    if (r.rounds !== t.rules.rounds || r.hasFinal !== t.rules.hasFinal) {
      return toast('回戦数と決勝の有無は大会作成後は変更できません', 'error');
    }
    const names = ed.names.map((n) => n.trim());
    if (names.some((n) => !n) || new Set(names).size !== names.length) return toast('名前が空、または重複しています', 'error');
    try {
      await store.updateTournament(t.id, {
        rules: r,
        ruleSections: ed.sections.filter((s) => s.title.trim() || s.body.trim()),
        players: t.players.map((p, i) => ({ ...p, name: names[i] })),
      });
      ed.dirty = false;
      toast('設定を保存しました。ポイントは新しいルールで再計算されます', 'ok');
    } catch (e) {
      toast(`保存できませんでした（${e.message}）`, 'error');
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
    h('section', { class: 'card' }, h('h2', {}, 'ルール'), rulesEditor(ed.rules, ed.sections, { onChange: markDirty })),
    h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary big', onClick: save }, '設定を保存')),
  );
}

// ===== 精算（主催者） =====
function renderAdminSettle(ctx) {
  const { state, store } = ctx;
  const t = state.t;
  const d = state.d;
  const status = chipStatus(d.players, state.chips);

  const feeInput = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', value: Number.isFinite(t.venueFee) ? t.venueFee : '', placeholder: '例 48000' });

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
          toast(`保存できませんでした（${e.message}）`, 'error');
        }
      }),
      isFeePrepaid(d.rules)
        ? h('p', { class: 'muted' }, '場代は精算に含めません。チップがそろえば精算を確定できます。')
        : [
            !d.allDone && h('p', { class: 'muted' }, 'まだ全回戦が終わっていません（先に入力しても大丈夫です）'),
            h('div', { class: 'row' }, h('span', {}, '合計'), feeInput, h('span', {}, '円'), h('button', { class: 'btn primary', onClick: async () => {
              const v = Number(feeInput.value);
              if (!Number.isFinite(v) || v < 0 || feeInput.value === '') return toast('場代を入れてください', 'error');
              try {
                await store.updateTournament(t.id, { venueFee: v });
                toast('場代を保存しました', 'ok');
              } catch (e) {
                toast(`保存できませんでした（${e.message}）`, 'error');
              }
            } }, '保存')),
          ],
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'チップ枚数'),
      h('div', { class: 'row between' }, h('span', {}, `入力済み ${d.players.length - status.missing.length} / ${d.players.length} 人`), h('span', { class: `badge ${status.total === 0 ? 'ok' : 'warn'}` }, `合計 ${fmtPt(status.total)} 枚`)),
      h('p', { class: 'muted' }, '参加者が入力できないときは、ここで代わりに入れられます'),
      h(
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
                type: 'number',
                inputmode: 'numeric',
                value: Number.isFinite(state.chips[p.id]) ? state.chips[p.id] : '',
                placeholder: '未',
                onChange: async (e) => {
                  const raw = e.target.value.trim();
                  try {
                    await store.setChip(t.id, p.id, raw === '' ? null : Number(raw));
                  } catch (err) {
                    toast(`保存できませんでした（${err.message}）`, 'error');
                  }
                },
              }),
            ),
          ),
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, '精算の確定'),
      d.settled
        ? [
            h('p', {}, '精算は確定済みです。結果とチップの入力は締め切っています。'),
            h('button', { class: 'btn', onClick: () => store.updateTournament(t.id, { status: 'open' }) }, '確定を取り消す'),
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
                    toast(`確定できませんでした（${e.message}）`, 'error');
                  }
                },
              },
              '精算を確定する',
            ),
            !(d.allDone && status.ready && feeReady(d.rules, t.venueFee)) &&
              h('p', { class: 'muted' }, '全回戦の結果・場代（事前徴収なら不要）・チップ（合計 0 枚）がそろうと押せます'),
          ],
    ),
  );
}
