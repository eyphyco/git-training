import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { fresh, repoWith, text } from '../testing';
import { getCommit } from '../model/objects';

describe('git commit', () => {
  it('最初のコミットは root-commit と表示し、main を作る', () => {
    const r = fresh(['echo "# app" > README.md', 'git add README.md', 'git commit -m "first commit"']);
    expect(text(r)).toMatch(/^\[main \(root-commit\) [0-9a-f]{7}\] first commit\n 1 file changed, 1 insertion\(\+\)\n create mode 100644 README.md$/);
    const oid = r.world.local.refs.heads.main;
    expect(getCommit(r.world.local, oid).parents).toEqual([]);
    expect(r.events.map((e) => e.type)).toEqual(['COMMIT_CREATED', 'REF_MOVED']);
  });
  it('2つ目以降は親を持ち、時計が進む', () => {
    const r = fresh(['echo a > a', 'git add a', 'git commit -m one', 'echo b >> a', 'git commit -am two']);
    const c = getCommit(r.world.local, r.world.local.refs.heads.main);
    expect(c.parents).toHaveLength(1);
    expect(c.message).toBe('two');
    expect(text(r)).toMatch(/1 file changed, 1 insertion\(\+\)$/);
  });
  it('複数の -m は空行で連結', () => {
    const r = fresh(['touch a', 'git add a', 'git commit -m title -m body']);
    expect(getCommit(r.world.local, r.world.local.refs.heads.main).message).toBe('title\n\nbody');
  });
  it('ステージが空なら失敗、-m なしも失敗', () => {
    const r = fresh(['touch a']);
    expect(execute(r.world, 'git commit -m x').ok).toBe(false);
    expect(text(execute(r.world, 'git commit -m x'))).toContain('nothing added to commit but untracked files present');
    expect(execute(execute(r.world, 'git add a').world, 'git commit').ok).toBe(false);
  });
  it('--allow-empty と detached HEAD でのコミット', () => {
    const r = repoWith({ commits: [{ id: 'c1', msg: 'i', files: { a: '1\n' } }], branches: { main: 'c1' }, head: 'detached:c1' }, ['git commit --allow-empty -m e']);
    expect(text(r)).toMatch(/^\[detached HEAD [0-9a-f]{7}\] e/);
    expect(r.world.local.head.type).toBe('detached');
  });
  it('--amend は未対応メッセージ', () => {
    expect(fresh(['git commit --amend -m x']).ok).toBe(false);
  });
  it('--fixup は「fixup! 元の件名」というメッセージでコミットする', () => {
    const r = fresh(['echo a > a', 'git add a', 'git commit -m "add a"', 'echo b > b', 'git add b', 'git commit -m "add b"', 'echo A > a', 'git add a', 'git commit --fixup HEAD~1']);
    expect(r.ok).toBe(true);
    expect(getCommit(r.world.local, r.world.local.refs.heads.main).message).toBe('fixup! add a');
    expect(text(r)).toMatch(/^\[main [0-9a-f]{7}\] fixup! add a\n/);
    const withBody = fresh(['echo a > a', 'git add a', 'git commit -m one', 'echo b > a', 'git commit -a --fixup=HEAD -m extra']);
    expect(getCommit(withBody.world.local, withBody.world.local.refs.heads.main).message).toBe('fixup! one\n\nextra');
  });
});
