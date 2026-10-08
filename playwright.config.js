// 画面操作テスト（E2E）の設定。デモモード（Firebase なし）で実際の画面を動かして確かめる
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    locale: 'ja-JP',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 5174 --directory public',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
});
