import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { repoWith, text } from '../testing';

const three: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'one\n' } },
    { id: 'c2', parent: 'c1', msg: 'two', files: { 'a.txt': 'two\n', 'b.txt': 'b\n' } },
    { id: 'c3', parent: 'c2', msg: 'three', files: { 'a.txt': 'three\n' } },
  ],
  branches: { main: 'c3' },
};

describe('git reset', () => {
  it('--soft はブランチだけ動かし、差分はステージに残る', () => {
    const r = repoWith(three, ['git reset --soft HEAD~1']);
    expect(r.ok).toBe(true);
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c2);
    expect(r.world.local.workingTree['a.txt']).toBe('three\n');
    expect(text(execute(r.world, 'git status -s'))).toBe('M  a.txt');
  });
  it('既定（--mixed）はステージも戻し、ワークツリーは残す', () => {
    const r = repoWith(three, ['git reset HEAD~1']);
    expect(text(r)).toBe('Unstaged changes after reset:\nM\ta.txt');
    expect(r.world.local.workingTree['a.txt']).toBe('three\n');
    expect(text(execute(r.world, 'git status -s'))).toBe(' M a.txt');
  });
  it('--hard はワークツリーまで戻し、消えたコミットを events で知らせる', () => {
    const r = repoWith(three, ['git reset --hard HEAD~2']);
    expect(text(r)).toMatch(/^HEAD is now at [0-9a-f]{7} init$/);
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'one\n' });
    const e = r.events.find((x) => x.type === 'RESET');
    expect(e).toMatchObject({ mode: 'hard', lost: [r.aliases.c3, r.aliases.c2] });
  });
  it('--hard でも未追跡ファイルは残る', () => {
    const r = repoWith({ ...three, workingTree: { 'new.txt': 'x\n', 'a.txt': 'dirty\n' } }, ['git reset --hard']);
    expect(r.world.local.workingTree['new.txt']).toBe('x\n');
    expect(r.world.local.workingTree['a.txt']).toBe('three\n');
  });
  it('reflog に残り、HEAD@{1} で元に戻せる', () => {
    const r = repoWith(three, ['git reset --hard HEAD~2', 'git reset --hard HEAD@{1}']);
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c3);
    const log = r.world.local.reflog.filter((e) => e.ref === 'HEAD').map((e) => e.message);
    expect(log.at(-2)).toBe('reset: moving to HEAD~2');
  });
  it('ファイルを指定するとステージから外すだけ', () => {
    const r = repoWith({ ...three, staged: { 'a.txt': 'staged\n' } }, ['git reset a.txt']);
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c3);
    expect(text(execute(r.world, 'git status -s'))).toBe(' M a.txt');
    expect(repoWith({ ...three, staged: { 'a.txt': 'staged\n' } }, ['git reset HEAD -- a.txt']).ok).toBe(true);
  });
  it('マージ中の reset --hard でマージを取りやめる', () => {
    const r = repoWith(
      {
        commits: [
          { id: 'c1', msg: 'init', files: { 'a.txt': 'one\n' } },
          { id: 'c2', parent: 'c1', msg: 'ours', files: { 'a.txt': 'ours\n' } },
          { id: 'c3', parent: 'c1', msg: 'theirs', files: { 'a.txt': 'theirs\n' } },
        ],
        branches: { main: 'c2', feature: 'c3' },
      },
      ['git merge feature', 'git reset --hard'],
    );
    expect(r.world.local.inProgress).toBeUndefined();
    expect(r.world.local.workingTree['a.txt']).toBe('ours\n');
  });
  it('存在しないコミットはエラー、--keep は未対応', () => {
    expect(text(repoWith(three, ['git reset --hard nope']))).toContain("fatal: ambiguous argument 'nope'");
    expect(repoWith(three, ['git reset --keep HEAD~1']).ok).toBe(false);
  });
});
