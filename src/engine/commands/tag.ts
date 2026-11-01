import { fail, type CommandDef } from '../command';
import { short, writeTag } from '../model/objects';
import { headOid, isValidBranchName, resolveRev } from '../model/refs';
import { cleanupMessage, you } from './commit';

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

export const tag: CommandDef = {
  name: 'tag',
  spec: { short: { a: 'annotate', m: 'message', d: 'delete', l: 'list', f: 'force' }, multiple: ['message'], long: ['annotate', 'delete', 'list', 'force'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    if (opts.delete) {
      if (!positional.length) fail('usage: git tag -d <tagname>...');
      for (const name of positional) {
        const oid = repo.refs.tags[name];
        if (!oid) fail(`error: tag '${name}' not found.`);
        delete repo.refs.tags[name];
        ctx.out(`Deleted tag '${name}' (was ${short(oid)})`);
        ctx.emit({ type: 'TAG_DELETED', name });
      }
      return;
    }
    const messages = (opts.message as string[] | undefined) ?? [];
    if (opts.list || (!positional.length && !messages.length && !opts.annotate)) {
      const re = positional[0] ? glob(positional[0]) : null;
      for (const name of Object.keys(repo.refs.tags).sort()) if (!re || re.test(name)) ctx.out(name);
      return;
    }
    const [name, rev] = positional;
    if (!name) fail('usage: git tag [-a] [-m <msg>] <tagname> [<commit>]');
    if (!isValidBranchName(name)) fail(`fatal: '${name}' is not a valid tag name.`, 'タグ名に空白や ~ ^ : などは使えません。v1.0.0 のような名前が一般的です。');
    if (repo.refs.tags[name] && !opts.force) fail(`fatal: tag '${name}' already exists`, '同じ名前のタグがあります。付け直すなら git tag -d で消してから作ります（共有済みのタグを動かすのは避けましょう）。');
    const target = rev ? resolveRev(repo, rev) : headOid(repo);
    if (!target) fail(rev ? `fatal: Failed to resolve '${rev}' as a valid ref.` : "fatal: Failed to resolve 'HEAD' as a valid ref.", rev ? `「${rev}」というコミットは見つかりません。` : 'まだコミットがありません。');
    const annotated = Boolean(opts.annotate || messages.length);
    if (annotated && !messages.length) fail('このサイトではエディタが開けないため、-m でタグのメッセージを指定してください。', '例: git tag -a v1.0.0 -m "最初のリリース"');
    const oid = annotated ? writeTag(repo, { object: target, objectType: 'commit', tag: name, tagger: you(ctx, ctx.tick()), message: cleanupMessage(messages) }) : target;
    repo.refs.tags[name] = oid;
    ctx.emit({ type: 'TAG_CREATED', name, oid: target, annotated });
  },
};
