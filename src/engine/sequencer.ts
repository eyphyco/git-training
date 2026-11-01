// cherry-pick / revert / rebase の共通処理（実 Git の sequencer）。コミットを1つずつ HEAD の上に当て、衝突や edit で止まる。
import { fail, type Ctx } from './command';
import { mergeTrees } from './merge/tree3';
import { commitFiles, getBlob, getCommit, short, subject, writeCommit, writeTree } from './model/objects';
import { currentBranch, headOid, logRef, resolveRev, setBranch } from './model/refs';
import type { Oid, Path, SequenceInProgress, TodoItem } from './model/types';
import { printSummary, treeDiffStat } from './stat';
import { formatDate } from './commands/log';
import { cleanupMessage, moveHead, you } from './commands/commit';
import { applyTree, checkoutTree, findOverwrites } from './worktree';

export const TODO_PATH = '.git/rebase-merge/git-rebase-todo';
export const MSG_PATH = '.git/COMMIT_EDITMSG';

type Op = SequenceInProgress['op'];

export function sequenceOf(ctx: Ctx, op?: Op): SequenceInProgress | null {
  const ip = ctx.repo.inProgress;
  if (!ip || ip.op === 'merge' || (op && ip.op !== op)) return null;
  return ip;
}

const label = (ctx: Ctx, oid: Oid) => `${short(oid)} (${subject(getCommit(ctx.repo, oid).message)})`;

export function revertMessage(ctx: Ctx, oid: Oid): string {
  return `Revert "${subject(getCommit(ctx.repo, oid).message)}"\n\nThis reverts commit ${oid}.`;
}

const HELP = "# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.";

/** エディタで書いたメッセージから # の行を除き、前後の空行を整える（実 Git の cleanup=strip） */
export function stripComments(text: string): string {
  return cleanupMessage([
    text
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n'),
  ]);
}

