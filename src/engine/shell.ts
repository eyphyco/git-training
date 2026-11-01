// git 以外の最小限のシェルコマンド（ファイルの作成・確認用）。
import { fail, type Ctx } from './command';
import { cwdOf, enterWorktree, resolvePath } from './worktrees';
import { HOOK_DIR } from './hooks';

export type ShellDef = { name: string; run(ctx: Ctx, args: string[]): void };

function writeFile(ctx: Ctx, path: string, content: string) {
  const p = path.replace(/^\.\//, '');
  if (!p || p.endsWith('/') || p.startsWith('/') || p.split('/').includes('..')) fail(`${path}: 不正なパスです`, 'プロジェクトフォルダ内の相対パスで指定してください。');
  if (p.startsWith(HOOK_DIR) && p.length > HOOK_DIR.length && !p.slice(HOOK_DIR.length).includes('/')) {
    ctx.repo.hooks ??= {};
    ctx.repo.hooks[p.slice(HOOK_DIR.length)] = content;
    return;
  }
  if (p === '.git' || p.startsWith('.git/')) fail(`${path}: .git フォルダの中は直接触れません`, 'hooks は .git/hooks/pre-commit のように書けます。中身は内部構造ビューで見られます。');
  const created = !(p in ctx.repo.workingTree);
  ctx.repo.workingTree[p] = content;
  ctx.emit({ type: 'FILE_WRITTEN', path: p, created });
}

function topEntries(ctx: Ctx, all: boolean): string[] {
  const names = new Set<string>();
  for (const p of Object.keys(ctx.repo.workingTree)) {
    const [first, ...rest] = p.split('/');
    names.add(rest.length ? `${first}/` : first);
  }
  if (all && ctx.repo.initialized) names.add('.git/');
  return [...names].filter((n) => all || !n.startsWith('.')).sort();
}

/** .git の中の、文字だけのファイル（HEAD と refs）を読む（第8章） */
function gitFile(ctx: Ctx, p: string): string | undefined {
  const repo = ctx.repo;
  if (p === '.git/HEAD') return repo.head.type === 'symbolic' ? `ref: refs/heads/${repo.head.ref}\n` : `${repo.head.oid}\n`;
  const m = p.match(/^\.git\/refs\/(heads|tags)\/(.+)$/);
  if (m) {
    const oid = m[1] === 'heads' ? repo.refs.heads[m[2]] : repo.refs.tags[m[2]];
    return oid ? `${oid}\n` : undefined;
  }
  const r = p.match(/^\.git\/refs\/remotes\/([^/]+)\/(.+)$/);
  if (r) {
    const oid = repo.refs.remotes[r[1]]?.[r[2]];
    return oid ? `${oid}\n` : undefined;
  }
  if (p.startsWith('.git/objects/')) fail(`cat: ${p}: オブジェクトは zlib で圧縮された形で保存されています`, '中身は git cat-file -p <ID> で見ます。');
  return undefined;
}

export const SHELL: Record<string, ShellDef> = {
  ls: {
    name: 'ls',
    run(ctx, args) {
      const all = args.some((a) => /^-\w*a/.test(a));
      const dir = args.find((a) => !a.startsWith('-'))?.replace(/\/$/, '');
      if (dir === '.git/hooks') return ctx.out(Object.keys(ctx.repo.hooks ?? {}).sort().join('  '));
      if (dir) {
        const hits = Object.keys(ctx.repo.workingTree).filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1).split('/')[0]);
        if (!hits.length) fail(`ls: cannot access '${dir}': No such file or directory`);
        ctx.out([...new Set(hits)].sort().join('  '));
        return;
      }
      const entries = topEntries(ctx, all);
      if (entries.length) ctx.out(entries.join('  '), 'cyan');
    },
  },
  cat: {
    name: 'cat',
    run(ctx, args) {
      if (!args.length) fail('cat: ファイル名を指定してください');
      for (const a of args) {
        const p = a.replace(/^\.\//, '');
        const c = p.startsWith(HOOK_DIR) ? ctx.repo.hooks?.[p.slice(HOOK_DIR.length)] : p.startsWith('.git/') ? gitFile(ctx, p) : ctx.repo.workingTree[p];
        if (c === undefined) fail(`cat: ${a}: No such file or directory`);
        for (const l of c.replace(/\n$/, '').split('\n')) ctx.out(l);
      }
    },
  },
  echo: {
    name: 'echo',
    run(ctx, args) {
      const text = args.join(' ');
      if (!ctx.redirect) return ctx.out(text);
      const p = ctx.redirect.path.replace(/^\.\//, '');
      const prev = (p.startsWith(HOOK_DIR) ? ctx.repo.hooks?.[p.slice(HOOK_DIR.length)] : ctx.repo.workingTree[p]) ?? '';
      writeFile(ctx, p, ctx.redirect.op === '>>' ? `${prev}${text}\n` : `${text}\n`);
    },
  },
  touch: {
    name: 'touch',
    run(ctx, args) {
      if (!args.length) fail('touch: missing file operand');
      for (const a of args) if (!(a.replace(/^\.\//, '') in ctx.repo.workingTree)) writeFile(ctx, a, '');
    },
  },
  rm: {
    name: 'rm',
    run(ctx, args) {
      const recursive = args.some((a) => /^-\w*r/i.test(a));
      const targets = args.filter((a) => !a.startsWith('-'));
      if (!targets.length) fail('rm: missing operand');
      for (const a of targets) {
        const p = a.replace(/^\.\//, '').replace(/\/$/, '');
        const hits = Object.keys(ctx.repo.workingTree).filter((q) => q === p || (recursive && q.startsWith(`${p}/`)));
        if (!hits.length) fail(Object.keys(ctx.repo.workingTree).some((q) => q.startsWith(`${p}/`)) ? `rm: cannot remove '${a}': Is a directory` : `rm: cannot remove '${a}': No such file or directory`);
        for (const q of hits) {
          delete ctx.repo.workingTree[q];
          ctx.emit({ type: 'FILE_DELETED', path: q });
        }
      }
    },
  },
  mkdir: {
    name: 'mkdir',
    run(ctx) {
      ctx.hint('このシミュレータではファイルを作るとフォルダも自動で作られます（Git は空のフォルダを管理しないため、mkdir は省略しています）。');
    },
  },
  chmod: { name: 'chmod', run: (ctx) => ctx.hint('このシミュレータでは実行権限は不要です（.git/hooks のファイルはそのまま実行されます）。実機では chmod +x .git/hooks/pre-commit が必要です。') },
  pwd: { name: 'pwd', run: (ctx) => ctx.out(cwdOf(ctx.repo)) },
  cd: {
    name: 'cd',
    run(ctx, args) {
      if (!args[0]) fail('cd: 移動先を指定してください', 'git worktree list に出る作業フォルダの間を cd で移動できます。');
      const path = resolvePath(cwdOf(ctx.repo), args[0]);
      if (path === cwdOf(ctx.repo)) return;
      if (!ctx.repo.worktrees?.others[path]) fail(`cd: ${args[0]}: No such file or directory`, 'このシミュレータでは、プロジェクトフォルダと git worktree で作った作業フォルダの間だけ移動できます。');
      enterWorktree(ctx.repo, path);
    },
  },
  clear: { name: 'clear', run: (ctx) => ctx.emit({ type: 'CLEAR' }) },
};
