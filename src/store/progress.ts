// 進捗（IndexedDB に自動保存）。設計書 §7 の Progress 型に「続きから再開」用の resume を足したもの。
import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import type { World } from '../engine/model/types';
import { chapters, lessons } from '../lesson/content';

export type LessonId = string;

export type Resume = { lessonId: LessonId; stepIndex: number; world: World; commands: string[]; undo: World[] };

export type Progress = {
  lessons: Record<LessonId, { status: 'todo' | 'doing' | 'done'; hintsUsed: number; clearedAt?: string }>;
  snapshots: Record<string, World>;
  studyLog: Record<string, number>;
  settings: { theme: 'light' | 'dark'; animationSpeed: number };
  resume?: Resume;
};

const KEY = 'git-training/progress/v1';

export const emptyProgress = (): Progress => ({
  lessons: {},
  snapshots: {},
  studyLog: {},
  settings: { theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', animationSpeed: 1 },
});

type Store = Progress & {
  loaded: boolean;
  load(): Promise<void>;
  startLesson(id: LessonId): void;
  completeLesson(id: LessonId): void;
  recordHint(id: LessonId): void;
  saveResume(r: Resume | undefined): void;
  saveSnapshot(name: string, world: World): void;
  deleteSnapshot(name: string): void;
  addStudyMinutes(n: number): void;
  setSettings(s: Partial<Progress['settings']>): void;
  exportJson(): string;
  importJson(text: string): void;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function pick(s: Progress): Progress {
  return { lessons: s.lessons, snapshots: s.snapshots, studyLog: s.studyLog, settings: s.settings, resume: s.resume };
}

let timer: ReturnType<typeof setTimeout> | undefined;
function persist(s: Progress) {
  clearTimeout(timer);
  timer = setTimeout(() => void set(KEY, pick(s)).catch(() => {}), 300);
}

export const useProgress = create<Store>((setState, getState) => {
  const update = (fn: (s: Progress) => Partial<Progress>) => {
    setState((s) => fn(s));
    persist(getState());
  };
  return {
    ...emptyProgress(),
    loaded: false,
    async load() {
      try {
        const saved = await get<Progress>(KEY);
        if (saved) setState({ ...emptyProgress(), ...saved });
      } catch {
        // IndexedDB が使えない環境ではメモリ上だけで動かす
      }
      setState({ loaded: true });
    },
    startLesson(id) {
      update((s) => (s.lessons[id] ? {} : { lessons: { ...s.lessons, [id]: { status: 'doing', hintsUsed: 0 } } }));
    },
    completeLesson(id) {
      update((s) => {
        const prev = s.lessons[id] ?? { status: 'todo', hintsUsed: 0 };
        if (prev.status === 'done') return {};
        return { lessons: { ...s.lessons, [id]: { ...prev, status: 'done', clearedAt: new Date().toISOString() } } };
      });
    },
    recordHint(id) {
      update((s) => {
        const prev = s.lessons[id] ?? { status: 'doing', hintsUsed: 0 };
        return { lessons: { ...s.lessons, [id]: { ...prev, hintsUsed: prev.hintsUsed + 1 } } };
      });
    },
    saveResume(resume) {
      update(() => ({ resume }));
    },
    saveSnapshot(name, world) {
      update((s) => ({ snapshots: { ...s.snapshots, [name]: world } }));
    },
    deleteSnapshot(name) {
      update((s) => {
        const { [name]: _, ...rest } = s.snapshots;
        return { snapshots: rest };
      });
    },
    addStudyMinutes(n) {
      update((s) => ({ studyLog: { ...s.studyLog, [today()]: (s.studyLog[today()] ?? 0) + n } }));
    },
    setSettings(patch) {
      update((s) => ({ settings: { ...s.settings, ...patch } }));
    },
    exportJson() {
      return JSON.stringify({ app: 'git-training', version: 1, progress: pick(getState()) }, null, 2);
    },
    importJson(text) {
      const data = JSON.parse(text);
      if (data?.app !== 'git-training' || !data.progress?.lessons) throw new Error('Git Training の進捗ファイルではありません');
      update(() => ({ ...emptyProgress(), ...data.progress }));
    },
  };
});

/** 章の解放：第0章は最初から、それ以降は前の章の章末チャレンジをクリアしたら */
export function isChapterUnlocked(p: Progress, chapterId: string): boolean {
  const i = chapters.findIndex((c) => c.id === chapterId);
  if (i <= 0) return true;
  const prev = chapters[i - 1];
  if (!prev.challenge) return false;
  return p.lessons[prev.challenge]?.status === 'done';
}

export function chapterProgress(p: Progress, chapterId: string): { done: number; total: number } {
  const ch = chapters.find((c) => c.id === chapterId)!;
  const ids = [...ch.lessons, ...(ch.challenge ? [ch.challenge] : [])];
  return { done: ids.filter((id) => p.lessons[id]?.status === 'done').length, total: ids.length };
}

export function lessonExists(id: string) {
  return id in lessons;
}
