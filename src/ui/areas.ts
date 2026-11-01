// 4エリアビューに並べるファイルと状態（UI から切り離してテストする）。
import { commitFiles, getCommit, short } from '../engine/model/objects';
import { headOid } from '../engine/model/refs';
import { computeStatus } from '../engine/model/status';
import type { GitEvent, Path, RepoState } from '../engine/model/types';

export type FileState = 'untracked' | 'ignored' | 'modified' | 'deleted' | 'clean' | 'conflict' | 'added' | 'staged' | 'removed';
export type FileItem = { path: Path; state: FileState };
export type Areas = { worktree: FileItem[]; index: FileItem[]; head: FileItem[]; headLabel: string | null };

export function computeAreas(repo: RepoState): Areas {
  const head = commitFiles(repo, headOid(repo));
  const h = headOid(repo);
  const headLabel = h ? `${short(h)} ${getCommit(repo, h).message.split('\n')[0]}` : null;
  if (!repo.initialized) return { worktree: Object.keys(repo.workingTree).sort().map((path) => ({ path, state: 'untracked' })), index: [], head: [], headLabel };
  const s = computeStatus(repo);
  const unstaged = new Map(s.unstaged.map((e) => [e.path, e.change]));
  const staged = new Map(s.staged.map((e) => [e.path, e.change]));
  const worktree: FileItem[] = [...new Set([...Object.keys(repo.workingTree), ...Object.keys(repo.index)])].sort().map((path) => ({
    path,
    state: s.conflicts.includes(path)
      ? 'conflict'
      : s.untracked.includes(path)
        ? 'untracked'
        : s.ignored.includes(path)
          ? 'ignored'
          : unstaged.get(path) === 'deleted'
            ? 'deleted'
            : unstaged.get(path) === 'modified'
              ? 'modified'
              : 'clean',
  }));
  const index: FileItem[] = [...new Set([...Object.keys(repo.index), ...Object.keys(head)])].sort().map((path) => {
    const c = staged.get(path);
    return { path, state: s.conflicts.includes(path) ? 'conflict' : c === 'added' ? 'added' : c === 'modified' ? 'staged' : c === 'deleted' ? 'removed' : 'clean' };
  });
  const headItems: FileItem[] = Object.keys(head).sort().map((path) => ({ path, state: 'clean' }));
  return { worktree, index, head: headItems, headLabel };
}

export type Motion = 'from-left' | 'from-right' | 'pop' | null;

/** 直前の操作でそのエリアのファイルがどこから来たか（アニメーションの向き） */
export function motionFor(events: GitEvent[], area: 'worktree' | 'index' | 'head', path: Path, changedInCommit: Set<Path>): Motion {
  for (const e of events) {
    if (area === 'index' && e.type === 'FILE_STAGED' && e.path === path) return 'from-left';
    if (area === 'index' && e.type === 'FILE_UNSTAGED' && e.path === path) return 'from-right';
    if (area === 'worktree' && e.type === 'FILE_RESTORED' && e.path === path) return 'from-right';
    if (area === 'worktree' && e.type === 'FILE_WRITTEN' && e.path === path) return 'pop';
    if (area === 'head' && e.type === 'COMMIT_CREATED' && changedInCommit.has(path)) return 'from-left';
  }
  // switch / merge では、入れ替わったファイルがすべてのエリアで更新される
  if (events.some((e) => e.type === 'HEAD_MOVED' || e.type === 'MERGE_FAST_FORWARD' || e.type === 'MERGE_COMMIT') && changedInCommit.has(path)) return 'pop';
  return null;
}

export const STATE_INFO: Record<FileState, { badge: string; text: string; cls: string }> = {
  untracked: { badge: 'U', text: '未追跡：Git がまだ管理していないファイルです。git add で追跡を始めます。', cls: 'border-rose-400 text-rose-700 dark:text-rose-300' },
  ignored: { badge: '無視', text: '.gitignore で無視されているファイルです。git status にも出ず、git add . でも載りません。', cls: 'border-white/60 text-slate-400 line-through decoration-slate-400/60 dark:border-white/10' },
  modified: { badge: 'M', text: '変更あり（未ステージ）：ステージの内容から変わっています。git add でステージへ、git restore で変更を捨てます。', cls: 'border-rose-400 text-rose-700 dark:text-rose-300' },
  deleted: { badge: 'D', text: '削除（未ステージ）：ワークツリーから消えています。git add（または git rm）で削除をステージへ、git restore で復活します。', cls: 'border-dashed border-rose-400 text-rose-500 opacity-70' },
  clean: { badge: '', text: '変更なし：隣のエリアと同じ内容です。', cls: 'border-white/70 text-slate-600 dark:border-white/15 dark:text-slate-300' },
  conflict: { badge: '!', text: 'コンフリクト中：<<<<<<< 〜 >>>>>>> を直して git add すると解消済みになります。', cls: 'border-orange-500 bg-orange-100/70 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  added: { badge: 'A', text: '新規ファイル（ステージ済み）：次のコミットで初めて記録されます。git restore --staged で外せます。', cls: 'border-emerald-500 text-emerald-700 dark:text-emerald-300' },
  staged: { badge: 'M', text: '変更（ステージ済み）：次のコミットに入ります。git restore --staged で外せます。', cls: 'border-emerald-500 text-emerald-700 dark:text-emerald-300' },
  removed: { badge: 'D', text: '削除（ステージ済み）：次のコミットでこのファイルが消えます。', cls: 'border-dashed border-emerald-500 text-emerald-600 opacity-70' },
};
