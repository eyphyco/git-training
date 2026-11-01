// ターミナル（F-02）。Tab 補完・↑↓ 履歴・入力中のコマンドの意味と危険度（F-19）を表示する。
import { useEffect, useRef, useState } from 'react';
import { currentBranch } from '../engine/model/refs';
import { short } from '../engine/model/objects';
import type { RepoState, Tone } from '../engine/model/types';
import { useLesson } from '../store/lesson';
import { complete } from './completion';
import { DANGER_LABEL, lookupCommand } from './glossary';

const TONE: Record<Tone, string> = {
  normal: 'text-slate-200',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  yellow: 'text-amber-300',
  cyan: 'text-cyan-300',
  dim: 'text-slate-500',
  error: 'text-rose-300',
  hint: 'text-sky-300 before:content-["💡_"]',
};

export function promptFor(repo: RepoState): string {
  if (!repo.initialized) return 'you@git-training:~/project$';
  const b = currentBranch(repo);
  const where = b ?? (repo.head.type === 'detached' ? short(repo.head.oid) + '…' : '');
  return `you@git-training:~/project (${where})$`;
}

export function Terminal({ repo }: { repo: RepoState }) {
  const lines = useLesson((s) => s.lines);
  const history = useLesson((s) => s.history);
  const run = useLesson((s) => s.run);
  const pending = useLesson((s) => s.pendingInput);
  const setPending = useLesson((s) => s.setPendingInput);
  const [input, setInput] = useState('');
  const [histPos, setHistPos] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const prompt = promptFor(repo);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [lines, candidates]);

  useEffect(() => {
    if (pending === null) return;
    setInput(pending);
    setPending(null);
    inputRef.current?.focus();
  }, [pending, setPending]);

  const info = lookupCommand(input);
  // 入力が止まったら実行プレビュー用にストアへ渡す
  const setDraft = useLesson((s) => s.setDraft);
  useEffect(() => {
    const t = setTimeout(() => setDraft(input), 200);
    return () => clearTimeout(t);
  }, [input, setDraft]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      run(input, prompt);
      setInput('');
      setHistPos(null);
      setCandidates([]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const r = complete(input, repo);
      setInput(r.value);
      setCandidates(r.candidates);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!history.length) return;
      const pos = histPos === null ? history.length - 1 : Math.max(0, histPos - 1);
      setHistPos(pos);
      setInput(history[pos]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histPos === null) return;
      const pos = histPos + 1;
      if (pos >= history.length) {
        setHistPos(null);
        setInput('');
      } else {
        setHistPos(pos);
        setInput(history[pos]);
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      run('clear', prompt);
    }
  };

  return (
    <div className="flex h-full flex-col font-mono text-[13px] leading-snug" onClick={() => window.getSelection()?.isCollapsed && inputRef.current?.focus()}>
      <div className="flex-1 overflow-y-auto px-3 py-2" data-testid="terminal-output">
        {lines.map((l) =>
          l.kind === 'cmd' ? (
            <div key={l.id} className="mt-1 break-all whitespace-pre-wrap text-slate-100">
              <span className="text-emerald-400">{l.prompt}</span> {l.text}
            </div>
          ) : (
            <div key={l.id} className={`break-all whitespace-pre-wrap ${l.kind === 'info' ? 'text-slate-500 italic' : TONE[l.tone]}`}>
              {l.text.replace(/\t/g, '        ') || ' '}
            </div>
          ),
        )}
        {candidates.length > 0 && <div className="text-slate-400">{candidates.join('   ')}</div>}
        <div ref={bottom} />
      </div>
      <div className="flex min-h-6 items-center gap-2 border-t border-white/10 px-3 py-1 text-xs text-slate-400">
        {info ? (
          <>
            <span className="text-slate-200">{info.key}</span>
            <span className="truncate">— {info.info.summary}</span>
            <span className={`ml-auto shrink-0 rounded px-1.5 font-sans font-bold ${DANGER_LABEL[info.info.danger].cls}`}>{DANGER_LABEL[info.info.danger].text}</span>
          </>
        ) : (
          <span>Tab で補完 / ↑↓ で履歴 / help でコマンド一覧</span>
        )}
      </div>
      <label className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <span className="shrink-0 text-emerald-400">{prompt}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setCandidates([]);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="コマンド入力"
          data-testid="terminal-input"
          className="min-w-0 flex-1 bg-transparent text-slate-100 caret-emerald-400 outline-none"
        />
      </label>
    </div>
  );
}