const ORD = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function squashTemplate(messages: { text: string; skip: boolean }[]): string {
  const parts = [`# This is a combination of ${messages.length} commits.`];
  messages.forEach((m, i) => {
    if (i === 0) parts.push(`# This is the ${ORD(1)} commit message:\n\n${m.text}\n`);
    else if (m.skip) parts.push(`# The commit message #${i + 1} will be skipped:\n\n${m.text.split('\n').map((l) => `# ${l}`).join('\n')}\n`);
    else parts.push(`# This is the commit message #${i + 1}:\n\n${m.text}\n`);
  });
  return `${parts.join('\n')}\n${HELP}\n`;
}

function openEditor(ctx: Ctx, s: SequenceInProgress, path: Path, text: string, purpose: 'todo' | 'message') {
  s.editor = { path, text, purpose };
  s.stopped = 'editor';
  ctx.out('hint: Waiting for your editor to close the file...', 'dim');
  ctx.hint(
    purpose === 'todo'
      ? 'エディタタブで git-rebase-todo を開き、各行の先頭（pick）を書き換えて保存すると rebase が始まります。全部の行を消して保存すると中止します。'
      : 'エディタタブで COMMIT_EDITMSG を開き、コミットメッセージを書いて保存すると続きが進みます（# で始まる行は無視されます）。',
  );
  ctx.emit({ type: 'EDITOR_OPENED', path, purpose });
  ctx.emit({ type: 'SEQUENCE_STOPPED', op: s.op, reason: 'editor', oid: s.current?.oid ?? null });
}

const CONFLICT_HINT: Record<Op, string> = {
  'cherry-pick':
    'hint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git cherry-pick --continue".\nhint: You can instead skip this commit with "git cherry-pick --skip".\nhint: To abort and get back to the state before "git cherry-pick",\nhint: run "git cherry-pick --abort".',
  revert:
    'hint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git revert --continue".\nhint: You can instead skip this commit with "git revert --skip".\nhint: To abort and get back to the state before "git revert",\nhint: run "git revert --abort".',
  rebase:
    'hint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
};

/** 当て終わったコミットを書く（squash / fixup なら直前のコミットに混ぜる） */
function commitPicked(ctx: Ctx, s: SequenceInProgress, item: TodoItem, tree: Oid, message: string) {
  const repo = ctx.repo;
  const head = headOid(repo)!;
  const c = getCommit(repo, item.oid);
  if (item.action === 'squash' || item.action === 'fixup') {
    const prev = getCommit(repo, head);
    s.squash ??= { messages: [{ text: prev.message, skip: false }], author: prev.author, base: head, editMessage: false };
    s.squash.messages.push({ text: c.message, skip: item.action === 'fixup' });
    if (item.action === 'squash') s.squash.editMessage = true;
    const combined = s.squash.editMessage ? stripComments(squashTemplate(s.squash.messages)) : s.squash.messages[0].text;
    const oid = writeCommit(repo, { tree, parents: prev.parents, author: prev.author, committer: you(ctx, s.time), message: combined });
    moveHead(ctx, oid, `rebase (${item.action}): ${subject(combined)}`);
    ctx.emit({ type: 'COMMIT_CREATED', oid, parents: prev.parents, branch: currentBranch(repo), message: combined });
    ctx.emit({ type: 'REF_MOVED', ref: 'HEAD', from: head, to: oid, reason: 'commit' });
    const next = s.todo[0];
    if (next && (next.action === 'squash' || next.action === 'fixup')) return;
    const { editMessage, messages } = s.squash;
    s.squash = undefined;
    if (editMessage) openEditor(ctx, s, MSG_PATH, squashTemplate(messages), 'message');
    return;
  }
  const author = s.op === 'revert' ? you(ctx, s.time) : c.author;
  const oid = writeCommit(repo, { tree, parents: [head], author, committer: you(ctx, s.time), message });
  const branch = currentBranch(repo);
  const reflog = s.op === 'rebase' ? `rebase (${item.action === 'edit' || item.action === 'reword' ? item.action : 'pick'})` : s.op;
  moveHead(ctx, oid, `${reflog}: ${subject(message)}`);
  ctx.emit({ type: 'COMMIT_CREATED', oid, parents: [head], branch, message });
  ctx.emit({ type: 'REF_MOVED', ref: branch ?? 'HEAD', from: head, to: oid, reason: 'commit' });
  ctx.emit(s.op === 'revert' ? { type: 'REVERTED', target: item.oid, oid } : { type: 'CHERRY_PICKED', from: item.oid, oid });
  if (s.op !== 'rebase') {
    ctx.out(`[${branch ?? 'detached HEAD'} ${short(oid)}] ${subject(message)}`);
    if (s.op === 'cherry-pick') ctx.out(` Date: ${formatDate(author.time, author.tz)}`);
    printSummary(ctx, treeDiffStat(repo, commitFiles(repo, head), commitFiles(repo, oid)), false);
  }
}

/** コミット後に edit / reword で止まる。止まったら false */
function afterCommit(ctx: Ctx, s: SequenceInProgress, item: TodoItem): boolean {
  if (s.stopped === 'editor') return false;
  const head = headOid(ctx.repo)!;
  if (item.action === 'edit') {
    s.stopped = 'edit';
    ctx.out(`Stopped at ${short(head)}...  ${subject(getCommit(ctx.repo, head).message)}`);
    ctx.out('You can amend the commit now, with');
    ctx.out('');
    ctx.out('  git commit --amend ');
    ctx.out('');
    ctx.out('Once you are satisfied with your changes, run');
    ctx.out('');
    ctx.out('  git rebase --continue');
    ctx.hint('edit で止まりました。ファイルを直して git add → git commit --amend で作り直し、git rebase --continue で続けます。');
    ctx.emit({ type: 'SEQUENCE_STOPPED', op: s.op, reason: 'edit', oid: head });
    return false;
  }
  if (item.action === 'reword') {
    openEditor(ctx, s, MSG_PATH, `${getCommit(ctx.repo, head).message}\n\n${HELP}\n`, 'message');
    return false;
  }
  return true;
}

/** 1コミット分を HEAD の上に当てる。止まったら false */
function applyItem(ctx: Ctx, s: SequenceInProgress, item: TodoItem): boolean {
  const repo = ctx.repo;
  const c = getCommit(repo, item.oid);
  if (c.parents.length > 1)
    fail(`error: commit ${item.oid} is a merge but no -m option was given.\nfatal: ${s.op} failed`, 'マージコミットはこのサイトでは扱えません（実 Git では -m 1 のように「どちらの親を基準にするか」を指定します）。');
  const head = headOid(repo)!;
  const parent = c.parents[0] ?? null;
  // rebase で親が今の HEAD と同じコミットは作り直さない（実 Git と同じくコミット ID が変わらない）
  if (s.op === 'rebase' && parent === head && !s.squash && item.action !== 'squash' && item.action !== 'fixup') {
    const from = commitFiles(repo, head);
    applyTree(repo, from, commitFiles(repo, item.oid));
    moveHead(ctx, item.oid, `rebase (${item.action === 'edit' || item.action === 'reword' ? item.action : 'pick'}): ${subject(c.message)}`);
    return afterCommit(ctx, s, item);
  }
  const revert = s.op === 'revert';
  const message = revert ? revertMessage(ctx, item.oid) : c.message;
  const [base, theirs] = revert ? [item.oid, parent] : [parent, item.oid];
  const oursFiles = commitFiles(repo, head);
  const m = mergeTrees(repo, commitFiles(repo, base), oursFiles, commitFiles(repo, theirs), { ours: 'HEAD', theirs: `${revert ? 'parent of ' : ''}${label(ctx, item.oid)}` });
  const target: Record<Path, string> = { ...m.result };
  for (const p of m.conflicts) target[p] = `conflict:${p}`;
  const bad = findOverwrites(repo, oursFiles, target);
  if (bad.length)
    fail(
      `error: Your local changes to the following files would be overwritten by merge:\n${bad.map((p) => `\t${p}`).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting\nfatal: ${s.op} failed`,
      '書き換わるファイルに未コミットの変更があります。先にコミットするか git stash で退避しましょう。',
    );
  const affected = applyTree(repo, oursFiles, m.result);
  for (const l of m.lines) if (l.startsWith('CONFLICT') || s.op !== 'rebase' || m.conflicts.length) ctx.out(l, l.startsWith('CONFLICT') ? 'red' : 'normal');
  if (m.conflicts.length) {
    for (const p of m.conflicts) if (m.conflictText[p] !== undefined) repo.workingTree[p] = m.conflictText[p];
    s.conflicts = m.conflicts;
    s.affected = [...new Set([...s.affected, ...affected, ...m.conflicts])];
    s.current = item;
    s.stopped = 'conflict';
    s.message = message;
    ctx.out(`error: could not ${revert ? 'revert' : 'apply'} ${short(item.oid)}... ${subject(c.message)}`, 'error');
    for (const l of CONFLICT_HINT[s.op].split('\n')) ctx.out(l, 'dim');
    ctx.hint(`コンフリクトが起きました。${m.conflicts.join(', ')} を直して git add し、git ${s.op} --continue で続けます。やめるなら git ${s.op} --abort。`);
    ctx.emit({ type: 'CONFLICT', paths: m.conflicts, theirs: short(item.oid) });
    ctx.emit({ type: 'SEQUENCE_STOPPED', op: s.op, reason: 'conflict', oid: item.oid });
    return false;
  }
  const tree = writeTree(repo, m.result);
  if (tree === getCommit(repo, head).tree && item.action !== 'squash' && item.action !== 'fixup') {
    // 変更が空になったコミット（すでに同じ変更がある）は落とす
    ctx.hint(`${short(item.oid)}（${subject(c.message)}）は当てても変更がないため、コミットを作りませんでした${s.op === 'rebase' ? '' : '（実 Git ではここで止まり、--skip か --allow-empty を選びます）'}。`);
    return true;
  }
  commitPicked(ctx, s, item, tree, message);
  return afterCommit(ctx, s, item);
}

function finish(ctx: Ctx, s: SequenceInProgress) {
  const repo = ctx.repo;
  const head = headOid(repo)!;
  if (s.op === 'rebase') {
    if (s.headName) {
      setBranch(repo, s.headName, head, `rebase (finish): refs/heads/${s.headName} onto ${s.onto}`, ctx.world.clock);
      repo.head = { type: 'symbolic', ref: s.headName };
      logRef(repo, 'HEAD', head, head, `rebase (finish): returning to refs/heads/${s.headName}`, ctx.world.clock);
    }
    ctx.out(`Successfully rebased and updated ${s.headName ? `refs/heads/${s.headName}` : 'detached HEAD'}.`);
    ctx.emit({ type: 'REBASED', branch: s.headName ?? null, from: s.origHead, to: head, onto: s.onto!, count: 0 });
  }
  delete repo.inProgress;
}

/** 残りの todo を順に当てる */
export function runSequence(ctx: Ctx) {
  const s = sequenceOf(ctx)!;
  while (s.todo.length) {
    const item = s.todo.shift()!;
    s.current = item;
    if (item.action === 'drop') continue;
    if (!applyItem(ctx, s, item)) return;
  }
  s.current = null;
  finish(ctx, s);
}

export function startSequence(ctx: Ctx, op: Op, items: TodoItem[], extra: Partial<SequenceInProgress> = {}) {
  const head = headOid(ctx.repo)!;
  ctx.repo.inProgress = { op, current: null, todo: items, stopped: null, message: '', time: ctx.tick(), origHead: head, conflicts: [], affected: [], ...extra };
  return ctx.repo.inProgress as SequenceInProgress;
}

/** rebase：HEAD を onto に切り離して当て始める */
export function beginRebase(ctx: Ctx, s: SequenceInProgress, upstreamName: string) {
  const repo = ctx.repo;
  const from = headOid(repo)!;
  checkoutTree(repo, commitFiles(repo, from), commitFiles(repo, s.onto!), 'checkout');
  repo.head = { type: 'detached', oid: s.onto! };
  logRef(repo, 'HEAD', from, s.onto!, `rebase (start): checkout ${upstreamName}`, ctx.world.clock);
  runSequence(ctx);
}

function resetTo(ctx: Ctx, oid: Oid, paths: Path[]) {
  const repo = ctx.repo;
  const files = commitFiles(repo, oid);
  for (const p of new Set([...paths, ...Object.keys(repo.index), ...Object.keys(files)])) {
    if (files[p]) {
      repo.index[p] = files[p];
      repo.workingTree[p] = getBlob(repo, files[p]);
    } else if (p in repo.index || paths.includes(p)) {
      delete repo.index[p];
      delete repo.workingTree[p];
    }
  }
}

export function abortSequence(ctx: Ctx, op: Op) {
  const s = sequenceOf(ctx, op);
  if (!s) fail(op === 'rebase' ? 'fatal: No rebase in progress?' : `error: no ${op} in progress\nfatal: ${op} failed`, `今は ${op} の途中ではありません。`);
  const repo = ctx.repo;
  const head = headOid(repo)!;
  resetTo(ctx, s.origHead, s.affected);
  if (op === 'rebase') {
    if (s.headName) {
      repo.head = { type: 'symbolic', ref: s.headName };
      logRef(repo, 'HEAD', head, s.origHead, `rebase (abort): returning to refs/heads/${s.headName}`, ctx.world.clock);
    } else repo.head = { type: 'detached', oid: s.origHead };
  } else if (head !== s.origHead) moveHead(ctx, s.origHead, `reset: moving to ${s.origHead}`);
  delete repo.inProgress;
  ctx.hint(`${op} を中止し、始める前の状態に戻しました。`);
  ctx.emit({ type: 'SEQUENCE_ABORTED', op });
}

export function skipSequence(ctx: Ctx, op: Op) {
  const s = sequenceOf(ctx, op);
  if (!s) fail(op === 'rebase' ? 'fatal: No rebase in progress?' : `error: no ${op} in progress\nfatal: ${op} failed`);
  if (s.stopped === 'editor') fail('', 'エディタの保存待ちです。エディタタブで保存してください。');
  resetTo(ctx, headOid(ctx.repo)!, s.affected);
  s.conflicts = [];
  s.current = null;
  s.stopped = null;
  s.time = ctx.tick();
  runSequence(ctx);
}

export function continueSequence(ctx: Ctx, op: Op) {
  const s = sequenceOf(ctx, op);
  if (!s) fail(op === 'rebase' ? 'fatal: No rebase in progress?' : `error: no ${op} in progress\nfatal: ${op} failed`, `今は ${op} の途中ではありません。`);
  const repo = ctx.repo;
  if (s.stopped === 'editor') fail('', 'エディタの保存待ちです。エディタタブで保存すると続きが進みます。');
  if (s.conflicts.length)
    fail(
      op === 'rebase'
        ? `${s.conflicts.map((p) => `${p}: needs merge`).join('\n')}\nYou must edit all merge conflicts and then\nmark them as resolved using git add`
        : "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.",
      'まだ解消していないファイルがあります。直して git add してから --continue します。',
    );
  s.time = ctx.tick();
  const head = headOid(repo)!;
  const tree = writeTree(repo, { ...repo.index });
  if (s.stopped === 'conflict' && s.current) {
    const item = s.current;
    if (tree === getCommit(repo, head).tree && item.action !== 'squash' && item.action !== 'fixup')
      fail(
        op === 'rebase'
          ? "No changes - did you forget to use 'git add'?\nIf there is nothing left to stage, chances are that something else\nalready introduced the same changes; you might want to skip this patch."
          : `The previous ${op} is now empty, possibly due to conflict resolution.`,
        `変更が残っていません。直したファイルを git add したか確認しましょう。このコミットを飛ばすなら git ${op} --skip。`,
      );
    s.stopped = null;
    s.conflicts = [];
    commitPicked(ctx, s, item, tree, s.message);
    if (!afterCommit(ctx, s, item)) return;
  } else if (s.stopped === 'edit' && tree !== getCommit(repo, head).tree) {
    fail(
      'error: you have staged changes in your working tree\nIf these changes are meant to be squashed into the previous commit, run:\n\n  git commit --amend \n\nIf they are meant to go into a new commit, run:\n\n  git commit \n\nIn both cases, once you\'re done, continue with:\n\n  git rebase --continue',
      'ステージに変更があります。git commit --amend で今のコミットに入れてから --continue します。',
    );
  }
  s.stopped = null;
  s.current = null;
  runSequence(ctx);
}

const ACTIONS: Record<string, TodoItem['action']> = { p: 'pick', pick: 'pick', r: 'reword', reword: 'reword', e: 'edit', edit: 'edit', s: 'squash', squash: 'squash', f: 'fixup', fixup: 'fixup', d: 'drop', drop: 'drop' };

export function todoText(ctx: Ctx, items: TodoItem[], from: Oid, to: Oid, onto: Oid): string {
  const lines = items.map((i) => `${i.action} ${short(i.oid)} # ${subject(getCommit(ctx.repo, i.oid).message)}`);
  return `${lines.join('\n')}

# Rebase ${short(from)}..${short(to)} onto ${short(onto)} (${items.length} command${items.length === 1 ? '' : 's'})
#
# Commands:
# p, pick <commit> = use commit
# r, reword <commit> = use commit, but edit the commit message
# e, edit <commit> = use commit, but stop for amending
# s, squash <commit> = use commit, but meld into previous commit
# f, fixup <commit> = like "squash" but keep only the previous
#                    commit's log message
# d, drop <commit> = remove commit
#
# These lines can be re-ordered; they are executed from top to bottom.
#
# If you remove a line here THAT COMMIT WILL BE LOST.
#
# However, if you remove everything, the rebase will be aborted.
#
# （Git Training）行の先頭の pick を書き換えたり、行を並べ替えたりして保存します。
# exec / break / label などは、このサイトでは未対応です。
`;
}

function parseTodo(ctx: Ctx, text: string): TodoItem[] {
  const items: TodoItem[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'noop') return;
    const [word, hash] = line.split(/\s+/);
    const action = ACTIONS[word];
    if (!action) fail(`error: invalid line ${i + 1}: ${line}`, `「${word}」はこのサイトでは使えない指示です。pick / reword / edit / squash / fixup / drop のどれかにしてください。`);
    const oid = hash ? resolveRev(ctx.repo, hash) : null;
    if (!oid) fail(`error: invalid line ${i + 1}: ${line}`, `「${hash ?? ''}」というコミットが見つかりません。`);
    if ((action === 'squash' || action === 'fixup') && !items.some((x) => x.action !== 'drop'))
      fail(`error: cannot '${action}' without a previous commit`, `${action} は「1つ前のコミットにまとめる」指示なので、先頭には置けません。`);
    items.push({ action, oid });
  });
  return items;
}

