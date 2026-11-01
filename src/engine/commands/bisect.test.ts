import { describe, expect, it } from 'vitest';
import type { Setup, SetupCommit } from '../world';
import { execute } from '../run';
import { repoWith, text } from '../testing';

// c1〜c10。c7 で bug.txt にバグが入る
const commits: SetupCommit[] = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i + 1}`,
  ...(i ? { parent: `c${i}` } : {}),
  msg: `c${i + 1}`,
  files: { 'n.txt': `${i + 1}\n`, ...(i + 1 === 7 ? { 'bug.txt': 'bug\n' } : {}), ...(i === 0 ? { 'test.sh': '! grep -q bug bug.txt\n' } : {}) },
}));
const setup: Setup = { commits, branches: { main: 'c10' } };

describe('git bisect', () => {
  it('good / bad で半分ずつ絞り込み、最初の bad を見つける', () => {
    let r = repoWith(setup, ['git bisect start', 'git bisect bad', 'git bisect good HEAD~9']);
    expect(text(r)).toMatch(/Bisecting: 4 revisions left to test after this \(roughly 2 steps\)\n\[[0-9a-f]{40}\] c5$/);
    expect(r.world.local.head.type).toBe('detached');
    // バグがあるかどうかを答えていく（c7 以降が bad）
    for (let i = 0; i < 5 && !text(r).includes('is the first bad commit'); i++) {
      const msg = text(r).split('] ').pop()!;
      r = { ...r, ...execute(r.world, `git bisect ${Number(msg.slice(1)) >= 7 ? 'bad' : 'good'}`) };
    }
    expect(text(r)).toContain(`${r.aliases.c7} is the first bad commit`);
    const reset = execute(r.world, 'git bisect reset');
    expect(reset.world.local.head).toEqual({ type: 'symbolic', ref: 'main' });
    expect(reset.world.local.bisect).toBeUndefined();
  });
  it('start <bad> <good> と run で自動化', () => {
    const r = repoWith(setup, ['git bisect start HEAD c1', 'git bisect run sh test.sh'].map((l) => l.replace('c1', 'HEAD~9')));
    expect(text(r)).toContain('is the first bad commit');
    expect(text(r)).toContain('bisect found first bad commit');
    expect(text(r)).toContain(`${r.aliases.c7} is the first bad commit`);
  });
  it('start 前の good はエラー', () => {
    expect(repoWith(setup, ['git bisect good']).ok).toBe(false);
  });
});
