// レッスンのシナリオで起こす GitHub 上の出来事（同僚の PR・レビュー・コメント・マージ）。
import { runInDraft } from '../engine/run';
import { teammatePush } from '../engine/remote';
import type { GitEvent, MergeMethod, Path, Review, World } from '../engine/model/types';
import { commentPr, mergePr, openPr, reviewPr } from './ops';

export type HostingEvent =
  | { type: 'openPr'; author: string; head: string; base?: string; title: string; body?: string; message: string; files: Record<Path, string | null>; draft?: boolean }
  | { type: 'review'; author: string; pr?: number; state: Review['state']; body?: string; comments?: { path: Path; line?: number; body: string }[] }
  | { type: 'comment'; author: string; pr?: number; body: string }
  | { type: 'mergePr'; author: string; pr?: number; method: MergeMethod }
  | { type: 'openIssue'; author: string; title: string; body?: string };

const login = (name: string) => name.toLowerCase();

/** 出来事を起こした後の World と、画面に出す1行の説明 */
export function applyHostingEvent(world: World, e: HostingEvent): { world: World; events: GitEvent[]; summary: string } {
  let w = world;
  const events: GitEvent[] = [];
  const run = (fn: Parameters<typeof runInDraft>[1]) => {
    const r = runInDraft(w, fn);
    if (!r.ok) throw new Error(`hosting event ${e.type} failed: ${r.output.map((o) => o.text).join('\n')}`);
    w = r.world;
    events.push(...r.events);
  };
  switch (e.type) {
    case 'openPr': {
      const p = teammatePush(w, { author: e.author, branch: e.head, from: e.base, message: e.message, files: e.files });
      w = p.world;
      events.push(...p.events);
      run((ctx) => void openPr(ctx, { title: e.title, body: e.body, head: e.head, base: e.base, author: login(e.author), draft: e.draft }));
      const n = w.hosting.pullRequests[w.hosting.pullRequests.length - 1].number;
      return { world: w, events, summary: `${e.author} さんが PR #${n}「${e.title}」を作りました（${e.head} → ${e.base ?? 'main'}）。GitHub タブで見られます。` };
    }
    case 'review': {
      run((ctx) => {
        reviewPr(ctx, e.pr, { author: login(e.author), state: e.state, body: e.body });
        for (const c of e.comments ?? []) commentPr(ctx, e.pr, { author: login(e.author), ...c });
      });
      const label = { approved: '承認（Approve）しました', changes_requested: '修正を依頼しました（Request changes）', commented: 'コメントしました' }[e.state];
      return { world: w, events, summary: `${e.author} さんが PR をレビューして${label}${e.body ? `：「${e.body}」` : ''}` };
    }
    case 'comment':
      run((ctx) => commentPr(ctx, e.pr, { author: login(e.author), body: e.body }));
      return { world: w, events, summary: `${e.author} さんが PR にコメントしました：「${e.body}」` };
    case 'mergePr':
      run((ctx) => void mergePr(ctx, e.pr, e.method, { by: login(e.author), deleteBranch: true }));
      return { world: w, events, summary: `${e.author} さんが PR をマージしました。GitHub の main が進んだので、手元は git pull で追いつきます。` };
    case 'openIssue': {
      run((ctx) => {
        const n = Math.max(ctx.world.hosting.nextNumber ?? 1, ...ctx.world.hosting.pullRequests.map((p) => p.number + 1), ...(ctx.world.hosting.issues ?? []).map((i) => i.number + 1));
        ctx.world.hosting.nextNumber = n + 1;
        (ctx.world.hosting.issues ??= []).push({ number: n, title: e.title, body: e.body ?? '', author: login(e.author), state: 'open' });
      });
      return { world: w, events, summary: `${e.author} さんが Issue「${e.title}」を作りました。` };
    }
  }
}
