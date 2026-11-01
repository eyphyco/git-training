// 比較ビュー（F-12）の題材：同じ初期状態に、左右で別の操作をして結果の履歴を比べる。
import type { Setup } from '../engine/world';
import type { HostingEvent } from '../hosting/events';

export type Side = { label: string; steps: string[]; note: string };
export type ComparePreset = { id: string; title: string; summary: string; setup: Setup; events?: HostingEvent[]; left: Side; right: Side };

const diverged: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'README.md': '# app\n' } },
    { id: 'c2', parent: 'c1', msg: 'main: fix header', files: { 'header.html': '<h1>App</h1>\n' } },
    { id: 'f1', parent: 'c1', msg: 'feat: add login', files: { 'login.js': 'login()\n' } },
    { id: 'f2', parent: 'f1', msg: 'feat: login form', files: { 'login.html': '<form></form>\n' } },
  ],
  branches: { main: 'c2', feature: 'f2' },
};

export const PRESETS: ComparePreset[] = [
  {
    id: 'merge-rebase',
    title: 'merge と rebase',
    summary: '分かれた feature を main に取り込むとき、merge は合流の記録を残し、rebase は一直線に付け直します。',
    setup: diverged,
    left: { label: 'merge', steps: ['git merge feature'], note: 'マージコミットができ、2本の線が合流します。元のコミットはそのまま。' },
    right: { label: 'rebase してから fast-forward', steps: ['git switch feature', 'git rebase main', 'git switch main', 'git merge feature'], note: 'feature のコミットが main の先に作り直され（ID が変わる）、履歴が一直線になります。' },
  },
  {
    id: 'merge-squash',
    title: 'GitHub の merge と squash',
    summary: '同じ PR を「Create a merge commit」と「Squash and merge」でマージし、git pull した後の手元の履歴を比べます。',
    setup: {
      commits: [{ id: 'c1', msg: 'init', files: { 'README.md': '# app\n' } }],
      branches: { main: 'c1' },
      remotes: { origin: { url: 'https://github.com/you/project.git', branches: { main: 'c1' } } },
    },
    events: [{ type: 'openPr', author: 'Sato', head: 'feature/search', title: '検索機能', message: 'add search box', files: { 'search.js': 'search()\n' } }],
    left: { label: 'Create a merge commit', steps: ['gh pr merge 1 --merge', 'git pull'], note: 'PR のコミットとマージコミットが main に入ります。' },
    right: { label: 'Squash and merge', steps: ['gh pr merge 1 --squash', 'git pull'], note: 'PR の変更が1つのコミットにまとまって main に入ります（PR 側のコミットは main に載りません）。' },
  },
  {
    id: 'reset-soft-hard',
    title: 'reset --soft と --hard',
    summary: '直前の2コミットを取り消します。--soft は変更をステージに残し、--hard は変更ごと消します。',
    setup: {
      commits: [
        { id: 'c1', msg: 'init', files: { 'a.txt': 'one\n' } },
        { id: 'c2', parent: 'c1', msg: 'wip 1', files: { 'a.txt': 'two\n' } },
        { id: 'c3', parent: 'c2', msg: 'wip 2', files: { 'b.txt': 'b\n' } },
      ],
      branches: { main: 'c3' },
    },
    left: { label: 'reset --soft', steps: ['git reset --soft HEAD~2', 'git status -s'], note: 'ブランチだけ戻り、変更はステージに残ります。1つのコミットにまとめ直すときに使います。' },
    right: { label: 'reset --hard', steps: ['git reset --hard HEAD~2', 'git status -s'], note: 'ワークツリーまで戻り、変更は消えます（reflog からなら戻せます）。' },
  },
  {
    id: 'revert-reset',
    title: 'push 済みの取り消し：revert と reset',
    summary: 'すでに push したバグのコミットを取り消します。共有した履歴は revert で「打ち消すコミット」を足すのが安全です。',
    setup: {
      commits: [
        { id: 'c1', msg: 'init', files: { 'app.js': 'ok\n' } },
        { id: 'c2', parent: 'c1', msg: 'add bug', files: { 'app.js': 'bug\n' } },
      ],
      branches: { main: 'c2' },
      remotes: { origin: { url: 'https://github.com/you/project.git', branches: { main: 'c2' } } },
    },
    left: { label: 'revert', steps: ['git revert HEAD', 'git push'], note: '打ち消すコミットが増えるだけなので、普通に push できます。' },
    right: { label: 'reset --hard', steps: ['git reset --hard HEAD~1', 'git push'], note: '手元の履歴が origin より古くなるため、push は拒否されます（--force が必要＝チームの履歴を壊す）。' },
  },
];
