// 素点の入力フォーム（参加者の結果入力と、主催者の修正で共用）
//
// 卓の 4 人の名前が並び、それぞれの点数を百点単位で入れる（「325」で 32,500 点、マイナスは ± ボタン）。
// 3 人分を入れると、残り 1 人の欄に「合計 − 3 人の合計」が自動で入る（手で上書きも可）。
// 同点の人がいるときは「どちらを上の着順にするか」を選んでもらう。
// 保存するときは着順の順に並べて保存する（並び順が同点のときの順位の決め手になる）
import { h, fmtPt, ptClass, fmtScore, modal } from '../ui.js';
import { calcHanchan, validateScores, expectedTotal } from '../logic/scoring.js';

// draft はフォームの入力途中の状態（画面を描き直しても値が消えないように外で持つ）。
//   players  … 行に並べる 4 人（固定。同じ人を 2 回選ぶことはない）
//   hundreds … 点数（百点単位の文字）
//   negative … マイナスかどうか
//   auto     … 自動で入れた行の番号（なければ null）
//   tiePref  … 同点のときに上にすると選ばれた人（先に選ばれた人ほど上）
export function newDraft(tablePlayers, initial) {
  if (initial) {
    const players = initial.seats.map((s) => s.playerId);
    return {
      players,
      hundreds: initial.seats.map((s) => String(Math.abs(s.score / 100))),
      negative: initial.seats.map((s) => s.score < 0),
      auto: null,
      // 保存済みの結果は着順の順に並んでいるので、その順を同点の決め手としてそのまま使う
      tiePref: [...players],
    };
  }
  return { players: [...tablePlayers], hundreds: ['', '', '', ''], negative: [false, false, false, false], auto: null, tiePref: [] };
}

function scoreOf(draft, i) {
  const raw = draft.hundreds[i];
  if (raw === '' || !/^\d+$/.test(raw)) return NaN;
  const v = Number(raw) * 100;
  return draft.negative[i] ? -v : v;
}

