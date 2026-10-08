// 1 半荘ぶんの素点からポイント（+54 / -19 など）を計算する

// 既定ルール。大会作成時に主催者が上書きできる
export const DEFAULT_RULES = Object.freeze({
  startPoints: 25000, // 持ち点
  returnPoints: 30000, // 返し
  uma: [30, 10, -10, -30], // 1〜4 位のウマ（10-30）
  rounds: 7, // 回戦数（最終回を決勝にする）
  hasFinal: true, // 最終回を成績順の決勝卓にするか
  rate: 10, // 1pt あたりの金額（円）
  chipUnit: 500, // チップ 1 枚の金額（円）
  feeRoundUnit: 100, // 場代の割り勘の切り上げ単位（円）
});

// オカ（トップ賞）。返しと持ち点の差 × 4 人ぶんを 1000 点単位にしたもの
export function okaOf(rules) {
  return ((rules.returnPoints - rules.startPoints) * 4) / 1000;
}

// 卓の素点合計として正しい値
export function expectedTotal(rules) {
  return rules.startPoints * 4;
}

// (素点 - 返し) を 1000 点単位にして、百の位を五捨六入する。
// マイナス側は絶対値で丸める（-17.5 は -17、-17.6 は -18）
export function roundedBase(score, returnPoints) {
  const diff = score - returnPoints;
  const hundreds = Math.round(Math.abs(diff) / 100); // 百点単位（素点は 100 点刻み前提）
  let thousands = Math.floor(hundreds / 10);
  if (hundreds % 10 >= 6) thousands += 1;
  return diff < 0 ? -thousands : thousands;
}

// 素点の入力チェック。問題があればメッセージの配列を返す
export function validateScores(scores, rules) {
  const errors = [];
  if (scores.length !== 4) {
    errors.push('4 人分の点数が必要です');
    return errors;
  }
  scores.forEach((s, i) => {
    if (!Number.isFinite(s)) errors.push(`${'東南西北'[i]}家の点数が未入力です`);
    else if (s % 100 !== 0) errors.push(`${'東南西北'[i]}家の点数は 100 点単位で入力してください`);
  });
  if (errors.length) return errors;
  const total = scores.reduce((a, b) => a + b, 0);
  const expected = expectedTotal(rules);
  if (total !== expected) {
    const gap = total - expected;
    errors.push(`合計が ${total.toLocaleString()} 点です（${gap > 0 ? '+' : ''}${gap.toLocaleString()} 点ずれています）`);
  }
  return errors;
}

// 素点（東南西北の順）から順位とポイントを計算する。
// 同点は起家（東）に近い方を上の順位にする。
// 合計を必ず 0 にするため、1 位は「2〜4 位の合計のマイナス」で決める
export function calcHanchan(scores, rules) {
  const order = scores
    .map((score, seat) => ({ score, seat }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);

  const points = new Array(4);
  const ranks = new Array(4);
  order.forEach((entry, i) => {
    ranks[entry.seat] = i + 1;
  });

  let othersSum = 0;
  for (let i = 1; i < 4; i += 1) {
    const { score, seat } = order[i];
    const p = roundedBase(score, rules.returnPoints) + rules.uma[i];
    points[seat] = p;
    othersSum += p;
  }
  points[order[0].seat] = -othersSum;

  return { points, ranks };
}
