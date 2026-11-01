import type { CommandDef } from '../command';
import { currentBranch } from '../model/refs';
import { fetchRemote, upstreamOf } from '../remote';

export const fetch: CommandDef = {
  name: 'fetch',
  spec: { short: { p: 'prune', q: 'quiet' }, long: ['all'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const names = opts.all ? Object.keys(repo.config.remotes ?? {}) : [positional[0] ?? upstreamOf(repo, currentBranch(repo))?.remote ?? 'origin'];
    let any = false;
    for (const name of names) any = fetchRemote(ctx, name, { prune: !!opts.prune, quiet: !!opts.quiet }).length > 0 || any;
    if (!any) ctx.hint('（新しい変更はありませんでした）');
  },
};
