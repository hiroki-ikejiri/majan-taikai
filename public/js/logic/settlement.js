// 最終精算。収支 = 合計ポイント × レート ＋ チップ枚数 × 単価 − 場代の割り勘
// （場代を事前に徴収済みの大会では、場代は精算に含めない）

// 場代を事前に徴収済みか
export const isFeePrepaid = (rules) => rules.feeMode === 'prepaid';

// 精算に必要な場代の情報がそろっているか（事前徴収なら不要）
export const feeReady = (rules, totalFee) => isFeePrepaid(rules) || Number.isFinite(totalFee);

// 1 人あたりの場代。指定単位で切り上げる
export function feePerPerson(totalFee, playerCount, roundUnit = 100) {
  if (!totalFee || playerCount <= 0) return 0;
  const unit = roundUnit > 0 ? roundUnit : 1;
  return Math.ceil(totalFee / playerCount / unit) * unit;
}

// チップ入力の状態。全員入力済みで合計 0 枚なら確定できる
export function chipStatus(players, chips) {
  const missing = players.filter((p) => !Number.isFinite(chips[p.id]));
  const total = players.reduce((sum, p) => sum + (Number.isFinite(chips[p.id]) ? chips[p.id] : 0), 0);
  return { missing, total, ready: missing.length === 0 && total === 0 };
}

// 一人ずつの精算額を計算する。standings は computeStandings の戻り値
export function computeSettlement(standings, chips, rules, totalFee) {
  const fee = isFeePrepaid(rules) ? 0 : feePerPerson(totalFee, standings.length, rules.feeRoundUnit);
  return standings.map((row) => {
    const chipCount = Number.isFinite(chips[row.id]) ? chips[row.id] : 0;
    const pointYen = row.total * rules.rate;
    const chipYen = chipCount * rules.chipUnit;
    return {
      id: row.id,
      name: row.name,
      rank: row.rank,
      total: row.total,
      chipCount,
      pointYen,
      chipYen,
      fee,
      amount: pointYen + chipYen - fee,
    };
  });
}
