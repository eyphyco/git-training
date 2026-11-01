import { fail, unsupported, type CommandDef, type Ctx } from '../command';
import { commitFiles, getCommit, short, subject } from '../model/objects';
import { ancestors, currentBranch, headOid, logRef, resolveRev, walkLog } from '../model/refs';
import type { Oid } from '../model/types';
import { runScript } from '../minish';
import { printSummary, treeDiffStat } from '../stat';
import { checkoutTree } from '../worktree';
import { formatDate } from './log';

/** まだ調べていない候補（bad から辿れて、good から辿れないもの。新しい順） */
function candidates(ctx: Ctx): Oid[] {
  const b = ctx.repo.bisect!;
  const exclude = new Set<Oid>();
  for (const g of b.good) for (const o of ancestors(ctx.repo, g)) exclude.add(o);
  return walkLog(ctx.repo, [b.bad!]).filter((o) => !exclude.has(o));
}

/** 実 Git と同じ見積もり（bisect.c の estimate_bisect_steps） */
function estimateSteps(all: number): number {
  if (all < 3) return 0;
  const n = Math.floor(Math.log2(all));
  const e = 1 << n;
  return e < 3 * (all - e) ? n : n - 1;
}

function checkout(ctx: Ctx, oid: Oid) {
  const repo = ctx.repo;
  const from = headOid(repo);
  checkoutTree(repo, commitFiles(repo, from), commitFiles(repo, oid), 'checkout');
  repo.head = { type: 'detached', oid };
  logRef(repo, 'HEAD', from, oid, `checkout: moving from ${currentBranch(repo) ?? short(from!)} to ${oid}`, ctx.world.clock);
}

/** 次に試すコミットに移る。見つかったら true */
function next(ctx: Ctx): boolean {
  const repo = ctx.repo;
  const b = repo.bisect!;
  if (!b.bad || !b.good.length) {
    ctx.out(`status: waiting for ${!b.bad && !b.good.length ? 'both good and bad commits' : b.bad ? 'good commit(s), bad commit known' : 'bad commit, 1 good commit known'}`);
    return false;
  }
  const all = candidates(ctx);
  const testable = all.filter((o) => o !== b.bad && !b.skip.includes(o));
  if (!testable.length) {
    if (all.some((o) => b.skip.includes(o))) {
      ctx.out('There are only \'skip\'ped commits left to test.');
      ctx.out(`The first bad commit could be any of:`);
      for (const o of all) ctx.out(o);
      ctx.out('We cannot bisect more!');
      return true;
    }
    const c = getCommit(repo, b.bad);
    ctx.out(`${b.bad} is the first bad commit`, 'yellow');
    ctx.out(`commit ${b.bad}`);
    ctx.out(`Author: ${c.author.name} <${c.author.email}>`);
    ctx.out(`Date:   ${formatDate(c.author.time, c.author.tz)}`);
    ctx.out('');
    for (const l of c.message.split('\n')) ctx.out(`    ${l}`);
    ctx.out('');
    printSummary(ctx, treeDiffStat(repo, commitFiles(repo, c.parents[0] ?? null), commitFiles(repo, b.bad)), true);
    b.log.push(`# first bad commit: [${b.bad}] ${subject(c.message)}`);
    ctx.hint(`見つかりました！ ${short(b.bad)}「${subject(c.message)}」でバグが入りました。調べ終わったら git bisect reset で元のブランチに戻ります。`);
    return true;
  }
  // 候補を半分に分けるコミットを選ぶ（同点なら古い方。実 Git と同じ結果になる）
  const set = new Set(all);
  const n = all.length;
  const weight = (o: Oid) => [...ancestors(repo, o)].filter((x) => set.has(x)).length;
  let best = testable[testable.length - 1];
  let bestDist = -1;
  let bestW = 0;
  for (const o of [...testable].reverse()) {
    const w = weight(o);
    const dist = Math.min(w, n - w);
    if (dist > bestDist) {
      best = o;
      bestDist = dist;
      bestW = w;
    }
    if (Math.abs(2 * w - n) <= 1) break;
  }
  const left = n - bestW - 1;
  const steps = estimateSteps(n);
  ctx.out(`Bisecting: ${left} revision${left === 1 ? '' : 's'} left to test after this (roughly ${steps} step${steps === 1 ? '' : 's'})`);
  checkout(ctx, best);
  ctx.out(`[${best}] ${subject(getCommit(repo, best).message)}`);
  return false;
}

