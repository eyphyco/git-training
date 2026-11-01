import { fail, unsupported, type CommandDef } from '../command';
import { lineOps } from '../merge/diff';
import { commitFiles, getBlob, getCommit, short, subject } from '../model/objects';
import { ancestors, currentBranch, headOid, isAncestor, resolveRev } from '../model/refs';
import { computeStatus } from '../model/status';
import type { Oid, RepoState, TodoItem } from '../model/types';
import { upstreamOf } from '../remote';
import { abortSequence, beginRebase, continueSequence, sequenceOf, skipSequence, startSequence, TODO_PATH, todoText } from '../sequencer';

/** 変更内容の指紋（実 Git の patch-id の簡略版）。同じ変更が上流にすでにあるコミットを見分ける */
function patchKey(repo: RepoState, oid: Oid): string {
  const c = getCommit(repo, oid);
  const a = commitFiles(repo, c.parents[0] ?? null);
  const b = commitFiles(repo, oid);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((p) => a[p] !== b[p])
    .sort()
    .map((p) => `${p}\n${lineOps(a[p] ? getBlob(repo, a[p]) : '', b[p] ? getBlob(repo, b[p]) : '').filter((o) => o.type !== ' ').map((o) => o.type + o.line).join('\n')}`)
    .join('\n');
}

/** upstream から辿れない、HEAD 側のコミット（古い順。マージコミットは除く） */
function commitsToReplay(repo: RepoState, head: Oid, upstream: Oid): Oid[] {
  const exclude = ancestors(repo, upstream);
  const out: Oid[] = [];
  const seen = new Set<Oid>();
  const visit = (o: Oid) => {
    if (seen.has(o) || exclude.has(o)) return;
    seen.add(o);
    for (const p of getCommit(repo, o).parents) visit(p);
    out.push(o);
  };
  visit(head);
  return out.filter((o) => getCommit(repo, o).parents.length <= 1);
}

/** --autosquash：「fixup! 件名」「squash! 件名」のコミットを、その件名のコミットの直後へ移して fixup / squash にする */
function autosquash(repo: RepoState, picks: Oid[]): TodoItem[] {
  const subj = (o: Oid) => subject(getCommit(repo, o).message);
  const items: TodoItem[] = [];
  const moved = new Set<Oid>();
  for (const oid of picks) {
    if (moved.has(oid)) continue;
    items.push({ action: 'pick', oid });
    // 後ろにある、このコミット（またはそれに混ぜるコミット）宛ての fixup! / squash! を続けて並べる
    const targets = [subj(oid)];
    for (const o of picks) {
      if (moved.has(o) || o === oid) continue;
      const m = subj(o).match(/^(fixup|squash)! (.*)$/);
      if (m && targets.some((t) => t === m[2] || t.startsWith(m[2]))) {
        items.push({ action: m[1] as 'fixup' | 'squash', oid: o });
        moved.add(o);
        targets.push(subj(o));
      }
    }
  }
  return items;
}

export const rebase: CommandDef = {
  name: 'rebase',
  spec: { short: { i: 'interactive' }, valued: ['onto'], long: ['continue', 'abort', 'skip', 'interactive', 'edit-todo', 'root', 'autosquash', 'quit'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    if (opts.continue) return continueSequence(ctx, 'rebase');
    if (opts.abort) return abortSequence(ctx, 'rebase');
    if (opts.skip) return skipSequence(ctx, 'rebase');
    if (opts['edit-todo'] || opts.root || opts.quit) unsupported(`rebase --${['edit-todo', 'root', 'quit'].find((k) => opts[k])}`, 'rebase の細かい動きを変えるオプションです');
    if (repo.inProgress)
      fail(
        sequenceOf(ctx, 'rebase')
          ? 'fatal: It seems that there is already a rebase-merge directory, and\nI wonder if you are in the middle of another rebase.'
          : `error: ${repo.inProgress.op} is in progress`,
        '前の操作が途中です。git rebase --continue で続けるか --abort で中止してください。',
      );
    if (positional.length > 1) unsupported('ブランチを指定した rebase（git rebase <上流> <ブランチ>）', '先にそのブランチへ切り替えます。このサイトでは git switch <ブランチ> してから git rebase <上流> としてください');

    const head = headOid(repo);
    if (!head) fail('fatal: no commits yet', 'まだコミットがありません。');
    const branch = currentBranch(repo);
    let upstreamName = positional[0];
    if (!upstreamName) {
      const up = upstreamOf(repo, branch);
      if (!up)
        fail(
          'There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.\nSee git-rebase(1) for details.\n\n    git rebase \'<branch>\'',
          '付け替え先のブランチを指定してください（例: git rebase main）。',
        );
      upstreamName = up.ref;
    }
    const upstream = resolveRev(repo, upstreamName);
    if (!upstream) fail(`fatal: invalid upstream '${upstreamName}'`, `「${upstreamName}」というブランチやコミットは見つかりません。`);
    const ontoName = opts.onto as string | undefined;
    const onto = ontoName ? resolveRev(repo, ontoName) : upstream;
    if (!onto) fail(`fatal: Does not point to a valid commit '${ontoName}'`);

    const s = computeStatus(repo);
    if (s.unstaged.length) fail('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.', '未コミットの変更があります。先にコミットするか git stash で退避しましょう。');
    if (s.staged.length) fail('error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.', 'ステージに未コミットの変更があります。先にコミットするか git stash で退避しましょう。');

    const interactive = Boolean(opts.interactive);
    if (!interactive && !ontoName && !opts.autosquash && isAncestor(repo, upstream, head)) {
      ctx.out(`Current branch ${branch ?? 'HEAD'} is up to date.`);
      return;
    }
    // 上流にすでに同じ変更があるコミットは当てない
    const upstreamKeys = new Set(commitsToReplay(repo, upstream, head).map((o) => patchKey(repo, o)));
    const all = commitsToReplay(repo, head, upstream);
    const picks = all.filter((o) => !upstreamKeys.has(patchKey(repo, o)));
    for (const o of all.filter((x) => !picks.includes(x))) ctx.out(`warning: skipped previously applied commit ${short(o)}`, 'yellow');
    const items: TodoItem[] = opts.autosquash ? autosquash(repo, picks) : picks.map((oid) => ({ action: 'pick', oid }));
    const seq = startSequence(ctx, 'rebase', interactive ? [] : items, { headName: branch, onto, interactive });
    if (interactive) {
      seq.stopped = 'editor';
      seq.editor = { path: TODO_PATH, purpose: 'todo', text: picks.length ? todoText(ctx, items, upstream, head, onto) : 'noop\n' };
      ctx.out('hint: Waiting for your editor to close the file...', 'dim');
      ctx.hint('エディタタブで git-rebase-todo を開き、各行の先頭（pick）を書き換えて保存すると rebase が始まります。全部の行を消して保存すると中止します。');
      ctx.emit({ type: 'EDITOR_OPENED', path: TODO_PATH, purpose: 'todo' });
      ctx.emit({ type: 'SEQUENCE_STOPPED', op: 'rebase', reason: 'editor', oid: null });
      return;
    }
    beginRebase(ctx, seq, upstreamName);
  },
};
