import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { pendingEditor, saveEditor } from '../editor';
import { getCommit } from '../model/objects';
import { walkLog } from '../model/refs';
import { repoWith, text } from '../testing';
import type { World } from '../model/types';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
    { id: 'c2', parent: 'c1', msg: 'main 1', files: { 'm.txt': 'm\n' } },
    { id: 'f1', parent: 'c1', msg: 'feat 1', files: { 'f.txt': 'f1\n' } },
    { id: 'f2', parent: 'f1', msg: 'feat 2', files: { 'f.txt': 'f2\n' } },
  ],
  branches: { main: 'c2', feature: 'f2' },
  head: 'feature',
};

const messages = (w: World, ref = 'feature') => walkLog(w.local, [w.local.refs.heads[ref]]).map((o) => getCommit(w.local, o).message);

describe('git rebase', () => {
  it('feature のコミットを main の先に付け替える', () => {
    const r = repoWith(setup, ['git rebase main']);
    expect(text(r)).toBe('Successfully rebased and updated refs/heads/feature.');
    expect(messages(r.world)).toEqual(['feat 2', 'feat 1', 'main 1', 'init']);
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'feature' });
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'a\n', 'm.txt': 'm\n', 'f.txt': 'f2\n' });
    // 元のコミットとは別のコミットになる（作者の時刻は元のまま）
    const head = getCommit(r.world.local, r.world.local.refs.heads.feature);
    expect(r.world.local.refs.heads.feature).not.toBe(r.aliases.f2);
    expect(head.author.time).toBe(getCommit(r.world.local, r.aliases.f2).author.time);
    expect(r.events.find((e) => e.type === 'REBASED')).toBeTruthy();
  });
  it('すでに main の先にあれば何もしない', () => {
    const r = repoWith(setup, ['git rebase main', 'git rebase main']);
    expect(text(r)).toBe('Current branch feature is up to date.');
  });
  it('未コミットの変更があると始めない', () => {
    expect(text(repoWith({ ...setup, workingTree: { 'f.txt': 'dirty\n' } }, ['git rebase main']))).toContain('cannot rebase: You have unstaged changes.');
  });
  it('衝突 → 解消 → --continue', () => {
    const s: Setup = { ...setup, commits: [...setup.commits!, { id: 'c3', parent: 'c2', msg: 'main f', files: { 'f.txt': 'main\n' } }], branches: { main: 'c3', feature: 'f2' } };
    const r = repoWith(s, ['git rebase main']);
    expect(r.ok).toBe(true);
    expect(text(r)).toContain('CONFLICT (add/add): Merge conflict in f.txt');
    expect(text(r)).toMatch(/error: could not apply [0-9a-f]{7}\.\.\. feat 1/);
    expect(r.world.local.head.type).toBe('detached');
    expect(text(execute(r.world, 'git status'))).toContain('rebase in progress; onto');
    let w = execute(execute(r.world, 'echo f1 > f.txt').world, 'git add f.txt').world;
    const cont = execute(w, 'git rebase --continue');
    expect(cont.ok).toBe(true);
    expect(text(cont)).toContain('Successfully rebased');
    expect(messages(cont.world)).toEqual(['feat 2', 'feat 1', 'main f', 'main 1', 'init']);
    w = execute(r.world, 'git rebase --abort').world;
    expect(w.local.head).toEqual({ type: 'symbolic', ref: 'feature' });
    expect(w.local.refs.heads.feature).toBe(r.aliases.f2);
    expect(w.local.workingTree['f.txt']).toBe('f2\n');
    const skipped = execute(r.world, 'git rebase --skip');
    // feat 1 を飛ばすと、feat 2 も main の f.txt とぶつかる（実 Git と同じ）
    expect(text(skipped)).toMatch(/could not apply [0-9a-f]{7}\.\.\. feat 2/);
    expect(skipped.world.local.inProgress?.op).toBe('rebase');
  });
  it('--onto で付け替え先を指定できる', () => {
    const s: Setup = { ...setup, commits: [...setup.commits!.slice(0, 3), { id: 'f2', parent: 'f1', msg: 'feat 2', files: { 'g.txt': 'g\n' } }] };
    const r = repoWith(s, ['git rebase --onto main feature~1']);
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'a\n', 'm.txt': 'm\n', 'g.txt': 'g\n' });
    expect(messages(r.world)).toEqual(['feat 2', 'main 1', 'init']);
  });
  it('上流ブランチがなければ引数が必要', () => {
    expect(text(repoWith(setup, ['git rebase']))).toContain('There is no tracking information for the current branch.');
  });
});

