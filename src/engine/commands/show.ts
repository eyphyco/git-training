import { fail, type CommandDef } from '../command';
import { countChanges } from '../merge/diff';
import { commitFiles, getBlob, getCommit, peel, short, subject } from '../model/objects';
import { headOid, resolveRev } from '../model/refs';
import type { Oid } from '../model/types';
import { printSummary, type FileStat } from '../stat';
import { printFileDiff } from './diff';
import { decorations, formatDate } from './log';

export const show: CommandDef = {
  name: 'show',
  spec: { short: { s: 'no-patch' }, long: ['stat', 'oneline', 'name-only', 'no-patch'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const revs = positional.length ? positional : ['HEAD'];
    revs.forEach((rev, i) => {
      if (i > 0) ctx.out('');
      // 注釈付きタグはタグオブジェクトの中身を先に出す
      const tagOid = repo.refs.tags[rev.replace(/^(refs\/)?tags\//, '')];
      const tag = tagOid ? repo.objects[tagOid] : undefined;
      if (tag?.type === 'tag' && !opts.oneline) {
        ctx.out(`tag ${tag.tag}`, 'yellow');
        ctx.out(`Tagger: ${tag.tagger.name} <${tag.tagger.email}>`);
        ctx.out(`Date:   ${formatDate(tag.tagger.time, tag.tagger.tz)}`);
        ctx.out('');
        for (const l of tag.message.split('\n')) ctx.out(l);
        ctx.out('');
      }
      const oid: Oid | null = tagOid ? peel(repo, tagOid) : resolveRev(repo, rev);
      if (!oid) {
        if (!headOid(repo)) fail("fatal: your current branch does not have any commits yet", 'まだコミットが1つもありません。');
        fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`, `「${rev}」というコミットは見つかりません。git log --oneline で確かめましょう。`);
      }
      const c = getCommit(repo, oid);
      const dec = decorations(repo, oid);
      const decText = dec.length ? ` (${dec.join(', ')})` : '';
      if (opts.oneline) ctx.out(`${short(oid)}${decText} ${subject(c.message)}`);
      else {
        ctx.out(`commit ${oid}${decText}`, 'yellow');
        if (c.parents.length > 1) ctx.out(`Merge: ${c.parents.map(short).join(' ')}`);
        ctx.out(`Author: ${c.author.name} <${c.author.email}>`);
        ctx.out(`Date:   ${formatDate(c.author.time, c.author.tz)}`);
        ctx.out('');
        for (const l of c.message.split('\n')) ctx.out(`    ${l}`);
      }
      // マージコミットの差分（combined diff）は省略する
      if (opts['no-patch'] || c.parents.length > 1) return;
      const a = commitFiles(repo, c.parents[0] ?? null);
      const b = commitFiles(repo, oid);
      const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();
      if (!changed.length) return;
      if (opts['name-only']) return changed.forEach((p) => ctx.out(p));
      if (opts.stat) {
        const stats: FileStat[] = changed.map((p) => ({ path: p, ...countChanges(a[p] ? getBlob(repo, a[p]) : '', b[p] ? getBlob(repo, b[p]) : ''), created: false, deleted: false }));
        return printSummary(ctx, stats, true);
      }
      if (!opts.oneline) ctx.out('');
      for (const p of changed)
        printFileDiff(ctx, p, a[p] ? { oid: a[p], content: getBlob(repo, a[p]) } : undefined, b[p] ? { oid: b[p], content: getBlob(repo, b[p]) } : undefined);
    });
  },
};
