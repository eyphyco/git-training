// ゴールデンテスト：同じ操作を本物の git でも行い、コミット ID（= 内容・親・時刻すべて）が一致するか確かめる（設計書 §8）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from './run';
import { createWorld, START_TIME } from './world';
import type { World } from './model/types';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
})();

type Step = { write?: Record<string, string>; git: string[]; /** 実 Git が終了コード 1 を返す操作（コンフリクト） */ conflict?: boolean };

/** シミュレータと実 Git の両方で手順を実行し、各ブランチの指すコミットを返す */
function runBoth(steps: Step[], branches: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'git-golden-'));
  try {
    let world: World = createWorld({ initialized: false }).world;
    let clock = START_TIME;
    const git = (args: string[]) =>
      execFileSync('git', args, {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_NAME: 'You',
          GIT_AUTHOR_EMAIL: 'you@example.com',
          GIT_COMMITTER_NAME: 'You',
          GIT_COMMITTER_EMAIL: 'you@example.com',
          GIT_AUTHOR_DATE: `@${clock} +0900`,
          GIT_COMMITTER_DATE: `@${clock} +0900`,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    for (const step of steps) {
      for (const [p, content] of Object.entries(step.write ?? {})) {
        mkdirSync(dirname(join(dir, p)), { recursive: true });
        writeFileSync(join(dir, p), content);
        world = { ...world, local: { ...world.local, workingTree: { ...world.local.workingTree, [p]: content } } };
      }
      for (const line of step.git) {
        const res = execute(world, `git ${line}`);
        if (!res.ok) throw new Error(`simulator failed: ${line}\n${res.output.map((o) => o.text).join('\n')}`);
        // コミットを作る操作ではシミュレータの時計が進むので、実 Git の日時もそれに合わせる
        clock = res.world.clock;
        world = res.world;
        const argv = line.match(/"[^"]*"|\S+/g)!.map((a) => a.replace(/^"|"$/g, ''));
        if (argv[0] === 'init') git(['init', '-q', '-b', 'main']);
        else if (step.conflict) {
          try {
            git(argv);
          } catch {
            // コンフリクト時の実 Git は終了コード 1
          }
          expect(res.world.local.inProgress?.conflicts.length).toBeGreaterThan(0);
        } else git(argv);
      }
    }
    const real = Object.fromEntries(branches.map((b) => [b, git(['rev-parse', b]).trim()]));
    const sim = Object.fromEntries(branches.map((b) => [b, world.local.refs.heads[b]]));
    const realTree = git(['rev-parse', 'HEAD^{tree}']).trim();
    return { real, sim, world, realTree };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
