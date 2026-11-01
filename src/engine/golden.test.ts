// ゴールデンテスト：同じ操作を本物の git でも行い、コミット ID（= 内容・親・時刻すべて）が一致するか確かめる（設計書 §8）。
import { describe, expect, it } from 'vitest';
import { hasGit, runBoth } from './golden-utils';

describe.skipIf(!hasGit)('実 Git との比較（ゴールデンテスト）', () => {
  it('commit・入れ子ディレクトリ・日本語', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'README.md': '# アプリ\n', 'src/app.ts': 'console.log(1)\n', 'src/lib/util.ts': 'export {}\n' }, git: ['init', 'add .', 'commit -m "first commit"'] },
        { write: { 'README.md': '# アプリ\n\n説明\n' }, git: ['commit -am "update readme" -m "本文"'] },
      ],
      ['main'],
    );
    expect(sim).toEqual(real);
  });

  it('ブランチ・fast-forward・3-way マージ', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'one\ntwo\nthree\nfour\nfive\n' }, git: ['init', 'add a.txt', 'commit -m init', 'branch feature'] },
        { write: { 'a.txt': 'ONE\ntwo\nthree\nfour\nfive\n' }, git: ['commit -am main-change', 'switch feature'] },
        { write: { 'a.txt': 'one\ntwo\nthree\nfour\nFIVE\n', 'b.txt': 'b\n' }, git: ['add .', 'commit -m feature-change', 'switch main', 'merge feature -m "Merge branch \'feature\'"'] },
        { git: ['switch -c hotfix'] },
        { write: { 'c.txt': 'c\n' }, git: ['add c.txt', 'commit -m hotfix', 'switch main', 'merge hotfix'] },
      ],
      ['main', 'feature', 'hotfix'],
    );
    expect(sim).toEqual(real);
  });

  it('コンフリクトを解消したマージコミット', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'hello\n' }, git: ['init', 'add .', 'commit -m init', 'switch -c feature'] },
        { write: { 'a.txt': 'hello feature\n' }, git: ['commit -am f', 'switch main'] },
        { write: { 'a.txt': 'hello main\n' }, git: ['commit -am m'] },
        { git: ['merge feature'], conflict: true },
        { write: { 'a.txt': 'hello both\n' }, git: ['add a.txt', 'commit -m "Merge branch \'feature\'"'] },
      ],
      ['main', 'feature'],
    );
    expect(sim).toEqual(real);
  });
});
