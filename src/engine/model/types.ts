// 学習用 Git エンジンのデータモデル（設計書 §7）。UI には依存しない。

export type Oid = string; // 40桁の SHA-1（実 Git と同じオブジェクト形式で計算）
export type Path = string; // "src/app.ts" のような / 区切りの相対パス

export type Blob = { type: 'blob'; content: string };

export type TreeEntry = { name: string; mode: '100644' | '40000'; oid: Oid };
export type Tree = { type: 'tree'; entries: TreeEntry[] };

export type Signature = { name: string; email: string; time: number; tz: string };
export type Commit = {
  type: 'commit';
  tree: Oid;
  parents: Oid[];
  author: Signature;
  committer: Signature;
  message: string; // 末尾の改行は含めない
};

export type GitObject = Blob | Tree | Commit;

export type ReflogEntry = { ref: string; old: Oid | null; new: Oid; message: string; time: number };
export type StashEntry = { oid: Oid; message: string };

export type Head = { type: 'symbolic'; ref: string } | { type: 'detached'; oid: Oid };

export type InProgress = {
  op: 'merge';
  theirs: Oid; // MERGE_HEAD
  theirsName: string;
  message: string;
  conflicts: Path[]; // 未解消のパス（実 Git のステージ 1〜3 の代わり）
  affected: Path[]; // merge --abort で HEAD に戻すパス
};

export type RepoState = {
  initialized: boolean; // false の間は git init 以外の git コマンドが失敗する
  objects: Record<Oid, GitObject>;
  refs: {
    heads: Record<string, Oid>;
    tags: Record<string, Oid>;
    remotes: Record<string, Record<string, Oid>>;
  };
  head: Head;
  index: Record<Path, Oid>; // ステージングエリア（ステージ 0 のみ）
  workingTree: Record<Path, string>; // ファイル内容
  reflog: ReflogEntry[];
  stash: StashEntry[];
  inProgress?: InProgress;
  config: { user: { name: string; email: string } };
};

export type PullRequest = { id: number; title: string; head: string; base: string; state: 'open' | 'merged' | 'closed' };
export type BranchProtection = { branch: string; requirePullRequest: boolean };

export type World = {
  local: RepoState;
  remotes: Record<string, RepoState>;
  hosting: { pullRequests: PullRequest[]; protections: BranchProtection[] };
  clock: number; // 決定的な時刻（UNIX 秒）。コミットごとに進む
};

export type FileChange = 'added' | 'modified' | 'deleted';

export type GitEvent =
  | { type: 'REPO_INITIALIZED' }
  | { type: 'FILE_WRITTEN'; path: Path; created: boolean }
  | { type: 'FILE_DELETED'; path: Path }
  | { type: 'FILE_STAGED'; path: Path; change: FileChange }
  | { type: 'FILE_UNSTAGED'; path: Path }
  | { type: 'FILE_RESTORED'; path: Path }
  | { type: 'COMMIT_CREATED'; oid: Oid; parents: Oid[]; branch: string | null; message: string }
  | { type: 'REF_MOVED'; ref: string; from: Oid | null; to: Oid; reason: 'commit' | 'fast-forward' | 'merge' | 'branch' }
  | { type: 'BRANCH_CREATED'; name: string; oid: Oid }
  | { type: 'BRANCH_DELETED'; name: string; oid: Oid }
  | { type: 'BRANCH_RENAMED'; from: string; to: string }
  | { type: 'HEAD_MOVED'; from: string; to: string; detached: boolean }
  | { type: 'MERGE_FAST_FORWARD'; branch: string; from: Oid; to: Oid }
  | { type: 'MERGE_COMMIT'; oid: Oid; theirs: string }
  | { type: 'CONFLICT'; paths: Path[]; theirs: string }
  | { type: 'MERGE_ABORTED' }
  | { type: 'CONFIG_SET'; key: string; value: string }
  | { type: 'CLEAR' };

export type Tone = 'normal' | 'green' | 'red' | 'yellow' | 'cyan' | 'dim' | 'error' | 'hint';
export type OutputLine = { text: string; tone: Tone };

export type CommandResult = {
  world: World;
  output: OutputLine[];
  events: GitEvent[];
  ok: boolean;
};
