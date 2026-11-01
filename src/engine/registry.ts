// コマンド登録表。新しいコマンドはここに1行足すだけで使えるようになる（設計書 §8 保守性）。
import type { CommandDef } from './command';
import { add } from './commands/add';
import { branch } from './commands/branch';
import { checkout } from './commands/checkout';
import { clone } from './commands/clone';
import { commit } from './commands/commit';
import { config } from './commands/config';
import { diff } from './commands/diff';
import { fetch } from './commands/fetch';
import { init } from './commands/init';
import { log } from './commands/log';
import { merge } from './commands/merge';
import { pull } from './commands/pull';
import { push } from './commands/push';
import { remote } from './commands/remote';
import { restore } from './commands/restore';
import { rm } from './commands/rm';
import { status } from './commands/status';
import { switchCmd } from './commands/switch';

export const GIT_COMMANDS: Record<string, CommandDef> = {
  init,
  config,
  status,
  add,
  rm,
  commit,
  log,
  diff,
  restore,
  branch,
  switch: switchCmd,
  checkout,
  merge,
  clone,
  remote,
  fetch,
  pull,
  push,
};

/** 実 Git にはあるが、このフェーズではまだ動かないコマンド → 何章で扱うか */
export const PLANNED: Record<string, string> = {
  revert: '第6章',
  reset: '第6章',
  stash: '第6章',
  'cherry-pick': '第6章',
  rebase: '第6章',
  reflog: '第6章',
  tag: '第7章',
  bisect: '第8章',
  worktree: '第8章',
  show: '第6章',
  mv: '今後',
};
