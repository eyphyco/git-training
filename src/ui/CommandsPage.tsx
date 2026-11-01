// コマンド辞典（S-08, F-17）：検索・カテゴリ別一覧・危険度バッジ・関連レッスン。
import { useMemo, useState } from 'react';
import { lessons } from '../lesson/content';
import { GIT_COMMANDS } from '../engine/registry';
import { relatedLessons, searchCommands } from './commandIndex';
import { commandInfo, DANGER_LABEL } from './glossary';
import { Markdown } from './Markdown';
import { href } from './router';

export function CommandsPage({ q: initial }: { q?: string }) {
  const [q, setQ] = useState(initial ?? '');
  const [cat, setCat] = useState<string | null>(null);
  const entries = useMemo(() => Object.entries(commandInfo), []);
  const categories = [...new Set(entries.map(([, v]) => v.category))];
  const hits = searchCommands(entries, q).filter(([, v]) => !cat || v.category === cat);
  const all = Object.values(lessons);
  const available = (k: string) => !k.startsWith('git ') || k.split(' ')[1] in GIT_COMMANDS;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
      <a href={href.home()} className="text-sm text-slate-500 hover:underline">
        ← ホーム
      </a>
      <header>
        <h1 className="text-2xl font-bold">コマンド辞典</h1>
        <p className="text-sm text-slate-500">意味・危険度・関連レッスン。危険度は「履歴や変更を失う可能性があるか」の目安です。</p>
      </header>
      <div className="glass sticky top-2 z-10 space-y-2 rounded-3xl p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索（例：push、ステージ、取り消す）" className="glass-input w-full py-2" aria-label="コマンドを検索" autoFocus />
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[null, ...categories].map((c) => (
            <button key={c ?? 'all'} type="button" onClick={() => setCat(c)} className={`glass-btn px-2.5 py-1 ${cat === c ? 'bg-sky-500/80! font-bold text-white' : ''}`}>
              {c ?? 'すべて'}
            </button>
          ))}
        </div>
      </div>
      <ul className="space-y-2">
        {hits.map(([k, v]) => {
          const rel = relatedLessons(k, all);
          return (
            <li key={k} className="glass rounded-3xl p-4" data-testid={`command-${k}`}>
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-base font-bold">{k}</code>
                <span className={`rounded px-1.5 text-xs font-bold ${DANGER_LABEL[v.danger].cls}`}>{DANGER_LABEL[v.danger].text}</span>
                <span className="text-xs text-slate-500">{v.category}</span>
                {!available(k) && <span className="rounded bg-slate-500/20 px-1.5 text-xs text-slate-500">このサイトでは今後対応</span>}
              </div>
              <p className="mt-1 text-sm">{v.summary}</p>
              {v.detail && (
                <div className="mt-1 text-slate-600 dark:text-slate-300">
                  <Markdown text={v.detail} />
                </div>
              )}
              {rel.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="text-slate-500">関連レッスン:</span>
                  {rel.map((l) => (
                    <a key={l.id} href={href.lesson(l.id)} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300">
                      {l.title}
                    </a>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {!hits.length && <li className="text-sm text-slate-500">見つかりませんでした。</li>}
      </ul>
    </div>
  );
}
