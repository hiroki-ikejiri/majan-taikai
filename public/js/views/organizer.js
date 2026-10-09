// 主催者のトップ画面と、大会作成ウィザード（人数 → 名前 → ルール → 確認）
import { h, toast, copyText, qrCode } from '../ui.js';
import { DEFAULT_RULES, okaOf } from '../logic/scoring.js';
import { makePrelimSchedule, TABLE_LABELS } from '../logic/seating.js';
import { parseNames, cleanNames, fillWithGuests, isGuestName } from '../logic/names.js';
import { DEFAULT_RULE_SECTIONS } from '../defaultRules.js';

export const shareUrlOf = (id) => `${location.origin}${location.pathname}#/t/${id}`;

export function renderOrganizerHome(ctx) {
  const { state, store } = ctx;
  const view = h('div', { class: 'page' });

  view.append(h('header', { class: 'app-header' }, h('h1', {}, '麻雀大会スコア')));

  if (!state.user?.isOrganizer) {
    view.append(
      h(
        'section',
        { class: 'card center' },
        h('p', {}, '大会を作るには、主催者として Google でログインしてください。'),
        h('p', { class: 'muted' }, '参加する人は、主催者から届いた URL を開くだけでログインは不要です。'),
        h(
          'button',
          {
            class: 'btn primary big',
            onClick: () => store.signInOrganizer().catch((e) => toast(`ログインできませんでした（${e.message}）`, 'error')),
          },
          store.isDemo ? 'デモ主催者として始める' : 'Google でログイン',
        ),
      ),
    );
    return view;
  }

  view.append(
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'row between' }, h('span', {}, `${state.user.displayName || '主催者'} さん`), h('button', { class: 'btn link', onClick: () => store.signOut() }, 'ログアウト')),
      h('button', { class: 'btn primary big', onClick: () => ctx.navigate('#/new') }, '＋ 新しい大会を作る'),
    ),
  );

  const list = h('section', { class: 'card' }, h('h2', {}, 'これまでの大会'), h('p', { class: 'muted' }, '読み込み中…'));
  view.append(list);
  store
    .listMyTournaments(state.user.uid)
    .then((items) => {
      list.replaceChildren(h('h2', {}, 'これまでの大会'));
      if (!items.length) {
        list.append(h('p', { class: 'muted' }, 'まだありません'));
        return;
      }
      items.forEach((t) =>
        list.append(
          h(
            'a',
            { class: 'list-item', href: `#/t/${t.id}/admin` },
            h('strong', {}, t.name),
            h('span', { class: 'muted' }, `${t.date || ''}・${t.players?.length || 0}人${t.status === 'settled' ? '・精算済み' : ''}`),
          ),
        ),
      );
    })
    .catch((e) => list.replaceChildren(h('p', { class: 'error-line' }, `読み込めませんでした（${e.message}）`)));

  return view;
}

// ===== 大会作成ウィザード =====

let wizard = null;

function newWizard() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    step: 1,
    name: '',
    date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    count: 16,
    names: [],
    rules: { ...DEFAULT_RULES, uma: [...DEFAULT_RULES.uma] },
    sections: DEFAULT_RULE_SECTIONS.map((s) => ({ ...s })),
    pastPlayers: null,
    pastTournaments: null,
  };
}

export function renderWizard(ctx) {
  const { state, store } = ctx;
  if (!state.user?.isOrganizer) {
    ctx.navigate('#/');
    return h('div');
  }
  if (!wizard) wizard = newWizard();
  const w = wizard;

  const steps = ['人数', '参加者', 'ルール', '確認'];
  const view = h(
    'div',
    { class: 'page' },
    h('header', { class: 'app-header' }, h('a', { href: '#/', class: 'back', onClick: () => (wizard = null) }, '‹ 戻る'), h('h1', {}, '新しい大会')),
    h(
      'ol',
      { class: 'stepper' },
      steps.map((s, i) => h('li', { class: i + 1 === w.step ? 'active' : i + 1 < w.step ? 'done' : '' }, s)),
    ),
  );

  const go = (step) => {
    w.step = step;
    ctx.rerender();
  };

  if (w.step === 1) view.append(stepCount(w, go));
  if (w.step === 2) view.append(stepNames(w, go, ctx));
  if (w.step === 3) view.append(stepRules(w, go, ctx));
  if (w.step === 4) view.append(stepConfirm(w, go, ctx, store, state));
  return view;
}

