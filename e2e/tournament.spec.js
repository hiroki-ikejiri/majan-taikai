// 大会の流れを画面から通して確かめる E2E テスト（デモモード）
import { test, expect } from '@playwright/test';
import { buildTournament, resultsFor, seed, fillScores, NAMES8 } from './helpers.js';

test.describe('大会作成', () => {
  test('人数 → 名前（表の読み込み・手入力） → ルール → 作成 → 共有 URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'デモ主催者として始める' }).click();
    await page.getByRole('button', { name: '＋ 新しい大会を作る' }).click();

    await expect(page.getByRole('heading', { name: '今回の大会は何人？' })).toBeVisible();
    await page.getByRole('button', { name: '8人', exact: true }).click();
    await page.getByPlaceholder('第11回大会').fill('第12回大会');
    await page.getByRole('button', { name: '次へ（参加者）' }).click();

    // マークダウンの表から 6 人
    await page.locator('textarea').nth(1).fill(
      ['| No | 名前 | 所属 |', '|---|---|---|', ...NAMES8.slice(0, 6).map((n, i) => `| ${i + 1} | ${n} | 本社 |`)].join('\n'),
    );
    await page.getByRole('button', { name: '読み込む', exact: true }).click();
    await expect(page.locator('.count-line')).toHaveText('6 / 8 人');

    // 人数が足りないと先へ進めない
    await page.getByRole('button', { name: '次へ（ルール）' }).click();
    await expect(page.locator('.toast.error')).toContainText('8 人ぶん');

    // 手入力で 2 人（重複は無視される）
    await page.locator('textarea').first().fill('伊藤、渡辺\n池尻');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(page.locator('.count-line')).toHaveText('8 / 8 人');
    await page.getByRole('button', { name: '次へ（ルール）' }).click();

    // ウマを 10-20 に変える
    await page.getByRole('button', { name: '10-20' }).click();
    await expect(page.getByText('オカ（トップ賞）は自動で +20 になります')).toBeVisible();
    await page.getByRole('button', { name: '次へ（確認）' }).click();

    await expect(page.getByText('予選 6 回 ＋ 決勝 1 回')).toBeVisible();
    await expect(page.getByText('20 / 10 / -10 / -20')).toBeVisible();
    await page.getByRole('button', { name: 'この内容で大会を作る' }).click();

    await expect(page.getByRole('heading', { name: '参加者に共有' })).toBeVisible();
    await expect(page.locator('.url-box')).toContainText('#/t/');
    await expect(page.locator('.qr svg')).toBeVisible();

    // 次の大会作成では過去の参加者が選べる
    await page.goto('/#/new');
    await page.getByRole('button', { name: '8人', exact: true }).click();
    await page.getByPlaceholder('第11回大会').fill('第13回大会');
    await page.getByRole('button', { name: '次へ（参加者）' }).click();
    await expect(page.getByRole('heading', { name: '過去の参加者から選ぶ' })).toBeVisible();
    await page.getByRole('button', { name: /池尻/ }).click();
    await expect(page.locator('.count-line')).toHaveText('1 / 8 人');
  });

  test('4 の倍数でない人数は受け付けない', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'デモ主催者として始める' }).click();
    await page.goto('/#/new');
    await page.locator('input[type=number]').fill('10');
    await page.getByPlaceholder('第11回大会').fill('x');
    await page.getByRole('button', { name: '次へ（参加者）' }).click();
    await expect(page.locator('.toast.error')).toContainText('4 の倍数');
  });
});

