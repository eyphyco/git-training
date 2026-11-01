// 実戦シナリオのチームタイムライン（S-06）：Bot からの連絡を新しい順でなく、届いた順に並べる。
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../lesson/session';
import { Avatar } from './github/parts';

export function TeamChat({ chat }: { chat: ChatMessage[] }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.length]);
  return (
    <section className="mb-3 rounded-xl border border-[var(--edge)] bg-[var(--raised)]" data-testid="team-chat">
      <div className="border-b border-[var(--line)] px-3 py-1.5 text-xs font-bold"># team（チームのチャット）</div>
      <ul className="max-h-56 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {chat.map((m, i) => (
          <li key={i} className="flex gap-2">
            <Avatar name={m.from} />
            <div>
              <div className="text-xs font-bold">{m.from}</div>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          </li>
        ))}
        {!chat.length && <li className="text-xs text-[var(--muted)]">まだメッセージはありません。</li>}
        <div ref={bottom} />
      </ul>
    </section>
  );
}
