// World の生成と、レッスン定義の setup（設計書 §7）から初期状態を組み立てる。
import { produce } from 'immer';
import { getBlob, readTree, getCommit, writeBlob, writeCommit, writeTree } from './model/objects';
import type { GitEvent, Oid, Path, RepoState, World } from './model/types';
import { copyObjects, DEFAULT_URL, emptyHosted } from './remote';

export const START_TIME = 1767225600; // 2026-01-01 00:00:00 UTC

export function emptyRepo(): RepoState {
  return {
    initialized: false,
    objects: {},
    refs: { heads: {}, tags: {}, remotes: {} },
    head: { type: 'symbolic', ref: 'main' },
    index: {},
    workingTree: {},
    reflog: [],
    stash: [],
    config: { user: { name: 'You', email: 'you@example.com' } },
  };
}

export function emptyWorld(): World {
  return { local: emptyRepo(), remotes: {}, hosting: { pullRequests: [], protections: [] }, clock: START_TIME };
}

export type SetupCommit = {
  id: string;
  msg: string;
  /** 親コミットの id。マージコミットは parents で複数指定 */
  parent?: string;
  parents?: string[];
  /** 親からの変更（null で削除）。最初のコミットは全ファイル */
  files?: Record<Path, string | null>;
};

export type Setup = {
  /** false なら git init 前の状態から始める */
  initialized?: boolean;
  commits?: SetupCommit[];
  branches?: Record<string, string>;
  /** ブランチ名。"detached:<id>" で detached HEAD */
  head?: string;
  /** HEAD をチェックアウトした後に加えるワークツリーの変更（null で削除） */
  workingTree?: Record<Path, string | null>;
  /** ステージ済みにしておく変更（ワークツリーにも反映される） */
  staged?: Record<Path, string | null>;
  user?: { name: string; email: string };
  /** GitHub 側のリポジトリ（commits の id でブランチを指定。オブジェクトは自動でコピーされる） */
  remotes?: Record<string, { url?: string; branches: Record<string, string>; head?: string }>;
  /** 手元が覚えているリモートの位置（"origin/main": "c2"）。省略時はリモートと同じ＝最新を fetch 済み */
  tracking?: Record<string, string>;
  /** 追跡ブランチの設定（"main": "origin/main"）。省略時は同名のリモートブランチ */
  upstream?: Record<string, string>;
};

