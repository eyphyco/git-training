// ブランチ戦略シミュレータ（F-13）：戦略を選ぶとブランチ構成と保護が設定され、自由に操作してルール違反を確かめられる。
import { useEffect, useState } from 'react';
import { createWorld } from '../engine/world';
import { STRATEGIES, strategySetup, type StrategyId } from '../lesson/strategy';
import type { Lesson } from '../lesson/types';
import { useLesson } from '../store/lesson';
import { href } from './router';
import { StrategyRules } from './StrategyRules';
import { Toolbar } from './Toolbar';
import { MobileTabs, PageHeader, WorkspaceLayout, type MobileTab } from './Workspace';

const IDS = Object.keys(STRATEGIES) as StrategyId[];
const lessonFor = (id: StrategyId): Lesson => ({ id: `sandbox:strategy:${id}`, title: `戦略シミュレータ：${STRATEGIES[id].name}`, level: 'advanced', setup: strategySetup(id), steps: [] });

function Panel({ id }: { id: StrategyId }) {
  const session = useLesson((s) => s.session)!;
  const s = STRATEGIES[id];
  const start = () => useLesson.getState().openWorld(lessonFor(id), createWorld(strategySetup(id)).world, `${s.name} の構成で始めました`);
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm">
      <div>
        <div className="eyebrow">BRANCH STRATEGY</div>
        <h1 className="text-lg font-bold">ブランチ戦略シミュレータ</h1>
        <p className="text-xs text-[var(--muted)]">戦略を選ぶと、ブランチ構成とブランチ保護が設定されます。ルールに反する操作をすると、ターミナルとここに警告が出ます（進捗には記録されません）。</p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {IDS.map((x) => (
          <a key={x} href={href.strategy(x)} className={`glass-btn px-2.5 py-1 text-xs ${x === id ? 'border-[var(--accent-line)]! text-[var(--accent)]!' : ''}`} data-testid={`strategy-${x}`}>
            {STRATEGIES[x].name}
          </a>
        ))}
      </nav>
      <StrategyRules world={session.world} />
      <section className="space-y-1 text-xs">
        <h2 className="font-bold text-[var(--muted)]">ブランチ</h2>
        <ul className="space-y-1">
          {s.branches.map((b) => (
            <li key={b.name}>
              <code className="font-bold">{b.name}</code>：{b.role}
            </li>
          ))}
          {s.naming.map((n) => (
            <li key={n} className="text-[var(--muted)]">
              {n}
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[var(--muted)]">向いているチーム：{s.fits}</p>
      </section>
      <button type="button" className="glass-btn self-start px-3 py-1 text-xs" onClick={start}>
        ⟲ この戦略の最初の状態に戻す
      </button>
    </div>
  );
}

export function StrategyPage({ id: raw }: { id?: string }) {
  const id: StrategyId = IDS.includes(raw as StrategyId) ? (raw as StrategyId) : 'github-flow';
  const session = useLesson((s) => s.session);
  const lesson = useLesson((s) => s.lesson);
  const [tab, setTab] = useState<MobileTab>('task');
  const lessonId = lessonFor(id).id;

  useEffect(() => {
    if (useLesson.getState().lesson?.id === lessonId) return;
    useLesson.getState().openWorld(lessonFor(id), createWorld(strategySetup(id)).world, `${STRATEGIES[id].name} の構成で始めました。git branch -a や GitHub タブの Settings で確認できます`);
  }, [id, lessonId]);

  if (!session || lesson?.id !== lessonId) return null;
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="ブランチ戦略シミュレータ">
        <Toolbar />
      </PageHeader>
      <MobileTabs tab={tab} onChange={setTab} first="戦略" />
      <WorkspaceLayout tab={tab} session={session} resetKey={lessonId} left={<Panel id={id} />} />
    </div>
  );
}
