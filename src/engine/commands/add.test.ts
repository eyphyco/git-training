import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { fresh, repoWith, text } from '../testing';

describe('git add', () => {
  it('指定ファイルをステージに載せ、イベントを出す', () => {
    const r = fresh(['echo hi > a.txt', 'echo yo > b.txt', 'git add a.txt']);
    expect(Object.keys(r.world.local.index)).toEqual(['a.txt']);
    expect(r.events).toEqual([{ type: 'FILE_STAGED', path: 'a.txt', change: 'added' }]);
  });
  it('. で全部、削除もステージする', () => {
    const r = repoWith({ commits: [{ id: 'c1', msg: 'i', files: { 'old.txt': 'x\n' } }], branches: { main: 'c1' }, workingTree: { 'old.txt': null, 'new.txt': 'n\n' } }, ['git add .']);
    expect(Object.keys(r.world.local.index)).toEqual(['new.txt']);
  });
  it('.gitignore 対象は . では黙って飛ばし、名指しはエラー', () => {
    const r = fresh(['echo "*.log" > .gitignore', 'echo e > err.log', 'git add .']);
    expect(Object.keys(r.world.local.index)).toEqual(['.gitignore']);
    const e = execute(r.world, 'git add err.log');
    expect(e.ok).toBe(false);
    expect(text(e)).toContain('ignored by one of your .gitignore files');
    expect(Object.keys(execute(r.world, 'git add -f err.log').world.local.index)).toContain('err.log');
  });
  it('存在しないパスはエラー、引数なしもエラー', () => {
    expect(text(fresh(['git add nope']))).toBe("fatal: pathspec 'nope' did not match any files");
    expect(fresh(['git add']).ok).toBe(false);
  });
});
