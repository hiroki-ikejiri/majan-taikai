// 主催者のトップ画面と、大会作成ウィザード（人数 → 名前 → ルール → 確認）
import { h, toast, copyText, qrCode, errorText } from '../ui.js';
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
            onClick: () => store.signInOrganizer().catch((e) => toast(`ログインできませんでした。${errorText(e)}`, 'error')),
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
    .catch((e) => list.replaceChildren(h('p', { class: 'error-line' }, `読み込めませんでした。${errorText(e)}`)));

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

  // 別のステップに進む・戻るときは、ページの一番上から見せる（同じステップの描き直しでは位置を保つ）
  const go = (step) => {
    const changed = w.step !== step;
    w.step = step;
    ctx.rerender();
    if (changed) window.scrollTo(0, 0);
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
            toast('人数は 4 の倍数（8・12・16・20…）にしてください', 'error');
            return;
          }
          if (!w.name.trim()) {
            toast('大会名を入れてください（例 第11回大会）', 'error');
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
    toast(added ? `${added} 人追加しました` : 'どの名前もすでに登録されていました', added ? 'ok' : 'info');
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
    w.names.length !== w.count && h('p', { class: `count-hint ${w.names.length > w.count ? 'error-line' : 'muted'}` }, nameCountMessage(w)),
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
  const spaceToggle = h('input', { type: 'checkbox', 'aria-label': '空白も区切りにする' });
  section.append(
    h('h3', {}, '名前を入力・ファイルから読み込む'),
    h('p', { class: 'muted' }, '「田中、加藤」「田中,加藤」「\"田中\",\"加藤\"」や 1 行 1 人など、区切り方は自由です。テキストファイルやマークダウンの表（「名前」列）も読み込めます'),
    file,
    text,
    h(
      'label',
      { class: 'field inline space-toggle' },
      h('span', {}, '空白も区切りにする（「田中 加藤」を 2 人として読む）'),
      spaceToggle,
    ),
    h('p', { class: 'muted small-note' }, 'チェックなしでも、空白で 3 人以上並んでいれば分けます。「山田 太郎」のような 2 語はフルネームとして読みます'),
    h(
      'button',
      {
        class: 'btn',
        onClick: () => {
          const names = parseNames(text.value, { splitOnSpace: spaceToggle.checked });
          if (!names.length) {
            toast('名前が見つかりませんでした。名前を入れるか、ファイルを選んでから「追加」を押してください', 'error');
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
              toast(nameCountMessage(w), 'error');
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

// 予選の回数と決勝の有無。データ上は rules.rounds（決勝を含めた合計）と rules.hasFinal で持つ
const prelimOf = (rules) => (rules.hasFinal ? rules.rounds - 1 : rules.rounds);

function roundsEditor(rules, { onChange, locked }) {
  const summary = h('p', { class: 'muted rounds-summary' });
  const drawSummary = () => {
    summary.textContent = rules.hasFinal
      ? `予選 ${prelimOf(rules)} 回 ＋ 決勝 1 回（全 ${rules.rounds} 回戦）`
      : `全 ${rules.rounds} 回戦（決勝なし）`;
  };
  drawSummary();
  if (locked) {
    return h('div', {}, summary, h('p', { class: 'muted' }, '回戦の数は、大会を作ったあとでは変えられません（卓割りを最初に作るため）'));
  }

  const setPrelim = (n) => {
    rules.rounds = n + (rules.hasFinal ? 1 : 0);
    drawSummary();
    onChange?.();
  };
  const prelimInput = h('input', {
    class: 'input num',
    type: 'number',
    inputmode: 'numeric',
    min: '1',
    max: '20',
    value: prelimOf(rules),
    'aria-label': '予選の回数',
    onInput: (e) => {
      setPrelim(Number(e.target.value));
      e.target.parentElement.parentElement.querySelectorAll('.prelim-chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.n) === prelimOf(rules)));
    },
  });
  return h(
    'div',
    {},
    h('div', { class: 'field' }, h('span', {}, '予選の回数'),
      h('div', { class: 'chip-grid' }, [4, 5, 6, 7, 8].map((n) =>
        h('button', { type: 'button', class: `chip prelim-chip ${prelimOf(rules) === n ? 'on' : ''}`, 'data-n': n, onClick: (e) => {
          setPrelim(n);
          prelimInput.value = n;
          e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
          e.currentTarget.classList.add('on');
        } }, `${n}回`),
      )),
    ),
    h('label', { class: 'field inline' }, h('span', {}, 'その他の回数'), prelimInput),
    h('div', { class: 'field' }, h('span', {}, '決勝'),
      h('div', { class: 'segmented' }, [[true, '決勝あり（成績順の卓）'], [false, '決勝なし']].map(([value, label]) =>
        h('button', { type: 'button', class: rules.hasFinal === value ? 'on' : '', onClick: (e) => {
          if (rules.hasFinal !== value) {
            const prelim = prelimOf(rules);
            rules.hasFinal = value;
            rules.rounds = prelim + (value ? 1 : 0);
          }
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
          e.currentTarget.classList.add('on');
          drawSummary();
          onChange?.();
        } }, label),
      )),
    ),
    summary,
  );
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
// roundsLocked が true のとき（大会作成後）は、回戦の設定を変えられないように表示だけにする
export function rulesEditor(rules, sections, { onChange, roundsLocked = false } = {}) {
  // after は値が変わったあとに呼ぶ処理（オカの表示の更新など）
  const num = (label, key, opts = {}, after) =>
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
          after?.();
          onChange?.();
        },
      }),
    );
  // オカは持ち点と返しから決まるので、どちらかが変わるたびに表示し直す
  const okaLabel = h('p', { class: 'muted oka-label' });
  const drawOka = () => {
    const oka = okaOf(rules);
    okaLabel.textContent = Number.isFinite(oka) ? `オカ（トップ賞）は自動で ${oka >= 0 ? '+' : ''}${oka} になります` : 'オカは持ち点と返しを入れると自動で計算します';
  };
  drawOka();
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
  const umaLabel = h('p', { class: 'muted uma-label' });
  const drawUma = () => {
    umaLabel.textContent = rules.uma.map((v, i) => `${i + 1}位 ${v > 0 ? '+' : ''}${v}`).join(' / ');
  };
  drawUma();
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
    num('持ち点', 'startPoints', { step: '1000' }, drawOka),
    num('返し', 'returnPoints', { step: '1000' }, drawOka),
    okaLabel,
    h('div', { class: 'field' }, h('span', {}, 'ウマ（1〜4 位）'),
      h('div', { class: 'chip-grid' }, presets.map(([label, uma]) =>
        h('button', { type: 'button', class: `chip ${uma.join() === rules.uma.join() ? 'on' : ''}`, onClick: (e) => {
          rules.uma.splice(0, 4, ...uma);
          drawUma();
          e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
          e.currentTarget.classList.add('on');
          onChange?.();
        } }, label),
      )),
      umaLabel,
    ),
    h('h3', {}, '回戦'),
    roundsEditor(rules, { onChange, locked: roundsLocked }),
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
    h('h3', {}, '時間'),
    num('1 回戦の打ち切り時間（分）', 'timeLimitMin', { min: '1', max: '180' }),
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
  // 前に作った大会のルールを使い回せるようにする（使わなくてもよいので、説明つきのたたんだ欄にする）
  if (w.pastTournaments?.length) {
    const sel = h(
      'select',
      { class: 'input', 'aria-label': 'ルールをコピーする大会' },
      h('option', { value: '' }, '大会を選んでください'),
      w.pastTournaments.map((t) => h('option', { value: t.id }, `${t.name}${t.date ? `（${t.date}）` : ''}`)),
    );
    section.append(
      h(
        'details',
        { class: 'copy-rules' },
        h('summary', {}, '前に作った大会のルールを使う（任意）'),
        h('p', { class: 'muted' }, '選んだ大会の点数・お金・時間の設定とルール文を、この大会にコピーします。コピーしたあとも自由に直せます。'),
        sel,
        h('button', { class: 'btn', onClick: () => {
          const src = w.pastTournaments.find((t) => t.id === sel.value);
          if (!src) {
            toast('コピーしたい大会を選んでください', 'error');
            return;
          }
          // 回戦の数はこの大会で決めたものを残す（コピー元の回戦数に変わらないように）
          const keep = { rounds: w.rules.rounds, hasFinal: w.rules.hasFinal };
          w.rules = { ...DEFAULT_RULES, ...src.rules, uma: [...(src.rules?.uma || DEFAULT_RULES.uma)], ...keep };
          w.sections = (src.ruleSections || []).map((s) => ({ ...s }));
          toast(`「${src.name}」のルールをコピーしました`, 'ok');
          go(3);
        } }, 'このルールをコピー'),
      ),
    );
  }
  section.append(rulesEditor(w.rules, w.sections));
  section.append(
    h('div', { class: 'row between sticky-actions' },
      h('button', { class: 'btn', onClick: () => go(2) }, '戻る'),
      h('button', { class: 'btn primary', onClick: () => {
        const problem = rulesProblem(w.rules);
        if (problem) return toast(problem, 'error');
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
      h('dt', {}, 'ウマ・オカ'), h('dd', {}, `${w.rules.uma.map((v) => (v > 0 ? `+${v}` : `${v}`)).join(' / ')}・オカ +${okaOf(w.rules)}`),
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
          toast(`作成できませんでした。${errorText(err)}`, 'error');
          e.currentTarget.disabled = false;
        }
      } }, 'この内容で大会を作る'),
    ),
  );
  return section;
}

// ルールの数値のチェック（大会作成と主催者の設定で共用）。問題があれば案内の文、なければ null
export function rulesProblem(r) {
  if (r.uma.reduce((a, b) => a + b, 0) !== 0) return 'ウマの合計を 0 にしてください';
  if (!(r.startPoints > 0) || r.startPoints % 100 !== 0) return '持ち点は 100 点単位の数字で入れてください（例 25000）';
  if (!(r.returnPoints >= r.startPoints) || r.returnPoints % 100 !== 0) return '返しは持ち点以上で、100 点単位の数字にしてください（例 30000）';
  if (!(r.rate >= 0)) return 'レートは 0 円以上の数字で入れてください';
  if (!(r.chipUnit >= 0)) return 'チップ 1 枚の金額は 0 円以上の数字で入れてください';
  if (!(r.feeRoundUnit >= 1)) return '場代の切り上げ単位は 1 円以上で入れてください（例 100）';
  if (!(r.timeLimitMin >= 1)) return '打ち切り時間は 1 分以上で入れてください';
  const prelim = r.hasFinal ? r.rounds - 1 : r.rounds;
  if (!(prelim >= 1) || !Number.isInteger(prelim)) return '予選の回数を入れてください';
  return null;
}

// 名前の数が人数と合わないときの案内
function nameCountMessage(w) {
  const diff = w.names.length - w.count;
  if (diff > 0) return `${diff} 人多いです。名前の「×」を押して ${w.count} 人にしてください`;
  return `あと ${-diff} 人足りません。名前を追加するか、「仮の名前で埋める」を使ってください`;
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
