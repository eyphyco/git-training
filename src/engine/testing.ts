// テスト用ヘルパー：コマンドを順に流して最後の結果を返す。
import { execute } from './run';
import { createWorld, type Setup } from './world';
import type { CommandResult, World } from './model/types';

export function runAll(world: World, lines: string[]): CommandResult {
  let res: CommandResult = { world, output: [], events: [], ok: true };
  for (const line of lines) {
    res = execute(res.world, line);
    if (!res.ok && line !== lines[lines.length - 1]) throw new Error(`"${line}" failed:\n${text(res)}`);
  }
  return res;
}

export function text(res: CommandResult): string {
  return res.output.filter((o) => o.tone !== 'hint').map((o) => o.text).join('\n');
}

export function repoWith(setup: Setup, lines: string[] = []) {
  const { world, aliases } = createWorld(setup);
  return { ...runAll(world, lines), aliases };
}

/** 初期化済みの空リポジトリでコマンドを流す */
export function fresh(lines: string[]) {
  return repoWith({}, lines);
}
