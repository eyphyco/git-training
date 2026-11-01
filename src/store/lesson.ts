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
  /** ターミナルに入力中のテキスト（実行プレビュー用） */
  draft: string;
  setDraft(text: string): void;
  open(lesson: Lesson): void;
  /** フリープレイ：任意の World から始める */
  openWorld(lesson: Lesson, world: World, note: string): void;
  run(line: string, prompt: string): void;
  save(path: string, content: string | null): void;
  answer(choice: number): boolean;
  toggleCheck(item: number): void;
  /** GitHub 画面のボタンなど、コマンド以外の操作。失敗したら false（理由はターミナルに出る） */
  action(label: string, fn: (ctx: import('../engine/command').Ctx) => void): boolean;
  /** フリープレイなどレッスン外の出来事（同僚の push）を反映する */
  apply(world: World, events: import('../engine/model/types').GitEvent[], label: string, summary: string): void;
  undo(): void;
  reset(): void;
  restartLesson(): void;
  restore(world: World, name: string): void;
  setPendingInput(text: string | null): void;
};

/** フリープレイ（課題なし）は進捗に記録しない */
export const FREEPLAY_ID = 'freeplay';
/** 戦略シミュレータなど、進捗に記録しない作業場 */
export const isSandbox = (id: string) => id === FREEPLAY_ID || id.startsWith('sandbox:');

let nextId = 1;
const line = (kind: TermLine['kind'], text: string, tone: OutputLine['tone'] = 'normal', prompt?: string): TermLine => ({ id: nextId++, kind, text, tone, prompt });

const WELCOME = (lesson: Lesson) => [line('info', `— ${lesson.title} —  help でコマンド一覧、Tab で補完、↑↓ で履歴`, 'dim')];

export const useLesson = create<Store>((set, get) => {
  /** セッションが進んだら進捗に反映する */
  const commit = (next: S.Session) => {
    const { lesson } = get();
    if (!lesson) return;
    set({ session: next });
    if (isSandbox(lesson.id)) return;
    const progress = useProgress.getState();
    if (next.done) {
      progress.completeLesson(lesson.id, lesson.scenario ? S.scoreOf(next, progress.lessons[lesson.id]?.hintsUsed ?? 0).score : undefined);
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
    draft: '',
    setDraft(text) {
      if (get().draft !== text) set({ draft: text });
    },
    open(lesson) {
      const progress = useProgress.getState();
      progress.startLesson(lesson.id);
      let session = S.startSession(lesson);
      const r = progress.resume;
      const lines = WELCOME(lesson);
      if (r && r.lessonId === lesson.id && r.stepIndex < lesson.steps.length) {
        session = { ...session, world: r.world, stepIndex: r.stepIndex, commands: r.commands, undo: r.undo, timeline: [{ world: r.world, label: '（前回の続き）' }], summary: '前回の続きから再開しました。' };
        lines.push(line('info', '（前回の続きから再開しました。最初からやり直すには「最初から」ボタン）', 'dim'));
      }
      set({ lesson, session, lines, history: session.commands.slice(-50) });
    },
    openWorld(lesson, world, note) {
      const base = S.startSession(lesson);
      const session = { ...base, world, initial: world, timeline: [{ world, label: '初期状態' }] };
      set({ lesson, session, lines: [...WELCOME(lesson), line('info', note, 'dim')], history: [] });
    },
    run(input, prompt) {
      const { lesson, session, lines, history } = get();
      if (!lesson || !session) return;
      const echo = line('cmd', input, 'normal', prompt);
      if (!input.trim()) return set({ lines: [...lines, echo] });
      const { session: next, result } = S.runCommand(lesson, session, input);
      const cleared = result.events.some((e) => e.type === 'CLEAR');
      const out = result.output.map((o) => line('out', o.text, o.tone));
      set({ lines: cleared ? [] : [...lines, echo, ...out].slice(-1000), history: [...history, input.trim()].slice(-100), draft: '' });
      commit(next);
    },
    save(path, content) {
      const { lesson, session, lines } = get();
      if (!lesson || !session) return;
      // git がエディタの保存を待っている（rebase -i の todo など）なら、結果をターミナルに出す
      if (content !== null) {
        const { session: next, result } = S.saveEditorFile(lesson, session, path, content);
        if (result) {
          set({ lines: [...lines, line('info', `（エディタ）${path.split('/').pop()} を保存しました`, 'dim'), ...result.output.map((o) => line('out', o.text, o.tone))].slice(-1000) });
          if (result.ok) commit(next);
          return;
        }
      }
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
    toggleCheck(item) {
      const { lesson, session } = get();
      if (!lesson || !session) return;
      commit(S.toggleCheck(lesson, session, item));
    },
    action(label, fn) {
      const { lesson, session, lines } = get();
      if (!lesson || !session) return false;
      const { session: next, result } = S.runAction(lesson, session, label, fn);
      set({ lines: [...lines, line('info', label, 'dim'), ...result.output.map((o) => line('out', o.text, o.tone))].slice(-1000) });
      if (result.ok) commit(next);
      return result.ok;
    },
    apply(world, events, label, summary) {
      const { lesson, session, lines } = get();
      if (!lesson || !session) return;
      set({ lines: [...lines, line('info', summary, 'dim')] });
      commit(S.applyWorld(lesson, session, world, events, label, summary));
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
      // フリープレイの「最初から」でレッスンの再開データを消さない
      if (!isSandbox(lesson.id)) useProgress.getState().saveResume(undefined);
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
