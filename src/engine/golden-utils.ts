// ゴールデンテストの共通処理：同じ手順をシミュレータと本物の git の両方で実行する（テスト専用）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';
import { pendingEditor, saveEditor } from './editor';
import { execute } from './run';
import { createWorld, START_TIME } from './world';
import type { World } from './model/types';

export const hasGit = (() => {
  try {
    execFileSync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
})();

export type Step = {
  write?: Record<string, string>;
  git: string[];
  /** 実 Git が終了コード 1 を返す操作（コンフリクト） */
  conflict?: boolean;
  /** rebase -i：開いたエディタの内容をどう書き換えて保存するか（todo、メッセージの順） */
  editors?: ((text: string) => string)[];
};

/** "main" "refs/tags/v1" "refs/stash" をシミュレータ側で引く */
function simRef(world: World, ref: string) {
  if (ref.startsWith('refs/tags/')) return world.local.refs.tags[ref.slice(10)];
  if (ref === 'refs/stash') return world.local.stash[0]?.oid;
  return world.local.refs.heads[ref];
}

/** シミュレータと実 Git の両方で手順を実行し、各ブランチの指すコミットを返す */
export function runBoth(steps: Step[], branches: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'git-golden-'));
  try {
    let world: World = createWorld({ initialized: false }).world;
    let clock = START_TIME;
    const git = (args: string[], extra: Record<string, string> = {}) =>
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
          GIT_EDITOR: 'true',
          ...extra,
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
        // エディタの保存：シミュレータには内容を渡し、実 Git にはその内容をコピーするエディタを使わせる
        const extra: Record<string, string> = {};
        (step.editors ?? []).forEach((edit, i) => {
          const ed = pendingEditor(world);
          if (!ed) throw new Error(`editor ${i} is not open`);
          const file = join(dir, `..`, `${dir.split('/').pop()}-edit-${i}.txt`);
          writeFileSync(file, edit(ed.text));
          extra[ed.purpose === 'todo' ? 'GIT_SEQUENCE_EDITOR' : 'GIT_EDITOR'] = `cp ${file}`;
          const saved = saveEditor(world, ed.path, edit(ed.text));
          if (!saved.ok) throw new Error(`simulator editor failed\n${saved.output.map((o) => o.text).join('\n')}`);
          world = saved.world;
        });
        const argv = line.match(/"[^"]*"|\S+/g)!.map((a) => a.replace(/^"|"$/g, ''));
        if (argv[0] === 'init') git(['init', '-q', '-b', 'main']);
        else if (step.conflict) {
          try {
            git(argv);
          } catch {
            // コンフリクト時の実 Git は終了コード 1
          }
          expect(res.world.local.inProgress?.conflicts.length).toBeGreaterThan(0);
        } else git(argv, extra);
      }
    }
    const real = Object.fromEntries(branches.map((b) => [b, git(['rev-parse', b]).trim()]));
    const sim = Object.fromEntries(branches.map((b) => [b, simRef(world, b)]));
    const realTree = git(['rev-parse', 'HEAD^{tree}']).trim();
    return { real, sim, world, realTree };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

