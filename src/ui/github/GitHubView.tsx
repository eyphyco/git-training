// 模擬 GitHub 画面（S-04, F-10）：Code / Pull requests / Issues / Settings。操作はすべて hosting 層の関数を通す。
import { useState } from 'react';
import { lineOps } from '../../engine/merge/diff';
import { commitFiles, getBlob, getCommit, short, subject } from '../../engine/model/objects';
import { walkLog } from '../../engine/model/refs';
import type { MergeMethod, PullRequest, RepoState, World } from '../../engine/model/types';
import { codeOwners, defaultBranch, latestReviews, ME, mergeBlockers, prChecks, prCommits, prFiles, protectionOf, repoSlug } from '../../hosting/model';
import { closePr, commentPr, deleteRemoteBranch, mergePr, openPr, reviewPr, setProtection } from '../../hosting/ops';
import { useLesson } from '../../store/lesson';
import { Avatar, Badge, Box, TabBar } from './parts';

type Page = { kind: 'code' } | { kind: 'pulls' } | { kind: 'pr'; number: number } | { kind: 'compare' } | { kind: 'issues' } | { kind: 'settings' };

const act = (label: string, fn: Parameters<ReturnType<typeof useLesson.getState>['action']>[1]) => useLesson.getState().action(`（GitHub）${label}`, fn);

