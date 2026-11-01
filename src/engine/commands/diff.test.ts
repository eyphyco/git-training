import { describe, expect, it } from 'vitest';
import { repoWith, text } from '../testing';

const setup = { commits: [{ id: 'c1', msg: 'init', files: { 'a.txt': 'one\ntwo\nthree\n' } }], branches: { main: 'c1' } };

describe('git diff', () => {
  it('ステージとワークツリーの差を unified 形式で出す', () => {
    const t = text(repoWith({ ...setup, workingTree: { 'a.txt': 'one\nTWO\nthree\n' } }, ['git diff']));
    expect(t).toMatch(/^diff --git a\/a.txt b\/a.txt\nindex [0-9a-f]{7}\.\.[0-9a-f]{7} 100644\n--- a\/a.txt\n\+\+\+ b\/a.txt\n@@ -1,3 \+1,3 @@\n one\n-two\n\+TWO\n three$/);
  });
  it('--staged は HEAD とステージの差、新規ファイル', () => {
    const t = text(repoWith({ ...setup, staged: { 'b.txt': 'x' } }, ['git diff --staged']));
    expect(t).toContain('new file mode 100644');
    expect(t).toContain('--- /dev/null\n+++ b/b.txt\n@@ -0,0 +1 @@\n+x\n\\ No newline at end of file');
    expect(text(repoWith({ ...setup, staged: { 'b.txt': 'x' } }, ['git diff']))).toBe('');
  });
  it('コミット同士の比較と --stat', () => {
    const s = { commits: [...setup.commits, { id: 'c2', parent: 'c1', msg: 'm', files: { 'a.txt': 'one\n' } }], branches: { main: 'c2' } };
    expect(text(repoWith(s, ['git diff HEAD~1 HEAD --stat']))).toBe(' a.txt | 2 --\n 1 file changed, 2 deletions(-)');
  });
});
