import { fail, type CommandDef } from '../command';
import { commitFiles, getBlob } from '../model/objects';
import { copyObjects, setUpstream } from '../remote';

export const clone: CommandDef = {
  name: 'clone',
  noRepo: true,
  run(ctx) {
    const repo = ctx.repo;
    const [url, dir] = ctx.args.positional;
    if (!url) fail('fatal: You must specify a repository to clone.', '例: git clone https://github.com/you/project.git');
    if (repo.initialized || Object.keys(repo.workingTree).length)
      fail(`fatal: destination path '${dir ?? 'project'}' already exists and is not an empty directory.`, 'このシミュレータでは、空のフォルダでだけ clone できます。');
    // このシミュレータでは URL に関係なく、レッスンで用意した origin を clone する
    const hosted = ctx.world.remotes.origin;
    if (!hosted) fail(`remote: Repository not found.\nfatal: repository '${url}' not found`, 'clone できるリポジトリが用意されていません。');
    ctx.out(`Cloning into '${dir ?? url.replace(/\.git$/, '').split(/[/:]/).pop()}'...`);
    copyObjects(hosted, repo, Object.values(hosted.refs.heads));
    repo.initialized = true;
    repo.config.remotes = { origin: { url } };
    repo.refs.remotes.origin = { ...hosted.refs.heads };
    const branch = hosted.head.type === 'symbolic' && hosted.refs.heads[hosted.head.ref] ? hosted.head.ref : Object.keys(hosted.refs.heads)[0];
    if (branch) {
      const oid = hosted.refs.heads[branch];
      repo.refs.heads[branch] = oid;
      repo.head = { type: 'symbolic', ref: branch };
      setUpstream(repo, branch, 'origin', branch);
      for (const [p, o] of Object.entries(commitFiles(repo, oid))) {
        repo.index[p] = o;
        repo.workingTree[p] = getBlob(repo, o);
      }
    } else ctx.out('warning: You appear to have cloned an empty repository.');
    ctx.hint('実 Git では project という名前のフォルダが作られ、cd project で中に入ります。このシミュレータでは今のフォルダに直接展開しています。');
    ctx.emit({ type: 'CLONED', url, branch: branch ?? null });
  },
};
