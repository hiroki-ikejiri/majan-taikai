// 1 卓ぶんの結果の表示と、主催者による入力・修正・削除（参加者画面と主催者画面で共用）
import { h, fmtPt, ptClass, fmtScore, toast, modal } from '../ui.js';
import { resultIdOf } from '../store/index.js';
import { scoreForm, newDraft } from './scoreForm.js';

const WINDS = ['東', '南', '西', '北'];
const roundTitle = (d, r) => (d.rules.hasFinal && r === d.rules.rounds ? `第${r}回戦（決勝）` : `第${r}回戦`);

// 1 卓ぶんの結果表（順位順）
export function resultTable(d, res) {
  const st = new Map(d.standings.map((s) => [s.id, s]));
  const rows = res.seats
    .map((s, i) => ({ ...s, wind: WINDS[i], info: st.get(s.playerId)?.perRound[res.round] }))
    .sort((a, b) => (a.info?.rank || 9) - (b.info?.rank || 9));
  return h(
    'table',
    { class: 'confirm-table' },
    rows.map((r) =>
      h(
        'tr',
        {},
        h('td', {}, r.info ? `${r.info.rank}位` : ''),
        h('td', {}, `${r.wind} ${d.nameOf(r.playerId)}`),
        h('td', { class: 'num' }, fmtScore(r.score)),
        h('td', { class: `num ${ptClass(r.info?.point || 0)}` }, r.info ? fmtPt(r.info.point) : ''),
      ),
    ),
  );
}

// 結果の入力・修正・削除（主催者用）
export function openResultEditor(ctx, round, table) {
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

