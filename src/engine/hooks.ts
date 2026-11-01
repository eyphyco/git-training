// .git/hooks のスクリプトを小さなシェル（minish）で実行する。commit / push の前に呼ぶ。
import { Fail, type Ctx } from './command';
import { diff } from './commands/diff';
import { log } from './commands/log';
import { show } from './commands/show';
import { status } from './commands/status';
import { currentBranch } from './model/refs';
import { OptionError, parseArgs } from './parser';
import { runScript } from './minish';

export const HOOK_DIR = '.git/hooks/';
export const HOOK_NAMES = ['pre-commit', 'commit-msg', 'pre-push'];

/** hook の中から呼べる git（読むだけのコマンド） */
const READ_ONLY = { diff, log, show, status } as const;

function hookGit(ctx: Ctx, argv: string[]): { code: number; out: string } {
  const [sub, ...rest] = argv;
  if (sub === 'branch' && rest[0] === '--show-current') return { code: 0, out: `${currentBranch(ctx.repo) ?? ''}\n` };
  if (sub === 'rev-parse' && rest.join(' ') === '--abbrev-ref HEAD') return { code: 0, out: `${currentBranch(ctx.repo) ?? 'HEAD'}\n` };
  const def = READ_ONLY[sub as keyof typeof READ_ONLY];
  if (!def) return { code: 1, out: `git ${sub}: このサイトの hooks では diff / log / show / status / branch --show-current だけが使えます\n` };
  const buf: string[] = [];
  try {
    const args = parseArgs(rest, def.spec ?? {});
    def.run({ ...ctx, args, raw: rest, out: (t) => buf.push(t), hint: () => {}, emit: () => {} });
    return { code: 0, out: buf.map((l) => `${l}\n`).join('') };
  } catch (e) {
    if (e instanceof Fail || e instanceof OptionError) return { code: 1, out: '' };
    throw e;
  }
}

/** hook を実行する。hook がないか、終了コード 0 なら true */
export function runHook(ctx: Ctx, name: string, args: string[] = [], files: Record<string, string> = {}): boolean {
  const script = ctx.repo.hooks?.[name];
  if (script === undefined) return true;
  const r = runScript(script, {
    args,
    readFile: (p) => {
      const path = p.replace(/^\.\//, '');
      return files[path] ?? ctx.repo.workingTree[path] ?? null;
    },
    git: (argv) => hookGit(ctx, argv),
  });
  for (const l of r.out) ctx.out(l, r.code ? 'red' : 'normal');
  return r.code === 0;
}