export function GitHubView({ world, readOnly }: { world: World; readOnly?: boolean }) {
  const [page, setPage] = useState<Page>({ kind: 'pulls' });
  const repo = world.remotes.origin;
  if (!repo) return <div className="p-4 text-sm text-slate-500">まだ GitHub のリポジトリ（origin）がありません。git remote add origin &lt;URL&gt; → git push で作られます。</div>;
  const open = world.hosting.pullRequests.filter((p) => p.state === 'open').length;
  const issues = (world.hosting.issues ?? []).filter((i) => i.state === 'open').length;
  return (
    <div className="flex h-full min-h-0 flex-col text-sm" data-testid="github">
      <div className="flex items-center gap-2 border-b border-white/40 px-3 py-1.5 dark:border-white/10">
        <span className="text-lg">🐙</span>
        <span className="font-mono font-bold">{repoSlug(world)}</span>
        <span className="rounded-full border border-slate-400/50 px-1.5 text-[10px] text-slate-500">模擬 GitHub</span>
        {readOnly && <span className="ml-auto text-xs text-sky-600">再生中（表示だけ）</span>}
      </div>
      <TabBar
        tabs={[
          ['code', '<> Code'],
          ['pulls', `⇄ Pull requests${open ? ` ${open}` : ''}`],
          ['issues', `◎ Issues${issues ? ` ${issues}` : ''}`],
          ['settings', '⚙ Settings'],
        ]}
        active={page.kind === 'pr' || page.kind === 'compare' ? 'pulls' : page.kind}
        onChange={(k) => setPage({ kind: k as 'code' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {page.kind === 'code' && <CodePage repo={repo} />}
        {page.kind === 'pulls' && <PullsPage world={world} onOpen={(n) => setPage({ kind: 'pr', number: n })} onNew={() => setPage({ kind: 'compare' })} readOnly={readOnly} />}
        {page.kind === 'compare' && <ComparePage world={world} onCreated={(n) => setPage({ kind: 'pr', number: n })} />}
        {page.kind === 'pr' && <PrPage world={world} number={page.number} onBack={() => setPage({ kind: 'pulls' })} readOnly={readOnly} />}
        {page.kind === 'issues' && <IssuesPage world={world} />}
        {page.kind === 'settings' && <SettingsPage world={world} readOnly={readOnly} />}
      </div>
    </div>
  );
}

function CodePage({ repo }: { repo: RepoState }) {
  const [branch, setBranch] = useState(defaultBranch(repo));
  const tip = repo.refs.heads[branch];
  const files = tip ? Object.keys(commitFiles(repo, tip)).sort() : [];
  const [file, setFile] = useState<string | null>(null);
  const log = tip ? walkLog(repo, [tip]).slice(0, 8) : [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="glass-input py-1 font-mono text-xs" aria-label="ブランチ">
          {Object.keys(repo.refs.heads).sort().map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500">{Object.keys(repo.refs.heads).length} branches</span>
      </div>
      {!tip ? (
        <Box>このリポジトリは空です。git push で最初のコミットを送りましょう。</Box>
      ) : (
        <>
          <Box title={`${short(tip)} ${subject(getCommit(repo, tip).message)}`}>
            <ul className="divide-y divide-white/40 dark:divide-white/10">
              {files.map((f) => (
                <li key={f}>
                  <button type="button" className="w-full px-1 py-1 text-left font-mono text-xs hover:underline" onClick={() => setFile(file === f ? null : f)}>
                    📄 {f}
                  </button>
                  {file === f && <pre className="mb-1 overflow-x-auto rounded bg-slate-950/80 p-2 text-xs text-slate-100">{getBlob(repo, commitFiles(repo, tip)[f])}</pre>}
                </li>
              ))}
            </ul>
          </Box>
          <Box title="Commits">
            <ul className="space-y-1 text-xs">
              {log.map((o) => {
                const c = getCommit(repo, o);
                return (
                  <li key={o} className="flex gap-2">
                    <code className="text-sky-700 dark:text-sky-300">{short(o)}</code>
                    <span className="flex-1 truncate">{subject(c.message)}</span>
                    <span className="text-slate-500">{c.author.name}</span>
                  </li>
                );
              })}
            </ul>
          </Box>
        </>
      )}
    </div>
  );
}

function stateBadge(pr: PullRequest) {
  if (pr.state === 'merged') return <Badge tone="purple">Merged</Badge>;
  if (pr.state === 'closed') return <Badge tone="red">Closed</Badge>;
  return pr.draft ? <Badge tone="gray">Draft</Badge> : <Badge tone="green">Open</Badge>;
}

function PullsPage({ world, onOpen, onNew, readOnly }: { world: World; onOpen(n: number): void; onNew(): void; readOnly?: boolean }) {
  const [state, setState] = useState<'open' | 'closed'>('open');
  const prs = world.hosting.pullRequests.filter((p) => (state === 'open' ? p.state === 'open' : p.state !== 'open')).slice().reverse();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" className={`text-xs ${state === 'open' ? 'font-bold' : 'text-slate-500'}`} onClick={() => setState('open')}>
          ● {world.hosting.pullRequests.filter((p) => p.state === 'open').length} Open
        </button>
        <button type="button" className={`text-xs ${state === 'closed' ? 'font-bold' : 'text-slate-500'}`} onClick={() => setState('closed')}>
          ✓ {world.hosting.pullRequests.filter((p) => p.state !== 'open').length} Closed
        </button>
        {!readOnly && (
          <button type="button" className="ml-auto rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500" onClick={onNew} data-testid="new-pr">
            New pull request
          </button>
        )}
      </div>
      <Box>
        {prs.length ? (
          <ul className="divide-y divide-white/40 dark:divide-white/10">
            {prs.map((p) => (
              <li key={p.number}>
                <button type="button" className="flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-white/30 dark:hover:bg-white/5" onClick={() => onOpen(p.number)}>
                  {stateBadge(p)}
                  <span className="flex-1 font-bold">{p.title}</span>
                  <span className="text-xs text-slate-500">
                    #{p.number} · {p.author} · {p.head} → {p.base}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-4 text-center text-xs text-slate-500">{state === 'open' ? 'オープン中の PR はありません。ブランチを push して「New pull request」から作ります（gh pr create でも作れます）。' : 'まだありません。'}</div>
        )}
      </Box>
    </div>
  );
}

function ComparePage({ world, onCreated }: { world: World; onCreated(n: number): void }) {
  const repo = world.remotes.origin!;
  const branches = Object.keys(repo.refs.heads).sort();
  const [base, setBase] = useState(defaultBranch(repo));
  const [head, setHead] = useState(branches.find((b) => b !== base) ?? '');
  const tip = repo.refs.heads[head];
  const [title, setTitle] = useState(tip ? subject(getCommit(repo, tip).message) : '');
  const [body, setBody] = useState('');
  const draft: PullRequest = { number: 0, title, body, author: ME, head, base, state: 'open', reviews: [], comments: [], createdAt: 0 };
  const commits = head && head !== base ? prCommits(repo, draft) : [];
  return (
    <div className="space-y-3">
      <h3 className="font-bold">Open a pull request</h3>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>
          base:{' '}
          <select value={base} onChange={(e) => setBase(e.target.value)} className="glass-input py-1 font-mono" aria-label="base">
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <span>←</span>
        <label>
          compare:{' '}
          <select
            value={head}
            onChange={(e) => {
              setHead(e.target.value);
              const t = repo.refs.heads[e.target.value];
              if (t) setTitle(subject(getCommit(repo, t).message));
            }}
            className="glass-input py-1 font-mono"
            aria-label="compare"
          >
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <span className="text-slate-500">{commits.length} commits</span>
      </div>
      {!commits.length && <Box>{head === base ? 'base と compare が同じブランチです。' : `${head} には ${base} にないコミットがありません。`}</Box>}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="glass-input w-full py-1.5" aria-label="PR のタイトル" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a description（Closes #1 と書くと、マージ時に Issue #1 が閉じます）" rows={4} className="glass-input w-full py-1.5" aria-label="PR の説明" />
      <button
        type="button"
        disabled={!commits.length || !title.trim()}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
        onClick={() => {
          let n = 0;
          if (act(`PR「${title}」を作成`, (ctx) => void (n = openPr(ctx, { title: title.trim(), body, head, base }).number))) onCreated(n);
        }}
        data-testid="create-pr"
      >
        Create pull request
      </button>
    </div>
  );
}

function DiffView({ before, after, comments }: { before: string | null; after: string | null; comments: PullRequest['comments'] }) {
  const ops = lineOps(before ?? '', after ?? '');
  let line = 0;
  return (
    <pre className="overflow-x-auto text-xs leading-5">
      {ops.map((o, i) => {
        if (o.type !== '-') line++;
        const here = o.type !== '-' ? comments.filter((c) => c.line === line) : [];
        return (
          <div key={i}>
            <div className={o.type === '+' ? 'bg-emerald-500/15' : o.type === '-' ? 'bg-rose-500/15' : ''}>
              <span className="inline-block w-8 pr-2 text-right text-slate-400 select-none">{o.type === '-' ? '' : line}</span>
              <span className="select-none">{o.type === ' ' ? ' ' : o.type}</span>
              {o.line}
            </div>
            {here.map((c, j) => (
              <div key={j} className="my-1 ml-10 rounded-lg border border-amber-300/60 bg-amber-50/80 px-2 py-1 font-sans whitespace-normal text-slate-800 dark:bg-amber-500/10 dark:text-slate-100">
                <b>{c.author}</b>: {c.body}
              </div>
            ))}
          </div>
        );
      })}
    </pre>
  );
}

const METHOD_LABEL: Record<MergeMethod, [string, string]> = {
  merge: ['Create a merge commit', 'マージコミットで2本の線を合流させます（履歴がそのまま残る）'],
  squash: ['Squash and merge', 'PR のコミットを1つにまとめて main に載せます'],
  rebase: ['Rebase and merge', 'PR のコミットを1つずつ main の先に付け直します（マージコミットなし）'],
};

function PrPage({ world, number, onBack, readOnly }: { world: World; number: number; onBack(): void; readOnly?: boolean }) {
  const [tab, setTab] = useState('conversation');
  const allowed = world.hosting.mergeMethods ?? ['merge', 'squash', 'rebase'];
  const [method, setMethod] = useState<MergeMethod>(allowed[0]);
  const [review, setReview] = useState('');
  const [comment, setComment] = useState('');
  const pr = world.hosting.pullRequests.find((p) => p.number === number);
  const repo = world.remotes.origin!;
  if (!pr) return <Box>PR #{number} は見つかりません。</Box>;
  const commits = prCommits(repo, pr);
  const files = prFiles(repo, pr);
  const checks = prChecks(world, pr);
  const blockers = mergeBlockers(world, pr);
  const owners = codeOwners(repo, pr);
  const reviews = latestReviews(pr);
  const mine = pr.author === ME;
  const timeline = [...pr.reviews.map((r) => ({ ...r, kind: 'review' as const })), ...pr.comments.filter((c) => !c.path).map((c) => ({ ...c, kind: 'comment' as const }))].sort((a, b) => a.time - b.time);
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-slate-500 hover:underline">
        ← Pull requests
      </button>
      <div>
        <h3 className="text-base font-bold">
          {pr.title} <span className="font-normal text-slate-500">#{pr.number}</span>
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {stateBadge(pr)}
          <span>
            <b>{pr.author}</b> {pr.state === 'merged' ? 'merged' : 'wants to merge'} {commits.length} commit{commits.length === 1 ? '' : 's'} into <code className="rounded bg-sky-500/10 px-1">{pr.base}</code> from <code className="rounded bg-sky-500/10 px-1">{pr.head}</code>
          </span>
        </div>
      </div>
      <TabBar
        tabs={[
          ['conversation', 'Conversation'],
          ['commits', `Commits ${commits.length}`],
          ['files', `Files changed ${files.length}`],
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'conversation' && (
        <div className="space-y-3">
          <Box title={<><Avatar name={pr.author} /> {pr.author}</>}>
            <div className="whitespace-pre-wrap">{pr.body || <span className="text-slate-500">No description provided.</span>}</div>
          </Box>
          {timeline.map((t, i) => (
            <Box key={i} title={<><Avatar name={t.author} /> {t.author} {t.kind === 'review' ? ({ approved: <Badge tone="green">approved</Badge>, changes_requested: <Badge tone="red">requested changes</Badge>, commented: <Badge tone="gray">reviewed</Badge> }[t.state]) : 'commented'}</>}>
              {t.body && <div className="whitespace-pre-wrap">{t.body}</div>}
            </Box>
          ))}
          {pr.comments.some((c) => c.path) && <div className="text-xs text-slate-500">ファイルの行へのコメントは「Files changed」タブに表示されます。</div>}
          <Box title="Checks">
            <ul className="space-y-1 text-xs">
              {checks.map((c) => (
                <li key={c.name} className={c.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
                  {c.ok ? '✓' : '✗'} {c.name}
                  {c.description && <span className="text-slate-500"> — {c.description}</span>} · {c.detail}
                </li>
              ))}
              {owners.length > 0 && <li className="text-slate-600 dark:text-slate-300">👥 Code owners: {owners.map((o) => `@${o}`).join(', ')}</li>}
              {reviews.map((r) => (
                <li key={r.author}>
                  {r.state === 'approved' ? '✓' : '✗'} {r.author} {r.state === 'approved' ? 'approved' : 'requested changes'}
                </li>
              ))}
            </ul>
          </Box>
          {pr.state === 'open' && !readOnly && (
            <Box title="Merge">
              {blockers.length ? (
                <ul className="mb-2 space-y-0.5 text-xs text-rose-700 dark:text-rose-300">
                  {blockers.map((b) => (
                    <li key={b}>✗ {b}</li>
                  ))}
                </ul>
              ) : (
                <div className="mb-2 text-xs text-emerald-700 dark:text-emerald-300">✓ This branch has no conflicts with the base branch（マージできます）</div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select value={method} onChange={(e) => setMethod(e.target.value as MergeMethod)} className="glass-input py-1 text-xs" aria-label="マージ方式">
                  {allowed.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m][0]}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={blockers.length > 0} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40" onClick={() => act(`PR #${pr.number} を ${method} でマージ`, (ctx) => void mergePr(ctx, pr.number, method))} data-testid="merge-pr">
                  {METHOD_LABEL[method][0]}
                </button>
                <button type="button" className="glass-btn px-2 py-1 text-xs" onClick={() => act(`PR #${pr.number} をクローズ`, (ctx) => closePr(ctx, pr.number))}>
                  Close pull request
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-500">{METHOD_LABEL[method][1]}</div>
            </Box>
          )}
          {pr.state === 'merged' && pr.merged && (
            <Box>
              <div className="text-xs">
                <Badge tone="purple">Merged</Badge> {pr.merged.by} merged commit <code>{short(pr.merged.oid)}</code> into {pr.base}（{METHOD_LABEL[pr.merged.method][0]}）
              </div>
              {!readOnly && repo.refs.heads[pr.head] && !protectionOf(world, pr.head) && (
                <button type="button" className="glass-btn mt-2 px-2 py-1 text-xs" onClick={() => act(`ブランチ ${pr.head} を削除`, (ctx) => deleteRemoteBranch(ctx, pr.head))}>
                  Delete branch
                </button>
              )}
            </Box>
          )}
          {pr.state === 'open' && !readOnly && (
            <Box title="Review / Comment">
              <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={2} placeholder="コメント" className="glass-input w-full py-1 text-xs" aria-label="レビューのコメント" />
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button" className="glass-btn px-2 py-1 text-xs" disabled={!review.trim()} onClick={() => act(`PR #${pr.number} にコメント`, (ctx) => commentPr(ctx, pr.number, { body: review.trim() })) && setReview('')}>
                  Comment
                </button>
                <button type="button" className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-40" disabled={mine} title={mine ? '自分の PR は承認できません' : ''} onClick={() => act(`PR #${pr.number} を承認`, (ctx) => reviewPr(ctx, pr.number, { state: 'approved', body: review.trim() })) && setReview('')} data-testid="approve-pr">
                  Approve
                </button>
                <button type="button" className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-40" disabled={mine || !review.trim()} onClick={() => act(`PR #${pr.number} に修正を依頼`, (ctx) => reviewPr(ctx, pr.number, { state: 'changes_requested', body: review.trim() })) && setReview('')}>
                  Request changes
                </button>
              </div>
              {mine && <div className="mt-1 text-xs text-slate-500">自分の PR は Approve / Request changes できません（GitHub と同じ）。</div>}
            </Box>
          )}
        </div>
      )}
      {tab === 'commits' && (
        <Box>
          <ul className="space-y-1 text-xs">
            {commits.map((o) => (
              <li key={o} className="flex gap-2">
                <code className="text-sky-700 dark:text-sky-300">{short(o)}</code>
                <span className="flex-1">{subject(getCommit(repo, o).message)}</span>
                <span className="text-slate-500">{getCommit(repo, o).author.name}</span>
              </li>
            ))}
            {!commits.length && <li className="text-slate-500">{pr.state === 'merged' ? 'マージ済み（squash / rebase では元のコミットは base に載りません）' : 'コミットがありません'}</li>}
          </ul>
        </Box>
      )}
      {tab === 'files' && (
        <div className="space-y-2">
          {files.map((f) => (
            <Box key={f.path} title={<span className="font-mono">{f.path}{f.before === null ? '（新規）' : f.after === null ? '（削除）' : ''}</span>}>
              <DiffView before={f.before} after={f.after} comments={pr.comments.filter((c) => c.path === f.path)} />
            </Box>
          ))}
          {!files.length && <Box>差分はありません。</Box>}
          {pr.state === 'open' && !readOnly && (
            <Box title="行にコメントする">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="例: login.ts:3 ここはエラー処理が必要です" className="glass-input w-full py-1 text-xs" aria-label="行コメント" />
              <button
                type="button"
                className="glass-btn mt-1 px-2 py-1 text-xs"
                disabled={!comment.trim()}
                onClick={() => {
                  const m = comment.match(/^(\S+):(\d+)\s+([\s\S]+)/);
                  if (act(`PR #${pr.number} にコメント`, (ctx) => commentPr(ctx, pr.number, m ? { path: m[1], line: Number(m[2]), body: m[3] } : { body: comment.trim() }))) setComment('');
                }}
              >
                Add comment
              </button>
              <div className="mt-1 text-xs text-slate-500">「ファイル名:行番号 コメント」と書くと、その行に付きます。</div>
            </Box>
          )}
        </div>
      )}
    </div>
  );
}

function IssuesPage({ world }: { world: World }) {
  const issues = (world.hosting.issues ?? []).slice().reverse();
  return (
    <Box>
      {issues.length ? (
        <ul className="divide-y divide-white/40 dark:divide-white/10">
          {issues.map((i) => (
            <li key={i.number} className="flex items-center gap-2 px-1 py-2">
              {i.state === 'open' ? <Badge tone="green">Open</Badge> : <Badge tone="purple">Closed</Badge>}
              <span className="flex-1 font-bold">{i.title}</span>
              <span className="text-xs text-slate-500">
                #{i.number} · {i.author}
                {i.closedBy ? ` · #${i.closedBy} で解決` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-4 text-center text-xs text-slate-500">Issue はありません。</div>
      )}
    </Box>
  );
}

function SettingsPage({ world, readOnly }: { world: World; readOnly?: boolean }) {
  const repo = world.remotes.origin!;
  const branch = defaultBranch(repo);
  const p = protectionOf(world, branch);
  const [form, setForm] = useState({ requirePullRequest: p?.requirePullRequest ?? true, requiredApprovals: p?.requiredApprovals ?? 1, requireStatusChecks: p?.requireStatusChecks ?? false, requireCodeOwnerReviews: p?.requireCodeOwnerReviews ?? false });
  const check = (key: 'requirePullRequest' | 'requireStatusChecks' | 'requireCodeOwnerReviews', label: string) => (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={form[key]} disabled={readOnly} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="accent-sky-500" />
      {label}
    </label>
  );
  return (
    <div className="space-y-3">
      <Box title={`Branch protection rule: ${branch}`}>
        <div className="space-y-1.5">
          {check('requirePullRequest', 'Require a pull request before merging（直接 push を禁止して PR 必須にする）')}
          <label className="flex items-center gap-2 pl-5 text-xs">
            Required approvals
            <input type="number" min={0} max={3} value={form.requiredApprovals} disabled={readOnly} onChange={(e) => setForm({ ...form, requiredApprovals: Number(e.target.value) })} className="glass-input w-14 py-0.5" aria-label="必要な承認数" />
          </label>
          {check('requireStatusChecks', 'Require status checks to pass（CI が通らないとマージできない）')}
          {check('requireCodeOwnerReviews', 'Require review from Code Owners（CODEOWNERS の人の承認が必要）')}
        </div>
        {!readOnly && (
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white" onClick={() => act(`${branch} のブランチ保護を保存`, (ctx) => setProtection(ctx, branch, form))} data-testid="save-protection">
              {p ? 'Save changes' : 'Create'}
            </button>
            {p && (
              <button type="button" className="glass-btn px-2 py-1 text-xs" onClick={() => act(`${branch} のブランチ保護を削除`, (ctx) => setProtection(ctx, branch, null))}>
                Delete rule
              </button>
            )}
          </div>
        )}
        <div className="mt-2 text-xs text-slate-500">{p ? `現在：保護あり（${p.requirePullRequest ? 'PR 必須' : 'PR 任意'}・承認 ${p.requiredApprovals ?? 0} 件${p.requireStatusChecks ? '・CI 必須' : ''}${p.requireCodeOwnerReviews ? '・Code owners' : ''}）` : '現在：保護なし（誰でも直接 push できます）'}</div>
      </Box>
    </div>
  );
}