describe('git rebase -i', () => {
  const linear: Setup = {
    commits: [
      { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
      { id: 'c2', parent: 'c1', msg: 'add b', files: { 'b.txt': 'b\n' } },
      { id: 'c3', parent: 'c2', msg: 'fix typo in b', files: { 'b.txt': 'B\n' } },
      { id: 'c4', parent: 'c3', msg: 'add c', files: { 'c.txt': 'c\n' } },
    ],
    branches: { main: 'c4' },
  };
  const start = () => repoWith(linear, ['git rebase -i HEAD~3']);

  it('todo をエディタに開いて待つ', () => {
    const r = start();
    const ed = pendingEditor(r.world)!;
    expect(ed.path).toBe('.git/rebase-merge/git-rebase-todo');
    expect(ed.text).toMatch(/^pick [0-9a-f]{7} # add b\npick [0-9a-f]{7} # fix typo in b\npick [0-9a-f]{7} # add c\n\n# Rebase /);
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c4);
  });
  it('そのまま保存すればコミットは変わらない', () => {
    const r = start();
    const done = saveEditor(r.world, pendingEditor(r.world)!.path, pendingEditor(r.world)!.text);
    expect(done.ok).toBe(true);
    expect(done.world.local.refs.heads.main).toBe(r.aliases.c4);
    expect(done.world.local.inProgress).toBeUndefined();
  });
  it('fixup でまとめ、drop で消す', () => {
    const r = start();
    const todo = pendingEditor(r.world)!.text.replace(/^pick (\w+) # fix typo/m, 'fixup $1 # fix typo').replace(/^pick (\w+) # add c/m, 'drop $1 # add c');
    const done = saveEditor(r.world, '.git/rebase-merge/git-rebase-todo', todo);
    expect(messages(done.world, 'main')).toEqual(['add b', 'init']);
    expect(done.world.local.workingTree).toEqual({ 'a.txt': 'a\n', 'b.txt': 'B\n' });
  });
  it('squash はメッセージの編集を待ち、保存で完了', () => {
    const r = start();
    const todo = pendingEditor(r.world)!.text.replace(/^pick (\w+) # fix typo/m, 's $1');
    const mid = saveEditor(r.world, '.git/rebase-merge/git-rebase-todo', todo);
    const ed = pendingEditor(mid.world)!;
    expect(ed.path).toBe('.git/COMMIT_EDITMSG');
    expect(ed.text).toContain('# This is a combination of 2 commits.');
    const done = saveEditor(mid.world, ed.path, 'add b (typo fixed)\n# comment\n');
    expect(messages(done.world, 'main')).toEqual(['add c', 'add b (typo fixed)', 'init']);
    expect(done.world.local.inProgress).toBeUndefined();
  });
  it('並べ替えと reword', () => {
    const r = start();
    const lines = pendingEditor(r.world)!.text.split('\n');
    const todo = [lines[2].replace('pick', 'reword'), lines[0], lines[1]].join('\n');
    const mid = saveEditor(r.world, '.git/rebase-merge/git-rebase-todo', todo);
    const done = saveEditor(mid.world, '.git/COMMIT_EDITMSG', 'add c first\n');
    expect(messages(done.world, 'main')).toEqual(['fix typo in b', 'add b', 'add c first', 'init']);
  });
  it('edit で止まり、amend して --continue', () => {
    const r = start();
    const todo = pendingEditor(r.world)!.text.replace(/^pick (\w+) # add b/m, 'edit $1');
    const mid = saveEditor(r.world, '.git/rebase-merge/git-rebase-todo', todo);
    expect(text(mid)).toContain('Stopped at');
    const w = ['echo extra > e.txt', 'git add e.txt', 'git commit --amend --no-edit', 'git rebase --continue'].reduce((acc, l) => {
      const x = execute(acc, l);
      expect(x.ok, `${l}\n${text(x)}`).toBe(true);
      return x.world;
    }, mid.world);
    expect(messages(w, 'main')).toEqual(['add c', 'fix typo in b', 'add b', 'init']);
    expect(w.local.workingTree['e.txt']).toBe('extra\n');
  });
  it('不正な行はエラーでエディタに戻る。空にすると中止', () => {
    const r = start();
    const bad = saveEditor(r.world, '.git/rebase-merge/git-rebase-todo', 'squash 1234567\n');
    expect(bad.ok).toBe(false);
    const empty = saveEditor(r.world, '.git/rebase-merge/git-rebase-todo', '# nothing\n');
    expect(text(empty)).toBe('Nothing to do');
    expect(empty.world.local.inProgress).toBeUndefined();
  });
  it('エディタ待ちの間に --abort できる', () => {
    const r = execute(start().world, 'git rebase --abort');
    expect(r.ok).toBe(true);
    expect(r.world.local.inProgress).toBeUndefined();
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'main' });
  });
});
