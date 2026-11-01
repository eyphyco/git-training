// 動く図解（F-21）。content/figures/*.json の手順をエンジンで実行して、コマごとの状態を作る。
import { execute } from '../engine/run';
import { teammatePush, type TeammatePush } from '../engine/remote';
import { createWorld, type Setup } from '../engine/world';
import type { World } from '../engine/model/types';
import { applyHostingEvent, type HostingEvent } from '../hosting/events';
import { GH } from '../hosting/gh';

export type FigureStep = { commands?: string[]; teammatePush?: TeammatePush; event?: HostingEvent; caption: string };
export type Figure = { id: string; title: string; show?: ('graph' | 'areas')[]; setup: Setup; intro: string; steps: FigureStep[] };
export type FigureFrame = { world: World; caption: string; command?: string };

const files = import.meta.glob<Figure>('/content/figures/*.json', { eager: true, import: 'default' });
export const figures: Record<string, Figure> = Object.fromEntries(Object.values(files).map((f) => [f.id, f]));

export function buildFrames(fig: Figure): FigureFrame[] {
  let world = createWorld(fig.setup).world;
  const frames: FigureFrame[] = [{ world, caption: fig.intro }];
  for (const step of fig.steps) {
    if (step.teammatePush) world = teammatePush(world, step.teammatePush).world;
    if (step.event) world = applyHostingEvent(world, step.event).world;
    for (const cmd of step.commands ?? []) {
      const r = execute(world, cmd, { programs: { gh: GH } });
      if (!r.ok) throw new Error(`figure ${fig.id}: "${cmd}" failed: ${r.output.map((o) => o.text).join(' / ')}`);
      world = r.world;
    }
    frames.push({ world, caption: step.caption, command: step.commands?.join(' && ') ?? (step.teammatePush ? `（${step.teammatePush.author} さんが push）` : step.event ? `（${step.event.author} さん：GitHub）` : undefined) });
  }
  return frames;
}

/** Markdown を :::figure{id="..."} の行で区切る */
export function splitFigures(md: string): ({ kind: 'md'; text: string } | { kind: 'figure'; id: string })[] {
  const out: ({ kind: 'md'; text: string } | { kind: 'figure'; id: string })[] = [];
  let buf: string[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^:::figure\{id="([^"]+)"\}\s*$/);
    if (m) {
      if (buf.join('').trim()) out.push({ kind: 'md', text: buf.join('\n') });
      buf = [];
      out.push({ kind: 'figure', id: m[1] });
    } else buf.push(line);
  }
  if (buf.join('').trim()) out.push({ kind: 'md', text: buf.join('\n') });
  return out;
}
