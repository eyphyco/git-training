// rebase -i の todo やコミットメッセージなど、「git がエディタを開いて待っている」状態の入口。
import type { CommandResult, Path, World } from './model/types';
import { runInDraft } from './run';
import { submitEditor } from './sequencer';

export type PendingEditor = { path: Path; text: string; purpose: 'todo' | 'message' };

/** git がエディタの保存を待っていれば、その仮のファイル */
export function pendingEditor(world: World): PendingEditor | null {
  const ip = world.local.inProgress;
  return ip && ip.op !== 'merge' && ip.editor ? ip.editor : null;
}

/** エディタで保存した内容を git に渡して、続きを進める */
export function saveEditor(world: World, path: Path, text: string): CommandResult {
  return runInDraft(world, (ctx) => submitEditor(ctx, path, text));
}
