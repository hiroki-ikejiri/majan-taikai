// 素点の入力フォーム（参加者の結果入力と、主催者の修正で共用）
//
// 入力は百点単位。「325」と打つと 32,500 点になる。マイナスは ± ボタンで切り替える。
// 3 人分を入れると、残り 1 人の欄に「合計 − 3 人の合計」が自動で入る（手で上書きも可）。
// 席（東南西北）ごとに誰が座ったかを選び、合計 10 万点になったら確定できる
import { h, fmtPt, ptClass, fmtScore, modal } from '../ui.js';
import { calcHanchan, validateScores, expectedTotal } from '../logic/scoring.js';

const WINDS = ['東', '南', '西', '北'];

// draft はフォームの入力途中の状態（画面を描き直しても値が消えないように外で持つ）
export function newDraft(tablePlayers, initial) {
  if (initial) {
    return {
      seats: initial.seats.map((s) => s.playerId),
      hundreds: initial.seats.map((s) => String(Math.abs(s.score / 100))),
      negative: initial.seats.map((s) => s.score < 0),
      auto: null,
    };
  }
  // auto は自動で入れた席の番号（なければ null）
  return { seats: [...tablePlayers], hundreds: ['', '', '', ''], negative: [false, false, false, false], auto: null };
}

// 手で入れた 3 人分から、残り 1 人の点数を自動で入れる。
// 手入力が 3 人分そろっていなければ、前に自動で入れた値を消す
export function applyAutoFill(draft, total) {
  const seats = [0, 1, 2, 3];
  const manual = seats.filter((i) => i !== draft.auto && draft.hundreds[i] !== '');
  const rest = seats.filter((i) => !manual.includes(i));
  if (manual.length === 3 && rest.length === 1) {
    const i = rest[0];
    const remaining = total - manual.reduce((sum, k) => sum + scoreOf(draft, k), 0);
    draft.auto = i;
    draft.hundreds[i] = String(Math.abs(remaining) / 100);
    draft.negative[i] = remaining < 0;
  } else if (draft.auto !== null) {
    draft.hundreds[draft.auto] = '';
    draft.negative[draft.auto] = false;
    draft.auto = null;
  }
}

function scoreOf(draft, i) {
  const raw = draft.hundreds[i];
  if (raw === '' || !/^\d+$/.test(raw)) return NaN;
  const v = Number(raw) * 100;
  return draft.negative[i] ? -v : v;
}

