import { fail, type CommandDef } from '../command';
import { matchPathspec } from '../parser';
import { hashBlob } from '../model/objects';
import { headFiles } from '../model/status';

export const rm: CommandDef = {
  name: 'rm',
  spec: { short: { r: 'recursive', f: 'force', q: 'quiet' }, long: ['cached'] },
  run(ctx) {
    const repo = ctx.repo;
    const specs = [...ctx.args.positional, ...(ctx.args.afterDashDash ?? [])];
    if (!specs.length) fail('usage: git rm [--cached] <file>...');
    const head = headFiles(repo);
    const targets: string[] = [];
    for (const spec of specs) {
      const hits = Object.keys(repo.index).filter((p) => matchPathspec(spec, p));
      if (!hits.length) fail(`fatal: pathspec '${spec}' did not match any files`, `「${spec}」は Git が追跡していないファイルです。`);
      if (hits.some((p) => p !== spec) && !ctx.args.opts.recursive && !/[*?]/.test(spec) && spec !== '.')
        fail(`fatal: not removing '${spec}' recursively without -r`);
      targets.push(...hits);
    }
    for (const p of targets) {
      const wt = repo.workingTree[p];
      const localMod = wt !== undefined && hashBlob(wt) !== repo.index[p];
      const staged = head[p] !== repo.index[p];
      if (!ctx.args.opts.force && !ctx.args.opts.cached && (localMod || staged))
        fail(`error: the following file has ${staged ? 'changes staged in the index' : 'local modifications'}:\n    ${p}\n(use --cached to keep the file, or -f to force removal)`);
    }
    for (const p of targets) {
      delete repo.index[p];
      if (!ctx.args.opts.cached) {
        if (p in repo.workingTree) ctx.emit({ type: 'FILE_DELETED', path: p });
        delete repo.workingTree[p];
      }
      ctx.emit(p in head ? { type: 'FILE_STAGED', path: p, change: 'deleted' } : { type: 'FILE_UNSTAGED', path: p });
      if (!ctx.args.opts.quiet) ctx.out(`rm '${p}'`);
    }
  },
};
