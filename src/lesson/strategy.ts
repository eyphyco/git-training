// ブランチ戦略シミュレータ（F-13）：戦略ごとのブランチ構成・保護と、操作のたびのルール違反の判定。
import { ancestors } from '../engine/model/refs';
import type { BranchProtection, GitEvent, Oid, World } from '../engine/model/types';
import type { Setup } from '../engine/world';

export type StrategyId = NonNullable<World['hosting']['strategy']>;

export type Strategy = {
  id: StrategyId;
  name: string;
  summary: string;
  /** 長く使うブランチと役割 */
  branches: { name: string; role: string }[];
  /** 作業用ブランチの名前の付け方 */
  naming: string[];
  rules: string[];
  protections: BranchProtection[];
  /** 向いているチーム */
  fits: string;
};

export const STRATEGIES: Record<StrategyId, Strategy> = {
  'github-flow': {
    id: 'github-flow',
    name: 'GitHub Flow',
    summary: 'main だけを長く使い、作業はすべて短いブランチ → PR → main へマージ。main は常にデプロイできる状態に保つ。',
    branches: [{ name: 'main', role: '常にデプロイ可能。直接コミットしない' }],
    naming: ['feature/〜、fix/〜 など（main から作る）'],
    rules: ['main に直接コミット・push しない', '作業ブランチは main から作る', 'マージは PR 経由'],
    protections: [{ branch: 'main', requirePullRequest: true }],
    fits: 'Web サービスなど、こまめにデプロイするチーム',
  },
  'git-flow': {
    id: 'git-flow',
    name: 'Git Flow',
    summary: 'main（リリース済み）と develop（開発の統合先）の2本を長く使う。機能は feature/、リリース準備は release/、緊急修正は hotfix/。',
    branches: [
      { name: 'main', role: 'リリースしたものだけ。タグ（v1.0.0）を付ける' },
      { name: 'develop', role: '次のリリースに向けた開発の統合先' },
    ],
    naming: ['feature/〜：develop から作り、develop にマージ', 'release/〜：develop から作り、main と develop にマージ', 'hotfix/〜：main から作り、main と develop にマージ'],
    rules: ['main・develop に直接コミットしない（マージだけ）', 'feature/ は develop から作り、develop にマージする', 'main にマージしてよいのは release/ と hotfix/ だけ', 'hotfix/ は main から作る'],
    protections: [
      { branch: 'main', requirePullRequest: true },
      { branch: 'develop', requirePullRequest: true },
    ],
    fits: 'バージョンを決めて定期的にリリースする製品（アプリ・パッケージ）',
  },
  'gitlab-flow': {
    id: 'gitlab-flow',
    name: 'GitLab Flow（環境ブランチ）',
    summary: 'main で開発し、環境ごとのブランチ（production など）へ「上流から下流へ」マージして反映する。',
    branches: [
      { name: 'main', role: '開発の統合先（ステージング環境）' },
      { name: 'production', role: '本番環境。main からのマージだけで更新' },
    ],
    naming: ['feature/〜（main から作る）'],
    rules: ['production に直接コミットしない', 'production にマージしてよいのは main だけ（upstream first）', '修正はまず main に入れてから production へ'],
    protections: [
      { branch: 'main', requirePullRequest: true },
      { branch: 'production', requirePullRequest: true },
    ],
    fits: '本番に出すタイミングを開発と分けたいチーム',
  },
  trunk: {
    id: 'trunk',
    name: 'トランクベース開発',
    summary: '全員が main（trunk）に小さな変更をこまめに統合する。ブランチを作るなら数時間〜1日で消す。未完成の機能はフィーチャーフラグで隠す。',
    branches: [{ name: 'main', role: '唯一の長いブランチ。CI が常に緑' }],
    naming: ['作るなら短命なブランチ（1〜2コミット）'],
    rules: ['ブランチは短命に（main に入っていないコミットが3つを超えたら警告）', 'main から長く離れない'],
    protections: [],
    fits: 'CI とテストが充実し、1日に何度もリリースするチーム',
  },
};

/** 戦略シミュレータの初期状態 */
export function strategySetup(id: StrategyId): Setup {
  const s = STRATEGIES[id];
  const commits = [{ id: 'c1', msg: 'init', files: { 'README.md': '# Product\n', 'app.js': 'app()\n' } }];
  const branches: Record<string, string> = Object.fromEntries(s.branches.map((b) => [b.name, 'c1']));
  return {
    commits,
    branches,
    head: 'main',
    remotes: { origin: { url: 'https://github.com/team/product.git', branches } },
    hosting: { strategy: id, protections: s.protections },
  };
}

