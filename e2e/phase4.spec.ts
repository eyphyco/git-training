import { expect, test, type Page } from '@playwright/test';

async function type(page: Page, cmd: string) {
  const input = page.getByTestId('terminal-input');
  await input.fill(cmd);
  await input.press('Enter');
}

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
            { lessons: Object.fromEntries(done.map((id) => [id, { status: 'done', hintsUsed: 0 }])), snapshots: {}, studyLog: {}, settings: { theme: 'light', animationSpeed: 0 } },
            'git-training/progress/v1',
          );
          tx.oncomplete = () => res();
        };
      }),
    done,
  );
}

const ALL = ['ch00', 'ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07'].map((c) => `${c}-challenge`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
});

test('ブランチ戦略シミュレータ：Git Flow のルール違反を警告する', async ({ page }) => {
  await page.goto('/#/strategy/git-flow');
  await expect(page.getByTestId('violation-count').first()).toContainText('違反なし');
  await type(page, 'git switch -c feature/x');
  await expect(page.getByTestId('terminal-output')).toContainText('feature/ ブランチは develop から作ります');
  await expect(page.getByTestId('violation-count').first()).toContainText('違反 1 件');
  await page.getByRole('button', { name: '↶ 戻す' }).click();
  await expect(page.getByTestId('violation-count').first()).toContainText('違反なし');
});

test('実戦シナリオ：チャットの指示で hotfix を出し、スコアが出る', async ({ page }) => {
  await seed(page, ALL);
  await page.goto('/#/scenarios');
  await page.reload();
  await page.getByTestId('scenario-sc-01').click();
  await expect(page.getByTestId('team-chat')).toContainText('本番でログインが落ちています');
  for (const l of ['git switch -c hotfix/login', 'echo "login()" > login.js', 'git commit -am "fix login typo"', 'git push -u origin hotfix/login', 'gh pr create --title "fix" --body "x"'])
    await type(page, l);
  await expect(page.getByTestId('team-chat')).toContainText('Approve しました');
  for (const l of ['gh pr merge --squash --delete-branch', 'git pull', 'git tag -a v1.0.1 -m hotfix', 'git push origin v1.0.1']) await type(page, l);
  await expect(page.getByTestId('score')).toContainText('100');
});

test('内部構造ビュー：グラフのコミットをクリックして commit → tree をたどる', async ({ page }) => {
  await seed(page, ALL);
  await page.goto('/#/lesson/ch08-01');
  await page.reload();
  await page.locator('[data-testid^="commit-"]').last().click();
  const view = page.getByTestId('internals');
  await expect(view).toContainText('update readme');
  await view.locator('pre button').first().click();
  await expect(view).toContainText('README.md');
});

test('worktree：別の作業フォルダに cd するとプロンプトが変わる', async ({ page }) => {
  await seed(page, ALL);
  await page.goto('/#/lesson/ch08-02');
  await page.reload();
  await type(page, 'git worktree add ../hotfix');
  await type(page, 'cd ../hotfix');
  await type(page, 'pwd');
  await expect(page.getByTestId('terminal-output')).toContainText('you@git-training:~/hotfix (hotfix)$ pwd/home/you/hotfix');
});