function stepCount(w, go) {
  const custom = h('input', {
    type: 'number',
    inputmode: 'numeric',
    min: '4',
    step: '4',
    class: 'input',
    value: w.count,
    onInput: (e) => {
      w.count = Number(e.target.value);
    },
  });
  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'big-q' }, '今回の大会は何人？'),
    h(
      'div',
      { class: 'chip-grid' },
      [8, 12, 16, 20, 24, 28].map((n) =>
        h(
          'button',
          {
            class: `chip ${w.count === n ? 'on' : ''}`,
            onClick: () => {
              w.count = n;
              go(1);
            },
          },
          `${n}人`,
        ),
      ),
    ),
    h('label', { class: 'field' }, h('span', {}, 'その他の人数（4 の倍数）'), custom),
    h('label', { class: 'field' }, h('span', {}, '大会名'), h('input', { class: 'input', placeholder: '第11回大会', value: w.name, onInput: (e) => (w.name = e.target.value) })),
    h('label', { class: 'field' }, h('span', {}, '開催日'), h('input', { class: 'input', type: 'date', value: w.date, onInput: (e) => (w.date = e.target.value) })),
    h(
      'button',
      {
        class: 'btn primary big',
        onClick: () => {
          if (!Number.isInteger(w.count) || w.count < 4 || w.count % 4 !== 0) {
            toast('人数は 4 の倍数にしてください', 'error');
            return;
          }
          if (!w.name.trim()) {
            toast('大会名を入れてください', 'error');
            return;
          }
          go(2);
        },
      },
      '次へ（参加者）',
    ),
  );
}

function stepNames(w, go, ctx) {
  const { store, state } = ctx;
  const section = h('section', { class: 'card' });

  const addNames = (list) => {
    const before = w.names.length;
    w.names = cleanNames([...w.names, ...list]);
    const added = w.names.length - before;
    toast(added ? `${added} 人追加しました` : '新しく追加される名前はありませんでした', added ? 'ok' : 'info');
    go(2);
  };

  // 過去の参加者（参加回数の多い順）
  if (w.pastPlayers === null) {
    store
      .getPastPlayers(state.user.uid)
      .then((p) => {
        w.pastPlayers = p;
        ctx.rerender();
      })
      .catch(() => {
        w.pastPlayers = {};
      });
  }
  const past = Object.entries(w.pastPlayers || {}).sort((a, b) => b[1] - a[1]);

  const countClass = w.names.length === w.count ? 'ok' : 'warn';
  section.append(
    h('h2', {}, '参加者の名前'),
    h('div', { class: `count-line ${countClass}` }, `${w.names.length} / ${w.count} 人`),
  );

  // 登録済みの名前
  section.append(
    h(
      'div',
      { class: 'name-chips' },
      w.names.map((n) =>
        h(
          'button',
          {
            class: 'name-chip',
            title: 'タップで外す',
            onClick: () => {
              w.names = w.names.filter((x) => x !== n);
              go(2);
            },
          },
          n,
          h('span', { class: 'x' }, '×'),
        ),
      ),
    ),
  );

  // 名前を入れるのが面倒なときは、残りをゲスト1、ゲスト2…で埋める
  if (w.names.length < w.count) {
    section.append(
      h(
        'button',
        {
          class: 'btn',
          onClick: () => {
            const added = w.count - w.names.length;
            w.names = fillWithGuests(w.names, w.count);
            toast(`${added} 人を仮の名前で追加しました`, 'ok');
            go(2);
          },
        },
        `残り ${w.count - w.names.length} 人を仮の名前（ゲスト1…）で埋める`,
      ),
      h('p', { class: 'muted' }, '仮の名前は、大会を作ったあとで主催者メニューの「設定」から本名に直せます'),
    );
  }

  // 過去の参加者から選ぶ
  if (past.length) {
    section.append(
      h('h3', {}, '過去の参加者から選ぶ'),
      h(
        'div',
        { class: 'chip-grid' },
        past.map(([name, times]) => {
          const on = w.names.includes(name);
          return h(
            'button',
            {
              class: `chip ${on ? 'on' : ''}`,
              onClick: () => {
                w.names = on ? w.names.filter((x) => x !== name) : [...w.names, name];
                go(2);
              },
            },
            name,
            h('small', {}, ` ${times}回`),
          );
        }),
      ),
    );
  }

  // 手入力・ファイル読み込み（マークダウンの表もただのテキストも同じ欄で受け付ける）
  const text = h('textarea', {
    class: 'input',
    rows: '4',
    placeholder: '田中、加藤、佐藤\n（改行・読点・カンマ・引用符などで区切れば OK。マークダウンの表も読めます）',
  });
  const file = h('input', {
    type: 'file',
    accept: '.txt,.md,.markdown,.csv,.tsv,text/plain,text/markdown,text/csv',
    'aria-label': '名前のファイルを選ぶ',
    onChange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      text.value = await f.text();
    },
  });
  section.append(
    h('h3', {}, '名前を入力・ファイルから読み込む'),
    h('p', { class: 'muted' }, '「田中、加藤」「田中,加藤」「\"田中\",\"加藤\"」や 1 行 1 人など、区切り方は自由です。テキストファイルやマークダウンの表（「名前」列）も読み込めます'),
    file,
    text,
    h(
      'button',
      {
        class: 'btn',
        onClick: () => {
          const names = parseNames(text.value);
          if (!names.length) {
            toast('名前が見つかりませんでした', 'error');
            return;
          }
          addNames(names);
        },
      },
      '追加',
    ),
  );

  section.append(
    h(
      'div',
      { class: 'row between sticky-actions' },
      h('button', { class: 'btn', onClick: () => go(1) }, '戻る'),
      h(
        'button',
        {
          class: 'btn primary',
          onClick: () => {
            if (w.names.length !== w.count) {
              toast(`名前を ${w.count} 人ぶん登録してください（いま ${w.names.length} 人）`, 'error');
              return;
            }
            go(3);
          },
        },
        '次へ（ルール）',
      ),
    ),
  );
  return section;
}

