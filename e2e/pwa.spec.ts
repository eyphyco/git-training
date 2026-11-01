// オフライン対応（service worker）：一度開けば通信なしで動き、新しい版はお知らせから切り替える。
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** service worker が全ファイルを保存し、このページを制御するまで待つ */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    while (!navigator.serviceWorker.controller) await new Promise((r) => setTimeout(r, 50));
  });
}

test('一度開けば、通信なしでも読み込めてレッスンとエディタが動く', async ({ page, context }) => {
  await page.goto('/');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await page.goto('/#/lesson/ch00-01');
  const input = page.getByTestId('terminal-input');
  await input.fill('git --version');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-output')).toContainText('git version');
  // エディタ（別ファイルで読み込む Monaco）も保存済み
  await page.getByRole('button', { name: 'エディタ' }).click();
  await page.getByRole('button', { name: 'report.txt' }).click();
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
});

const SW = new URL('../dist/sw.js', import.meta.url);

test('新しい版が届くとお知らせを出し、「更新」で切り替える', async ({ page }) => {
  await page.goto('/');
  await waitForServiceWorker(page);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  // 新しい版を公開したことにする（配信中の sw.js の版を書き換え、終わったら戻す）
  const original = readFileSync(SW, 'utf8');
  try {
    writeFileSync(SW, original.replace(/git-training-[0-9a-f]+/, 'git-training-next'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect(page.getByTestId('update-banner')).toBeVisible();
  } finally {
    writeFileSync(SW, original);
  }
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '更新' }).click()]);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  expect(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('git-training-')))).toEqual(['git-training-next']);
});
