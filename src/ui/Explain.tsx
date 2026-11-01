// ホバー解説の共通部品。300ms 待ってから表示し、タッチ端末ではタップで開閉する（設計書 §4）。
import * as HoverCard from '@radix-ui/react-hover-card';
import { useState, type ReactNode } from 'react';

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** SVG の <g> などを直接トリガーにする */
  asChild?: boolean;
};

export function Explain({ content, children, side = 'top', asChild }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={300} closeDelay={100}>
      <HoverCard.Trigger
        asChild
        onClick={(e) => {
          // マウスなら hover で十分。タップ（pointerType 不明の click を含む）では開閉を切り替える
          if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') setOpen((o) => !o);
        }}
      >
        {asChild ? children : <span className="term">{children}</span>}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="glass-strong z-50 max-w-xs rounded-xl p-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
        >
          {content}
          <HoverCard.Arrow className="fill-white/75 dark:fill-slate-900/80" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