const RATE_PRESETS = [
  ['50円（点5）', 50],
  ['100円（点10）', 100],
];

// 場代の扱いの切り替え。onSelect(mode) で 'split'（精算で割り勘）か 'prepaid'（事前徴収済み）を受け取る
export function feeModeSwitch(rules, onSelect) {
  const mode = rules.feeMode === 'prepaid' ? 'prepaid' : 'split';
  return h(
    'div',
    { class: 'segmented fee-mode' },
    [
      ['split', '精算で割り勘'],
      ['prepaid', '事前に徴収済み'],
    ].map(([value, label]) =>
      h('button', {
        type: 'button',
        class: mode === value ? 'on' : '',
        onClick: (e) => {
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
          e.currentTarget.classList.add('on');
          onSelect(value);
        },
      }, label),
    ),
  );
}

// 数値ルールとルール文の編集欄（大会作成と主催者画面で共用）
export function rulesEditor(rules, sections, { onChange } = {}) {
  const num = (label, key, opts = {}) =>
    h(
      'label',
      { class: 'field inline' },
      h('span', {}, label),
      h('input', {
        class: 'input num',
        type: 'number',
        inputmode: 'numeric',
        value: rules[key],
        ...opts,
        onInput: (e) => {
          rules[key] = Number(e.target.value);
          onChange?.();
        },
      }),
    );
  const rateInput = h('input', {
    class: 'input num',
    type: 'number',
    inputmode: 'numeric',
    value: rules.rate,
    'aria-label': 'レート（円）',
    onInput: (e) => {
      rules.rate = Number(e.target.value);
      onChange?.();
    },
  });
  const umaInputs = rules.uma.map((v, i) =>
    h('input', {
      class: 'input num',
      type: 'number',
      inputmode: 'numeric',
      value: v,
      'aria-label': `${i + 1}位のウマ`,
      onInput: (e) => {
        rules.uma[i] = Number(e.target.value);
        onChange?.();
      },
    }),
  );
  const presets = [
    ['10-30', [30, 10, -10, -30]],
    ['10-20', [20, 10, -10, -20]],
    ['5-10', [10, 5, -5, -10]],
    ['なし', [0, 0, 0, 0]],
  ];

  const sectionList = h('div', { class: 'rule-sections' });
  const drawSections = () => {
    sectionList.replaceChildren(
      ...sections.map((s, i) =>
        h(
          'div',
          { class: 'rule-section-edit' },
          h('div', { class: 'row' },
            h('input', { class: 'input', value: s.title, placeholder: '見出し（例 罰符）', onInput: (e) => { s.title = e.target.value; onChange?.(); } }),
            h('button', { class: 'btn link danger', onClick: () => { sections.splice(i, 1); drawSections(); onChange?.(); } }, '削除'),
          ),
          h('textarea', { class: 'input', rows: '6', value: s.body, placeholder: '1 行に 1 項目', onInput: (e) => { s.body = e.target.value; onChange?.(); } }),
        ),
      ),
      h('button', { class: 'btn', onClick: () => { sections.push({ title: '', body: '' }); drawSections(); } }, '＋ 見出しを追加'),
    );
  };
  drawSections();

  return h(
    'div',
    {},
    h('h3', {}, '点数のルール'),
    num('持ち点', 'startPoints', { step: '1000' }),
    num('返し', 'returnPoints', { step: '1000' }),
    h('p', { class: 'muted' }, `オカ（トップ賞）は自動で +${okaOf(rules)} になります`),
    h('div', { class: 'field' }, h('span', {}, 'ウマ（1〜4 位）'),
      h('div', { class: 'chip-grid' }, presets.map(([label, uma]) =>
        h('button', { class: `chip ${uma.join() === rules.uma.join() ? 'on' : ''}`, onClick: (e) => {
          rules.uma.splice(0, 4, ...uma);
          umaInputs.forEach((inp, i) => (inp.value = uma[i]));
          e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
          e.currentTarget.classList.add('on');
          onChange?.();
        } }, label),
      )),
      h('div', { class: 'uma-row' }, umaInputs),
    ),
    h('h3', {}, '回戦'),
    num('回戦数', 'rounds', { min: '1', max: '20' }),
    h('label', { class: 'field inline' }, h('span', {}, '最終回は成績順の決勝卓'),
      h('input', { type: 'checkbox', checked: rules.hasFinal, onChange: (e) => { rules.hasFinal = e.target.checked; onChange?.(); } })),
    h('h3', {}, 'お金'),
    h('div', { class: 'field' }, h('span', {}, 'レート（1000 点 = 1pt あたりの金額）'),
      h('div', { class: 'chip-grid' }, RATE_PRESETS.map(([label, yen]) =>
        h('button', { class: `chip ${rules.rate === yen ? 'on' : ''}`, onClick: (e) => {
          rules.rate = yen;
          rateInput.value = yen;
          e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
          e.currentTarget.classList.add('on');
          onChange?.();
        } }, label),
      )),
    ),
    h('label', { class: 'field inline' }, h('span', {}, 'その他のレート（円）'), rateInput),
    num('チップ 1 枚（円）', 'chipUnit'),
    h('div', { class: 'field' }, h('span', {}, '場代の扱い'), feeModeSwitch(rules, (mode) => { rules.feeMode = mode; onChange?.(); })),
    num('場代の切り上げ単位（円）', 'feeRoundUnit'),
    h('h3', {}, 'ルール文'),
    h('p', { class: 'muted' }, '参加者の「ルール」画面にそのまま表示されます'),
    sectionList,
  );
}