function mark(ctx: Ctx, kind: 'good' | 'bad' | 'skip', rev?: string) {
  const repo = ctx.repo;
  const b = repo.bisect;
  if (!b) fail('You need to start by "git bisect start"', 'まず git bisect start で始めます。');
  const oid = rev ? resolveRev(repo, rev) : headOid(repo);
  if (!oid) fail(`fatal: Needed a single revision\nBad rev input: ${rev}`, `「${rev}」というコミットは見つかりません。`);
  if (kind === 'bad') b.bad = oid;
  else if (kind === 'good') b.good.push(oid);
  else b.skip.push(oid);
  b.log.push(`# ${kind}: [${oid}] ${subject(getCommit(repo, oid).message)}`, `git bisect ${kind} ${oid}`);
  return next(ctx);
}

export const bisect: CommandDef = {
  name: 'bisect',
  run(ctx) {
    const repo = ctx.repo;
    const [sub, ...args] = ctx.args.positional;
    switch (sub) {
      case 'start': {
        if (repo.bisect) fail('', 'すでに bisect 中です。やり直すなら git bisect reset してから start します。');
        if (repo.inProgress) fail(`error: ${repo.inProgress.op} の途中なので bisect できません。`);
        repo.bisect = { bad: null, good: [], skip: [], start: repo.head, log: ['git bisect start'] };
        const [bad, ...goods] = args.filter((a) => a !== '--');
        if (bad) {
          const b = resolveRev(repo, bad);
          if (!b) fail(`fatal: '${bad}' does not appear to be a valid revision`);
          repo.bisect.bad = b;
        }
        for (const g of goods) {
          const o = resolveRev(repo, g);
          if (!o) fail(`fatal: '${g}' does not appear to be a valid revision`);
          repo.bisect.good.push(o);
        }
        next(ctx);
        return;
      }
      case 'good':
      case 'old':
        mark(ctx, 'good', args[0]);
        return;
      case 'bad':
      case 'new':
        mark(ctx, 'bad', args[0]);
        return;
      case 'skip':
        mark(ctx, 'skip', args[0]);
        return;
      case 'log':
        if (!repo.bisect) fail('error: We are not bisecting.');
        for (const l of repo.bisect.log) ctx.out(l);
        return;
      case 'reset': {
        const b = repo.bisect;
        if (!b) {
          ctx.out('We are not bisecting.');
          return;
        }
        const from = headOid(repo)!;
        const to = b.start.type === 'detached' ? b.start.oid : repo.refs.heads[b.start.ref];
        if (from !== to) ctx.out(`Previous HEAD position was ${short(from)} ${subject(getCommit(repo, from).message)}`);
        checkoutTree(repo, commitFiles(repo, from), commitFiles(repo, to), 'checkout');
        repo.head = b.start;
        delete repo.bisect;
        ctx.out(b.start.type === 'symbolic' ? `Switched to branch '${b.start.ref}'` : `HEAD is now at ${short(to)}`);
        return;
      }
      case 'run': {
        if (!repo.bisect) fail('You need to start by "git bisect start"');
        const script = args.filter((a) => a !== 'sh' && a !== 'bash').map((a) => a.replace(/^\.\//, ''))[0];
        if (!script) fail('usage: git bisect run <cmd> [<arg>...]', '例: git bisect run sh test.sh（test.sh が 0 で終われば good、それ以外は bad）');
        for (let i = 0; i < 64; i++) {
          if (!repo.bisect.bad || !repo.bisect.good.length) fail('bisect run failed:\nNo good or bad commit known.', '先に good と bad をそれぞれ1つ以上指定します。');
          const src = repo.workingTree[script];
          if (src === undefined) fail(`${script}: No such file or directory\nbisect run failed`, `${script} がこのコミットにありません。テスト用のスクリプトは全部のコミットにある必要があります。`);
          ctx.out(`running '${args.join(' ')}'`, 'dim');
          const r = runScript(src, { args: [], readFile: (p) => repo.workingTree[p.replace(/^\.\//, '')] ?? null, git: () => ({ code: 1, out: '' }) });
          for (const l of r.out) ctx.out(l);
          if (r.code >= 128 || r.code === 127) fail(`bisect run failed:\nexit code ${r.code} from '${args.join(' ')}' is < 0 or >= 128`);
          const done = mark(ctx, r.code === 0 ? 'good' : r.code === 125 ? 'skip' : 'bad');
          if (done) {
            ctx.out('bisect found first bad commit');
            return;
          }
        }
        return;
      }
      case undefined:
      case 'help':
        ctx.out('usage: git bisect [start|bad|good|skip|reset|log|run]');
        return;
      default:
        unsupported(`git bisect ${sub}`, 'start / good / bad / skip / reset / log / run が使えます');
    }
  },
};
