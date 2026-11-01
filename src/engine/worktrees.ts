// git worktree の土台：作業フォルダの切り替え。コミット・ブランチは共有し、HEAD・ステージ・ワークツリーだけを入れ替える。
import type { Draft } from 'immer';
import { fail } from './command';
import { PROJECT_DIR } from './commands/init';
import type { RepoState, WorktreeState } from './model/types';

export const HOME = '/home/you';

export function cwdOf(repo: RepoState): string {
  return repo.worktrees?.cwd ?? PROJECT_DIR;
}

/** "../hotfix" "hotfix" "~/x" "/home/you/x" を絶対パスにする */
export function resolvePath(cwd: string, arg: string): string {
  const parts = (arg.startsWith('/') ? arg : arg.startsWith('~') ? HOME + arg.slice(1) : `${cwd}/${arg}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return `/${out.join('/')}`;
}

/** 全作業フォルダのパス（今いるフォルダを含む） */
export function worktreePaths(repo: RepoState): string[] {
  return [PROJECT_DIR, ...Object.keys(repo.worktrees?.others ?? {}).filter((p) => p !== PROJECT_DIR), ...(repo.worktrees && repo.worktrees.cwd !== PROJECT_DIR ? [repo.worktrees.cwd] : [])].filter((p, i, a) => a.indexOf(p) === i).sort((a, b) => (a === PROJECT_DIR ? -1 : b === PROJECT_DIR ? 1 : a.localeCompare(b)));
}

/** そのフォルダの状態（今いるフォルダなら repo 自身から作る） */
export function stateAt(repo: RepoState, path: string): WorktreeState | null {
  if (path === cwdOf(repo)) return { head: repo.head, index: repo.index, workingTree: repo.workingTree, inProgress: repo.inProgress };
  return repo.worktrees?.others[path] ?? null;
}

/** ブランチがほかの作業フォルダで使われていれば、そのパス */
export function usedElsewhere(repo: RepoState, branch: string): string | null {
  for (const [path, wt] of Object.entries(repo.worktrees?.others ?? {})) if (wt.head.type === 'symbolic' && wt.head.ref === branch) return path;
  return null;
}

export function failIfUsedElsewhere(repo: RepoState, branch: string) {
  const at = usedElsewhere(repo, branch);
  if (at) fail(`fatal: '${branch}' is already used by worktree at '${at}'`, `${branch} はほかの作業フォルダ（${at}）で使われています。1つのブランチは1つの作業フォルダでしか使えません。`);
}

/** 作業フォルダを移動する（cd） */
export function enterWorktree(repo: Draft<RepoState>, path: string) {
  const cur = cwdOf(repo);
  if (path === cur) return;
  const target = repo.worktrees?.others[path];
  if (!target) fail(`cd: ${path}: No such file or directory`, 'このシミュレータでは、git worktree list に出る作業フォルダの間だけ移動できます。');
  repo.worktrees!.others[cur] = { head: repo.head, index: repo.index, workingTree: repo.workingTree, ...(repo.inProgress ? { inProgress: repo.inProgress } : {}) };
  repo.head = target.head;
  repo.index = target.index;
  repo.workingTree = target.workingTree;
  if (target.inProgress) repo.inProgress = target.inProgress;
  else delete repo.inProgress;
  delete repo.worktrees!.others[path];
  repo.worktrees!.cwd = path;
}