function stepRules(w, go, ctx) {
  const { store, state } = ctx;
  const section = h('section', { class: 'card' }, h('h2', {}, 'ルール'));

  // 前回大会のルールをコピー
  if (w.pastTournaments === null) {
    store.listMyTournaments(state.user.uid).then((list) => {
      w.pastTournaments = list;
      if (list.length) ctx.rerender();
    }).catch(() => { w.pastTournaments = []; });
  }
  if (w.pastTournaments?.length) {
    const sel = h('select', { class: 'input' }, w.pastTournaments.map((t) => h('option', { value: t.id }, t.name)));
    section.append(
      h('div', { class: 'row' }, sel, h('button', { class: 'btn', onClick: () => {
        const src = w.pastTournaments.find((t) => t.id === sel.value);
        if (!src) return;
        w.rules = { ...DEFAULT_RULES, ...src.rules, uma: [...(src.rules?.uma || DEFAULT_RULES.uma)] };
        w.sections = (src.ruleSections || []).map((s) => ({ ...s }));
        toast(`「${src.name}」のルールをコピーしました`, 'ok');
        go(3);
      } }, '前回からコピー')),
    );
  }

  section.append(rulesEditor(w.rules, w.sections));
  section.append(
    h('div', { class: 'row between sticky-actions' },
      h('button', { class: 'btn', onClick: () => go(2) }, '戻る'),
      h('button', { class: 'btn primary', onClick: () => {
        const r = w.rules;
        if (r.uma.reduce((a, b) => a + b, 0) !== 0) return toast('ウマの合計を 0 にしてください', 'error');
        if (r.returnPoints < r.startPoints) return toast('返しは持ち点以上にしてください', 'error');
        if (!(r.rounds >= 1)) return toast('回戦数を入れてください', 'error');
        if (r.hasFinal && r.rounds < 2) return toast('決勝ありの場合は 2 回戦以上にしてください', 'error');
        go(4);
      } }, '次へ（確認）'),
    ),
  );
  return section;
}

