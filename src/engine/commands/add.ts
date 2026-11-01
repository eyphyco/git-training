import { fail, type CommandDef } from '../command';
import { matchPathspec } from '../parser';
import { isIgnored } from '../model/ignore';
import { writeBlob } from '../model/objects';
import { ignoreRules } from '../model/status';
import type { Path } from '../model/types';

export const add: CommandDef = {
  name: 'add',
  spec: { short: { A: 'all', u: 'update', f: 'force', v: 'verbose' } },
  run(ctx) {
    const repo = ctx.repo;
    const { opts } = ctx.args;
    let specs = [...ctx.args.positional, ...(ctx.args.afterDashDash ?? [])];
    if (opts.all && !specs.length) specs = ['.'];
    if (opts.update && !specs.length) specs = ['.'];
    if (!specs.length) {
      fail('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?', 'どのファイルをステージに載せるか指定してください（例: git add README.md / 全部なら git add .）');
    }
    const rules = ignoreRules(repo);
    const conflicts = repo.inProgress?.conflicts ?? [];
    const targets = new Set<Path>();
    const ignoredHits: string[] = [];
    for (const spec of specs) {
      const candidates = [...new Set([...Object.keys(repo.workingTree), ...Object.keys(repo.index)])].filter((p) => matchPathspec(spec, p));
      if (!candidates.length) fail(`fatal: pathspec '${spec}' did not match any files`, `「${spec}」に当てはまるファイルがありません。ls でファイル名を確認しましょう。`);
      for (const p of candidates) {
        const tracked = p in repo.index;
        if (opts.update && !tracked) continue;
        if (!tracked && !opts.force && isIgnored(rules, p)) {
          // 明示的に名前を指定したときだけエラーにする（"." に含まれる無視ファイルは黙って飛ばす）
          if (spec.replace(/^\.\//, '') === p) ignoredHits.push(p);
          continue;
        }
        targets.add(p);
      }
    }
    if (ignoredHits.length && !targets.size) {
      fail(
        `The following paths are ignored by one of your .gitignore files:\n${ignoredHits.join('\n')}\nhint: Use -f if you really want to add them.`,
        '.gitignore で無視するよう指定されたファイルです。どうしても追加したいときは git add -f を使います。',
      );
    }
    for (const p of [...targets].sort()) {
      const before = repo.index[p];
      if (p in repo.workingTree) {
        const oid = writeBlob(repo, repo.workingTree[p]);
        const resolving = conflicts.includes(p);
        if (before === oid && !resolving) continue;
        repo.index[p] = oid;
        if (resolving) repo.inProgress!.conflicts = repo.inProgress!.conflicts.filter((c) => c !== p);
        ctx.emit({ type: 'FILE_STAGED', path: p, change: before === undefined ? 'added' : 'modified' });
        if (opts.verbose) ctx.out(`add '${p}'`);
      } else if (before !== undefined) {
        delete repo.index[p];
        ctx.emit({ type: 'FILE_STAGED', path: p, change: 'deleted' });
        if (opts.verbose) ctx.out(`remove '${p}'`);
      }
    }
  },
};
