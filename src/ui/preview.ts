// 実行プレビュー（F-20）：入力中のコマンドを今の状態で試しに実行し、グラフがどう変わるかを先に見せる。
import { execute } from '../engine/run';
import type { World } from '../engine/model/types';
import { PROGRAMS } from '../lesson/session';

/** グラフの形が変わる、事故の起きやすいコマンドだけ予告する */
const PREVIEWABLE = /^git\s+(merge|rebase|reset|cherry-pick|revert|pull|commit\s.*--amend)(\s|$)/;

export function previewOf(world: World, line: string, allowedCommands?: string[]): World | null {
  const t = line.trim();
  // rebase -i はエディタが開くだけなので予告しない
  if (!PREVIEWABLE.test(t) || /\s(-i|--interactive)(\s|$)/.test(t)) return null;
  const r = execute(world, t, { allowedCommands, programs: PROGRAMS });
  if (!r.ok || r.world.local === world.local) return null;
  return r.world;
}
