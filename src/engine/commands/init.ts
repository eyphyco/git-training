import type { CommandDef } from '../command';

export const PROJECT_DIR = '/home/you/project';

export const init: CommandDef = {
  name: 'init',
  noRepo: true,
  spec: { short: { q: 'quiet', b: 'initial-branch' }, valued: ['initial-branch'] },
  run(ctx) {
    const repo = ctx.repo;
    if (repo.initialized) {
      ctx.out(`Reinitialized existing Git repository in ${PROJECT_DIR}/.git/`);
      return;
    }
    const branch = (ctx.args.opts['initial-branch'] as string) || 'main';
    repo.initialized = true;
    repo.head = { type: 'symbolic', ref: branch };
    ctx.out(`Initialized empty Git repository in ${PROJECT_DIR}/.git/`);
    if (!ctx.args.opts['initial-branch'])
      ctx.hint('メモ: 実 Git の既定ブランチ名は設定がなければ master です。このサイトでは init.defaultBranch=main を設定済みとして main にしています。');
    ctx.emit({ type: 'REPO_INITIALIZED' });
  },
};
