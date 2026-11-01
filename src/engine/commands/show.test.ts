import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'one\n' } },
    { id: 'c2', parent: 'c1', msg: 'change a', files: { 'a.txt': 'two\n', 'b.txt': 'b\n' } },
  ],
  branches: { main: 'c2' },
};

describe('git show', () => {
  it('コミットの情報と差分を表示する', () => {
    const t = text(repoWith(setup, ['git show']));
    expect(t).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)\nAuthor: You <you@example.com>\nDate: {3}.+\n\n {4}change a\n\ndiff --git a\/a.txt b\/a.txt\n/);
    expect(t).toContain('-one\n+two');
    expect(t).toContain('new file mode 100644');
  });
  it('--stat と --oneline', () => {
    expect(text(repoWith(setup, ['git show --stat --oneline HEAD~1']))).toMatch(/^[0-9a-f]{7} init\n a.txt \| 1 \+\n 1 file changed, 1 insertion\(\+\)$/);
  });
  it('注釈付きタグはタグの情報も出す', () => {
    const t = text(repoWith(setup, ['git tag -a v1.0 -m "first release"', 'git show v1.0 -s']));
    expect(t).toMatch(/^tag v1.0\nTagger: You <you@example.com>\nDate: {3}.+\n\nfirst release\n\ncommit [0-9a-f]{40} \(HEAD -> main, tag: v1.0\)/);
  });
  it('存在しないコミットはエラー', () => {
    expect(text(repoWith(setup, ['git show nope']))).toContain("fatal: ambiguous argument 'nope'");
  });
});