test.describe('参加者', () => {
  test('名前を選ぶと自分の卓が出て、結果を入力するとポイントと順位が出る', async ({ page }) => {
    const t = buildTournament();
    await seed(page, { tournament: t });
    await page.goto(`/#/t/${t.id}`);

    await expect(page.getByRole('heading', { name: 'あなたはだれ？' })).toBeVisible();
    await page.getByRole('button', { name: '池尻' }).click();

    const myTable = t.data.schedule['1'].find((tb) => tb.players.includes('p1'));
    await expect(page.locator('.hero-sub')).toHaveText('第1回戦');
    await expect(page.locator('.table-label')).toHaveText(`${myTable.label}卓`);
    await expect(page.locator('.member')).toHaveCount(4);

    await page.getByRole('link', { name: '結果を入力する' }).click();
    // 合計がずれていると保存できない
    await fillScores(page, [42000, 33000, 26000, 0]);
    await expect(page.locator('.total-bar')).toContainText('+1,000 点ずれ');
    await expect(page.getByRole('button', { name: '確認して保存' })).toBeDisabled();
    // マイナス点（−1,000）を入れると OK
    await fillScores(page, [42000, 33000, 26000, -1000]);
    await expect(page.locator('.total-bar')).toContainText('OK');
    await expect(page.locator('.pt-preview')).toHaveText(['+62', '+13', '-14', '-61']);

    await page.getByRole('button', { name: '確認して保存' }).click();
    await expect(page.getByRole('heading', { name: 'この内容で保存しますか？' })).toBeVisible();
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('.toast.ok')).toHaveText('保存しました');

    // ホームに戻って結果と順位が出る
    await expect(page.locator('.status.ok')).toContainText('結果入力済み');
    await expect(page.locator('.stat-value').first()).toContainText('位');
    await page.getByRole('link', { name: '全体順位を見る' }).click();
    await expect(page.locator('.rank-row').first().locator('.rank-total')).toHaveText('+62');
    await expect(page.locator('.final-line')).toHaveText('▲ 決勝 A 卓 ▲');
  });

  test('同じ卓の二重入力は防がれ、別タブの入力がすぐ反映される', async ({ page, context }) => {
    const t = buildTournament();
    const myTable = t.data.schedule['1'].find((tb) => tb.players.includes('p1'));
    await seed(page, { tournament: t, me: 'p1' });
    await page.goto(`/#/t/${t.id}/input`);
    await fillScores(page, [25000, 25000, 25000, 25000]);

    // 同じ卓の別の人（別タブ）が先に保存する
    const other = await context.newPage();
    await other.goto(`/#/t/${t.id}`);
    // 同じブラウザなので名前を選び直して別の人になる
    await other.getByRole('button', { name: '名前を選び直す' }).click();
    await other.getByRole('button', { name: NAMES8[Number(myTable.players[1].slice(1)) - 1] }).click();
    await other.getByRole('link', { name: '結果を入力する' }).click();
    await fillScores(other, [40000, 30000, 20000, 10000]);
    await other.getByRole('button', { name: '確認して保存' }).click();
    await other.getByRole('button', { name: '保存する' }).click();
    await expect(other.locator('.toast.ok')).toHaveText('保存しました');

    // 元のタブは、入力欄から指を離すと入力済みの表示に切り替わる（別タブの更新が反映される）
    await page.locator('.score-input').nth(3).blur();
    await expect(page.locator('.confirm-table')).toBeVisible();
    await expect(page.getByText('間違いがあれば主催者に修正を頼んでください')).toBeVisible();
  });

  test('ルール画面に設定とルール文が出る', async ({ page }) => {
    const t = buildTournament();
    await seed(page, { tournament: t, me: 'p1' });
    await page.goto(`/#/t/${t.id}/rules`);
    await expect(page.getByText('25,000 点持ち 30,000 点返し')).toBeVisible();
    await expect(page.getByText('ウマ +30 / +10 / -10 / -30、オカ +20')).toBeVisible();
    await expect(page.getByText('誤ポンは 1000 点供託')).toBeVisible();
  });
});