/** エディタ（git-rebase-todo / COMMIT_EDITMSG）を保存したときの処理 */
export function submitEditor(ctx: Ctx, path: Path, text: string) {
  const s = sequenceOf(ctx);
  if (!s?.editor || s.editor.path !== path) fail(`${path} は今は編集できません。`);
  const purpose = s.editor.purpose;
  if (purpose === 'todo') {
    const items = parseTodo(ctx, text);
    s.editor = undefined;
    s.stopped = null;
    if (!items.length) {
      delete ctx.repo.inProgress;
      ctx.out('Nothing to do');
      ctx.hint('todo が空なので rebase を中止しました（何も変わっていません）。');
      ctx.emit({ type: 'SEQUENCE_ABORTED', op: 'rebase' });
      return;
    }
    s.todo = items;
    beginRebase(ctx, s, short(s.onto!));
    return;
  }
  const message = stripComments(text);
  if (!message) fail('Aborting commit due to empty commit message.', 'メッセージが空です。1行以上書いて保存してください。');
  const repo = ctx.repo;
  const head = headOid(repo)!;
  const c = getCommit(repo, head);
  const oid = writeCommit(repo, { tree: c.tree, parents: c.parents, author: c.author, committer: you(ctx, s.time), message });
  moveHead(ctx, oid, `rebase (reword): ${subject(message)}`);
  ctx.emit({ type: 'COMMIT_AMENDED', from: head, to: oid });
  s.editor = undefined;
  s.stopped = null;
  const item = s.current;
  s.current = null;
  if (item?.action === 'edit') return;
  runSequence(ctx);
}
