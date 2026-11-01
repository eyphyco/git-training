import { fail, type CommandDef } from '../command';
import { short } from '../model/objects';
import { reflogOf, reflogRef } from '../model/refs';

export const reflog: CommandDef = {
  name: 'reflog',
  spec: { short: { n: 'max-count' }, valued: ['max-count'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const args = positional[0] === 'show' ? positional.slice(1) : positional;
    if (args[0] && ['expire', 'delete', 'exists'].includes(args[0])) fail(`このサイトでは git reflog ${args[0]} は未対応です。`, 'reflog は「HEAD やブランチがどこにいたか」の記録です。表示だけ使えます。');
    const name = args[0] ?? 'HEAD';
    const ref = reflogRef(repo, name);
    if (!ref) fail(`fatal: ambiguous argument '${name}': unknown revision or path not in the working tree.`, `「${name}」というブランチはありません。`);
    const label = ref === 'HEAD' ? 'HEAD' : ref === 'refs/stash' ? 'stash' : name.replace(/^refs\/heads\//, '');
    const max = opts['max-count'] ? Number(opts['max-count']) : Infinity;
    reflogOf(repo, ref)
      .slice(0, max)
      .forEach((e, i) => ctx.out(`${short(e.new)} ${label}@{${i}}: ${e.message}`, 'normal'));
  },
};
