// レッスン定義（content/lessons/**/*.json）の型。設計書 §7 に quiz ステップを足したもの。
import type { Setup, SetupCommit } from '../engine/world';
import type { HostingEvent } from '../hosting/events';

export type Area = 'worktree' | 'index' | 'head';

export type Check =
  | { type: 'refEquals'; ref: string; to: string }
  | { type: 'headOn'; branch?: string; detached?: boolean }
  | { type: 'graphShape'; expected: GraphShape }
  | { type: 'fileContent'; path: string; area?: Area; equals?: string; contains?: string; notContains?: string; exists?: boolean }
  | { type: 'fileStatus'; path: string; status: 'untracked' | 'ignored' | 'staged' | 'modified' | 'clean' | 'conflicted' }
  | { type: 'statusClean'; includeUntracked?: boolean }
  | { type: 'commitCount'; ref?: string; count?: number; min?: number }
  | { type: 'noMergeCommit'; ref?: string }
  | { type: 'hasMergeCommit'; ref?: string }
  | { type: 'repoInitialized' }
  | { type: 'branchExists'; name: string; exists?: boolean }
  | { type: 'configEquals'; key: 'user.name' | 'user.email'; value?: string }
  | { type: 'commandUsed'; command: string }
  | { type: 'commandNotUsed'; command: string }
  | { type: 'remoteEquals'; ref: string; remote?: string; to?: string }
  | { type: 'aheadBehind'; branch?: string; ahead: number; behind: number }
  | { type: 'prState'; pr?: number; head?: string; state?: 'open' | 'merged' | 'closed'; method?: 'merge' | 'squash' | 'rebase'; approvedBy?: string; reviewedBy?: string; exists?: boolean }
  | { type: 'issueState'; number: number; state: 'open' | 'closed' }
  | { type: 'protection'; branch: string; requirePullRequest?: boolean; requiredApprovals?: number; requireStatusChecks?: boolean }
  | { type: 'stashCount'; count: number }
  | { type: 'noViolations' }
  | { type: 'remoteTag'; name: string; remote?: string }
  | { type: 'hookExists'; name: string }
  | { type: 'worktreeExists'; path: string; exists?: boolean }
  | { type: 'bisect'; state: 'active' | 'none' | 'found'; commit?: string }
  | { type: 'containsCommit'; ref: string; commit: string }
  | { type: 'inProgress'; op: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null }
  | { type: 'tagExists'; name: string; annotated?: boolean; at?: string };

/** お手本のグラフ。メッセージでコミットを識別し、形（親子関係）とブランチ位置を比べる */
export type GraphShape = {
  commits: { msg: string; parents?: string[] }[];
  branches?: Record<string, string>;
  head?: string;
};

/** ステップの開始時に起きる出来事（同僚の push、GitHub 上の PR・レビューなど） */
export type LessonEvent = { type: 'teammatePush'; id?: string; author: string; remote?: string; branch?: string; from?: string; message: string; files: Record<string, string | null> } | HostingEvent;

/** 模範解答の1手。文字列はターミナルの入力、edit はエディタで保存する操作（rebase -i の todo など） */
export type AnswerStep = string | { edit: string; content: string };

export type TaskStep = {
  type?: 'task';
  before?: LessonEvent[];
  instruction: string;
  hints?: string[];
  answer?: AnswerStep[];
  check: Check[];
  explain?: string;
  /** 模範解答がわざとエラーになるステップ（エラーを見せる課題） */
  expectError?: boolean;
};

export type QuizStep = {
  type: 'quiz';
  before?: LessonEvent[];
  question: string;
  choices: string[];
  answer: number;
  explain?: string;
};

/** 実機演習：手順を表示し、自分でチェックを付ける（シミュレータからは確かめられないため自己申告） */
export type ChecklistStep = {
  type: 'checklist';
  before?: LessonEvent[];
  instruction: string;
  items: string[];
  explain?: string;
};

export type Step = TaskStep | QuizStep | ChecklistStep;

/** 実戦シナリオ（F-14）：Bot が動くきっかけ */
export type ScenarioWhen =
  | { type: 'start' }
  /** そのコマンド（前方一致）を実行したら */
  | { type: 'command'; match: string }
  /** そのイベント（COMMIT_CREATED、PUSHED、PR_OPENED など）が起きたら */
  | { type: 'event'; event: string }
  /** 判定条件を満たしたら */
  | { type: 'check'; check: Check };

export type ScenarioAction = { type: 'message'; from: string; text: string } | LessonEvent;

/** 1回だけ起きる出来事。after を書くと、そのきっかけの後でだけ反応する */
export type Trigger = { id: string; when: ScenarioWhen; after?: string; actions: ScenarioAction[] };

export type Lesson = {
  id: string;
  title: string;
  level: 'intro' | 'beginner' | 'intermediate' | 'advanced';
  doc?: string;
  setup: Setup;
  steps: Step[];
  allowedCommands?: string[];
  /** 章末チャレンジなら true */
  challenge?: boolean;
  /** 実機演習なら true */
  practice?: boolean;
  /** 実戦シナリオ（チャットとスコアを表示する） */
  scenario?: { summary: string; members: string[] };
  triggers?: Trigger[];
  /** 実行環境（ブラウザ）で読み込んだ解説 Markdown */
  body?: string;
};

export type Chapter = {
  id: string;
  number: number;
  level: string;
  title: string;
  goal: string;
  commands: string;
  lessons: string[];
  challenge?: string;
  /** 実機演習（章の解放条件にはしない） */
  practice?: string;
  /** まだ教材がない章（今後のフェーズで追加） */
  phase?: number;
};

export type { Setup, SetupCommit };
