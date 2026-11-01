// リモート操作のゴールデンテスト：bare リポジトリを origin にして、push / 同僚の push / fetch / pull の結果を実 Git と比べる。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from './run';
import { teammatePush } from './remote';
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

describe.skipIf(!hasGit)('実 Git との比較（リモート）', () => {
  it('push → 同僚の push → fetch → 分岐した pull（マージ）→ push', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-golden-remote-'));
    try {
      const origin = join(root, 'origin.git');
      const me = join(root, 'me');
      const mate = join(root, 'mate');
      let clock = START_TIME;
      const git = (cwd: string, args: string[], who = 'You') =>
        execFileSync('git', args, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            PATH: process.env.PATH,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_AUTHOR_NAME: who,
            GIT_AUTHOR_EMAIL: `${who.toLowerCase()}@example.com`,
            GIT_COMMITTER_NAME: who,
            GIT_COMMITTER_EMAIL: `${who.toLowerCase()}@example.com`,
            GIT_AUTHOR_DATE: `@${clock} +0900`,
            GIT_COMMITTER_DATE: `@${clock} +0900`,
          },
        });
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
      execFileSync('git', ['init', '-q', '-b', 'main', me]);

      let world: World = createWorld({}).world;
      const sim = (line: string) => {
        const r = execute(world, line);
        if (!r.ok) throw new Error(`${line}\n${r.output.map((o) => o.text).join('\n')}`);
        world = r.world;
        clock = world.clock;
      };
      const write = (p: string, c: string) => {
        writeFileSync(join(me, p), c);
        world = { ...world, local: { ...world.local, workingTree: { ...world.local.workingTree, [p]: c } } };
      };

      write('a.txt', 'one\n');
      sim('git add a.txt');
      sim('git commit -m init');
      git(me, ['add', 'a.txt']);
      git(me, ['commit', '-q', '-m', 'init']);
      sim(`git remote add origin ${origin}`);
      git(me, ['remote', 'add', 'origin', origin]);
      sim('git push -u origin main');
      git(me, ['push', '-q', '-u', 'origin', 'main']);

      // 同僚が clone して push
      execFileSync('git', ['clone', '-q', origin, mate]);
      const t = teammatePush(world, { author: 'Sato', message: 'add b', files: { 'b.txt': 'b\n' } });
      world = t.world;
      clock = world.clock;
      writeFileSync(join(mate, 'b.txt'), 'b\n');
      git(mate, ['add', 'b.txt'], 'Sato');
      git(mate, ['commit', '-q', '-m', 'add b'], 'Sato');
      git(mate, ['push', '-q'], 'Sato');

      // 自分もコミットしてから pull（分岐 → マージコミット）して push
      write('a.txt', 'two\n');
      sim('git commit -am mine');
      git(me, ['commit', '-q', '-am', 'mine']);
      sim('git fetch');
      git(me, ['fetch', '-q']);
      sim('git pull');
      git(me, ['-c', 'pull.rebase=false', 'pull', '-q']);
      sim('git push');
      git(me, ['push', '-q']);

      const real = { main: git(me, ['rev-parse', 'main']).trim(), origin: git(origin, ['rev-parse', 'main']).trim(), msg: git(me, ['log', '-1', '--format=%s']).trim() };
      const simMain = world.local.refs.heads.main;
      expect({ main: simMain, origin: world.remotes.origin.refs.heads.main, msg: execute(world, 'git log -1 --oneline').output[0].text.slice(8).replace(/^\(.*?\) /, '') }).toEqual(real);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--force-with-lease：同僚の push の後は stale info で止まり、fetch 後は上書きする。タグの push', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-golden-lease-'));
    try {
      const origin = join(root, 'origin.git');
      const me = join(root, 'me');
      const mate = join(root, 'mate');
      let clock = START_TIME;
      const env = (who: string) => ({
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: who,
        GIT_AUTHOR_EMAIL: `${who.toLowerCase()}@example.com`,
        GIT_COMMITTER_NAME: who,
        GIT_COMMITTER_EMAIL: `${who.toLowerCase()}@example.com`,
        GIT_AUTHOR_DATE: `@${clock} +0900`,
        GIT_COMMITTER_DATE: `@${clock} +0900`,
      });
      const git = (cwd: string, args: string[], who = 'You') => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: env(who) });
      /** 失敗する操作：終了コードが 0 以外なら true */
      const gitFails = (cwd: string, args: string[]) => {
        try {
          git(cwd, args);
          return false;
        } catch {
          return true;
        }
      };
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
      execFileSync('git', ['init', '-q', '-b', 'main', me]);
      let world: World = createWorld({}).world;
      const sim = (line: string, ok = true) => {
        const r = execute(world, line);
        expect(r.ok, `${line}\n${r.output.map((o) => o.text).join('\n')}`).toBe(ok);
        world = r.world;
        clock = world.clock;
      };
      const write = (p: string, c: string) => {
        writeFileSync(join(me, p), c);
        world = { ...world, local: { ...world.local, workingTree: { ...world.local.workingTree, [p]: c } } };
      };

      write('a.txt', 'one\n');
      sim('git add a.txt');
      git(me, ['add', 'a.txt']);
      sim('git commit -m init');
      git(me, ['commit', '-q', '-m', 'init']);
      sim(`git remote add origin ${origin}`);
      git(me, ['remote', 'add', 'origin', origin]);
      sim('git push -u origin main');
      git(me, ['push', '-q', '-u', 'origin', 'main']);
      sim('git tag -a v1.0.0 -m "1.0.0"');
      git(me, ['tag', '-a', 'v1.0.0', '-m', '1.0.0']);
      sim('git push origin v1.0.0');
      git(me, ['push', '-q', 'origin', 'v1.0.0']);

      // 自分は直前のコミットを作り直し、同僚は同じブランチに push する
      write('a.txt', 'one!\n');
      sim('git commit -a --amend --no-edit');
      git(me, ['commit', '-q', '-a', '--amend', '--no-edit']);
      execFileSync('git', ['clone', '-q', origin, mate]);
      world = teammatePush(world, { author: 'Sato', message: 'add b', files: { 'b.txt': 'b\n' } }).world;
      clock = world.clock;
      writeFileSync(join(mate, 'b.txt'), 'b\n');
      git(mate, ['add', 'b.txt'], 'Sato');
      git(mate, ['commit', '-q', '-m', 'add b'], 'Sato');
      git(mate, ['push', '-q'], 'Sato');

      sim('git push --force-with-lease', false);
      expect(gitFails(me, ['push', '-q', '--force-with-lease'])).toBe(true);
      sim('git fetch');
      git(me, ['fetch', '-q']);
      sim('git push --force-with-lease');
      git(me, ['push', '-q', '--force-with-lease']);

      const real = { main: git(me, ['rev-parse', 'main']).trim(), origin: git(origin, ['rev-parse', 'main']).trim(), tag: git(origin, ['rev-parse', 'v1.0.0']).trim() };
      expect({ main: world.local.refs.heads.main, origin: world.remotes.origin.refs.heads.main, tag: world.remotes.origin.refs.tags['v1.0.0'] }).toEqual(real);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
