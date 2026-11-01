import { expect, test, type Page } from '@playwright/test';
import ch00Challenge from '../content/lessons/ch00/challenge.json' with { type: 'json' };

/** 第0章の章末チャレンジを解いて第1章を解放する */
async function unlockChapter1(page: Page) {
  await page.goto('/#/lesson/ch00-challenge');
  for (const step of ch00Challenge.steps) {
    await page.getByTestId('current-step').getByRole('button').nth(step.answer).click();
  }
  await expect(page.getByTestId('lesson-done')).toBeVisible();
}

async function type(page: Page, cmd: string) {
  const input = page.getByTestId('terminal-input');
  await input.fill(cmd);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.reload();
});

test('第1章：init → add → commit がグラフとエリアに反映される', async ({ page }) => {
  // 第1章は第0章の章末チャレンジをクリアするまでロックされている
  await expect(page.getByTestId('chapter-ch01')).toHaveCount(0);
  await unlockChapter1(page);

  await page.goto('/#/lesson/ch01-02');
  await type(page, 'git add README.md');
  await expect(page.getByTestId('file-index-README.md')).toBeVisible();
  await expect(page.getByTestId('summary')).toContainText('README.md をステージに載せました');
  await type(page, 'git status');
  await expect(page.getByTestId('terminal-output')).toContainText('Changes to be committed:');
  await type(page, 'git commit -m "add README"');
  await expect(page.getByTestId('label-branch:main')).toBeVisible();
  await expect(page.getByTestId('label-HEAD')).toBeVisible();
  await expect(page.getByTestId('file-head-README.md')).toBeVisible();
  await expect(page.getByTestId('step-cleared')).toBeVisible();
});

test('Tab 補完・↑ 履歴・Undo・進捗の保存', async ({ page }) => {
  await page.goto('/#/lesson/ch00-01');
  const input = page.getByTestId('terminal-input');
  await input.fill('git --vers');
  await input.press('Tab');
  await expect(input).toHaveValue('git --vers');
  await input.fill('git --version');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-output')).toContainText('git version');
  await expect(page.getByTestId('step-cleared')).toBeVisible();
  await input.press('ArrowUp');
  await expect(input).toHaveValue('git --version');
  await input.fill('');
  await input.fill('echo hi > a.txt');
  await input.press('Enter');
  await expect(page.getByTestId('file-worktree-a.txt')).toBeVisible();
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('file-worktree-a.txt')).toHaveCount(0);
  // 再読み込みしても続きから（ステップ2のクイズ）
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('current-step')).toContainText('理解度クイズ');
});

test('ホバーでコミットの解説が出る', async ({ page }) => {
  await unlockChapter1(page);
  await page.goto('/#/lesson/ch01-01');
  await type(page, 'git init');
  await page.goto('/#/lesson/ch01-02');
  await type(page, 'git add README.md');
  await type(page, 'git commit -m first');
  const node = page.locator('[data-testid^="commit-"]').first();
  await node.hover();
  await expect(page.getByText('親: なし（最初のコミット）')).toBeVisible();
});

test('スマホ幅ではタブで切り替える @mobile', async ({ page }) => {
  await page.goto('/#/lesson/ch00-01');
  await expect(page.getByTestId('current-step')).toBeVisible();
  await page.getByRole('button', { name: 'ターミナル' }).click();
  await type(page, 'git --version');
  await page.getByRole('button', { name: '課題' }).click();
  await expect(page.getByTestId('step-cleared')).toBeVisible();
});
