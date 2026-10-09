// 大会の結果をマークダウンにまとめる。
// これまでのスプレッドシート（第◯回大会集計表）と同じ並びにして、Claude に渡せば集計表に転記できるようにする
import { okaOf } from './scoring.js';
import { computeSettlement, isFeePrepaid, feePerPerson } from './settlement.js';
import { placeLabel } from './standings.js';


const pt = (n) => (n > 0 ? `+${n}` : `${n}`);
const yen = (n) => `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
// 表のセルに入れても崩れないように | と改行を消す
const cell = (v) => String(v ?? '').replace(/\|/g, '／').replace(/\r?\n/g, ' ');
const row = (cells) => `| ${cells.map(cell).join(' | ')} |`;
const table = (header, rows) => [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');

const roundName = (rules, r) => (rules.hasFinal && r === rules.rounds ? '決勝' : `予選${r}回`);

// t は大会データ、d は deriveTournament の結果、chips は { playerId: 枚数 }
export function buildResultMarkdown(t, d, chips = {}) {
  const { rules, players } = d;
  const st = new Map(d.standings.map((s) => [s.id, s]));
  const rounds = Array.from({ length: rules.rounds }, (_, i) => i + 1);
  const prepaid = isFeePrepaid(rules);
  const out = [];

  out.push(`# ${t.name} 結果`);
  out.push('');
  out.push(d.allDone ? '全回戦の結果がそろった時点のデータです。' : '**途中経過です。** まだ結果が入っていない卓があります。');
  out.push('');

  // 大会情報
  out.push('## 大会情報');
  out.push('');
  out.push(
    table(
      ['項目', '値'],
      [
        ['開催日', t.date || ''],
        ['参加者', `${players.length}人`],
        ['回戦', rules.hasFinal ? `予選${rules.rounds - 1}回＋決勝` : `${rules.rounds}回`],
        ['持ち点・返し', `${rules.startPoints}点持ち ${rules.returnPoints}点返し`],
        ['ウマ・オカ', `${rules.uma.map(pt).join(' / ')}・オカ ${pt(okaOf(rules))}`],
        ['レート', `1000点（1pt）${rules.rate}円`],
        ['チップ単価', `${rules.chipUnit}円`],
        [
          '場代',
          prepaid
            ? '事前に徴収済み（精算に含めない）'
            : Number.isFinite(t.venueFee)
              ? `合計 ${t.venueFee}円（1人 ${feePerPerson(t.venueFee, players.length, rules.feeRoundUnit)}円）`
              : '未入力',
        ],
      ],
    ),
  );
  out.push('');

  // 回戦ごとのポイント（集計表の上半分と同じ形。列は参加者の登録順）
  out.push('## 回戦ごとのポイント');
  out.push('');
  const perRoundRows = rounds.map((r) => [roundName(rules, r), ...players.map((p) => {
    const pr = st.get(p.id)?.perRound[r];
    return pr ? pt(pr.point) : '';
  })]);
  perRoundRows.push(['縦集計', ...players.map((p) => pt(st.get(p.id)?.total ?? 0))]);
  perRoundRows.push(['チップ枚数', ...players.map((p) => (Number.isFinite(chips[p.id]) ? pt(chips[p.id]) : ''))]);
  perRoundRows.push(['順位', ...players.map((p) => st.get(p.id)?.rank ?? '')]);
  out.push(table(['半荘数', ...players.map((p) => p.name)], perRoundRows));
  out.push('');

  // 最終結果
  if (d.finalResult) {
    out.push('## 最終結果');
    out.push('');
    if (rules.hasFinal) out.push('決勝卓の着順で決定（A 卓の 1 着が優勝、2 着が準優勝…、B 卓の 1 着が 5 位…）。');
    out.push('');
    out.push(
      table(
        ['最終順位', '名前', '決勝卓', '卓内着順', '合計pt', 'pt順位'],
        d.finalResult.map((r) => [
          placeLabel(r.place),
          d.nameOf(r.playerId),
          r.table ? `${r.table}卓` : '',
          r.rankInTable ? `${r.rankInTable}着` : '',
          pt(st.get(r.playerId)?.total ?? 0),
          st.get(r.playerId)?.rank ?? '',
        ]),
      ),
    );
    out.push('');
  }

  // ポイントランキングと精算（集計表の左下と同じ形）
  out.push('## ポイントランキング・精算');
  out.push('');
  const fourth = d.standings[3]?.total ?? 0;
  const settle = computeSettlement(d.standings, chips, rules, t.venueFee);
  out.push(
    table(
      ['順位', '名前', 'ポイント', '4位からの差', '集計', 'チップ', '集計+チップ', '場代', '最終支払'],
      settle.map((s) => [
        s.rank,
        s.name,
        pt(s.total),
        pt(s.total - fourth),
        s.pointYen,
        s.chipYen,
        s.pointYen + s.chipYen,
        prepaid ? '徴収済み' : s.fee ? -s.fee : '',
        yen(s.amount),
      ]),
    ),
  );
  out.push('');

  // 対戦組み合わせ（集計表の下と同じ形。結果があれば東南西北の順）
  out.push('## 対戦組み合わせ');
  out.push('');
  const maxTables = Math.max(...rounds.map((r) => d.tablesOf(r)?.length || 0), 0);
  const labels = d.tablesOf(1)?.map((tb) => tb.label) || [];
  const header = ['ゲーム数'];
  for (let k = 0; k < maxTables; k += 1) header.push(`${labels[k] || ''}卓`, '', '', '');
  out.push(
    table(
      header,
      rounds.map((r) => {
        const cells = [roundName(rules, r)];
        const tables = d.tablesOf(r) || [];
        for (let k = 0; k < maxTables; k += 1) {
          const tb = tables[k];
          const res = tb && d.resultOf(r, tb.label);
          const ids = res ? res.seats.map((s) => s.playerId) : tb?.players || [];
          for (let i = 0; i < 4; i += 1) cells.push(ids[i] ? d.nameOf(ids[i]) : r === rules.rounds && rules.hasFinal ? '未定' : '');
        }
        return cells;
      }),
    ),
  );
  out.push('');

  // 素点（参考）
  out.push('## 素点（参考）');
  out.push('');
  const scoreRows = [];
  rounds.forEach((r) => {
    (d.tablesOf(r) || []).forEach((tb) => {
      const res = d.resultOf(r, tb.label);
      if (!res) return;
      scoreRows.push([
        roundName(rules, r),
        `${tb.label}卓`,
        ...res.seats
          .map((s) => ({ s, pr: st.get(s.playerId)?.perRound[r] }))
          .sort((a, b) => (a.pr?.rank || 9) - (b.pr?.rank || 9))
          .map(({ s, pr }) => `${d.nameOf(s.playerId)} ${s.score}（${pr ? pt(pr.point) : ''}）`),
      ]);
    });
  });
  out.push(scoreRows.length ? table(['回戦', '卓', '1着', '2着', '3着', '4着'], scoreRows) : 'まだ結果がありません。');
  out.push('');

  return out.join('\n');
}

// ファイル名（使えない文字を _ にする）
export const resultFileName = (t) => `${String(t.name || '大会').replace(/[\\/:*?"<>|\s]+/g, '_')}_結果.md`;
