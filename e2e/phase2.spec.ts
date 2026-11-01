import { expect, test, type Page } from '@playwright/test';

async function type(page: Page, cmd: string) {
  const input = page.getByTestId('terminal-input');
  await input.fill(cmd);
  await input.press('Enter');
}

/** 進捗を直接書き込んで章を解放する */
async function seed(page: Page, done: string[]) {
  await page.goto('/');
  await page.evaluate(
    (done) =>
      new Promise<void>((res) => {
        const r = indexedDB.open('keyval-store');
        r.onupgradeneeded = () => r.result.createObjectStore('keyval');
        r.onsuccess = () => {
          const tx = r.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(
            { lessons: Object.fromEntries(done.map((id) => [id, { status: 'done', hintsUsed: 0 }])), snapshots: {}, studyLog: {}, settings: { theme: 'light', animationSpeed: 1 } },
            'git-training/progress/v1',
          );
          tx.oncomplete = () => res();
        };
      }),
    done,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
});

test('第4章：同僚の push → rejected → pull → push', async ({ page }) => {
  await seed(page, ['ch00-challenge', 'ch01-challenge', 'ch02-challenge', 'ch03-challenge']);
  await page.goto('/#/lesson/ch04-05');
  await page.reload();
  await type(page, 'echo "<form>login</form>" > login.html');
  await type(page, 'git add login.html');
  await type(page, 'git commit -m "add login"');
  await expect(page.getByTestId('summary')).toContainText('Tanaka');
  await type(page, 'git push');
  await expect(page.getByTestId('terminal-output')).toContainText('! [rejected]');
  await type(page, 'git pull');
  await type(page, 'git push');
  await expect(page.getByTestId('label-remote:origin/main')).toBeVisible();
  await expect(page.getByTestId('current-step')).toContainText('理解度クイズ');
});

test('フリープレイ：同僚の push と操作の再生', async ({ page }) => {
  await page.goto('/#/play');
  await expect(page.getByTestId('remote-branch-main')).toBeVisible();
  await page.getByTestId('teammate-push').click();
  await type(page, 'git pull');
  await expect(page.getByTestId('terminal-output')).toContainText('Fast-forward');
  const slider = page.getByLabel('操作の再生位置');
  await slider.fill('0');
  await expect(page.getByText('再生中（操作はできません）')).toBeVisible();
  await page.getByRole('button', { name: '今に戻る' }).click();
  await expect(page.getByText('再生中（操作はできません）')).toHaveCount(0);
});

test('コマンド辞典の検索と、ホームのダッシュボード', async ({ page }) => {
  await page.goto('/#/commands');
  await page.getByLabel('コマンドを検索').fill('rejected');
  await expect(page.getByTestId('command-git push')).toBeVisible();
  await expect(page.getByTestId('command-git add')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByTestId('dashboard')).toContainText('ゴールまで');
});

test('動く図解のステップ送り', async ({ page }) => {
  await seed(page, ['ch00-challenge']);
  await page.goto('/#/lesson/ch01-02');
  await page.reload();
  const fig = page.getByTestId('figure-three-areas');
  await expect(fig).toContainText('0/4');
  await fig.getByTestId('figure-next').click();
  await expect(fig).toContainText('1/4');
  await expect(fig).toContainText('git add README.md');
});
