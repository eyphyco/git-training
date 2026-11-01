// 右上の操作：Undo・リセット・スナップショット・答え合わせ（F-08）。
import { useState } from 'react';
import { checkStep } from '../lesson/session';
import { useLesson } from '../store/lesson';
import { useProgress } from '../store/progress';

const btn = 'glass-btn px-2.5 py-1 text-xs';

export function Toolbar() {
  const lesson = useLesson((s) => s.lesson)!;
  const session = useLesson((s) => s.session)!;
  const { undo, reset, restore, restartLesson } = useLesson.getState();
  const snapshots = useProgress((s) => s.snapshots);
  const saveSnapshot = useProgress((s) => s.saveSnapshot);
  const deleteSnapshot = useProgress((s) => s.deleteSnapshot);
  const [checkOpen, setCheckOpen] = useState(false);
  const prefix = `${lesson.id}:`;
  const mine = Object.keys(snapshots).filter((k) => k.startsWith(prefix));
  const results = checkOpen ? checkStep(lesson, session) : [];
  const step = lesson.steps[session.stepIndex];

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      <button type="button" className={btn} onClick={undo} disabled={!session.undo.length} title="1操作戻す" data-testid="undo">
        ↶ 戻す
      </button>
      <button type="button" className={btn} onClick={() => confirm('レッスンの初期状態に戻しますか？（進んだステップはそのまま）') && reset()} title="初期状態に戻す">
        ⟲ リセット
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => {
          const name = prompt('スナップショットの名前', `#${mine.length + 1}`);
          if (name) saveSnapshot(prefix + name, session.world);
        }}
        title="今の状態を保存"
      >
        📷 保存
      </button>
      {mine.length > 0 && (
        <select
          className={btn}
          value=""
          onChange={(e) => {
            const k = e.target.value;
            if (k.startsWith('del:')) deleteSnapshot(k.slice(4));
            else if (k) restore(snapshots[k], k.slice(prefix.length));
          }}
          aria-label="スナップショット"
        >
          <option value="">復元 ▾</option>
          {mine.map((k) => (
            <option key={k} value={k}>
              {k.slice(prefix.length)}
            </option>
          ))}
          {mine.map((k) => (
            <option key={`del:${k}`} value={`del:${k}`}>
              🗑 {k.slice(prefix.length)} を削除
            </option>
          ))}
        </select>
      )}
      <button type="button" className={btn} onClick={() => setCheckOpen(!checkOpen)} disabled={!step || step.type === 'quiz'}>
        ✓ 答え合わせ
      </button>
      <button type="button" className={btn} onClick={() => confirm('このレッスンを最初からやり直しますか？') && restartLesson()}>
        最初から
      </button>
      {checkOpen && step && step.type !== 'quiz' && (
        <div className="glass-strong absolute top-full right-0 z-40 mt-2 w-72 rounded-xl p-3 text-sm">
          <div className="mb-1 font-bold">今の課題の判定条件</div>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}>
                {r.ok ? '✓' : '✗'} {r.label}
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs text-slate-500 underline" onClick={() => setCheckOpen(false)}>
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
