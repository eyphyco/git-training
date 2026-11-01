// コマンド定義の共通部品。各コマンドは Immer の draft を書き換えるだけで、外からは純粋関数に見える。
import type { Draft } from 'immer';
import type { OptSpec, ParsedArgs, Redirect } from './parser';
import type { GitEvent, OutputLine, RepoState, Tone, World } from './model/types';

export type Ctx = {
  world: Draft<World>;
  repo: Draft<RepoState>;
  args: ParsedArgs;
  raw: string[];
  redirect?: Redirect;
  out(text: string, tone?: Tone): void;
  hint(text: string): void;
  emit(e: GitEvent): void;
  /** 時刻を1分進めて返す（コミットごとに呼ぶ） */
  tick(): number;
};

export class Fail extends Error {
  constructor(public lines: OutputLine[]) {
    super(lines.map((l) => l.text).join('\n'));
  }
}

/** エラー出力して中断する。日本語ヒントは hint で添える */
export function fail(text: string, hint?: string): never {
  const lines: OutputLine[] = text ? text.split('\n').map((t) => ({ text: t, tone: 'error' as const })) : [];
  if (hint) lines.push({ text: hint, tone: 'hint' });
  throw new Fail(lines);
}

export type CommandDef = {
  name: string;
  spec?: OptSpec;
  /** git init のように、リポジトリがなくても実行できるか */
  noRepo?: boolean;
  run(ctx: Ctx): void;
};

export function unsupported(what: string, real: string): never {
  fail(`このサイトでは ${what} は未対応です。`, `実 Git では: ${real}`);
}

export const NOT_A_REPO = 'fatal: not a git repository (or any of the parent directories): .git';