export function scoreForm({ draft, tablePlayers, nameOf, rules, submitLabel = '確認して保存', onSubmit }) {
  const totalBox = h('div', { class: 'total-bar' });
  const rows = [];
  const submitBtn = h('button', { class: 'btn primary big', onClick: confirm }, submitLabel);

  function refresh() {
    const scores = draft.seats.map((_, i) => scoreOf(draft, i));
    const filled = scores.every(Number.isFinite);
    const total = scores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    const gap = total - expectedTotal(rules);
    const dupSeat = new Set(draft.seats).size !== 4;

    let preview = null;
    if (filled) preview = calcHanchan(scores, rules);
    rows.forEach((row, i) => {
      if (document.activeElement !== row.input) row.input.value = draft.hundreds[i];
      row.input.classList.toggle('auto', draft.auto === i);
      row.autoBadge.hidden = draft.auto !== i;
      row.scoreLabel.textContent = Number.isFinite(scores[i]) ? `${fmtScore(scores[i])} 点` : '';
      row.scoreLabel.className = `score-echo ${scores[i] < 0 ? 'minus' : ''}`;
      row.signBtn.textContent = draft.negative[i] ? '−' : '+';
      row.signBtn.className = `sign ${draft.negative[i] ? 'neg' : ''}`;
      row.pt.textContent = preview ? fmtPt(preview.points[i]) : '';
      row.pt.className = `pt-preview ${preview ? ptClass(preview.points[i]) : ''}`;
      row.rank.textContent = preview ? `${preview.ranks[i]}位` : '';
    });

    totalBox.replaceChildren(
      h('span', {}, '合計 '),
      h('strong', {}, `${total.toLocaleString()} 点`),
      gap === 0
        ? h('span', { class: 'badge ok' }, 'OK')
        : h('span', { class: 'badge warn' }, `${gap > 0 ? '+' : ''}${gap.toLocaleString()} 点ずれ`),
    );
    if (dupSeat) totalBox.append(h('div', { class: 'error-line' }, '同じ人が 2 つの席に入っています'));
    submitBtn.disabled = !(filled && gap === 0 && !dupSeat);
  }

  WINDS.forEach((wind, i) => {
    const select = h(
      'select',
      {
        class: 'seat-select',
        'aria-label': `${wind}家の人`,
        onChange: (e) => {
          draft.seats[i] = e.target.value;
          refresh();
        },
      },
      tablePlayers.map((pid) => h('option', { value: pid, selected: draft.seats[i] === pid }, nameOf(pid))),
    );
    const input = h('input', {
      class: 'score-input',
      type: 'text',
      inputmode: 'numeric',
      pattern: '[0-9]*',
      maxlength: '4',
      value: draft.hundreds[i],
      'aria-label': `${wind}家の点数（百点単位）`,
      onInput: (e) => {
        draft.hundreds[i] = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = draft.hundreds[i];
        // 自動で入った欄を手で直したら、その欄は手入力扱いにする
        if (draft.auto === i) draft.auto = null;
        applyAutoFill(draft, expectedTotal(rules));
        refresh();
      },
    });
    const signBtn = h('button', {
      class: 'sign',
      type: 'button',
      'aria-label': 'プラス・マイナス切り替え',
      onClick: () => {
        draft.negative[i] = !draft.negative[i];
        if (draft.auto === i) draft.auto = null;
        else applyAutoFill(draft, expectedTotal(rules));
        refresh();
      },
    });
    const row = {
      input,
      signBtn,
      autoBadge: h('span', { class: 'badge auto-badge', hidden: true }, '自動'),
      scoreLabel: h('div', { class: 'score-echo' }),
      pt: h('div', { class: 'pt-preview' }),
      rank: h('div', { class: 'rank-preview' }),
    };
    rows.push(row);
    row.el = h(
      'div',
      { class: 'seat-row' },
      h('div', { class: 'wind' }, wind),
      h(
        'div',
        { class: 'seat-main' },
        select,
        h('div', { class: 'score-line' }, signBtn, input, h('span', { class: 'suffix' }, '00'), row.autoBadge, row.scoreLabel),
      ),
      h('div', { class: 'seat-result' }, row.pt, row.rank),
    );
  });

  async function confirm() {
    const scores = draft.seats.map((_, i) => scoreOf(draft, i));
    const errors = validateScores(scores, rules);
    if (errors.length) {
      modal({ title: '入力を確認してください', body: h('ul', {}, errors.map((e) => h('li', {}, e))), actions: [{ label: '戻る' }] });
      return;
    }
    const { points, ranks } = calcHanchan(scores, rules);
    const order = [0, 1, 2, 3].sort((a, b) => ranks[a] - ranks[b]);
    modal({
      title: 'この内容で保存しますか？',
      body: h(
        'table',
        { class: 'confirm-table' },
        order.map((i) =>
          h(
            'tr',
            {},
            h('td', {}, `${ranks[i]}位`),
            h('td', {}, `${WINDS[i]} ${nameOf(draft.seats[i])}`),
            h('td', { class: 'num' }, fmtScore(scores[i])),
            h('td', { class: `num ${ptClass(points[i])}` }, fmtPt(points[i])),
          ),
        ),
      ),
      actions: [
        { label: '戻る' },
        {
          label: '保存する',
          kind: 'primary',
          onClick: () => onSubmit(draft.seats.map((playerId, i) => ({ playerId, score: scores[i] }))),
        },
      ],
    });
  }

  const form = h(
    'div',
    { class: 'score-form' },
    h('p', { class: 'hint' }, '席順（東南西北）に、百点単位で入力。例）32,500 点 → 325。3 人分を入れると残り 1 人は自動で入ります'),
    rows.map((r) => r.el),
    totalBox,
    submitBtn,
  );
  refresh();
  return form;
}
