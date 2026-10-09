// マークダウンの表から「名前」列を読み取る

const NAME_HEADERS = ['名前', '氏名', 'なまえ', 'name', 'プレイヤー', '参加者'];

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));

// 名前の配列を返す。「名前」などの見出し列がなければ 1 列目を使う。
// 表が見つからない場合は空配列
export function parseNamesFromMarkdownTable(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return [];

  const header = splitRow(lines[0]);
  const second = splitRow(lines[1]);
  const hasHeader = isSeparator(second);

  let col = 0;
  if (hasHeader) {
    const found = header.findIndex((h) => NAME_HEADERS.includes(h.replace(/\*/g, '').toLowerCase()));
    if (found >= 0) col = found;
  }

  const body = hasHeader ? lines.slice(2) : lines;
  return cleanNames(body.map((l) => splitRow(l)).filter((cells) => !isSeparator(cells)).map((cells) => cells[col] || ''));
}

// 空白を整え、空・重複を取り除く
export function cleanNames(names) {
  const seen = new Set();
  const out = [];
  names.forEach((n) => {
    const name = n.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  });
  return out;
}

// 人数に足りない分を「ゲスト1」「ゲスト2」…で埋めた名前の配列を返す。
// すでに同じ名前がある番号は飛ばす（例 ゲスト1 が登録済みなら ゲスト2 から）
export function fillWithGuests(names, count) {
  const out = [...names];
  const used = new Set(out);
  let n = 1;
  while (out.length < count) {
    const name = `ゲスト${n}`;
    if (!used.has(name)) {
      out.push(name);
      used.add(name);
    }
    n += 1;
  }
  return out;
}

// fillWithGuests で付けた仮の名前かどうか
export const isGuestName = (name) => /^ゲスト\d+$/.test(name);

// 区切りに使われそうな文字（改行・読点・カンマ・セミコロン・タブ・中黒・スラッシュ・縦棒）
const SEPARATORS = /[\n\r\t、，,;；・/／|｜]+/;
// 名前の前後についていそうな記号（引用符・かっこ・箇条書きの印・番号）
const WRAPPERS = /^[\s　"'“”‘’「」『』【】()（）\[\]<>＜＞]+|[\s　"'“”‘’「」『』【】()（）\[\]<>＜＞]+$/g;
const LIST_MARK = /^(?:[-*+•●○◯・]\s*|\d+[.)．）、]\s*)/;

// テキストから名前を読み取る。マークダウンの表があれば「名前」列、
// なければ改行・読点・カンマ・引用符などの区切りで分ける。
// 空白は「山田 太郎」のようなフルネームを壊さないよう、ふだんは区切りにしない。
// ただし「ikejiri sato tanaka」のように空白で 3 つ以上並んでいるときは、名前の並びとみなして分ける。
// splitOnSpace が true なら、空白は常に区切りにする
export function parseNames(text, { splitOnSpace = false } = {}) {
  const tableLines = text.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (tableLines.length >= 2) {
    const fromTable = parseNamesFromMarkdownTable(text);
    if (fromTable.length) return fromTable;
  }
  const pieces = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LIST_MARK, ''))
    .join('\n')
    // "田中","加藤" のように引用符だけで区切られている場合にも分けられるようにする
    .replace(/["“”]\s*["“”]/g, '\n')
    // 「田中」『加藤』のように、かっこが続いているところでも分ける
    .replace(/[」』）)】\]]\s*[「『（(【\[]/g, '\n')
    .split(SEPARATORS)
    .map((p) => p.replace(WRAPPERS, '').replace(LIST_MARK, '').replace(WRAPPERS, ''))
    .flatMap((p) => {
      const words = p.trim().split(/[\s　]+/).filter(Boolean);
      return splitOnSpace || words.length >= 3 ? words : [p];
    });
  return cleanNames(pieces);
}
