import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { getCommit } from '../model/objects';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
    { id: 'c2', parent: 'c1', msg: 'add featrue', files: { 'f.txt': 'f\n' } },
  ],
  branches: { main: 'c2' },
};

describe('git commit --amend', () => {
  it('直前のコミットを作り直す（親は同じ、作者の時刻は元のまま）', () => {
    const r = repoWith(setup, ['git commit --amend -m "add feature"']);
    expect(r.ok).toBe(true);
    const head = getCommit(r.world.local, r.world.local.refs.heads.main);
    const orig = getCommit(r.world.local, r.aliases.c2);
    expect(head.message).toBe('add feature');
    expect(head.parents).toEqual([r.aliases.c1]);
    expect(head.author.time).toBe(orig.author.time);
    expect(text(r)).toMatch(/^\[main [0-9a-f]{7}\] add feature\n Date: .+\n 1 file changed, 1 insertion\(\+\)\n create mode 100644 f.txt$/);
    expect(r.events.find((e) => e.type === 'COMMIT_AMENDED')).toBeTruthy();
    expect(r.world.local.reflog.at(-1)?.message).toBe('commit (amend): add feature');
  });
  it('--no-edit でステージの追加分だけ入れる', () => {
    const r = repoWith({ ...setup, staged: { 'g.txt': 'g\n' } }, ['git commit --amend --no-edit']);
    const head = getCommit(r.world.local, r.world.local.refs.heads.main);
    expect(head.message).toBe('add featrue');
    expect(r.world.local.objects[head.tree]).toBeTruthy();
    expect(text(repoWith({ ...setup, staged: { 'g.txt': 'g\n' } }, ['git commit --amend --no-edit', 'git show --stat --oneline HEAD']))).toContain('g.txt');
  });
  it('-m も --no-edit もなければエディタが開けない旨を伝える', () => {
    expect(repoWith(setup, ['git commit --amend']).ok).toBe(false);
  });
  it('push 済みのコミットを amend すると注意を出す', () => {
    const r = repoWith({ ...setup, remotes: { origin: { branches: { main: 'c2' } } } }, ['git commit --amend -m x']);
    expect(r.output.some((o) => o.tone === 'hint' && o.text.includes('push'))).toBe(true);
  });
});
