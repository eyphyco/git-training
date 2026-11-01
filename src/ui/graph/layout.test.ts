import { describe, expect, it } from 'vitest';
import { repoWith } from '../../engine/testing';
import { layoutGraph } from './layout';

describe('layoutGraph', () => {
  it('main が上のレーン、分岐したブランチは別レーン、マージは合流', () => {
    const r = repoWith(
      {
        commits: [
          { id: 'c1', msg: 'init', files: { a: '1\n' } },
          { id: 'c2', parent: 'c1', msg: 'feat', files: { b: '1\n' } },
          { id: 'c3', parent: 'c1', msg: 'main work', files: { c: '1\n' } },
        ],
        branches: { main: 'c3', feature: 'c2' },
      },
      ['git merge feature'],
    );
    const l = layoutGraph(r.world.local);
    const by = (msg: string) => l.nodes.find((n) => n.message.startsWith(msg))!;
    expect(l.cols).toBe(4);
    expect(by('init').lane).toBe(0);
    expect(by('main work').lane).toBe(0);
    expect(by('Merge').lane).toBe(0);
    expect(by('feat').lane).toBe(1);
    expect(by('Merge').col).toBeGreaterThan(by('feat').col);
    expect(by('Merge').labels.map((x) => x.key)).toEqual(['HEAD', 'branch:main']);
    expect(l.edges.filter((e) => e.to === by('Merge').oid)).toHaveLength(2);
  });

  it('detached HEAD とブランチのないコミット', () => {
    const r = repoWith({ commits: [{ id: 'c1', msg: 'a', files: { a: '1' } }], branches: { main: 'c1' }, head: 'detached:c1' }, ['git commit --allow-empty -m loose']);
    const l = layoutGraph(r.world.local);
    const loose = l.nodes.find((n) => n.message === 'loose')!;
    expect(loose.labels[0]).toMatchObject({ key: 'HEAD', detached: true });
    expect(loose.lane).toBe(1);
  });
});
