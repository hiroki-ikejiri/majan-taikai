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
