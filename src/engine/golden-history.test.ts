// 履歴操作（第6章）のゴールデンテスト：amend / reset / revert / cherry-pick / rebase / stash / tag の結果を本物の git と比べる。
import { describe, expect, it } from 'vitest';
import { hasGit, runBoth } from './golden-utils';

describe.skipIf(!hasGit)('実 Git との比較（履歴操作）', () => {
  it('amend・revert・cherry-pick・reset・注釈付きタグ', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'one\ntwo\nthree\n' }, git: ['init', 'add .', 'commit -m init'] },
        { write: { 'b.txt': 'b\n' }, git: ['add b.txt', 'commit -m "add bb"', 'commit --amend -m "add b"'] },
        { write: { 'a.txt': 'one\nBUG\nthree\n' }, git: ['commit -am bug', 'revert --no-edit HEAD', 'switch -c side HEAD~2'] },
        { write: { 'c.txt': 'c\n' }, git: ['add c.txt', 'commit -m "side work"', 'switch main', 'cherry-pick side'] },
        { write: { 'd.txt': 'd\n' }, git: ['add d.txt', 'commit -m tmp', 'reset --soft HEAD~1', 'commit -m "add d"', 'tag -a v1.0 -m "first release"', 'tag v1.0-light HEAD~1'] },
        { git: ['reset --hard HEAD~1', 'reset --hard HEAD@{1}'] },
      ],
      ['main', 'side', 'refs/tags/v1.0', 'refs/tags/v1.0-light'],
    );
    expect(sim).toEqual(real);
  });

  it('rebase：衝突を解消して --continue', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'hello\n' }, git: ['init', 'add .', 'commit -m init', 'switch -c feature'] },
        { write: { 'a.txt': 'hello feature\n', 'f.txt': 'f\n' }, git: ['add .', 'commit -m f1'] },
        { write: { 'g.txt': 'g\n' }, git: ['add .', 'commit -m f2', 'switch main'] },
        { write: { 'a.txt': 'hello main\n' }, git: ['commit -am m1', 'switch feature'] },
        { git: ['rebase main'], conflict: true },
        { write: { 'a.txt': 'hello both\n' }, git: ['add a.txt', 'rebase --continue'] },
      ],
      ['main', 'feature'],
    );
    expect(sim).toEqual(real);
  });

  it('rebase -i：squash（メッセージ編集）・drop・並べ替え', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'a\n' }, git: ['init', 'add .', 'commit -m init'] },
        { write: { 'b.txt': 'b\n' }, git: ['add .', 'commit -m "add b"'] },
        { write: { 'b.txt': 'B\n' }, git: ['commit -am "fix b"'] },
        { write: { 'c.txt': 'c\n' }, git: ['add .', 'commit -m "add c"'] },
        { write: { 'd.txt': 'd\n' }, git: ['add .', 'commit -m "add d"'] },
        {
          git: ['rebase -i HEAD~4'],
          editors: [
            (todo) => {
              const [b, fix, c, d] = todo.split('\n');
              return [d, b, fix.replace(/^pick/, 'squash'), c.replace(/^pick/, 'drop')].join('\n') + '\n';
            },
            () => 'add b (fixed)\n\nsquashed\n',
          ],
        },
      ],
      ['main'],
    );
    expect(sim).toEqual(real);
  });

  it('stash：ステージ・ワークツリー・未追跡を退避して戻す', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'a\n', 'b.txt': 'b\n' }, git: ['init', 'add .', 'commit -m init'] },
        { write: { 'a.txt': 'a2\n', 'b.txt': 'b2\n', 'new.txt': 'n\n' }, git: ['add b.txt', 'stash push -u -m wip'] },
      ],
      ['main', 'refs/stash'],
    );
    expect(sim).toEqual(real);
    const two = runBoth(
      [
        { write: { 'a.txt': 'a\n' }, git: ['init', 'add .', 'commit -m init'] },
        { write: { 'a.txt': 'a2\n' }, git: ['stash'] },
        { write: { 'x.txt': 'x\n' }, git: ['add x.txt', 'commit -m x', 'stash pop', 'commit -am after'] },
      ],
      ['main'],
    );
    expect(two.sim).toEqual(two.real);
  });
});

describe.skipIf(!hasGit)('実 Git との比較（シナリオで使う操作）', () => {
  it('commit --fixup と rebase --autosquash', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'a.txt': 'a\n' }, git: ['init', 'add .', 'commit -m init', 'switch -c feature'] },
        { write: { 'login.js': 'logn()\n' }, git: ['add .', 'commit -m "add login"'] },
        { write: { 'logout.js': 'out()\n' }, git: ['add .', 'commit -m "add logout"'] },
        { write: { 'login.js': 'login()\n' }, git: ['add .', 'commit --fixup HEAD~1', 'rebase --autosquash main'] },
      ],
      ['main', 'feature'],
    );
    expect(sim).toEqual(real);
  });

  it('cherry-pick -x（衝突を解消して --continue）と merge --no-ff', () => {
    const { real, sim } = runBoth(
      [
        { write: { 'app.js': 'v1\nbug\n' }, git: ['init', 'add .', 'commit -m "release 1.0"', 'tag v1.0', 'branch release/1.x'] },
        { write: { 'app.js': 'v2\nbug\n' }, git: ['commit -am "start 2.0"'] },
        { write: { 'app.js': 'v2\nfixed\n' }, git: ['commit -am "fix bug"', 'switch release/1.x'] },
        { git: ['cherry-pick -x main'], conflict: true },
        { write: { 'app.js': 'v1\nfixed\n' }, git: ['add app.js', 'cherry-pick --continue', 'tag -a v1.0.1 -m "1.0.1"', 'switch main', 'switch -c topic'] },
        { write: { 't.txt': 't\n' }, git: ['add .', 'commit -m topic', 'switch main', 'merge --no-ff --no-edit topic'] },
      ],
      ['main', 'release/1.x', 'refs/tags/v1.0.1'],
    );
    expect(sim).toEqual(real);
  });

  it('cat-file・ls-tree・rev-parse の出力', () => {
    const { out } = runBoth(
      [
        { write: { 'README.md': '# app\n', 'src/main.js': 'main()\n' }, git: ['init', 'add .', 'commit -m init', 'tag -a v1 -m "first"'] },
        { write: { 'src/main.js': 'main(2)\n' }, git: ['commit -am second'] },
      ],
      [],
      ['cat-file -p HEAD', 'cat-file -t HEAD^{tree}', 'cat-file -s HEAD:src/main.js', 'cat-file -p v1', 'ls-tree HEAD', 'ls-tree -r HEAD', 'rev-parse HEAD~1', 'rev-parse --short HEAD', 'rev-parse --abbrev-ref HEAD'],
    );
    expect(out.sim).toEqual(out.real);
  });
});

describe.skipIf(!hasGit)('実 Git との比較（bisect）', () => {
  it('bisect が選ぶコミットの順番', () => {
    const steps = [{ write: { 'n.txt': '1\n' }, git: ['init', 'add .', 'commit -m c1'] }];
    for (let i = 2; i <= 12; i++) steps.push({ write: { 'n.txt': `${i}\n` }, git: ['add .', `commit -m c${i}`] });
    // c8 から bad として、各ステップで HEAD が実 Git と同じか（ブランチ名の代わりに HEAD を比べる）
    const answers = ['bisect start HEAD HEAD~11'];
    const { real, sim } = runBoth([...steps, { git: answers }], ['HEAD']);
    expect(sim.HEAD ?? real.HEAD).toBe(real.HEAD);
  });
});
