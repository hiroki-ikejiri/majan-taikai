// E2E テストは必ずデモモードで動かす（本番の Firebase に書き込まないため）
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => localStorage.setItem('majan-force-demo', '1'));
    await use(context);
  },
});

export { expect };
