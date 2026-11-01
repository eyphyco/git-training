import { fail, unsupported, type CommandDef } from '../command';
import { getCommit, short, subject } from '../model/objects';
import { currentBranch, headOid, resolveRev, walkLog } from '../model/refs';
import type { Oid, RepoState } from '../model/types';

/** "HEAD -> main, origin/main, feature" の部分 */
export function decorations(repo: RepoState, oid: Oid): string[] {
  const out: string[] = [];
  const branch = currentBranch(repo);
  if (repo.head.type === 'detached' && repo.head.oid === oid) out.push('HEAD');
  if (branch && repo.refs.heads[branch] === oid) out.push(`HEAD -> ${branch}`);
  for (const [t, o] of Object.entries(repo.refs.tags)) if (o === oid) out.push(`tag: ${t}`);
  for (const [r, refs] of Object.entries(repo.refs.remotes))
    for (const [b, o] of Object.entries(refs)) if (o === oid) out.push(`${r}/${b}`);
  for (const [b, o] of Object.entries(repo.refs.heads).sort()) if (o === oid && b !== branch) out.push(b);
  return out;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 実 Git の既定の日付形式 "Thu Jan 1 09:00:00 2026 +0900" */
export function formatDate(time: number, tz: string): string {
  const sign = tz[0] === '-' ? -1 : 1;
  const offset = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  const d = new Date((time + offset * 60) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} ${tz}`;
}

export const log: CommandDef = {
  name: 'log',
  spec: { short: { n: 'max-count' }, valued: ['max-count'], long: ['oneline', 'all', 'graph', 'decorate', 'reverse'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    if (opts.graph) unsupported('log --graph', '文字でグラフを描きます。このサイトでは画面のコミットグラフを見てください');
    let max = opts['max-count'] ? Number(opts['max-count']) : Infinity;
    const revs: string[] = [];
    for (const p of positional) {
      if (/^-\d+$/.test(p)) max = Number(p.slice(1));
      else revs.push(p);
    }
    let starts: Oid[];
    if (opts.all) {
      starts = [...Object.values(repo.refs.heads), ...Object.values(repo.refs.tags), ...Object.values(repo.refs.remotes).flatMap((r) => Object.values(r))];
      const h = headOid(repo);
      if (h) starts.push(h);
    } else if (revs.length) {
      starts = revs.map((r) => resolveRev(repo, r) ?? fail(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.`, `「${r}」というブランチやコミットは見つかりません。`));
    } else {
      const h = headOid(repo);
      if (!h) fail(`fatal: your current branch '${currentBranch(repo)}' does not have any commits yet`, 'まだコミットが1つもありません。');
      starts = [h];
    }
    let oids = walkLog(repo, starts).slice(0, max);
    if (opts.reverse) oids = oids.reverse();
    oids.forEach((oid, i) => {
      const c = getCommit(repo, oid);
      const dec = decorations(repo, oid);
      const decText = dec.length ? ` (${dec.join(', ')})` : '';
      if (opts.oneline) {
        ctx.out(`${short(oid)}${decText} ${subject(c.message)}`, 'normal');
        return;
      }
      if (i > 0) ctx.out('');
      ctx.out(`commit ${oid}${decText}`, 'yellow');
      if (c.parents.length > 1) ctx.out(`Merge: ${c.parents.map(short).join(' ')}`);
      ctx.out(`Author: ${c.author.name} <${c.author.email}>`);
      ctx.out(`Date:   ${formatDate(c.author.time, c.author.tz)}`);
      ctx.out('');
      for (const l of c.message.split('\n')) ctx.out(`    ${l}`);
    });
  },
};
