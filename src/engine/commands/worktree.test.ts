import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { getCommit } from '../model/objects';
import { repoWith, runAll, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'README.md': '# app\n' } },
    { id: 'f1', parent: 'c1', msg: 'feature work', files: { 'f.txt': 'f\n' } },
  ],
  branches: { main: 'c1', feature: 'f1' },
};

describe('git worktree', () => {
  it('add で別の作業フォルダを作り、cd で移動してそこでコミットできる', () => {
    const r = repoWith(setup, ['git worktree add ../hotfix']);
    expect(text(r)).toMatch(/^Preparing worktree \(new branch 'hotfix'\)\nHEAD is now at [0-9a-f]{7} init$/);
    let w = runAll(r.world, ['cd ../hotfix', 'echo fix > fix.txt', 'git add fix.txt', 'git commit -m fix']).world;
    expect(w.local.head).toEqual({ type: 'symbolic', ref: 'hotfix' });
    expect(text(execute(w, 'pwd'))).toBe('/home/you/hotfix');
    // 元のフォルダは main のまま、ファイルも混ざらない
    w = execute(w, 'cd ../project').world;
    expect(w.local.head).toEqual({ type: 'symbolic', ref: 'main' });
    expect(w.local.workingTree['fix.txt']).toBeUndefined();
    // ブランチとコミットは共有
    expect(getCommit(w.local, w.local.refs.heads.hotfix).message).toBe('fix');
  });
  it('既存のブランチを指定して作る。ほかで使用中のブランチは使えない', () => {
    const r = repoWith(setup, ['git worktree add ../feat feature']);
    expect(text(r)).toContain("Preparing worktree (checking out 'feature')");
    expect(text(execute(r.world, 'git worktree add ../again feature'))).toContain("fatal: 'feature' is already used by worktree at '/home/you/feat'");
    expect(text(execute(r.world, 'git switch feature'))).toContain("fatal: 'feature' is already used by worktree at '/home/you/feat'");
    expect(text(execute(r.world, 'git branch -D feature'))).toContain("cannot delete branch 'feature' used by worktree at '/home/you/feat'");
  });
  it('-b で新しいブランチ名を付ける、list で一覧', () => {
    const r = repoWith(setup, ['git worktree add -b fix/login ../login main', 'git worktree list']);
    expect(text(r)).toMatch(/^\/home\/you\/project +[0-9a-f]{7} \[main\]\n\/home\/you\/login +[0-9a-f]{7} \[fix\/login\]$/);
  });
  it('remove：変更があると --force が必要', () => {
    const r = repoWith(setup, ['git worktree add ../tmp', 'cd ../tmp', 'echo x > x.txt', 'cd ../project']);
    expect(text(execute(r.world, 'git worktree remove ../tmp'))).toContain('contains modified or untracked files, use --force to delete it');
    const ok = execute(r.world, 'git worktree remove --force ../tmp');
    expect(ok.ok).toBe(true);
    expect(text(execute(ok.world, 'git worktree list')).split('\n')).toHaveLength(1);
    expect(execute(ok.world, 'cd ../tmp').ok).toBe(false);
  });
  it('作業フォルダ以外には cd できない', () => {
    expect(repoWith(setup, ['cd ..']).ok).toBe(false);
  });
});
