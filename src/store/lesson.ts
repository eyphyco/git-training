// 開いているレッスンの状態（ターミナルの表示行を含む）。中身は src/lesson/session.ts の純粋関数。
import { create } from 'zustand';
import type { OutputLine, World } from '../engine/model/types';
import * as S from '../lesson/session';
import type { Lesson } from '../lesson/types';
import { useProgress } from './progress';

export type TermLine = { id: number; kind: 'cmd' | 'out' | 'info'; text: string; tone: OutputLine['tone']; prompt?: string };

type Store = {
  lesson: Lesson | null;
  session: S.Session | null;
  lines: TermLine[];
  /** ↑↓ で呼び出す入力履歴 */
  history: string[];
  /** GUI ボタンなどから入力欄に入れたいテキスト */
  pendingInput: string | null;
  open(lesson: Lesson): void;
  run(line: string, prompt: string): void;
  save(path: string, content: string | null): void;
  answer(choice: number): boolean;
  undo(): void;
  reset(): void;
  restartLesson(): void;
  restore(world: World, name: string): void;
  setPendingInput(text: string | null): void;
};

let nextId = 1;
const line = (kind: TermLine['kind'], text: string, tone: OutputLine['tone'] = 'normal', prompt?: string): TermLine => ({ id: nextId++, kind, text, tone, prompt });

const WELCOME = (lesson: Lesson) => [line('info', `— ${lesson.title} —  help でコマンド一覧、Tab で補完、↑↓ で履歴`, 'dim')];

export const useLesson = create<Store>((set, get) => {
  /** セッションが進んだら進捗に反映する */
  const commit = (next: S.Session) => {
    const { lesson } = get();
    if (!lesson) return;
    set({ session: next });
    const progress = useProgress.getState();
    if (next.done) {
      progress.completeLesson(lesson.id);
      progress.saveResume(undefined);
    } else {
      progress.saveResume({ lessonId: lesson.id, stepIndex: next.stepIndex, world: next.world, commands: next.commands, undo: next.undo.slice(-20) });
    }
  };

  return {
    lesson: null,
    session: null,
    lines: [],
    history: [],
    pendingInput: null,
    open(lesson) {
      const progress = useProgress.getState();
      progress.startLesson(lesson.id);
      let session = S.startSession(lesson);
      const r = progress.resume;
      const lines = WELCOME(lesson);
      if (r && r.lessonId === lesson.id && r.stepIndex < lesson.steps.length) {
        session = { ...session, world: r.world, stepIndex: r.stepIndex, commands: r.commands, undo: r.undo, summary: '前回の続きから再開しました。' };
        lines.push(line('info', '（前回の続きから再開しました。最初からやり直すには「最初から」ボタン）', 'dim'));
      }
      set({ lesson, session, lines, history: session.commands.slice(-50) });
    },
    run(input, prompt) {
      const { lesson, session, lines, history } = get();
      if (!lesson || !session) return;
      const echo = line('cmd', input, 'normal', prompt);
      if (!input.trim()) return set({ lines: [...lines, echo] });
      const { session: next, result } = S.runCommand(lesson, session, input);
      const cleared = result.events.some((e) => e.type === 'CLEAR');
      const out = result.output.map((o) => line('out', o.text, o.tone));
      set({ lines: cleared ? [] : [...lines, echo, ...out].slice(-1000), history: [...history, input.trim()].slice(-100) });
      commit(next);
    },
    save(path, content) {
      const { lesson, session, lines } = get();
      if (!lesson || !session) return;
      const next = S.saveFile(lesson, session, path, content);
      if (next.world === session.world) return;
      set({ lines: [...lines, line('info', content === null ? `（エディタ）${path} を削除しました` : `（エディタ）${path} を保存しました`, 'dim')] });
      commit(next);
    },
    answer(choice) {
      const { lesson, session } = get();
      if (!lesson || !session) return false;
      const { session: next, correct } = S.answerQuiz(lesson, session, choice);
      commit(next);
      return correct;
    },
    undo() {
      const { session, lines } = get();
      if (!session?.undo.length) return;
      set({ lines: [...lines, line('info', '↶ 1つ前の状態に戻しました', 'dim')] });
      commit(S.undo(session));
    },
    reset() {
      const { session, lines } = get();
      if (!session) return;
      set({ lines: [...lines, line('info', '⟲ レッスンの初期状態に戻しました（進んだステップはそのまま）', 'dim')] });
      commit(S.resetWorld(session));
    },
    restartLesson() {
      const { lesson } = get();
      if (!lesson) return;
      useProgress.getState().saveResume(undefined);
      set({ session: S.startSession(lesson), lines: WELCOME(lesson) });
    },
    restore(world, name) {
      const { session, lines } = get();
      if (!session) return;
      set({ lines: [...lines, line('info', `スナップショット「${name}」を復元しました`, 'dim')] });
      commit(S.restoreSnapshot(session, world));
    },
    setPendingInput(text) {
      set({ pendingInput: text });
    },
  };
});
