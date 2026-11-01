// 左ペイン：解説・課題・ヒント3段階・答え・クイズ（F-06）。
import { useMemo, useState } from 'react';
import { createWorld } from '../engine/world';
import { nextLessonId, chapterOf } from '../lesson/content';
import type { Session } from '../lesson/session';
import type { GraphShape, Lesson, TaskStep } from '../lesson/types';
import { useLesson } from '../store/lesson';
import { useProgress } from '../store/progress';
import { Graph } from './graph/Graph';
import { Markdown } from './Markdown';
import { href } from './router';

function ExpectedGraph({ shape }: { shape: GraphShape }) {
  const repo = useMemo(() => {
    const last = shape.commits[shape.commits.length - 1]?.msg;
    const { world } = createWorld({
      commits: shape.commits.map((c) => ({ id: c.msg, msg: c.msg, parents: c.parents ?? [] })),
      branches: shape.branches ?? (last ? { main: last } : {}),
      head: shape.head ?? Object.keys(shape.branches ?? { main: '' })[0],
    });
    return world.local;
  }, [shape]);
  return (
    <div className="mt-3 rounded-lg border border-dashed border-violet-400 bg-white p-2 dark:bg-slate-900">
      <div className="mb-1 text-xs font-bold text-violet-700 dark:text-violet-300">お手本</div>
      <div className="h-48">
        <Graph repo={repo} compact />
      </div>
    </div>
  );
}

function TaskCard({ lesson, step }: { lesson: Lesson; step: TaskStep }) {
  const [shown, setShown] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const recordHint = useProgress((s) => s.recordHint);
  const setPending = useLesson((s) => s.setPendingInput);
  const hints = step.hints ?? [];
  const shape = step.check.find((c) => c.type === 'graphShape');
  return (
    <div>
      <div className="text-sm leading-relaxed whitespace-pre-line">
        <Markdown text={step.instruction} inline />
      </div>
      {shape && shape.type === 'graphShape' && <ExpectedGraph shape={shape.expected} />}
      <ol className="mt-3 space-y-1.5">
        {hints.slice(0, shown).map((h, i) => (
          <li key={i} className="rounded bg-amber-50 px-2 py-1 text-sm dark:bg-amber-950/40">
            <span className="mr-1 font-bold text-amber-700 dark:text-amber-300">ヒント{i + 1}</span>
            <Markdown text={h} inline />
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {shown < hints.length && (
          <button
            type="button"
            onClick={() => {
              setShown(shown + 1);
              recordHint(lesson.id);
            }}
            className="rounded border border-amber-400 px-2 py-1 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            💡 ヒント{shown + 1}を見る（残り{hints.length - shown}）
          </button>
        )}
        {step.answer && (
          <button type="button" onClick={() => setShowAnswer(!showAnswer)} className="rounded border border-slate-400 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            {showAnswer ? '答えを隠す' : '答えを見る'}
          </button>
        )}
      </div>
      {showAnswer && step.answer && (
        <ul className="mt-2 space-y-1">
          {step.answer.map((a, i) => (
            <li key={i} className="flex items-center gap-2 rounded bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100">
              <span className="flex-1 break-all">{a}</span>
              <button type="button" onClick={() => setPending(a)} className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 font-sans text-[10px] hover:bg-slate-600">
                入力欄へ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuizCard({ step, session }: { step: Extract<Lesson['steps'][number], { type: 'quiz' }>; session: Session }) {
  const answer = useLesson((s) => s.answer);
  return (
    <div>
      <div className="mb-2 text-sm font-bold">
        <Markdown text={`Q. ${step.question}`} inline />
      </div>
      <div className="flex flex-col gap-1.5">
        {step.choices.map((c, i) => {
          const wrong = session.wrongChoices.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={wrong}
              onClick={() => answer(i)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${wrong ? 'border-rose-300 bg-rose-50 text-rose-400 line-through dark:bg-rose-950/30' : 'border-slate-300 hover:border-sky-500 hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-sky-950/40'}`}
            >
              {String.fromCharCode(65 + i)}. {c}
            </button>
          );
        })}
      </div>
      {session.wrongChoices.length > 0 && <div className="mt-2 text-sm text-rose-600">不正解。もう一度考えてみよう。</div>}
    </div>
  );
}

export function LessonPanel({ lesson, session }: { lesson: Lesson; session: Session }) {
  const [docOpen, setDocOpen] = useState(true);
  const restart = useLesson((s) => s.restartLesson);
  const step = lesson.steps[session.stepIndex];
  const ch = chapterOf(lesson.id);
  const next = nextLessonId(lesson.id);
  const total = lesson.steps.length;
  const done = session.stepIndex;
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="text-xs text-slate-500">
        <a href={ch ? href.chapter(ch.id) : href.home()} className="hover:underline">
          第{ch?.number}章 {ch?.title}
        </a>
      </div>
      <h1 className="mt-1 mb-2 text-lg font-bold">
        {lesson.challenge && <span className="mr-2 rounded bg-violet-600 px-1.5 py-0.5 align-middle text-xs text-white">章末チャレンジ</span>}
        {lesson.title}
      </h1>
      {lesson.body && (
        <details open={docOpen} onToggle={(e) => setDocOpen((e.target as HTMLDetailsElement).open)} className="mb-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-bold text-slate-500">解説</summary>
          <Markdown text={lesson.body} />
        </details>
      )}
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
        </div>
        {Math.min(done + 1, total)}/{total}
      </div>
      {session.cleared && (
        <div className="mb-3 rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40" data-testid="step-cleared">
          <div className="font-bold text-emerald-700 dark:text-emerald-300">✓ クリア！</div>
          {session.cleared.explain && <Markdown text={session.cleared.explain} inline />}
        </div>
      )}
      {session.done ? (
        <div className="rounded-lg border-2 border-emerald-500 bg-white p-4 text-center dark:bg-slate-900" data-testid="lesson-done">
          <div className="text-2xl">🎉</div>
          <div className="mt-1 font-bold">{lesson.challenge ? '章末チャレンジ クリア！次の章が解放されました' : 'レッスン完了！'}</div>
          <div className="mt-3 flex justify-center gap-2 text-sm">
            <button type="button" onClick={restart} className="rounded border border-slate-400 px-3 py-1">
              もう一度
            </button>
            {next ? (
              <a href={href.lesson(next)} className="rounded bg-emerald-600 px-3 py-1 font-bold text-white">
                次へ →
              </a>
            ) : (
              <a href={href.home()} className="rounded bg-emerald-600 px-3 py-1 font-bold text-white">
                ホームへ
              </a>
            )}
          </div>
        </div>
      ) : step ? (
        <div className="rounded-lg border-2 border-sky-400 bg-white p-3 dark:bg-slate-900" data-testid="current-step">
          <div className="mb-1 text-xs font-bold text-sky-700 dark:text-sky-300">{step.type === 'quiz' ? '理解度クイズ' : `課題 ${done + 1}`}</div>
          {step.type === 'quiz' ? <QuizCard key={session.stepIndex} step={step} session={session} /> : <TaskCard key={session.stepIndex} lesson={lesson} step={step} />}
        </div>
      ) : null}
    </div>
  );
}