const ownCommits = (w: World, branch: string): number => {
  const repo = w.local;
  const tip = repo.refs.heads[branch];
  const main = repo.refs.heads.main;
  if (!tip || !main) return 0;
  const inMain = ancestors(repo, main);
  return [...ancestors(repo, tip)].filter((o) => !inMain.has(o)).length;
};

/** 枝分かれした元のブランチ名（作った瞬間の位置が、どの長期ブランチの先端と同じか） */
function createdFrom(w: World, oid: Oid): string | null {
  for (const b of ['develop', 'main', 'production']) if (w.local.refs.heads[b] === oid) return b;
  return null;
}

/** 1回の操作で起きたルール違反（日本語の説明） */
export function findViolations(before: World, after: World, events: GitEvent[]): string[] {
  const id = after.hosting.strategy;
  if (!id) return [];
  const out: string[] = [];
  const name = STRATEGIES[id].name;
  const longLived = STRATEGIES[id].branches.map((b) => b.name);
  for (const e of events) {
    if (e.type === 'COMMIT_CREATED' && e.parents.length < 2 && e.branch && longLived.includes(e.branch) && id !== 'trunk')
      out.push(`${name}：${e.branch} に直接コミットしました。作業用のブランチを作って、そこでコミットします。`);
    if (e.type === 'BRANCH_CREATED') {
      const from = e.from?.replace(/^origin\//, '') ?? createdFrom(before, e.oid);
      if (id === 'git-flow' && e.name.startsWith('feature/') && from !== 'develop') out.push(`${name}：feature/ ブランチは develop から作ります（今は ${from ?? 'develop 以外'} から作りました）。`);
      if (id === 'git-flow' && e.name.startsWith('release/') && from !== 'develop') out.push(`${name}：release/ ブランチは develop から作ります。`);
      if (id === 'git-flow' && e.name.startsWith('hotfix/') && from !== 'main') out.push(`${name}：hotfix/ ブランチは main（リリース済みのもの）から作ります。`);
    }
    // マージ先と取り込んだブランチ（ローカルの merge と、GitHub 上の PR のマージ）
    let merge: { into: string; theirs: string } | null = null;
    if (e.type === 'MERGE_COMMIT') merge = { into: before.local.head.type === 'symbolic' ? before.local.head.ref : '', theirs: e.theirs };
    if (e.type === 'MERGE_FAST_FORWARD') merge = { into: e.branch, theirs: e.theirs ?? '' };
    if (e.type === 'PR_MERGED') {
      const pr = after.hosting.pullRequests.find((p) => p.number === e.number);
      if (pr) merge = { into: pr.base, theirs: pr.head };
    }
    if (merge) {
      const theirs = merge.theirs.replace(/^origin\//, '');
      if (id === 'git-flow' && merge.into === 'main' && !/^(release|hotfix)\//.test(theirs)) out.push(`${name}：main にマージしてよいのは release/ と hotfix/ だけです（${merge.theirs} をマージしました）。`);
      if (id === 'git-flow' && merge.into === 'develop' && theirs === 'main') out.push(`${name}：develop に main をマージするのではなく、release/ や hotfix/ を develop にもマージします。`);
      if (id === 'gitlab-flow' && merge.into === 'production' && theirs !== 'main') out.push(`${name}：production には main からだけマージします（upstream first）。${merge.theirs} をマージしました。`);
    }
    if (e.type === 'PUSHED' && id !== 'trunk')
      for (const u of e.updates) if (u.to && longLived.includes(u.ref) && before.remotes.origin?.refs.heads[u.ref] !== u.to && !before.hosting.protections.some((p) => p.branch === u.ref)) out.push(`${name}：${u.ref} に直接 push しました。PR を通してマージします。`);
  }
  if (id === 'trunk' && events.some((e) => e.type === 'COMMIT_CREATED'))
    for (const b of Object.keys(after.local.refs.heads)) if (b !== 'main' && ownCommits(after, b) > 3 && ownCommits(before, b) <= 3) out.push(`${name}：${b} に main に入っていないコミットが ${ownCommits(after, b)} 個あります。こまめに main に統合しましょう（ブランチは短命に）。`);
  return out;
}
