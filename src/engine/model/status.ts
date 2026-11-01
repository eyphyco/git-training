// HEAD・インデックス・ワークツリーの3者比較（git status と4エリアビューの両方で使う）。
import { parseIgnore, isIgnored } from './ignore';
import { commitFiles, hashBlob } from './objects';
import { headOid } from './refs';
import type { FileChange, Oid, Path, RepoState } from './types';

export type Status = {
  staged: { path: Path; change: FileChange }[];
  unstaged: { path: Path; change: 'modified' | 'deleted' }[];
  untracked: Path[];
  ignored: Path[];
  conflicts: Path[];
};

export function ignoreRules(repo: RepoState) {
  return parseIgnore(repo.workingTree['.gitignore'] ?? '');
}

export function headFiles(repo: RepoState): Record<Path, Oid> {
  return commitFiles(repo, headOid(repo));
}

export function computeStatus(repo: RepoState): Status {
  const head = headFiles(repo);
  const { index, workingTree } = repo;
  const conflicts = repo.inProgress?.conflicts ?? [];
  const rules = ignoreRules(repo);
  const s: Status = { staged: [], unstaged: [], untracked: [], ignored: [], conflicts: [...conflicts].sort() };

  for (const p of [...new Set([...Object.keys(head), ...Object.keys(index)])].sort()) {
    if (conflicts.includes(p)) continue;
    if (!(p in index)) s.staged.push({ path: p, change: 'deleted' });
    else if (!(p in head)) s.staged.push({ path: p, change: 'added' });
    else if (head[p] !== index[p]) s.staged.push({ path: p, change: 'modified' });
  }
  for (const p of Object.keys(index).sort()) {
    if (conflicts.includes(p)) continue;
    if (!(p in workingTree)) s.unstaged.push({ path: p, change: 'deleted' });
    else if (hashBlob(workingTree[p]) !== index[p]) s.unstaged.push({ path: p, change: 'modified' });
  }
  for (const p of Object.keys(workingTree).sort()) {
    if (p in index || conflicts.includes(p)) continue;
    (isIgnored(rules, p) ? s.ignored : s.untracked).push(p);
  }
  return s;
}

export function isClean(s: Status, includeUntracked = true): boolean {
  return !s.staged.length && !s.unstaged.length && !s.conflicts.length && (!includeUntracked || !s.untracked.length);
}

/** 追跡ファイルを1つも含まないディレクトリは "dir/" にまとめて表示する（実 Git と同じ） */
export function collapseUntracked(repo: RepoState, untracked: Path[]): Path[] {
  const tracked = Object.keys(repo.index);
  const out = new Set<string>();
  for (const p of untracked) {
    const segs = p.split('/');
    let shown = p;
    for (let i = 1; i < segs.length; i++) {
      const dir = segs.slice(0, i).join('/') + '/';
      if (!tracked.some((t) => t.startsWith(dir))) {
        shown = dir;
        break;
      }
    }
    out.add(shown);
  }
  return [...out];
}
