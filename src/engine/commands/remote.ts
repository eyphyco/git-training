import { fail, type CommandDef } from '../command';
import { emptyHosted } from '../remote';

export const remote: CommandDef = {
  name: 'remote',
  spec: { short: { v: 'verbose' } },
  run(ctx) {
    const repo = ctx.repo;
    const [sub, ...args] = ctx.args.positional;
    const remotes = (repo.config.remotes ??= {});
    if (!sub) {
      for (const [name, r] of Object.entries(remotes)) {
        if (ctx.args.opts.verbose) {
          ctx.out(`${name}\t${r.url} (fetch)`);
          ctx.out(`${name}\t${r.url} (push)`);
        } else ctx.out(name);
      }
      if (!Object.keys(remotes).length) ctx.hint('リモートはまだ登録されていません。git remote add origin <URL> で登録します。');
      return;
    }
    if (sub === 'add') {
      const [name, url] = args;
      if (!name || !url) fail('usage: git remote add <name> <url>');
      if (remotes[name]) fail(`error: remote ${name} already exists.`);
      remotes[name] = { url };
      // GitHub で空のリポジトリを作ってある状態とみなす（レッスンで用意したものがあればそれを使う）
      ctx.world.remotes[name] ??= emptyHosted();
      ctx.emit({ type: 'REMOTE_ADDED', name, url });
      return;
    }
    if (sub === 'remove' || sub === 'rm') {
      const [name] = args;
      if (!remotes[name]) fail(`error: No such remote: '${name}'`);
      delete remotes[name];
      delete repo.refs.remotes[name];
      for (const [b, u] of Object.entries(repo.config.branches ?? {})) if (u.remote === name) delete repo.config.branches![b];
      return;
    }
    if (sub === 'get-url') {
      const [name] = args;
      if (!remotes[name]) fail(`error: No such remote '${name}'`);
      ctx.out(remotes[name].url);
      return;
    }
    fail(`error: このサイトでは git remote ${sub} は未対応です。`, '対応: git remote / -v / add / remove / get-url');
  },
};
