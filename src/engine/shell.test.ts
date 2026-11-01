import { describe, expect, it } from 'vitest';
import { fresh, text } from './testing';
import { execute } from './run';
import { createWorld } from './world';

describe('shell', () => {
  it('echo / cat / ls / rm', () => {
    const r = fresh(['echo hello > a.txt', 'echo more >> a.txt', 'echo x > src/b.ts', 'ls']);
    expect(text(r)).toBe('a.txt  src/');
    expect(text(execute(r.world, 'cat a.txt'))).toBe('hello\nmore');
    expect(execute(r.world, 'rm src').ok).toBe(false);
    expect(execute(r.world, 'rm -r src').world.local.workingTree).toEqual({ 'a.txt': 'hello\nmore\n' });
  });
  it('未知のコマンドと未実装の git コマンド', () => {
    const { world } = createWorld();
    expect(text(execute(world, 'vim a'))).toBe('vim: command not found');
    expect(execute(world, 'git rebase main').output[1].text).toContain('第6章');
    expect(text(execute(world, 'git comit'))).toContain('commit');
  });
  it('allowedCommands で制限できる', () => {
    const { world } = createWorld();
    expect(execute(world, 'git log', { allowedCommands: ['status'] }).ok).toBe(false);
  });
  it('git log > file でファイルに書く', () => {
    const r = fresh(['touch a', 'git add a', 'git commit -m one', 'git log --oneline > log.txt']);
    expect(r.world.local.workingTree['log.txt']).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) one\n$/);
  });
});
