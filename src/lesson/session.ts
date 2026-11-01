// レッスンの実行状態。UI 非依存の純粋関数で、ストアはこれを呼ぶだけにする。
import { explainEvents } from '../engine/explain';
import { execute } from '../engine/run';
import { createWorld, editFile } from '../engine/world';
import type { CommandResult, GitEvent, Oid, World } from '../engine/model/types';
import { evaluateAll, type CheckResult } from './checks';
import type { Lesson, TaskStep } from './types';

export type Session = {
  lessonId: string;
  world: World;
  initial: World;
  aliases: Record<string, Oid>;
  undo: World[];
  stepIndex: number;
  /** 今のステップの間に実行したコマンド（commandUsed 判定用） */
  stepCommands: string[];
  commands: string[];
  lastEvents: GitEvent[];
  summary: string | null;
  /** 直前にクリアしたステップの解説 */
  cleared: { stepIndex: number; explain?: string } | null;
  /** クイズで間違えた選択肢 */
  wrongChoices: number[];
  done: boolean;
  /** イベントのたびに増える（アニメーションの起点に使う） */
  seq: number;
};

export function startSession(lesson: Lesson): Session {
  const { world, aliases } = createWorld(lesson.setup);
  return {
    lessonId: lesson.id,
    world,
    initial: world,
    aliases,
    undo: [],
    stepIndex: 0,
    stepCommands: [],
    commands: [],
    lastEvents: [],
    summary: null,
    cleared: null,
    wrongChoices: [],
    done: lesson.steps.length === 0,
    seq: 0,
  };
}

export function currentStep(lesson: Lesson, s: Session) {
  return lesson.steps[s.stepIndex];
}

export function checkStep(lesson: Lesson, s: Session): CheckResult[] {
  const step = currentStep(lesson, s);
  if (!step || step.type === 'quiz') return [];
  return evaluateAll((step as TaskStep).check, { world: s.world, aliases: s.aliases, commands: s.stepCommands });
}

function advance(lesson: Lesson, s: Session): Session {
  const step = currentStep(lesson, s);
  if (!step || step.type === 'quiz' || s.done) return s;
  const results = checkStep(lesson, s);
  if (!results.every((r) => r.ok)) return s;
  const next = s.stepIndex + 1;
  return { ...s, stepIndex: next, stepCommands: [], cleared: { stepIndex: s.stepIndex, explain: step.explain }, done: next >= lesson.steps.length, wrongChoices: [] };
}

function applyChange(lesson: Lesson, s: Session, world: World, events: GitEvent[], command?: string): Session {
  const changed = world !== s.world;
  const commands = command ? [...s.commands, command] : s.commands;
  const stepCommands = command ? [...s.stepCommands, command] : s.stepCommands;
  const next: Session = {
    ...s,
    world,
    undo: changed ? [...s.undo, s.world].slice(-200) : s.undo,
    commands,
    stepCommands,
    lastEvents: events,
    summary: explainEvents(events) ?? s.summary,
    cleared: null,
    seq: s.seq + 1,
  };
  return advance(lesson, next);
}

export function runCommand(lesson: Lesson, s: Session, line: string): { session: Session; result: CommandResult } {
  const result = execute(s.world, line, { allowedCommands: lesson.allowedCommands });
  return { session: applyChange(lesson, s, result.world, result.events, line.trim()), result };
}

export function saveFile(lesson: Lesson, s: Session, path: string, content: string | null): Session {
  const { world, events } = editFile(s.world, path, content);
  return applyChange(lesson, s, world, events);
}

export function answerQuiz(lesson: Lesson, s: Session, choice: number): { session: Session; correct: boolean } {
  const step = currentStep(lesson, s);
  if (!step || step.type !== 'quiz') return { session: s, correct: false };
  if (choice !== step.answer) return { session: { ...s, wrongChoices: [...new Set([...s.wrongChoices, choice])] }, correct: false };
  const next = s.stepIndex + 1;
  return {
    session: { ...s, stepIndex: next, stepCommands: [], cleared: { stepIndex: s.stepIndex, explain: step.explain }, done: next >= lesson.steps.length, wrongChoices: [] },
    correct: true,
  };
}

export function undo(s: Session): Session {
  if (!s.undo.length) return s;
  return { ...s, world: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1), lastEvents: [], summary: '1つ前の状態に戻しました。', seq: s.seq + 1 };
}

/** レッスン初期状態に戻す（進んだステップはそのまま） */
export function resetWorld(s: Session): Session {
  return { ...s, world: s.initial, undo: [...s.undo, s.world], lastEvents: [], summary: 'レッスンの初期状態に戻しました。', seq: s.seq + 1 };
}

export function restoreSnapshot(s: Session, world: World): Session {
  return { ...s, world, undo: [...s.undo, s.world], lastEvents: [], summary: 'スナップショットを復元しました。', seq: s.seq + 1 };
}
