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
  /** 末尾に改行を付けずに保存する（実 Git の git stash -m のメッセージだけがこうなる） */
  noNewline?: boolean;
};

/** 注釈付きタグ（git tag -a） */
export type Tag = { type: 'tag'; object: Oid; objectType: 'commit'; tag: string; tagger: Signature; message: string };

export type GitObject = Blob | Tree | Commit | Tag;

export type ReflogEntry = { ref: string; old: Oid | null; new: Oid; message: string; time: number };
export type StashEntry = { oid: Oid; message: string };

export type Head = { type: 'symbolic'; ref: string } | { type: 'detached'; oid: Oid };

type InProgressBase = {
  conflicts: Path[]; // 未解消のパス（実 Git のステージ 1〜3 の代わり）
  affected: Path[]; // --abort で元に戻すパス
};

export type MergeInProgress = InProgressBase & {
  op: 'merge';
  theirs: Oid; // MERGE_HEAD
  theirsName: string;
  message: string;
};

/** rebase -i の todo の1行 */
export type TodoItem = { action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'; oid: Oid };

/** cherry-pick / revert / rebase の共通の「順に当てていく」状態（実 Git の sequencer） */
export type SequenceInProgress = InProgressBase & {
  op: 'cherry-pick' | 'revert' | 'rebase';
  /** 今当てようとして止まっているコミット */
  current: TodoItem | null;
  /** まだ当てていないコミット */
  todo: TodoItem[];
  /** 止まった理由（conflict：衝突、edit：edit 指示、editor：エディタ待ち） */
  stopped: 'conflict' | 'edit' | 'editor' | null;
  /** 作るコミットのメッセージ（衝突解消後の commit / --continue で使う） */
  message: string;
  /** 1回の操作で作るコミットに共通の時刻 */
  time: number;
  /** 操作前の HEAD（--abort で戻す先） */
  origHead: Oid;
  /** rebase：操作前のブランチ（detached なら null）と移動先 */
  headName?: string | null;
  onto?: Oid;
  interactive?: boolean;
  /** rebase -i：エディタで編集中の内容 */
  editor?: { path: Path; text: string; purpose: 'todo' | 'message' };
  /** squash / fixup の連続でまとめているメッセージ */
  squash?: { messages: { text: string; skip: boolean }[]; author: Signature; base: Oid; editMessage: boolean };
};

export type InProgress = MergeInProgress | SequenceInProgress;

/** worktree ごとに別々に持つもの（HEAD・ステージ・ワークツリー・途中の操作） */
export type WorktreeState = { head: Head; index: Record<Path, Oid>; workingTree: Record<Path, string>; inProgress?: InProgress };

/** git bisect の途中経過 */
export type BisectState = { bad: Oid | null; good: Oid[]; skip: Oid[]; start: Head; log: string[] };

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
  config: {
    user: { name: string; email: string };
    /** git remote add で登録したリモート（名前 → URL） */
    remotes?: Record<string, { url: string }>;
    /** 追跡ブランチの設定（ローカルブランチ → リモート名とブランチ名） */
    branches?: Record<string, { remote: string; merge: string }>;
  };
  /** git worktree：今いる作業フォルダのパスと、ほかの作業フォルダの状態（今のフォルダの状態は head / index / workingTree にある） */
  worktrees?: { cwd: string; others: Record<string, WorktreeState> };
  /** .git/hooks/<名前> のスクリプト（このサイトの小さなシェルで実行する） */
  hooks?: Record<string, string>;
  bisect?: BisectState;
};

export type Review = { author: string; state: 'approved' | 'changes_requested' | 'commented'; body: string; time: number };
/** PR のコメント。path / line があれば「Files changed」の行へのコメント */
export type PrComment = { author: string; body: string; time: number; path?: Path; line?: number };
export type MergeMethod = 'merge' | 'squash' | 'rebase';

export type PullRequest = {
  number: number;
  title: string;
  body: string;
  author: string;
  /** origin 上のブランチ名 */
  head: string;
  base: string;
  state: 'open' | 'merged' | 'closed';
  draft?: boolean;
  reviews: Review[];
  comments: PrComment[];
  createdAt: number;
  merged?: { method: MergeMethod; oid: Oid; by: string; time: number };
};

export type Issue = { number: number; title: string; body: string; author: string; state: 'open' | 'closed'; closedBy?: number };

export type BranchProtection = {
  branch: string;
  /** main へ直接 push できず、PR を通す必要がある */
  requirePullRequest: boolean;
  /** マージに必要な承認（Approve）の数 */
  requiredApprovals?: number;
  /** CI のチェックが通っていないとマージできない */
  requireStatusChecks?: boolean;
  /** CODEOWNERS に書かれた人の承認が必要 */
  requireCodeOwnerReviews?: boolean;
};

