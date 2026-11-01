// レッスンの実行状態。UI 非依存の純粋関数で、ストアはこれを呼ぶだけにする。
import { explainEvents } from '../engine/explain';
import { execute } from '../engine/run';
import { teammatePush } from '../engine/remote';
import { createWorld, editFile } from '../engine/world';
import type { CommandResult, GitEvent, Oid, World } from '../engine/model/types';
import { evaluateAll, type CheckResult } from './checks';
import type { Lesson, Step, TaskStep } from './types';

/** 操作の再生（F-22）用の1コマ */
export type Frame = { world: World; label: string };

export type Session = {
  lessonId: string;
  world: World;
  initial: World;
  aliases: Record<string, Oid>;
  undo: World[];
  /** 初期状態からの操作の流れ。Undo すると末尾が消える */
  timeline: Frame[];
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
  /** 実機演習のチェック済み項目 */
  checked: number[];
  done: boolean;
  /** イベントのたびに増える（アニメーションの起点に使う） */
  seq: number;
};

/** ステップの開始時の出来事（同僚の push など）を起こす */
function enterStep(lesson: Lesson, s: Session): Session {
  const step: Step | undefined = lesson.steps[s.stepIndex];
  if (!step?.before?.length || s.done) return s;
  let world = s.world;
  const aliases = { ...s.aliases };
  const events: GitEvent[] = [];
  const timeline = [...s.timeline];
  for (const e of step.before) {
    const r = teammatePush(world, e);
    world = r.world;
    events.push(...r.events);
    if (e.id) aliases[e.id] = r.oid;
    timeline.push({ world, label: `（${e.author} さんが push）` });
  }
  const summary = step.before.map((e) => `同僚の ${e.author} さんが ${e.remote ?? 'origin'} の ${e.branch ?? 'main'} に push しました（「${e.message}」）。まだあなたの手元には届いていません。`).join(' ');
  return { ...s, world, aliases, timeline, lastEvents: events, summary, seq: s.seq + 1, undo: [...s.undo, s.world] };
}

export function startSession(lesson: Lesson): Session {
  const { world, aliases } = createWorld(lesson.setup);
  const s: Session = {
    lessonId: lesson.id,
    world,
    initial: world,
    aliases,
    undo: [],
    timeline: [{ world, label: '初期状態' }],
    stepIndex: 0,
    stepCommands: [],
    commands: [],
    lastEvents: [],
    summary: null,
    cleared: null,
    wrongChoices: [],
    checked: [],
    done: lesson.steps.length === 0,
    seq: 0,
  };
  return enterStep(lesson, s);
}

export function currentStep(lesson: Lesson, s: Session) {
  return lesson.steps[s.stepIndex];
}

export function checkStep(lesson: Lesson, s: Session): CheckResult[] {
  const step = currentStep(lesson, s);
  if (!step || step.type === 'quiz' || step.type === 'checklist') return [];
  return evaluateAll((step as TaskStep).check, { world: s.world, aliases: s.aliases, commands: s.stepCommands });
}

function nextStep(lesson: Lesson, s: Session): Session {
  const step = currentStep(lesson, s);
  const next = s.stepIndex + 1;
  const moved: Session = { ...s, stepIndex: next, stepCommands: [], cleared: { stepIndex: s.stepIndex, explain: step?.explain }, done: next >= lesson.steps.length, wrongChoices: [], checked: [] };
  return enterStep(lesson, moved);
}

function advance(lesson: Lesson, s: Session): Session {
  const step = currentStep(lesson, s);
  if (!step || step.type === 'quiz' || step.type === 'checklist' || s.done) return s;
  return checkStep(lesson, s).every((r) => r.ok) ? nextStep(lesson, s) : s;
}

function applyChange(lesson: Lesson, s: Session, world: World, events: GitEvent[], label: string, command?: string): Session {
  const changed = world !== s.world;
  const next: Session = {
    ...s,
    world,
    undo: changed ? [...s.undo, s.world].slice(-200) : s.undo,
    timeline: changed ? [...s.timeline, { world, label }].slice(-300) : s.timeline,
    commands: command ? [...s.commands, command] : s.commands,
    stepCommands: command ? [...s.stepCommands, command] : s.stepCommands,
    lastEvents: events,
    summary: explainEvents(events) ?? s.summary,
    cleared: null,
    seq: s.seq + 1,
  };
  return advance(lesson, next);
}

export function runCommand(lesson: Lesson, s: Session, line: string): { session: Session; result: CommandResult } {
  const result = execute(s.world, line, { allowedCommands: lesson.allowedCommands });
  return { session: applyChange(lesson, s, result.world, result.events, line.trim(), line.trim()), result };
}

export function saveFile(lesson: Lesson, s: Session, path: string, content: string | null): Session {
  const { world, events } = editFile(s.world, path, content);
  return applyChange(lesson, s, world, events, content === null ? `（エディタで ${path} を削除）` : `（エディタで ${path} を保存）`);
}

/** フリープレイの「同僚が push」ボタンなど、レッスン外から起こす出来事 */
export function applyWorld(lesson: Lesson, s: Session, world: World, events: GitEvent[], label: string, summary: string): Session {
  return { ...applyChange(lesson, s, world, events, label), summary };
}

export function answerQuiz(lesson: Lesson, s: Session, choice: number): { session: Session; correct: boolean } {
  const step = currentStep(lesson, s);
  if (!step || step.type !== 'quiz') return { session: s, correct: false };
  if (choice !== step.answer) return { session: { ...s, wrongChoices: [...new Set([...s.wrongChoices, choice])] }, correct: false };
  return { session: nextStep(lesson, s), correct: true };
}

/** 実機演習のチェックを付け外しする。全部付いたら次へ進む */
export function toggleCheck(lesson: Lesson, s: Session, item: number): Session {
  const step = currentStep(lesson, s);
  if (!step || step.type !== 'checklist') return s;
  const checked = s.checked.includes(item) ? s.checked.filter((i) => i !== item) : [...s.checked, item];
  const next = { ...s, checked };
  return checked.length === step.items.length ? nextStep(lesson, next) : next;
}

export function undo(s: Session): Session {
  if (!s.undo.length) return s;
  return {
    ...s,
    world: s.undo[s.undo.length - 1],
    undo: s.undo.slice(0, -1),
    timeline: s.timeline.length > 1 ? s.timeline.slice(0, -1) : s.timeline,
    lastEvents: [],
    summary: '1つ前の状態に戻しました。',
    seq: s.seq + 1,
  };
}

/** レッスン初期状態に戻す（進んだステップはそのまま） */
export function resetWorld(s: Session): Session {
  return { ...s, world: s.initial, undo: [...s.undo, s.world], timeline: [...s.timeline, { world: s.initial, label: '（リセット）' }], lastEvents: [], summary: 'レッスンの初期状態に戻しました。', seq: s.seq + 1 };
}

export function restoreSnapshot(s: Session, world: World): Session {
  return { ...s, world, undo: [...s.undo, s.world], timeline: [...s.timeline, { world, label: '（スナップショット復元）' }], lastEvents: [], summary: 'スナップショットを復元しました。', seq: s.seq + 1 };
}