function stepConfirm(w, go, ctx, store, state) {
  const prelim = w.rules.hasFinal ? w.rules.rounds - 1 : w.rules.rounds;
  const section = h(
    'section',
    { class: 'card' },
    h('h2', {}, '確認'),
    h('dl', { class: 'summary' },
      h('dt', {}, '大会名'), h('dd', {}, w.name),
      h('dt', {}, '開催日'), h('dd', {}, w.date),
      h('dt', {}, '人数'), h('dd', {}, `${w.count} 人（${w.count / 4} 卓）`),
      h('dt', {}, '回戦'), h('dd', {}, w.rules.hasFinal ? `予選 ${prelim} 回 ＋ 決勝 1 回` : `${prelim} 回`),
      h('dt', {}, '点数'), h('dd', {}, `${w.rules.startPoints.toLocaleString()} 点持ち ${w.rules.returnPoints.toLocaleString()} 点返し`),
      h('dt', {}, 'ウマ・オカ'), h('dd', {}, `${w.rules.uma.join(' / ')}・オカ +${okaOf(w.rules)}`),
      h('dt', {}, 'お金'), h('dd', {}, `1000 点 ${w.rules.rate} 円・チップ ${w.rules.chipUnit} 円`),
      h('dt', {}, '場代'), h('dd', {}, w.rules.feeMode === 'prepaid' ? '事前に徴収済み' : '精算で割り勘'),
    ),
    h('p', { class: 'muted' }, '予選の卓割りは、同じ人となるべく当たらないように自動で作ります。'),
  );
  section.append(
    h('div', { class: 'row between sticky-actions' },
      h('button', { class: 'btn', onClick: () => go(3) }, '戻る'),
      h('button', { class: 'btn primary', onClick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const players = w.names.map((name, i) => ({ id: `p${i + 1}`, name }));
          const prelimSchedule = makePrelimSchedule(players.map((p) => p.id), prelim);
          const schedule = {};
          prelimSchedule.forEach((tables, r) => {
            schedule[String(r + 1)] = tables.map((ids, i) => ({ label: TABLE_LABELS[i], players: ids }));
          });
          const id = await store.createTournament({
            name: w.name.trim(),
            date: w.date,
            ownerUid: state.user.uid,
            status: 'open',
            rules: w.rules,
            ruleSections: w.sections.filter((s) => s.title.trim() || s.body.trim()),
            players,
            schedule,
            venueFee: null,
          });
          // 仮の名前（ゲスト1…）は過去の参加者に残さない
          await store.addPastPlayers(state.user.uid, w.names.filter((n) => !isGuestName(n))).catch(() => {});
          wizard = null;
          toast('大会を作成しました', 'ok');
          ctx.navigate(`#/t/${id}/admin/share`);
        } catch (err) {
          toast(`作成できませんでした（${err.message}）`, 'error');
          e.currentTarget.disabled = false;
        }
      } }, 'この内容で大会を作る'),
    ),
  );
  return section;
}

// 参加者に共有する URL と QR
export function shareCard(id) {
  const url = shareUrlOf(id);
  return h(
    'section',
    { class: 'card center' },
    h('h2', {}, '参加者に共有'),
    h('p', { class: 'muted' }, 'この URL か QR コードを参加者に送ってください。開くと自分の名前を選ぶだけで参加できます。'),
    qrCode(url),
    h('div', { class: 'url-box' }, url),
    h('div', { class: 'row center' },
      h('button', { class: 'btn primary', onClick: () => copyText(url) }, 'URL をコピー'),
      navigator.share && h('button', { class: 'btn', onClick: () => navigator.share({ title: '麻雀大会', url }).catch(() => {}) }, '共有…'),
    ),
  );
}