/** 模擬 CI のチェック。failIf の文字列がファイルにあれば失敗する（なければ常に成功） */
export type CiRule = { name: string; description?: string; failIf?: { path: Path; contains: string } };

export type Hosting = {
  pullRequests: PullRequest[];
  protections: BranchProtection[];
  issues?: Issue[];
  ci?: CiRule[];
  /** PR と Issue で共通の通し番号の次の値 */
  nextNumber?: number;
  /** 許可するマージ方式（GitHub のリポジトリ設定） */
  mergeMethods?: MergeMethod[];
  /** チームのブランチ戦略（F-13）。ルール違反は violations に積む */
  strategy?: 'github-flow' | 'git-flow' | 'gitlab-flow' | 'trunk';
  violations?: string[];
};

export type World = {
  local: RepoState;
  remotes: Record<string, RepoState>;
  hosting: Hosting;
  clock: number; // 決定的な時刻（UNIX 秒）。コミットごとに進む
};

export type RefUpdate = { ref: string; from: Oid | null; to: Oid | null; forced?: boolean };

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
  | { type: 'BRANCH_CREATED'; name: string; oid: Oid; /** 起点に指定した名前（省略時は作ったときのブランチ） */ from?: string }
  | { type: 'BRANCH_DELETED'; name: string; oid: Oid }
  | { type: 'BRANCH_RENAMED'; from: string; to: string }
  | { type: 'HEAD_MOVED'; from: string; to: string; detached: boolean }
  | { type: 'MERGE_FAST_FORWARD'; branch: string; from: Oid; to: Oid; theirs?: string }
  | { type: 'MERGE_COMMIT'; oid: Oid; theirs: string }
  | { type: 'CONFLICT'; paths: Path[]; theirs: string }
  | { type: 'MERGE_ABORTED' }
  | { type: 'CONFIG_SET'; key: string; value: string }
  | { type: 'REMOTE_ADDED'; name: string; url: string }
  | { type: 'CLONED'; url: string; branch: string | null }
  | { type: 'FETCHED'; remote: string; updates: RefUpdate[] }
  | { type: 'PUSHED'; remote: string; updates: RefUpdate[] }
  | { type: 'PUSH_REJECTED'; remote: string; branch: string; reason: 'fetch first' | 'non-fast-forward' }
  | { type: 'UPSTREAM_SET'; branch: string; upstream: string }
  | { type: 'TEAMMATE_PUSHED'; author: string; remote: string; branch: string; oid: Oid }
  | { type: 'RESET'; mode: 'soft' | 'mixed' | 'hard'; ref: string; from: Oid; to: Oid; lost: Oid[] }
  | { type: 'COMMIT_AMENDED'; from: Oid; to: Oid }
  | { type: 'REVERTED'; target: Oid; oid: Oid }
  | { type: 'CHERRY_PICKED'; from: Oid; oid: Oid }
  | { type: 'REBASED'; branch: string | null; from: Oid; to: Oid; onto: Oid; count: number }
  | { type: 'SEQUENCE_STOPPED'; op: 'cherry-pick' | 'revert' | 'rebase'; reason: 'conflict' | 'edit' | 'editor'; oid: Oid | null }
  | { type: 'SEQUENCE_ABORTED'; op: 'cherry-pick' | 'revert' | 'rebase' }
  | { type: 'EDITOR_OPENED'; path: Path; purpose: 'todo' | 'message' }
  | { type: 'STASHED'; oid: Oid; message: string }
  | { type: 'STASH_APPLIED'; oid: Oid; dropped: boolean; conflict: boolean }
  | { type: 'STASH_DROPPED'; oid: Oid }
  | { type: 'TAG_CREATED'; name: string; oid: Oid; annotated: boolean }
  | { type: 'TAG_DELETED'; name: string }
  | { type: 'PR_OPENED'; number: number; author: string; head: string; base: string }
  | { type: 'PR_REVIEWED'; number: number; author: string; state: Review['state'] }
  | { type: 'PR_COMMENTED'; number: number; author: string }
  | { type: 'PR_MERGED'; number: number; method: MergeMethod; oid: Oid; base: string }
  | { type: 'PR_CLOSED'; number: number }
  | { type: 'ISSUE_CLOSED'; number: number; by: number }
  | { type: 'PROTECTION_CHANGED'; branch: string }
  | { type: 'PUSH_PROTECTED'; branch: string; reason: string }
  | { type: 'CLEAR' };

export type Tone = 'normal' | 'green' | 'red' | 'yellow' | 'cyan' | 'dim' | 'error' | 'hint';
export type OutputLine = { text: string; tone: Tone };

export type CommandResult = {
  world: World;
  output: OutputLine[];
  events: GitEvent[];
  ok: boolean;
};
