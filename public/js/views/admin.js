// 主催者の画面（進行・設定・共有・精算）
import { h, fmtPt, toast, copyText } from '../ui.js';
import { buildResultMarkdown, resultFileName } from '../logic/exportMarkdown.js';
import { DEFAULT_RULES } from '../logic/scoring.js';
import { makeFinalTables, TABLE_LABELS } from '../logic/seating.js';
import { chipStatus, feeReady, isFeePrepaid } from '../logic/settlement.js';
import { openResultEditor, statusBadge } from './resultEditor.js';
import { timerDisplay } from './timerView.js';
import { startTimer, pauseTimer, resumeTimer } from '../logic/timer.js';
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
    h('section', { class: 'card' }, h('h2', {}, 'ルール'), rulesEditor(ed.rules, ed.sections, { onChange: markDirty, roundsLocked: true })),
    h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary big', onClick: save }, '設定を保存')),
  );
}

// ===== 打ち切りタイマー =====
// 主催者が回戦ごとに開始する。開始時刻を大会データに保存するので、会場表示や参加者のスマホにも同じ残り時間が出る
function timerCard(ctx) {
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
      toast(`保存できませんでした（${e.message}）`, 'error');
    }
  };
  const isCurrent = timer && timer.round === r;

  let buttons;
  if (d.allDone) {
    buttons = [];
  } else if (!r || d.waitingFinal) {
    buttons = [h('p', { class: 'muted' }, '決勝の卓を確定すると開始できます')];
  } else if (!isCurrent) {
    buttons = [h('button', { class: 'btn primary big', onClick: () => save(startTimer(r, Date.now()), `${roundTitle(d, r)}を開始しました`) }, `${roundTitle(d, r)} 開始`)];
  } else {
    buttons = [
      h(
        'div',
        { class: 'row' },
        timer.pausedAt
          ? h('button', { class: 'btn primary', onClick: () => save(resumeTimer(timer, Date.now()), '再開しました') }, '再開')
          : h('button', { class: 'btn', onClick: () => save(pauseTimer(timer, Date.now()), '一時停止しました') }, '一時停止'),
        h('button', {
          class: 'btn',
          onClick: () => {
            if (window.confirm('タイマーを最初からやり直しますか？')) save(startTimer(r, Date.now()), 'やり直しました');
          },
        }, '最初から'),
        h('button', {
          class: 'btn link danger',
          onClick: () => {
            if (window.confirm('タイマーを止めて開始前に戻しますか？')) save(null, '止めました');
          },
        }, '止める'),
      ),
    ];
  }

  return h(
    'section',
    { class: 'card timer-card' },
    h('div', { class: 'row between' }, h('h2', {}, d.allDone ? '全回戦 終了' : r ? `${roundTitle(d, r)}の時間` : '時間'), h('a', { class: 'btn small', href: `#/t/${t.id}/screen`, target: '_blank', rel: 'noopener' }, '会場表示を開く')),
    !d.allDone && isCurrent && timerDisplay('small'),
    !d.allDone && !isCurrent && h('p', { class: 'muted' }, `打ち切り ${timeLimitLabel(d)}。全卓がそろったら開始を押してください`),
    buttons,
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
    exportCard(ctx),
  );
}
