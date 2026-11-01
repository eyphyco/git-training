import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'README.md': '# app\n', 'src/app.js': 'app()\n' } },
    { id: 'c2', parent: 'c1', msg: 'second', files: { 'README.md': '# App\n' } },
  ],
  branches: { main: 'c2' },
  remotes: { origin: { branches: { main: 'c2' } } },
};

describe('内部構造を見るコマンド', () => {
  it('cat-file -t / -p でコミット・ツリー・ブロブを見られる', () => {
    const r = repoWith(setup);
    expect(text(execute(r.world, 'git cat-file -t HEAD'))).toBe('commit');
    const c = text(execute(r.world, 'git cat-file -p HEAD'));
    expect(c).toMatch(/^tree [0-9a-f]{40}\nparent [0-9a-f]{40}\nauthor You <you@example.com> \d+ \+0900\ncommitter You <you@example.com> \d+ \+0900\n\nsecond$/);
    const tree = c.split('\n')[0].slice(5);
    expect(text(execute(r.world, `git cat-file -p ${tree}`))).toMatch(/^100644 blob [0-9a-f]{40}\tREADME.md\n040000 tree [0-9a-f]{40}\tsrc$/);
    expect(text(execute(r.world, 'git cat-file -p HEAD:README.md'))).toBe('# App');
    expect(text(execute(r.world, 'git cat-file -t HEAD^{tree}'))).toBe('tree');
    expect(execute(r.world, 'git cat-file -p 0000000').ok).toBe(false);
  });
  it('ls-tree と rev-parse', () => {
    const r = repoWith(setup);
    expect(text(execute(r.world, 'git ls-tree -r --name-only HEAD'))).toBe('README.md\nsrc/app.js');
    expect(text(execute(r.world, 'git rev-parse HEAD~1'))).toBe(r.aliases.c1);
    expect(text(execute(r.world, 'git rev-parse --short HEAD'))).toBe(r.aliases.c2.slice(0, 7));
    expect(text(execute(r.world, 'git rev-parse --abbrev-ref HEAD'))).toBe('main');
  });
  it('タグを push / fetch できる', () => {
    const r = repoWith(setup, ['git tag -a v1.0.0 -m release', 'git push origin v1.0.0']);
    expect(text(r)).toMatch(/\* \[new tag\] +v1.0.0 -> v1.0.0/);
    expect(r.world.remotes.origin.refs.tags['v1.0.0']).toBe(r.world.local.refs.tags['v1.0.0']);
    expect(text(execute(r.world, 'git push origin v1.0.0'))).toBe('Everything up-to-date');
    const fresh = execute({ ...r.world, local: { ...r.world.local, refs: { ...r.world.local.refs, tags: {} } } }, 'git fetch');
    expect(text(fresh)).toContain('[new tag]');
    expect(fresh.world.local.refs.tags['v1.0.0']).toBeTruthy();
  });
});
