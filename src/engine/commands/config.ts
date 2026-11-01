import { fail, type CommandDef } from '../command';

const KEYS = ['user.name', 'user.email'] as const;

export const config: CommandDef = {
  name: 'config',
  noRepo: true,
  spec: { short: { l: 'list' }, long: ['global', 'local'] },
  run(ctx) {
    const { user } = ctx.repo.config;
    if (ctx.args.opts.list) {
      ctx.out(`user.name=${user.name}`);
      ctx.out(`user.email=${user.email}`);
      return;
    }
    const [key, value] = ctx.args.positional;
    if (!key) fail('usage: git config [--global] <name> [<value>]');
    if (!(KEYS as readonly string[]).includes(key))
      fail(`このサイトでは ${key} の設定は未対応です。`, '対応しているのは user.name と user.email だけです。');
    const field = key === 'user.name' ? 'name' : 'email';
    if (value === undefined) {
      ctx.out(user[field]);
      return;
    }
    user[field] = value;
    ctx.emit({ type: 'CONFIG_SET', key, value });
  },
};
