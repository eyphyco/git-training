import type { CommandDef, Ctx } from '../command';
import { short } from '../model/objects';
import { currentBranch, headOid } from '../model/refs';
import { collapseUntracked, computeStatus } from '../model/status';

const LABEL = { added: 'new file:   ', modified: 'modified:   ', deleted: 'deleted:    ' } as const;

function shortStatus(ctx: Ctx) {
  const s = computeStatus(ctx.repo);
  const rows = new Map<string, [string, string]>();
  const code = { added: 'A', modified: 'M', deleted: 'D' } as const;
  for (const e of s.staged) rows.set(e.path, [code[e.change], ' ']);
  for (const e of s.unstaged) rows.set(e.path, [rows.get(e.path)?.[0] ?? ' ', code[e.change]]);
  for (const p of s.conflicts) ctx.out(`UU ${p}`, 'red');
  for (const [p, [x, y]] of [...rows].sort(([a], [b]) => a.localeCompare(b))) ctx.out(`${x}${y} ${p}`, y !== ' ' ? 'red' : 'green');
  for (const p of collapseUntracked(ctx.repo, s.untracked)) ctx.out(`?? ${p}`, 'red');
}

export const status: CommandDef = {
  name: 'status',
  spec: { short: { s: 'short' }, long: ['long'] },
  run(ctx) {
    if (ctx.args.opts.short) return shortStatus(ctx);
    const repo = ctx.repo;
    const s = computeStatus(repo);
    const branch = currentBranch(repo);
    const head = headOid(repo);
    ctx.out(branch ? `On branch ${branch}` : `HEAD detached at ${short(head!)}`, branch ? 'normal' : 'red');
    if (repo.inProgress?.op === 'merge') {
      if (s.conflicts.length) {
        ctx.out('You have unmerged paths.');
        ctx.out('  (fix conflicts and run "git commit")');
        ctx.out('  (use "git merge --abort" to abort the merge)');
      } else {
        ctx.out('All conflicts fixed but you are still merging.');
        ctx.out('  (use "git commit" to conclude merge)');
      }
      ctx.out('');
    }
    if (!head) {
      ctx.out('');
      ctx.out('No commits yet');
      ctx.out('');
    }
    if (s.staged.length) {
      ctx.out('Changes to be committed:');
      ctx.out(head ? '  (use "git restore --staged <file>..." to unstage)' : '  (use "git rm --cached <file>..." to unstage)');
      for (const e of s.staged) ctx.out(`\t${LABEL[e.change]}${e.path}`, 'green');
      ctx.out('');
    }
    if (s.conflicts.length) {
      ctx.out('Unmerged paths:');
      ctx.out('  (use "git add <file>..." to mark resolution)');
      for (const p of s.conflicts) ctx.out(`\tboth modified:   ${p}`, 'red');
      ctx.out('');
    }
    if (s.unstaged.length) {
      ctx.out('Changes not staged for commit:');
      ctx.out(`  (use "git add${s.unstaged.some((e) => e.change === 'deleted') ? '/rm' : ''} <file>..." to update what will be committed)`);
      ctx.out('  (use "git restore <file>..." to discard changes in working directory)');
      for (const e of s.unstaged) ctx.out(`\t${LABEL[e.change]}${e.path}`, 'red');
      ctx.out('');
    }
    const untracked = collapseUntracked(repo, s.untracked);
    if (untracked.length) {
      ctx.out('Untracked files:');
      ctx.out('  (use "git add <file>..." to include in what will be committed)');
      for (const p of untracked) ctx.out(`\t${p}`, 'red');
      ctx.out('');
    }
    if (s.staged.length || s.conflicts.length) return;
    if (s.unstaged.length) ctx.out('no changes added to commit (use "git add" and/or "git commit -a")');
    else if (untracked.length) ctx.out(`nothing added to commit but untracked files present (use "git add" to track)`);
    else if (!head) ctx.out('nothing to commit (create/copy files and use "git add" to track)');
    else if (!repo.inProgress) ctx.out('nothing to commit, working tree clean');
  },
};
