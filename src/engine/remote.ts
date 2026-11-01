// リモートとのやりとり（オブジェクトのコピー、追跡ブランチ、fetch の共通処理、同僚の push）。
import { produce } from 'immer';
import { fail, type Ctx } from './command';
import { getCommit, short, writeBlob, writeCommit, writeTree, readTree } from './model/objects';
import { ancestors } from './model/refs';
import type { GitEvent, Oid, Path, RefUpdate, RepoState, World } from './model/types';

export const DEFAULT_URL = 'https://github.com/you/project.git';

/** tips から辿れるオブジェクト（コミット・ツリー・ブロブ）を from から to へコピーする */
export function copyObjects(from: RepoState, to: RepoState, tips: Oid[]) {
  const stack = [...tips];
  while (stack.length) {
    const oid = stack.pop()!;
    if (to.objects[oid]) continue;
    const obj = from.objects[oid];
    if (!obj) continue;
    to.objects[oid] = obj;
    if (obj.type === 'commit') stack.push(obj.tree, ...obj.parents);
    else if (obj.type === 'tree') stack.push(...obj.entries.map((e) => e.oid));
    else if (obj.type === 'tag') stack.push(obj.object);
  }
}

export function remoteUrl(repo: RepoState, name: string): string {
  return repo.config.remotes?.[name]?.url ?? DEFAULT_URL;
}

export function hostedRepo(ctx: Ctx, name: string): RepoState {
  if (!ctx.repo.config.remotes?.[name])
    fail(`fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`, `「${name}」というリモートは登録されていません。git remote -v で確認しましょう。`);
  const r = ctx.world.remotes[name];
  if (!r) fail(`fatal: repository '${remoteUrl(ctx.repo, name)}' not found`);
  return r;
}

export function upstreamOf(repo: RepoState, branch: string | null): { remote: string; branch: string; ref: string } | null {
  if (!branch) return null;
  const u = repo.config.branches?.[branch];
  if (!u) return null;
  return { remote: u.remote, branch: u.merge, ref: `${u.remote}/${u.merge}` };
}

export function setUpstream(repo: RepoState, branch: string, remote: string, merge: string) {
  repo.config.branches ??= {};
  repo.config.branches[branch] = { remote, merge };
}

export function aheadBehind(repo: RepoState, local: Oid, upstream: Oid): { ahead: number; behind: number } {
  const a = ancestors(repo, local);
  const b = ancestors(repo, upstream);
  return { ahead: [...a].filter((o) => !b.has(o)).length, behind: [...b].filter((o) => !a.has(o)).length };
}

const pad = (s: string, n: number) => s.padEnd(n);

/** "   abc1234..def5678  main       -> origin/main" 形式の1行 */
export function refLine(u: RefUpdate, src: string, dst: string): string {
  if (!u.from && u.to) return ` * [new branch]      ${pad(src, 10)} -> ${dst}`;
  if (u.from && !u.to) return ` - [deleted]         ${pad('(none)', 10)} -> ${dst}`;
  if (u.forced) return ` + ${short(u.from!)}...${short(u.to!)} ${pad(src, 10)} -> ${dst}  (forced update)`;
  return `   ${short(u.from!)}..${short(u.to!)}  ${pad(src, 10)} -> ${dst}`;
}

/** リモートのブランチを取り込み、refs/remotes/<name>/* を更新する */
export function fetchRemote(ctx: Ctx, name: string, opts: { prune?: boolean; quiet?: boolean } = {}): RefUpdate[] {
  const repo = ctx.repo;
  const remote = hostedRepo(ctx, name);
  copyObjects(remote, repo, Object.values(remote.refs.heads));
  const before = { ...(repo.refs.remotes[name] ?? {}) };
  const after: Record<string, Oid> = { ...remote.refs.heads };
  const updates: (RefUpdate & { branch: string })[] = [];
  for (const [b, oid] of Object.entries(after).sort()) {
    if (before[b] === oid) continue;
    updates.push({ branch: b, ref: `${name}/${b}`, from: before[b] ?? null, to: oid, forced: !!before[b] && !ancestors(repo, oid).has(before[b]) });
  }
  if (opts.prune) for (const b of Object.keys(before)) if (!(b in after)) updates.push({ branch: b, ref: `${name}/${b}`, from: before[b], to: null });
  const next: Record<string, Oid> = opts.prune ? after : { ...before, ...after };
  repo.refs.remotes[name] = next;
  // タグは、手元にないものだけ取り込む（実 Git は既存のタグを勝手に書き換えない）
  const newTags = Object.entries(remote.refs.tags).filter(([t]) => !repo.refs.tags[t]);
  copyObjects(remote, repo, newTags.map(([, o]) => o));
  for (const [t, o] of newTags) repo.refs.tags[t] = o;
  if ((updates.length || newTags.length) && !opts.quiet) {
    ctx.out(`From ${remoteUrl(repo, name).replace(/\.git$/, '')}`);
    for (const u of updates) ctx.out(refLine(u, u.to ? u.branch : '', `${name}/${u.branch}`));
    for (const [t] of newTags.sort()) ctx.out(` * [new tag]         ${t.padEnd(10)} -> ${t}`);
  }
  if (updates.length) ctx.emit({ type: 'FETCHED', remote: name, updates: updates.map(({ branch: _, ...u }) => u) });
  return updates;
}

export type TeammatePush = {
  author: string;
  remote?: string;
  branch?: string;
  /** branch がまだないとき、どのブランチから分岐するか（省略時は既定ブランチ） */
  from?: string;
  message: string;
  /** 親からの変更（null で削除） */
  files: Record<Path, string | null>;
};

/** 同僚がリモートに直接 push した状態を作る（レッスンのイベント・フリープレイのボタン用） */
export function teammatePush(world: World, p: TeammatePush): { world: World; events: GitEvent[]; oid: Oid } {
  const remoteName = p.remote ?? 'origin';
  const branch = p.branch ?? 'main';
  let oid = '';
  const next = produce(world, (w) => {
    const remote = w.remotes[remoteName];
    if (!remote) throw new Error(`teammatePush: remote ${remoteName} がありません`);
    const def = remote.head.type === 'symbolic' ? remote.head.ref : 'main';
    const parent = remote.refs.heads[branch] ?? remote.refs.heads[p.from ?? def] ?? null;
    const files: Record<Path, Oid> = parent ? readTree(remote, getCommit(remote, parent).tree) : {};
    for (const [path, content] of Object.entries(p.files)) {
      if (content === null) delete files[path];
      else files[path] = writeBlob(remote, content);
    }
    w.clock += 60;
    const who = { name: p.author, email: `${p.author.toLowerCase()}@example.com`, time: w.clock, tz: '+0900' };
    oid = writeCommit(remote, { tree: writeTree(remote, files), parents: parent ? [parent] : [], author: who, committer: who, message: p.message });
    remote.refs.heads[branch] = oid;
  });
  return { world: next, events: [{ type: 'TEAMMATE_PUSHED', author: p.author, remote: remoteName, branch, oid }], oid };
}

/** 新しく作る空のリモート（GitHub で空のリポジトリを作った状態） */
export function emptyHosted(): RepoState {
  return {
    initialized: true,
    objects: {},
    refs: { heads: {}, tags: {}, remotes: {} },
    head: { type: 'symbolic', ref: 'main' },
    index: {},
    workingTree: {},
    reflog: [],
    stash: [],
    config: { user: { name: 'GitHub', email: 'noreply@github.com' } },
  };
}
