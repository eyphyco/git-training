// 入力1行を実行する入口。(world, line) => { world, output, events } の純粋関数。
import { produce, type Draft } from 'immer';
import { Fail, NOT_A_REPO, type Ctx } from './command';
import { OptionError, parseArgs, tokenize, type ParsedArgs, type Redirect } from './parser';
import { GIT_COMMANDS, PLANNED } from './registry';
import { SHELL } from './shell';
import type { CommandResult, GitEvent, OutputLine, World } from './model/types';

/** エンジンの外で定義するコマンド（gh など）。シェルコマンドと同じ形 */
export type ProgramDef = { name: string; run(ctx: Ctx, args: string[]): void };

export type RunOptions = {
  /** レッスンで使ってよい git サブコマンド（未指定なら全部） */
  allowedCommands?: string[];
  /** 追加のコマンド（模擬 GitHub の gh など。engine は hosting に依存しないので外から渡す） */
  programs?: Record<string, ProgramDef>;
};

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const err = (text: string): OutputLine => ({ text, tone: 'error' });
const hint = (text: string): OutputLine => ({ text, tone: 'hint' });

function failed(world: World, output: OutputLine[]): CommandResult {
  return { world, output, events: [], ok: false };
}

export function execute(world: World, line: string, options: RunOptions = {}): CommandResult {
  const trimmed = line.trim();
  if (!trimmed) return { world, output: [], events: [], ok: true };
  const { tokens, redirect, error } = tokenize(trimmed);
  if (error) return failed(world, [err(error)]);
  const [cmd, ...rest] = tokens;
  if (!cmd) return failed(world, [err('コマンドがありません')]);

  let runFn: (ctx: Ctx) => void;
  let args: ParsedArgs = { opts: {}, positional: rest, afterDashDash: null };

  if (cmd === 'git') {
    const [sub, ...subArgs] = rest;
    if (!sub || sub === '--help' || sub === 'help') {
      return {
        world,
        output: [
          { text: 'usage: git <command> [<args>]', tone: 'normal' },
          { text: '', tone: 'normal' },
          { text: `このサイトで使えるコマンド: ${Object.keys(GIT_COMMANDS).join(', ')}`, tone: 'hint' },
        ],
        events: [],
        ok: true,
      };
    }
    if (sub === '--version' || sub === 'version')
      return { world, output: [{ text: 'git version 2.53.0 (Git Training シミュレータ)', tone: 'normal' }], events: [], ok: true };
    const def = GIT_COMMANDS[sub];
    if (!def) {
      if (PLANNED[sub]) return failed(world, [err(`このサイトでは git ${sub} はまだ使えません。`), hint(`${PLANNED[sub]}で使えるようになります。`)]);
      const near = Object.keys(GIT_COMMANDS).filter((c) => distance(c, sub) <= 2);
      return failed(world, [
        err(`git: '${sub}' is not a git command. See 'git --help'.`),
        ...(near.length ? [err(''), err('The most similar command is'), err(`\t${near[0]}`), hint(`もしかして git ${near[0]} ですか？`)] : []),
      ]);
    }
    if (options.allowedCommands && !options.allowedCommands.includes(sub))
      return failed(world, [err(`このレッスンでは git ${sub} は使えません。`), hint(`使えるコマンド: ${options.allowedCommands.map((c) => `git ${c}`).join(', ')}`)]);
    if (!def.noRepo && !world.local.initialized)
      return failed(world, [err(NOT_A_REPO), hint('ここはまだ Git リポジトリではありません。git init で作りましょう。')]);
    try {
      args = parseArgs(subArgs, def.spec ?? {});
    } catch (e) {
      if (e instanceof OptionError) return failed(world, [err(e.message), hint(`このサイトの git ${sub} では未対応のオプションです。`)]);
      throw e;
    }
    runFn = (ctx) => def.run(ctx);
  } else if (options.programs?.[cmd]) {
    const def = options.programs[cmd];
    runFn = (ctx) => def.run(ctx, rest);
  } else if (SHELL[cmd]) {
    const def = SHELL[cmd];
    runFn = (ctx) => def.run(ctx, rest);
  } else if (cmd === 'help') {
    return {
      world,
      output: [
        { text: 'git <command> … Git コマンド（git help で一覧）', tone: 'normal' },
        { text: `シェル: ${Object.keys(SHELL).join(', ')}`, tone: 'normal' },
        { text: 'echo "内容" > ファイル名 でファイルを作れます（>> で追記）。エディタタブでも編集できます。', tone: 'hint' },
      ],
      events: [],
      ok: true,
    };
  } else {
    return failed(world, [err(`${cmd}: command not found`), hint('git で始まるコマンドか、ls / cat / echo などが使えます（help で一覧）。')]);
  }

  return runInDraft(world, runFn, { args, raw: rest, redirect, writeRedirect: cmd !== 'echo' });
}

type DraftOptions = { args?: ParsedArgs; raw?: string[]; redirect?: Redirect; writeRedirect?: boolean };

/** World を Immer の draft にしてコマンド本体を走らせる。Fail は失敗出力に変える（エディタ保存など、コマンド以外の入口でも使う） */
export function runInDraft(world: World, fn: (ctx: Ctx) => void, o: DraftOptions = {}): CommandResult {
  const output: OutputLine[] = [];
  const events: GitEvent[] = [];
  const { redirect } = o;
  try {
    const next = produce(world, (draft: Draft<World>) => {
      const ctx: Ctx = {
        world: draft,
        repo: draft.local,
        args: o.args ?? { opts: {}, positional: [], afterDashDash: null },
        raw: o.raw ?? [],
        redirect,
        out: (text, tone = 'normal') => output.push({ text, tone }),
        hint: (text) => output.push({ text, tone: 'hint' }),
        emit: (e) => events.push(e),
        tick: () => (draft.clock += 60),
      };
      fn(ctx);
      // echo 以外のリダイレクト（git log > log.txt など）は通常出力をファイルに書く
      if (redirect && o.writeRedirect) {
        const text = output.filter((x) => x.tone !== 'hint').map((x) => `${x.text}\n`).join('');
        const p = redirect.path.replace(/^\.\//, '');
        const created = !(p in draft.local.workingTree);
        draft.local.workingTree[p] = redirect.op === '>>' ? (draft.local.workingTree[p] ?? '') + text : text;
        output.splice(0, output.length, ...output.filter((x) => x.tone === 'hint'));
        events.push({ type: 'FILE_WRITTEN', path: p, created });
      }
    });
    return { world: next, output, events, ok: true };
  } catch (e) {
    if (e instanceof Fail) return failed(world, [...output, ...e.lines]);
    throw e;
  }
}
