import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const lesson = JSON.parse(readFileSync('content/lessons/ch06/05-rebase.json', 'utf8'));

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

const UNTIL_CH4 = ['ch00-challenge', 'ch01-challenge', 'ch02-challenge', 'ch03-challenge', 'ch04-challenge'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
});

test('第5章：PR を作り、修正依頼に対応し、GitHub 画面でマージ', async ({ page }) => {
  await seed(page, UNTIL_CH4);
  await page.goto('/#/lesson/ch05-02');
  await page.reload();
  await type(page, 'gh pr create --title "検索機能" --body "検索ボックスを追加しました"');
  await expect(page.getByTestId('terminal-output')).toContainText('https://github.com/team/shop/pull/1');
  // 次のステップの開始時に Sato さんの修正依頼が来て、GitHub タブが開く
  const gh = page.getByTestId('github');
  await expect(gh).toBeVisible();
  await gh.getByText('検索機能').click();
  await expect(gh.getByText('requested changes').first()).toBeVisible();
  await type(page, 'echo "export function search(q) { if (!q) return []; return find(q); }" > search.js');
  await type(page, 'git commit -am "handle empty query"');
  await type(page, 'git push');
  await expect(page.getByTestId('summary')).toContainText('承認');
  await gh.getByText('検索機能').click();
  await gh.getByTestId('merge-pr').click();
  await expect(gh.getByText('Merged').first()).toBeVisible();
  await type(page, 'git switch main');
  await type(page, 'git pull');
  await expect(page.getByTestId('current-step')).toContainText('理解度クイズ');
});

test('第6章：rebase -i の todo をエディタで書き換えて保存', async ({ page }) => {
  await seed(page, [...UNTIL_CH4, 'ch05-challenge']);
  await page.goto('/#/lesson/ch06-05');
  await page.reload();
  await type(page, 'git rebase main');
  await expect(page.getByTestId('terminal-output')).toContainText('Successfully rebased');
  await expect(page.getByTestId('current-step')).toContainText('rebase -i');
  await type(page, 'git rebase -i HEAD~3');
  await expect(page.getByTestId('pending-editor')).toBeVisible();
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toContainText('fix typo in cart');
  // 模範解答と同じ todo（2行目を fixup にしたもの）に書き換えて保存する
  const todo = lesson.steps[2].answer[0].content as string;
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(todo.split('\n').filter((l) => !l.startsWith('#')).join('\n'));
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('terminal-output')).toContainText('（エディタ）git-rebase-todo を保存しました');
  await expect(page.getByTestId('current-step')).toContainText('理解度クイズ');
});

test('実行プレビュー：reset --hard を入力すると消えるコミットが予告される', async ({ page }) => {
  await seed(page, [...UNTIL_CH4, 'ch05-challenge']);
  await page.goto('/#/lesson/ch06-02');
  await page.reload();
  await page.getByTestId('terminal-input').fill('git reset --hard HEAD~2');
  await expect(page.getByTestId('preview-banner')).toBeVisible();
  await expect(page.locator('[data-preview="lost"]')).toHaveCount(2);
  await page.getByTestId('terminal-input').press('Enter');
  await expect(page.getByTestId('preview-banner')).toBeHidden();
});

test('比較ビュー：merge と rebase を並べて実行', async ({ page }) => {
  await page.goto('/#/compare/merge-rebase');
  await page.getByTestId('compare-left-run').click();
  await page.getByTestId('compare-right-run').click();
  await expect(page.getByTestId('compare-left')).toContainText("Merge made by the 'ort' strategy.");
  await expect(page.getByTestId('compare-right')).toContainText('Successfully rebased');
  await page.screenshot({ path: 'test-results/compare.png', fullPage: true });
});
