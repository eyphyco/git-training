import { describe, expect, it } from 'vitest';
import { execute } from '../engine/run';
import { getCommit } from '../engine/model/objects';
import { createWorld, type Setup } from '../engine/world';
import type { CommandResult, World } from '../engine/model/types';
import { text } from '../engine/testing';
import { GH } from './gh';
import { applyHostingEvent } from './events';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'README.md': '# app\n' } },
    { id: 'f1', parent: 'c1', msg: 'add login', files: { 'login.ts': 'login\n' } },
  ],
  branches: { main: 'c1', feature: 'f1' },
  head: 'feature',
  remotes: { origin: { url: 'https://github.com/you/project.git', branches: { main: 'c1' } } },
};

function run(world: World, lines: string[]): CommandResult {
  let r: CommandResult = { world, output: [], events: [], ok: true };
  for (const l of lines) {
    r = execute(r.world, l, { programs: { gh: GH } });
    if (!r.ok && l !== lines[lines.length - 1]) throw new Error(`${l}\n${text(r)}`);
  }
  return r;
}
const start = (s: Setup = setup) => createWorld(s).world;
const opened = () => run(start(), ['git push -u origin feature', 'gh pr create --title "ログイン機能" --body "Closes #1"']);

describe('gh pr create', () => {
  it('push 済みのブランチから PR を作り、URL を表示する', () => {
    const r = opened();
    expect(text(r)).toBe('https://github.com/you/project/pull/1');
    expect(r.world.hosting.pullRequests[0]).toMatchObject({ number: 1, title: 'ログイン機能', head: 'feature', base: 'main', state: 'open', author: 'you' });
  });
  it('push 前ならエラー、--fill でコミットメッセージを使う', () => {
    expect(text(run(start(), ['gh pr create --title x']))).toContain('No commits between main and feature');
    expect(run(start(), ['git push -u origin feature', 'gh pr create --fill']).world.hosting.pullRequests[0].title).toBe('add login');
  });
  it('同じブランチの PR は2つ作れない', () => {
    expect(text(run(opened().world, ['gh pr create --title again']))).toContain('already exists');
  });
});

describe('gh pr list / view / checks', () => {
  it('一覧と詳細', () => {
    const w = opened().world;
    expect(text(run(w, ['gh pr list']))).toMatch(/Showing 1 of 1 open pull request in you\/project\n\nID\s+TITLE\s+BRANCH\n#1\s+ログイン機能\s+feature/);
    const v = text(run(w, ['gh pr view']));
    expect(v).toContain('ログイン機能 #1');
    expect(v).toContain('Open • you wants to merge 1 commit into main from feature');
    expect(text(run(w, ['gh pr checks 1']))).toMatch(/^test\tpass/);
  });
});

describe('gh pr review / merge', () => {
  it('自分の PR は approve できない', () => {
    expect(text(run(opened().world, ['gh pr review --approve']))).toContain('Can not approve your own pull request');
  });
  it('merge：マージコミットを作り、Issue を閉じ、--delete-branch で後片付け', () => {
    let w = opened().world;
    w = { ...w, hosting: { ...w.hosting, issues: [{ number: 1, title: 'login', body: '', author: 'sato', state: 'open' }] } };
    const r = run(w, ['gh pr merge --merge --delete-branch']);
    expect(r.ok).toBe(true);
    const origin = r.world.remotes.origin;
    const m = getCommit(origin, origin.refs.heads.main);
    expect(m.message).toBe('Merge pull request #1 from you/feature\n\nログイン機能');
    expect(m.committer.name).toBe('GitHub');
    expect(origin.refs.heads.feature).toBeUndefined();
    expect(r.world.hosting.issues![0].state).toBe('closed');
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'main' });
    expect(r.world.local.refs.heads.feature).toBeUndefined();
    expect(text(r)).toContain('✓ Merged pull request #1 (ログイン機能)');
  });
  it('squash：1つのコミットにまとめる', () => {
    const r = run(opened().world, ['gh pr merge 1 --squash']);
    const origin = r.world.remotes.origin;
    const c = getCommit(origin, origin.refs.heads.main);
    expect(c.parents).toHaveLength(1);
    expect(c.message).toBe('ログイン機能 (#1)');
    expect(c.author.name).toBe('You');
  });
  it('rebase：コミットを付け直す（作者はそのまま）', () => {
    const r = run(opened().world, ['gh pr merge 1 --rebase']);
    const origin = r.world.remotes.origin;
    const c = getCommit(origin, origin.refs.heads.main);
    expect(c.message).toBe('add login');
    expect(c.committer.name).toBe('GitHub');
  });
  it('ブランチ保護：承認と CI がないとマージできない', () => {
    let w = opened().world;
    w = { ...w, hosting: { ...w.hosting, protections: [{ branch: 'main', requirePullRequest: true, requiredApprovals: 1, requireStatusChecks: true }], ci: [{ name: 'test', failIf: { path: 'login.ts', contains: 'login' } }] } };
    const r = run(w, ['gh pr merge --squash']);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain('Review required');
    expect(text(r)).toContain('CI が失敗しています');
    const approved = applyHostingEvent(w, { type: 'review', author: 'Sato', state: 'approved' });
    const fixed = run(approved.world, ['echo ok > login.ts', 'git commit -am fix', 'git push']);
    expect(run(fixed.world, ['gh pr merge --squash']).ok).toBe(true);
  });
  it('保護された main へ直接 push すると拒否される', () => {
    const w = start({ ...setup, head: 'main' });
    const p = { ...w, hosting: { ...w.hosting, protections: [{ branch: 'main', requirePullRequest: true }] } };
    const r = run(p, ['echo x > x.txt', 'git add x.txt', 'git commit -m x', 'git push origin main']);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain('GH006: Protected branch update failed');
  });
});

describe('ボットのイベント', () => {
  it('同僚が PR を作り、gh pr checkout でレビュー用に取り込める', () => {
    const e = applyHostingEvent(start(), { type: 'openPr', author: 'Sato', head: 'fix/typo', title: 'typo 修正', message: 'fix typo', files: { 'README.md': '# App\n' } });
    expect(e.world.hosting.pullRequests[0]).toMatchObject({ author: 'sato', head: 'fix/typo' });
    const r = run(e.world, ['gh pr checkout 1']);
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'fix/typo' });
    expect(r.world.local.workingTree['README.md']).toBe('# App\n');
    expect(run(r.world, ['gh pr review 1 --approve']).world.hosting.pullRequests[0].reviews[0]).toMatchObject({ author: 'you', state: 'approved' });
  });
  it('修正依頼のレビューを付けられる', () => {
    const e = applyHostingEvent(opened().world, { type: 'review', author: 'Sato', state: 'changes_requested', body: 'テストを足してください', comments: [{ path: 'login.ts', line: 1, body: 'ここ' }] });
    expect(e.world.hosting.pullRequests[0].reviews[0].state).toBe('changes_requested');
    expect(e.world.hosting.pullRequests[0].comments[0]).toMatchObject({ path: 'login.ts', author: 'sato' });
  });
});
