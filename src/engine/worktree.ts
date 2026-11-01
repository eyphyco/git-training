// ワークツリーとインデックスをあるツリーの内容に切り替える（switch / merge の共通処理）。
import { fail } from './command';
import { getBlob, hashBlob } from './model/objects';
import type { Oid, Path, RepoState } from './model/types';

/** from → to への切り替えで上書きされてしまうローカル変更を探す */
export function findOverwrites(repo: RepoState, from: Record<Path, Oid>, to: Record<Path, Oid>): Path[] {
  const bad: Path[] = [];
  for (const p of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[p] === to[p]) continue;
    const idx = repo.index[p];
    const wt = repo.workingTree[p];
    const wtOid = wt === undefined ? undefined : hashBlob(wt);
    if (idx !== from[p] || wtOid !== idx) {
      // 切り替え先と同じ内容なら上書きにならない
      if (idx === to[p] && wtOid === to[p]) continue;
      bad.push(p);
    }
  }
  return bad.sort();
}

export function applyTree(repo: RepoState, from: Record<Path, Oid>, to: Record<Path, Oid>): Path[] {
  const changed: Path[] = [];
  for (const p of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[p] === to[p]) continue;
    changed.push(p);
    if (to[p]) {
      repo.index[p] = to[p];
      repo.workingTree[p] = getBlob(repo, to[p]);
    } else {
      delete repo.index[p];
      delete repo.workingTree[p];
    }
  }
  return changed.sort();
}

export function checkoutTree(repo: RepoState, from: Record<Path, Oid>, to: Record<Path, Oid>, op: 'checkout' | 'merge') {
  const bad = findOverwrites(repo, from, to);
  if (bad.length) {
    const untracked = bad.filter((p) => !(p in repo.index) && p in repo.workingTree && !(p in from));
    const tracked = bad.filter((p) => !untracked.includes(p));
    const lines: string[] = [];
    if (tracked.length)
      lines.push(`error: Your local changes to the following files would be overwritten by ${op}:`, ...tracked.map((p) => `\t${p}`), `Please commit your changes or stash them before you ${op === 'checkout' ? 'switch branches' : 'merge'}.`);
    if (untracked.length)
      lines.push(`error: The following untracked working tree files would be overwritten by ${op}:`, ...untracked.map((p) => `\t${p}`), `Please move or remove them before you ${op === 'checkout' ? 'switch branches' : 'merge'}.`);
    lines.push('Aborting');
    fail(lines.join('\n'), '未コミットの変更が消えてしまうため中断しました。先にコミットするか、git restore で変更を取り消してください。');
  }
  return applyTree(repo, from, to);
}
