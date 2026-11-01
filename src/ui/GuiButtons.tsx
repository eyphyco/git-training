// GUI 操作ボタン。押すと対応するコマンドがターミナルに表示されて実行される（設計の原則2）。
import { useState } from 'react';
import { currentBranch } from '../engine/model/refs';
import type { RepoState } from '../engine/model/types';

type Props = { repo: RepoState; onCommand(cmd: string): void };

const btn = 'rounded-lg border border-white/15 bg-white/10 px-2 py-1 font-mono text-xs text-slate-100 backdrop-blur-md transition hover:bg-white/25 disabled:opacity-40 [&>option]:text-slate-800';

const q = (s: string) => `"${s.replace(/(["\\])/g, '\\$1')}"`;

export function GuiButtons({ repo, onCommand }: Props) {
  const [message, setMessage] = useState('');
  const [branchName, setBranchName] = useState('');
  const others = Object.keys(repo.refs.heads).filter((b) => b !== currentBranch(repo)).sort();
  const ready = repo.initialized;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-white/5 px-2 py-1.5" aria-label="GUI 操作">
      {!ready && (
        <button type="button" className={btn} onClick={() => onCommand('git init')}>
          git init
        </button>
      )}
      <button type="button" className={btn} disabled={!ready} onClick={() => onCommand('git status')}>
        status
      </button>
      <button type="button" className={btn} disabled={!ready} onClick={() => onCommand('git add .')}>
        add .
      </button>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!message.trim()) return;
          onCommand(`git commit -m ${q(message.trim())}`);
          setMessage('');
        }}
      >
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="コミットメッセージ" className="w-32 rounded-lg border border-white/15 bg-white/10 px-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-400" />
        <button type="submit" className={btn} disabled={!ready || !message.trim()}>
          commit
        </button>
      </form>
      <button type="button" className={btn} disabled={!ready} onClick={() => onCommand('git log --oneline')}>
        log
      </button>
      <button type="button" className={btn} disabled={!ready} onClick={() => onCommand('git diff')}>
        diff
      </button>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!branchName.trim()) return;
          onCommand(`git branch ${branchName.trim()}`);
          setBranchName('');
        }}
      >
        <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="ブランチ名" className="w-24 rounded-lg border border-white/15 bg-white/10 px-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-400" />
        <button type="submit" className={btn} disabled={!ready || !branchName.trim()}>
          branch
        </button>
      </form>
      {(['switch', 'merge'] as const).map((sub) => (
        <select
          key={sub}
          value=""
          disabled={!ready || !others.length}
          onChange={(e) => e.target.value && onCommand(`git ${sub} ${e.target.value}`)}
          className={btn}
          aria-label={sub}
        >
          <option value="">{sub} ▾</option>
          {others.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
