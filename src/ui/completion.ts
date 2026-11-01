// Tab 補完（コマンド名・サブコマンド・オプション・ブランチ名・ファイル名）。
import type { RepoState } from '../engine/model/types';
import { GIT_COMMANDS } from '../engine/registry';
import { SHELL } from '../engine/shell';

const FILE_SUBS = new Set(['add', 'restore', 'rm', 'diff', 'checkout', 'reset']);
const REF_SUBS = new Set(['switch', 'merge', 'branch', 'checkout', 'log', 'diff', 'rebase', 'reset', 'cherry-pick', 'revert', 'show', 'tag', 'reflog']);
const GH: Record<string, string[]> = { pr: ['create', 'list', 'view', 'checks', 'review', 'merge', 'checkout', 'comment', 'close', 'ready'], issue: ['list', 'view'] };
const STASH = ['push', 'list', 'show', 'apply', 'pop', 'drop', 'clear'];
const FILE_SHELL = new Set(['cat', 'rm', 'touch', 'ls']);

function commonPrefix(xs: string[]): string {
  if (!xs.length) return '';
  let p = xs[0];
  for (const x of xs) while (!x.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function options(sub: string): string[] {
  const spec = GIT_COMMANDS[sub]?.spec;
  if (!spec) return [];
  const long = new Set([...(spec.long ?? []), ...Object.values(spec.short ?? {}), ...(spec.valued ?? []), ...(spec.multiple ?? [])]);
  return [...[...long].map((l) => `--${l}`), ...Object.keys(spec.short ?? {}).map((s) => `-${s}`)].sort();
}

export function complete(input: string, repo: RepoState): { value: string; candidates: string[] } {
  const words = input.split(/\s+/);
  const cur = words[words.length - 1];
  const before = words.slice(0, -1);
  let pool: string[];
  if (before.length === 0) pool = ['git', 'gh', 'help', ...Object.keys(SHELL)];
  else if (before[0] === 'gh') pool = before.length === 1 ? Object.keys(GH) : before.length === 2 ? (GH[before[1]] ?? []) : [];
  else if (before[0] === 'git' && before[1] === 'stash' && before.length === 2 && !cur.startsWith('-')) pool = STASH;
  else if (before[0] === 'git' && before.length === 1) pool = Object.keys(GIT_COMMANDS);
  else if (before[0] === 'git') {
    const sub = before[1];
    if (cur.startsWith('-')) pool = options(sub);
    else {
      pool = [];
      if (REF_SUBS.has(sub)) pool.push(...Object.keys(repo.refs.heads), ...(sub === 'switch' || sub === 'merge' ? [] : ['HEAD']));
      if (FILE_SUBS.has(sub)) pool.push(...Object.keys(repo.workingTree), ...Object.keys(repo.index));
    }
  } else if (FILE_SHELL.has(before[0])) pool = Object.keys(repo.workingTree);
  else pool = [];
  const candidates = [...new Set(pool)].filter((c) => c.startsWith(cur)).sort();
  if (!candidates.length) return { value: input, candidates: [] };
  const prefix = commonPrefix(candidates);
  const done = candidates.length === 1;
  return { value: [...before, prefix].join(' ') + (done ? ' ' : ''), candidates: done ? [] : candidates };
}
