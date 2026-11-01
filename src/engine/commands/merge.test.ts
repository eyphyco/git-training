import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { getCommit } from '../model/objects';
import { repoWith, text } from '../testing';

const ff = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'README.md': '# app\n' } },
    { id: 'c2', parent: 'c1', msg: 'add login', files: { 'login.ts': 'login\n' } },
  ],
  branches: { main: 'c1', 'feature/login': 'c2' },
};

const diverged = (theirs: string) => ({
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'one\ntwo\nthree\n' } },
    { id: 'c2', parent: 'c1', msg: 'ours', files: { 'a.txt': 'ONE\ntwo\nthree\n' } },
    { id: 'c3', parent: 'c1', msg: 'theirs', files: { 'a.txt': theirs, 'b.txt': 'b\n' } },
  ],
  branches: { main: 'c2', feature: 'c3' },
});

describe('git merge', () => {
  it('fast-forward はブランチを進めるだけ', () => {
    const r = repoWith(ff, ['git merge feature/login']);
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c2);
    expect(text(r)).toMatch(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward\n login.ts \| 1 \+\n 1 file changed, 1 insertion\(\+\)\n create mode 100644 login.ts$/);
    expect(r.world.local.workingTree['login.ts']).toBe('login\n');
  });
  it('--no-ff ならマージコミットを作る', () => {
    const r = repoWith(ff, ['git merge --no-ff feature/login']);
    const c = getCommit(r.world.local, r.world.local.refs.heads.main);
    expect(c.parents).toEqual([r.aliases.c1, r.aliases.c2]);
    expect(c.message).toBe("Merge branch 'feature/login'");
  });
  it('3-way マージ：別の行の変更は自動で混ぜる', () => {
    const r = repoWith(diverged('one\ntwo\nTHREE\n'), ['git merge feature']);
    expect(text(r)).toContain("Merge made by the 'ort' strategy.");
    expect(r.world.local.workingTree['a.txt']).toBe('ONE\ntwo\nTHREE\n');
    expect(r.world.local.workingTree['b.txt']).toBe('b\n');
    expect(getCommit(r.world.local, r.world.local.refs.heads.main).parents).toHaveLength(2);
  });
  it('同じ行の変更はコンフリクトになり、解消して commit で完了', () => {
    const r = repoWith(diverged('uno\ntwo\nthree\n'), ['git merge feature']);
    expect(text(r)).toContain('CONFLICT (content): Merge conflict in a.txt');
    expect(r.world.local.workingTree['a.txt']).toBe('<<<<<<< HEAD\nONE\n=======\nuno\n>>>>>>> feature\ntwo\nthree\n');
    expect(execute(r.world, 'git commit -m x').ok).toBe(false);
    let w = execute(r.world, 'echo fixed > a.txt').world;
    w = execute(w, 'git add a.txt').world;
    expect(text(execute(w, 'git status'))).toContain('All conflicts fixed but you are still merging.');
    const done = execute(w, 'git commit');
    expect(done.ok).toBe(true);
    expect(getCommit(done.world.local, done.world.local.refs.heads.main).message).toBe("Merge branch 'feature'");
    expect(done.world.local.inProgress).toBeUndefined();
  });
  it('--abort で元に戻す', () => {
    const r = repoWith(diverged('uno\ntwo\nthree\n'), ['git merge feature', 'git merge --abort']);
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'ONE\ntwo\nthree\n' });
    expect(r.world.local.inProgress).toBeUndefined();
  });
  it('既に取り込み済み・存在しないブランチ・ローカル変更', () => {
    expect(text(repoWith(ff, ['git switch feature/login', 'git merge main']))).toBe('Already up to date.');
    expect(repoWith(ff, ['git merge nope']).ok).toBe(false);
    expect(repoWith({ ...diverged('uno\n'), workingTree: { 'a.txt': 'dirty\n' } }, ['git merge feature']).ok).toBe(false);
  });
  it('main 以外へのマージはメッセージに into が付く', () => {
    const r = repoWith(diverged('one\ntwo\nTHREE\n'), ['git switch -c topic', 'git merge feature']);
    expect(getCommit(r.world.local, r.world.local.refs.heads.topic).message).toBe("Merge branch 'feature' into topic");
  });
});