/** setup から World を作る。aliases はレッスン内のコミット id（c1 など）→ 実際の SHA-1 */
export function createWorld(setup: Setup = {}): { world: World; aliases: Record<string, Oid> } {
  const aliases: Record<string, Oid> = {};
  const world = produce(emptyWorld(), (w) => {
    const repo = w.local;
    repo.initialized = setup.initialized ?? true;
    if (setup.user) repo.config.user = { ...setup.user };
    const filesOf: Record<string, Record<Path, Oid>> = {};
    for (const c of setup.commits ?? []) {
      const parents = (c.parents ?? (c.parent ? [c.parent] : [])).map((p) => {
        if (!aliases[p]) throw new Error(`setup: unknown parent ${p}`);
        return p;
      });
      const files: Record<Path, Oid> = { ...(parents[0] ? filesOf[parents[0]] : {}) };
      for (const [p, content] of Object.entries(c.files ?? {})) {
        if (content === null) delete files[p];
        else files[p] = writeBlob(repo, content);
      }
      w.clock += 60;
      const who = { ...repo.config.user, time: w.clock, tz: '+0900' };
      const oid = writeCommit(repo, { tree: writeTree(repo, files), parents: parents.map((p) => aliases[p]), author: who, committer: who, message: c.msg });
      aliases[c.id] = oid;
      filesOf[c.id] = files;
    }
    for (const [name, id] of Object.entries(setup.branches ?? {})) {
      if (!aliases[id]) throw new Error(`setup: unknown commit ${id}`);
      repo.refs.heads[name] = aliases[id];
    }
    for (const [name, r] of Object.entries(setup.remotes ?? {})) {
      const hosted = emptyHosted();
      const tips: Oid[] = [];
      for (const [b, id] of Object.entries(r.branches)) {
        if (!aliases[id]) throw new Error(`setup: unknown commit ${id}`);
        hosted.refs.heads[b] = aliases[id];
        tips.push(aliases[id]);
      }
      hosted.head = { type: 'symbolic', ref: r.head ?? 'main' };
      copyObjects(repo as RepoState, hosted, tips);
      w.remotes[name] = hosted;
      repo.config.remotes = { ...(repo.config.remotes ?? {}), [name]: { url: r.url ?? DEFAULT_URL } };
      if (!setup.tracking) repo.refs.remotes[name] = { ...hosted.refs.heads };
    }
    for (const [ref, id] of Object.entries(setup.tracking ?? {})) {
      const [name, ...rest] = ref.split('/');
      repo.refs.remotes[name] ??= {};
      repo.refs.remotes[name][rest.join('/')] = aliases[id];
    }
    for (const b of Object.keys(repo.refs.heads)) {
      const up = setup.upstream?.[b] ?? Object.keys(repo.refs.remotes).filter((r) => repo.refs.remotes[r][b]).map((r) => `${r}/${b}`)[0];
      if (!up) continue;
      const [r, ...rest] = up.split('/');
      repo.config.branches = { ...(repo.config.branches ?? {}), [b]: { remote: r, merge: rest.join('/') } };
    }

    const head = setup.head ?? 'main';
    // 今のブランチに至るコミットを順に作ったものとして reflog を入れておく（git reflog / HEAD@{n} 用）
    const headTip = head.startsWith('detached:') ? aliases[head.slice(9)] : repo.refs.heads[head];
    const chain = new Set<Oid>();
    for (let o: Oid | undefined = headTip; o; o = getCommit(repo, o).parents[0]) chain.add(o);
    let prev: Oid | null = null;
    for (const c of setup.commits ?? []) {
      const oid = aliases[c.id];
      if (!chain.has(oid)) continue;
      const commit = getCommit(repo, oid);
      const msg = `${prev ? (commit.parents.length > 1 ? 'commit (merge)' : 'commit') : 'commit (initial)'}: ${c.msg.split('\n')[0]}`;
      repo.reflog.push({ ref: 'HEAD', old: prev, new: oid, message: msg, time: commit.committer.time });
      if (!head.startsWith('detached:')) repo.reflog.push({ ref: `refs/heads/${head}`, old: prev, new: oid, message: msg, time: commit.committer.time });
      prev = oid;
    }
    if (head.startsWith('detached:')) repo.head = { type: 'detached', oid: aliases[head.slice(9)] };
    else repo.head = { type: 'symbolic', ref: head };
    const headCommit = repo.head.type === 'detached' ? repo.head.oid : repo.refs.heads[repo.head.ref];
    if (headCommit) {
      const files = readTree(repo, getCommit(repo, headCommit).tree);
      for (const [p, oid] of Object.entries(files)) {
        repo.index[p] = oid;
        repo.workingTree[p] = getBlob(repo, oid);
      }
    }
    for (const [p, content] of Object.entries(setup.staged ?? {})) {
      if (content === null) {
        delete repo.index[p];
        delete repo.workingTree[p];
      } else {
        repo.index[p] = writeBlob(repo, content);
        repo.workingTree[p] = content;
      }
    }
    for (const [p, content] of Object.entries(setup.workingTree ?? {})) {
      if (content === null) delete repo.workingTree[p];
      else repo.workingTree[p] = content;
    }
    // リモートにしかないコミットは手元に持たない（fetch するまで見えない状態を再現する）
    if (setup.remotes) {
      const keep = emptyHosted();
      const tips = [...Object.values(repo.refs.heads), ...Object.values(repo.refs.remotes).flatMap((r) => Object.values(r))];
      copyObjects(repo as RepoState, keep, tips);
      for (const oid of Object.keys(repo.objects)) {
        const o = repo.objects[oid];
        if (!keep.objects[oid] && (o.type === 'commit' || !Object.values(repo.index).includes(oid))) delete repo.objects[oid];
      }
      if (headCommit) copyObjects(keep, repo as RepoState, [headCommit]);
    }
  });
  return { world, aliases };
}

/** エディタからのファイル保存・削除（git コマンドではない操作） */
export function editFile(world: World, path: Path, content: string | null): { world: World; events: GitEvent[] } {
  const events: GitEvent[] = [];
  const next = produce(world, (w) => {
    if (content === null) {
      if (!(path in w.local.workingTree)) return;
      delete w.local.workingTree[path];
      events.push({ type: 'FILE_DELETED', path });
    } else {
      if (w.local.workingTree[path] === content) return;
      const created = !(path in w.local.workingTree);
      w.local.workingTree[path] = content;
      events.push({ type: 'FILE_WRITTEN', path, created });
    }
  });
  return { world: next, events };
}
