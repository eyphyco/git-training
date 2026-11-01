import { describe, expect, it } from 'vitest';
import { repoWith, text } from '../testing';
import type { Setup } from '../world';

const hosted: Setup = {
  initialized: false,
  commits: [
    { id: 'c1', msg: 'init', files: { 'README.md': '# app\n' } },
    { id: 'c2', parent: 'c1', msg: 'feat', files: { 'a.txt': 'a\n' } },
  ],
  remotes: { origin: { branches: { main: 'c1', feature: 'c2' } } },
};

describe('git clone', () => {
  it('origin を手元に複製し、main を追跡する', () => {
    const r = repoWith(hosted, ['git clone https://github.com/you/app.git', 'git status']);
    const repo = r.world.local;
    expect(repo.initialized).toBe(true);
    expect(repo.refs.heads).toEqual({ main: r.aliases.c1 });
    expect(repo.refs.remotes.origin).toEqual({ main: r.aliases.c1, feature: r.aliases.c2 });
    expect(repo.workingTree).toEqual({ 'README.md': '# app\n' });
    expect(text(r)).toBe("On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean");
  });
  it('switch でリモートブランチから追跡ブランチを作る', () => {
    const r = repoWith(hosted, ['git clone https://github.com/you/app.git', 'git switch feature']);
    expect(text(r)).toBe("branch 'feature' set up to track 'origin/feature'.\nSwitched to a new branch 'feature'");
    expect(r.world.local.config.branches?.feature).toEqual({ remote: 'origin', merge: 'feature' });
  });
  it('空でないフォルダには clone できない', () => {
    expect(repoWith({ ...hosted, workingTree: { x: '1' } }, ['git clone url']).ok).toBe(false);
  });
});