// 手で入れた 3 人分から、残り 1 人の点数を自動で入れる。
// 手入力が 3 人分そろっていなければ、前に自動で入れた値を消す
export function applyAutoFill(draft, total) {
  const rows = [0, 1, 2, 3];
  const manual = rows.filter((i) => i !== draft.auto && draft.hundreds[i] !== '');
  const rest = rows.filter((i) => !manual.includes(i));
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

// 同点のときの上下の決め手。選ばれた順（先に選ばれた人が上）、選ばれていない人は後ろ
function prefIndex(draft, i) {
  const k = draft.tiePref.indexOf(draft.players[i]);
  return k < 0 ? Infinity : k;
}

// 着順の順に並べた行の番号（点数の高い順、同点は選ばれた人が上）
export function rankingOrder(draft) {
  return [0, 1, 2, 3].sort((a, b) => scoreOf(draft, b) - scoreOf(draft, a) || prefIndex(draft, a) - prefIndex(draft, b) || a - b);
}

// 同点のグループ。all はグループ全員、unpicked はまだ順番を選んでいない人（どちらも行の番号）
export function tieGroups(draft) {
  const groups = new Map();
  [0, 1, 2, 3].forEach((i) => {
    const s = scoreOf(draft, i);
    if (!Number.isFinite(s)) return;
    groups.set(s, [...(groups.get(s) || []), i]);
  });
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((all) => ({ all, unpicked: all.filter((i) => !draft.tiePref.includes(draft.players[i])) }));
}

// まだ順番が決まっていない同点のグループ（選んでいない人が 2 人以上いれば、まだ決まっていない）
export function unresolvedTies(draft) {
  return tieGroups(draft)
    .map((g) => g.unpicked)
    .filter((unpicked) => unpicked.length >= 2);
}

// 保存する形（着順の順に並べた 4 人と点数）
export function seatsForSave(draft) {
  return rankingOrder(draft).map((i) => ({ playerId: draft.players[i], score: scoreOf(draft, i) }));
}

export function scoreForm({ draft, nameOf, rules, submitLabel = '確認して保存', onSubmit }) {
  const totalBox = h('div', { class: 'total-bar' });
  const tieBox = h('div', { class: 'tie-box' });
  const rows = [];
  const submitBtn = h('button', { class: 'btn primary big', onClick: confirm }, submitLabel);

  // 行の並びのままの点数・着順・ポイント（同点の決め手を反映した計算）
  function preview() {
    const scores = [0, 1, 2, 3].map((i) => scoreOf(draft, i));
    if (!scores.every(Number.isFinite)) return { scores, result: null };
    const order = rankingOrder(draft);
    const calc = calcHanchan(order.map((i) => scores[i]), rules);
    const points = [];
    const ranks = [];
    order.forEach((rowIndex, k) => {
      points[rowIndex] = calc.points[k];
      ranks[rowIndex] = calc.ranks[k];
    });
    return { scores, result: { points, ranks } };
  }

  function refresh() {
    const { scores, result } = preview();
    const filled = scores.every(Number.isFinite);
    const total = scores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    const gap = total - expectedTotal(rules);
    const ties = unresolvedTies(draft);

    rows.forEach((row, i) => {
      if (document.activeElement !== row.input) row.input.value = draft.hundreds[i];
      row.input.classList.toggle('auto', draft.auto === i);
      row.autoBadge.hidden = draft.auto !== i;
      row.scoreLabel.textContent = Number.isFinite(scores[i]) ? `${fmtScore(scores[i])} 点` : '';
      row.scoreLabel.className = `score-echo ${scores[i] < 0 ? 'minus' : ''}`;
      row.signBtn.textContent = draft.negative[i] ? '−' : '+';
      row.signBtn.className = `sign ${draft.negative[i] ? 'neg' : ''}`;
      const show = result && filled && ties.length === 0;
      row.pt.textContent = show ? fmtPt(result.points[i]) : '';
      row.pt.className = `pt-preview ${show ? ptClass(result.points[i]) : ''}`;
      row.rank.textContent = show ? `${result.ranks[i]}着` : '';
    });

    // 同点の人がいれば、上の着順にする人を選んでもらう。
    // 2 人なら「どちらを上にするか」、3 人以上なら「上から順にタップ」して順番を決める
    tieBox.replaceChildren(
      ...tieGroups(draft)
        .filter((g) => g.unpicked.length >= 2)
        .map((g) => {
          const picked = g.all.filter((i) => !g.unpicked.includes(i)).sort((a, b) => prefIndex(draft, a) - prefIndex(draft, b));
          const names = g.all.map((i) => `${nameOf(draft.players[i])}さん`).join('・');
          const step = picked.length + 1;
          return h(
            'div',
            { class: 'tie-question' },
            h(
              'p',
              {},
              g.all.length === 2
                ? `${names}が同点です。上の着順にする人を選んでください`
                : `${names}の ${g.all.length} 人が同点です。上の着順から順番にタップしてください（いま ${step} 番目）`,
            ),
            picked.length > 0 && h('p', { class: 'muted' }, picked.map((i, k) => `${k + 1} 番目 ${nameOf(draft.players[i])}`).join('、')),
            h(
              'div',
              { class: 'row' },
              g.unpicked.map((i) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn tie-btn',
                    onClick: () => {
                      draft.tiePref.push(draft.players[i]);
                      refresh();
                    },
                  },
                  g.all.length === 2 ? `${nameOf(draft.players[i])} を上に` : `${step} 番目は ${nameOf(draft.players[i])}`,
                ),
              ),
            ),
          );
        }),
      // replaceChildren は null を「null」という文字で出してしまうので、ボタンがないときは何も渡さない
      ...(draft.tiePref.length > 0 && filled && hasTie(scores)
        ? [h('button', { type: 'button', class: 'btn link', onClick: () => { draft.tiePref = []; refresh(); } }, '同点の順番を選び直す')]
        : []),
    );

    totalBox.replaceChildren(
      h('span', {}, '合計 '),
      h('strong', {}, `${total.toLocaleString()} 点`),
      gap === 0
        ? h('span', { class: 'badge ok' }, 'OK')
        : h('span', { class: 'badge warn' }, `${gap > 0 ? '+' : ''}${gap.toLocaleString()} 点ずれ`),
    );
    submitBtn.disabled = !(filled && gap === 0 && ties.length === 0);
  }

  const hasTie = (scores) => new Set(scores).size < scores.length;

  draft.players.forEach((pid, i) => {
    const name = nameOf(pid);
    const input = h('input', {
      class: 'score-input',
      type: 'text',
      inputmode: 'numeric',
      pattern: '[0-9]*',
      maxlength: '4',
      value: draft.hundreds[i],
      'aria-label': `${name}さんの点数（百点単位）`,
      onInput: (e) => {
        draft.hundreds[i] = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = draft.hundreds[i];
        // 自動で入った欄を手で直したら、その欄は手入力扱いにする
        if (draft.auto === i) draft.auto = null;
        applyAutoFill(draft, expectedTotal(rules));
        // 点数が変わったら、同点の順番は選び直してもらう（別の人と同点になることがあるため）
        draft.tiePref = [];
        refresh();
      },
    });
    const signBtn = h('button', {
      class: 'sign',
      type: 'button',
      'aria-label': `${name}さんの点数のプラス・マイナス切り替え`,
      onClick: () => {
        draft.negative[i] = !draft.negative[i];
        if (draft.auto === i) draft.auto = null;
        else applyAutoFill(draft, expectedTotal(rules));
        draft.tiePref = [];
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
      h(
        'div',
        { class: 'seat-main' },
        h('div', { class: 'seat-name' }, name),
        h('div', { class: 'score-line' }, signBtn, input, h('span', { class: 'suffix' }, '00'), row.autoBadge, row.scoreLabel),
      ),
      h('div', { class: 'seat-result' }, row.pt, row.rank),
    );
  });

  async function confirm() {
    const scores = [0, 1, 2, 3].map((i) => scoreOf(draft, i));
    const errors = validateScores(scores, rules, draft.players.map((pid) => `${nameOf(pid)}さん`));
    if (errors.length) {
      modal({ title: '入力を確認してください', body: h('ul', {}, errors.map((e) => h('li', {}, e))), actions: [{ label: '戻る' }] });
      return;
    }
    const seats = seatsForSave(draft);
    const { points, ranks } = calcHanchan(seats.map((s) => s.score), rules);
    modal({
      title: 'この内容で保存しますか？',
      body: h(
        'table',
        { class: 'confirm-table' },
        seats.map((s, k) =>
          h(
            'tr',
            {},
            h('td', {}, `${ranks[k]}着`),
            h('td', {}, nameOf(s.playerId)),
            h('td', { class: 'num' }, fmtScore(s.score)),
            h('td', { class: `num ${ptClass(points[k])}` }, fmtPt(points[k])),
          ),
        ),
      ),
      actions: [{ label: '戻る' }, { label: '保存する', kind: 'primary', onClick: () => onSubmit(seats) }],
    });
  }

  const form = h(
    'div',
    { class: 'score-form' },
    h('p', { class: 'hint' }, '4 人の点数を百点単位で入力。例）32,500 点 → 325。3 人分を入れると残り 1 人は自動で入ります'),
    rows.map((r) => r.el),
    tieBox,
    totalBox,
    submitBtn,
  );
  refresh();
  return form;
}
