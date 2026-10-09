// 画面づくりの小さな道具（要素の生成・表示用の整形・トースト・モーダル）

// h('div', { class: 'card', onClick: fn }, '文字', 子要素…)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  });
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  children.flat(Infinity).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
}

// +54 / -19 / ±0 の形にする
export const fmtPt = (n) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '±0');
export const ptClass = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero');
export const fmtScore = (n) => `${n.toLocaleString()}`;
export const fmtYen = (n) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n).toLocaleString()}円`;

export function toast(message, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast ${kind}` }, message);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

// モーダル。actions = [{ label, kind, onClick }]。onClick が false を返すと閉じない
export function modal({ title, body, actions = [] }) {
  const close = () => overlay.remove();
  const overlay = h(
    'div',
    { class: 'overlay', onClick: (e) => e.target === overlay && close() },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      title && h('h2', {}, title),
      body,
      h(
        'div',
        { class: 'modal-actions' },
        actions.map((a) =>
          h(
            'button',
            {
              class: `btn ${a.kind || ''}`,
              onClick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                  const keep = await a.onClick?.();
                  if (keep !== false) close();
                } finally {
                  btn.disabled = false;
                }
              },
            },
            a.label,
          ),
        ),
      ),
    ),
  );
  document.body.append(overlay);
  return close;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました', 'ok');
  } catch {
    toast('コピーできませんでした。長押しでコピーしてください', 'error');
  }
}

// QR コード（qrcode-generator を必要なときだけ読み込む）
let qrLoading = null;
export function qrCode(text) {
  const box = h('div', { class: 'qr' }, '読み込み中…');
  qrLoading =
    qrLoading ||
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  qrLoading
    .then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    })
    .catch(() => {
      box.textContent = 'QR コードを表示できませんでした';
    });
  return box;
}

// エラーを、何が起きてどうすればいいかがわかる日本語にする（Firebase の英語のエラーをそのまま見せない）
export function errorText(e) {
  const code = String(e?.code || '');
  if (e?.message === 'exists') return 'この卓はすでに入力済みです。画面を開き直して確認してください';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'インターネットにつながっていません。電波のよいところでもう一度試してください';
  if (code.includes('permission-denied')) return 'この操作をする権限がありません。主催者の操作なら、主催者として Google ログインしているか確認してください';
  if (code.includes('unavailable') || code.includes('network') || code.includes('deadline-exceeded')) return '通信できませんでした。電波のよいところでもう一度試してください';
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return 'ログインの画面が閉じられました。もう一度押してください';
  if (code.includes('popup-blocked')) return 'ログインの画面がブロックされました。ブラウザの設定でポップアップを許可してください';
  if (code.includes('unauthorized-domain')) return 'このサイトからのログインが許可されていません。Firebase の承認済みドメインを確認してください';
  if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) return 'ログインの方法が有効になっていません。Firebase の設定を確認してください';
  return `思わぬエラーが起きました。少し待ってからもう一度試してください（${e?.message || e}）`;
}
