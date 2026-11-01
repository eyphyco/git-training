// 用語カード（content/glossary.json）と、コマンドの意味・危険度（content/commands.json）。
import glossaryJson from '../../content/glossary.json';
import commandsJson from '../../content/commands.json';
import { Explain } from './Explain';

export type GlossaryEntry = { term: string; short: string; related?: string[] };
export const glossary = glossaryJson as Record<string, GlossaryEntry>;

export type Danger = 'safe' | 'caution' | 'danger';
export type CommandInfo = { summary: string; danger: Danger };
export const commandInfo = commandsJson as Record<string, CommandInfo>;

export const DANGER_LABEL: Record<Danger, { text: string; cls: string }> = {
  safe: { text: '安全', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' },
  caution: { text: '注意', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  danger: { text: '危険：変更が消える', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200' },
};

/** 入力中のコマンドに最も長く一致する説明（"git restore --staged x" → "git restore --staged"） */
export function lookupCommand(input: string): { key: string; info: CommandInfo } | null {
  const words = input.trim().split(/\s+/);
  for (let n = Math.min(words.length, 3); n > 0; n--) {
    const key = words.slice(0, n).join(' ');
    if (commandInfo[key]) return { key, info: commandInfo[key] };
  }
  return null;
}

export function TermCard({ id }: { id: string }) {
  const g = glossary[id];
  if (!g) return null;
  return (
    <div>
      <div className="mb-1 font-bold text-sky-700 dark:text-sky-300">{g.term}</div>
      <p>{g.short}</p>
      {g.related?.length ? (
        <div className="mt-2 text-xs text-slate-500">関連: {g.related.map((r) => glossary[r]?.term ?? r).join('、')}</div>
      ) : null}
    </div>
  );
}

export function Term({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!glossary[id]) return <>{children ?? id}</>;
  return <Explain content={<TermCard id={id} />}>{children ?? glossary[id].term}</Explain>;
}
