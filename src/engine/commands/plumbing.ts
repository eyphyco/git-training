// 内部構造を見るコマンド（第8章）：cat-file / ls-tree / rev-parse。
import { fail, type CommandDef, type Ctx } from '../command';
import { getCommit, readTree, serializeCommit, serializeTag, short } from '../model/objects';
import { currentBranch, resolveRev } from '../model/refs';
import type { Oid, RepoState } from '../model/types';

/** "HEAD" "abc1234" "HEAD:README.md" "HEAD^{tree}" をオブジェクト ID に */
export function resolveObject(repo: RepoState, spec: string): Oid | null {
  const colon = spec.indexOf(':');
  if (colon > 0) {
    const commit = resolveRev(repo, spec.slice(0, colon));
    if (!commit) return null;
    return readTree(repo, getCommit(repo, commit).tree)[spec.slice(colon + 1).replace(/^\.\//, '')] ?? null;
  }
  const tree = spec.match(/^(.*)\^\{tree\}$/);
  if (tree) {
    const c = resolveRev(repo, tree[1]);
    return c ? getCommit(repo, c).tree : null;
  }
  if (/^[0-9a-f]{4,40}$/.test(spec)) {
    const hits = Object.keys(repo.objects).filter((o) => o.startsWith(spec));
    if (hits.length === 1) return hits[0];
  }
  const tagOid = repo.refs.tags[spec];
  if (tagOid) return tagOid;
  return resolveRev(repo, spec);
}

function objectOrFail(ctx: Ctx, spec: string | undefined): Oid {
  if (!spec) fail('fatal: オブジェクトを指定してください', '例: git cat-file -p HEAD');
  const oid = resolveObject(ctx.repo, spec);
  if (!oid || !ctx.repo.objects[oid]) fail(`fatal: Not a valid object name ${spec}`, `「${spec}」というオブジェクトは見つかりません。`);
  return oid;
}

export function prettyObject(repo: RepoState, oid: Oid): string[] {
  const o = repo.objects[oid];
  if (o.type === 'blob') return o.content.replace(/\n$/, '').split('\n');
  if (o.type === 'tree') return o.entries.map((e) => `${e.mode === '40000' ? '040000 tree' : '100644 blob'} ${e.oid}\t${e.name}`);
  if (o.type === 'tag') return serializeTag(o).replace(/\n$/, '').split('\n');
  return serializeCommit(o).replace(/\n$/, '').split('\n');
}

export const catFile: CommandDef = {
  name: 'cat-file',
  spec: { short: { p: 'pretty', t: 'type', s: 'size' }, long: ['pretty', 'type', 'size'] },
  run(ctx) {
    const { opts, positional } = ctx.args;
    if (!opts.pretty && !opts.type && !opts.size) fail('usage: git cat-file (-t | -s | -p) <object>', '-p で中身、-t で種類（commit / tree / blob / tag）を表示します。');
    const oid = objectOrFail(ctx, positional[0]);
    const o = ctx.repo.objects[oid];
    if (opts.type) return ctx.out(o.type);
    if (opts.size) {
      const body = o.type === 'blob' ? o.content : o.type === 'commit' ? serializeCommit(o) : o.type === 'tag' ? serializeTag(o) : '';
      return ctx.out(String(new TextEncoder().encode(body).length + (o.type === 'tree' ? o.entries.reduce((a, e) => a + new TextEncoder().encode(`${e.mode} ${e.name}\0`).length + 20, 0) : 0)));
    }
    for (const l of prettyObject(ctx.repo, oid)) ctx.out(l);
  },
};

export const lsTree: CommandDef = {
  name: 'ls-tree',
  spec: { short: { r: 'recursive' }, long: ['recursive', 'name-only'] },
  run(ctx) {
    const { opts, positional } = ctx.args;
    let oid = objectOrFail(ctx, positional[0] ?? 'HEAD');
    const o = ctx.repo.objects[oid];
    if (o.type === 'commit') oid = o.tree;
    else if (o.type !== 'tree') fail('fatal: not a tree object');
    if (opts.recursive) {
      for (const [p, b] of Object.entries(readTree(ctx.repo, oid)).sort(([a], [b]) => (a < b ? -1 : 1))) ctx.out(opts['name-only'] ? p : `100644 blob ${b}\t${p}`);
      return;
    }
    const t = ctx.repo.objects[oid];
    if (t.type !== 'tree') return;
    for (const e of t.entries) ctx.out(opts['name-only'] ? e.name : `${e.mode === '40000' ? '040000 tree' : '100644 blob'} ${e.oid}\t${e.name}`);
  },
};

export const revParse: CommandDef = {
  name: 'rev-parse',
  spec: { long: ['short', 'abbrev-ref', 'show-toplevel', 'git-dir'] },
  run(ctx) {
    const { opts, positional } = ctx.args;
    if (opts['show-toplevel']) return ctx.out('/home/you/project');
    if (opts['git-dir']) return ctx.out('.git');
    for (const rev of positional) {
      if (opts['abbrev-ref']) {
        ctx.out(rev === 'HEAD' ? (currentBranch(ctx.repo) ?? 'HEAD') : rev);
        continue;
      }
      const oid = resolveObject(ctx.repo, rev);
      if (!oid) fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
      ctx.out(opts.short ? short(oid) : oid);
    }
  },
};