test.describe('主催者', () => {
  test('予選が終わると決勝卓を成績順で確定できる', async ({ page }) => {
    const t = buildTournament();
    await seed(page, { tournament: t, results: resultsFor(t, [1, 2, 3, 4, 5, 6]), organizer: true, me: 'p1' });
    await page.goto(`/#/t/${t.id}/admin`);

    await expect(page.getByRole('heading', { name: '予選終了！決勝の卓を確定' })).toBeVisible();
    await page.getByRole('button', { name: 'この卓割りで確定' }).click();
    await expect(page.locator('.toast.ok')).toHaveText('決勝の卓を確定しました');

    // 参加者ホームに決勝の卓が出る。上位 4 人が A 卓
    await page.goto(`/#/t/${t.id}/rank`);
    const top4 = await page.locator('.rank-name').evaluateAll((els) => els.slice(0, 4).map((e) => e.textContent));
    await page.getByRole('button', { name: '卓割り' }).click();
    const finalA = page.locator('.card').filter({ hasText: '第7回戦（決勝）' }).locator('.table-card').first();
    for (const name of top4) await expect(finalA).toContainText(name);
  });

  test('主催者は結果を修正でき、ポイントが再計算される', async ({ page }) => {
    const t = buildTournament();
    await seed(page, { tournament: t, results: resultsFor(t, [1]), organizer: true, me: 'p1' });
    await page.goto(`/#/t/${t.id}/admin`);
    await page.locator('.card').filter({ hasText: '第1回戦' }).locator('.table-card').first().click();
    await expect(page.getByRole('heading', { name: '現在の結果' })).toBeVisible();
    await fillScores(page, [10000, 20000, 30000, 40000]);
    await page.getByRole('button', { name: '確認して上書き' }).click();
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('.toast.ok')).toHaveText('保存しました');
    const first = t.data.schedule['1'][0].players;
    const lastSeatName = NAMES8[Number(first[3].slice(1)) - 1];
    await expect(page.locator('.card').filter({ hasText: '第1回戦' }).locator('.table-card').first()).toContainText(`${lastSeatName}+60`);
  });

  test('参加者は主催者画面を開けない', async ({ page }) => {
    const t = buildTournament();
    await seed(page, { tournament: t, me: 'p1' });
    await page.goto(`/#/t/${t.id}/admin`);
    await expect(page.getByText('この画面は大会を作った主催者だけが使えます。')).toBeVisible();
  });
});

test.describe('精算', () => {
  test('場代とチップがそろうと支払い額が確定し、金額を隠せる', async ({ page }) => {
    const t = buildTournament();
    const all = [1, 2, 3, 4, 5, 6];
    // 決勝卓も作っておく
    t.data.schedule['7'] = [
      { label: 'A', players: ['p1', 'p2', 'p3', 'p4'] },
      { label: 'B', players: ['p5', 'p6', 'p7', 'p8'] },
    ];
    const chips = { p1: 5, p2: -2, p3: 0, p4: 1, p5: -3, p6: 2, p7: -1 };
    await seed(page, { tournament: t, results: resultsFor(t, [...all, 7]), chips, organizer: true, me: 'p1' });

    await page.goto(`/#/t/${t.id}/settle`);
    await expect(page.getByText('未入力: 渡辺')).toBeVisible();
    await expect(page.getByText('主催者の場代入力を待っています。')).toBeVisible();

    // 主催者が場代を入れる（50000 ÷ 8 = 6250 → 6300 円）
    await page.goto(`/#/t/${t.id}/admin/settle`);
    await page.getByPlaceholder('例 48000').fill('50000');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.toast.ok')).toHaveText('場代を保存しました');
    await expect(page.getByRole('button', { name: '精算を確定する' })).toBeDisabled();

    // 渡辺さんがチップを入れる（-2 枚で合計 0）
    await page.evaluate(() => localStorage.setItem('majan-me-t1', 'p8'));
    await page.goto(`/#/t/${t.id}/settle`);
    await page.reload();
    await page.getByRole('button', { name: '−' }).click();
    await page.getByRole('button', { name: '−' }).click();
    await expect(page.locator('.chip-count')).toHaveText('-2');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('.toast.ok')).toHaveText('チップ枚数を保存しました');
    await expect(page.getByRole('heading', { name: '精算額', exact: true })).toBeVisible();
    await expect(page.getByText('1 人 6,300 円')).toBeVisible();

    // 合計は「場代の合計（切り上げ分を含む）」だけマイナスになる
    const amounts = await page.locator('.settle-table td:last-child').evaluateAll((els) =>
      els.map((e) => Number(e.textContent.replace(/[^0-9−+]/g, '').replace('−', '-'))),
    );
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(-6300 * 8);

    // 金額を隠す
    await page.getByRole('button', { name: '金額を隠す' }).click();
    await expect(page.locator('.my-amount strong')).toHaveText('＊＊＊');
    await page.getByRole('button', { name: '金額を表示' }).click();

    // 主催者が確定すると入力が締め切られる
    await page.evaluate(() => localStorage.setItem('majan-me-t1', 'p1'));
    await page.goto(`/#/t/${t.id}/admin/settle`);
    await page.getByRole('button', { name: '精算を確定する' }).click();
    await expect(page.locator('.toast.ok').last()).toHaveText('精算を確定しました');
    await page.goto(`/#/t/${t.id}/input`);
    await expect(page.getByText('精算が確定したため、入力は締め切りました。')).toBeVisible();
  });
});
