// レッスン定義（content/lessons/**/*.json）の型。設計書 §7 に quiz ステップを足したもの。
import type { Setup, SetupCommit } from '../engine/world';

export type Area = 'worktree' | 'index' | 'head';

export type Check =
  | { type: 'refEquals'; ref: string; to: string }
  | { type: 'headOn'; branch?: string; detached?: boolean }
  | { type: 'graphShape'; expected: GraphShape }
  | { type: 'fileContent'; path: string; area?: Area; equals?: string; contains?: string; exists?: boolean }
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
  | { type: 'remoteEquals'; ref: string }
  | { type: 'prState'; state: string };

/** お手本のグラフ。メッセージでコミットを識別し、形（親子関係）とブランチ位置を比べる */
export type GraphShape = {
  commits: { msg: string; parents?: string[] }[];
  branches?: Record<string, string>;
  head?: string;
};

export type TaskStep = {
  type?: 'task';
  instruction: string;
  hints?: string[];
  answer?: string[];
  check: Check[];
  explain?: string;
  /** 模範解答がわざとエラーになるステップ（エラーを見せる課題） */
  expectError?: boolean;
};

export type QuizStep = {
  type: 'quiz';
  question: string;
  choices: string[];
  answer: number;
  explain?: string;
};

export type Step = TaskStep | QuizStep;

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
  /** まだ教材がない章（今後のフェーズで追加） */
  phase?: number;
};

export type { Setup, SetupCommit };
