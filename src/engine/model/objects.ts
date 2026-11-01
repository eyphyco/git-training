// blob / tree / commit を実 Git と同じバイト列にして SHA-1 を取る（第8章の内部構造学習でもそのまま使う）。
import { sha1 } from './sha1';
import type { Commit, Oid, Path, RepoState, Signature, Tag, Tree, TreeEntry } from './types';

const enc = new TextEncoder();

function hashObject(type: string, body: Uint8Array): Oid {
  const header = enc.encode(`${type} ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return sha1(all);
}

export function hashBlob(content: string): Oid {
  return hashObject('blob', enc.encode(content));
}

export function writeBlob(repo: RepoState, content: string): Oid {
  const oid = hashBlob(content);
  if (!repo.objects[oid]) repo.objects[oid] = { type: 'blob', content };
  return oid;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Git の並び順：ディレクトリは名前の末尾に "/" があるものとしてバイト比較する
function sortKey(e: TreeEntry): string {
  return e.mode === '40000' ? `${e.name}/` : e.name;
}

function compareBytes(a: string, b: string): number {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const n = Math.min(ab.length, bb.length);
  for (let i = 0; i < n; i++) if (ab[i] !== bb[i]) return ab[i] - bb[i];
  return ab.length - bb.length;
}

export function hashTree(tree: Tree): Oid {
  const parts: Uint8Array[] = [];
  for (const e of tree.entries) {
    parts.push(enc.encode(`${e.mode} ${e.name}\0`));
    parts.push(hexToBytes(e.oid));
  }
  const len = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    body.set(p, off);
    off += p.length;
  }
  return hashObject('tree', body);
}

/** フラットな path → blob oid の対応から tree オブジェクトを（入れ子で）書き込む */
export function writeTree(repo: RepoState, files: Record<Path, Oid>): Oid {
  type Dir = { files: Record<string, Oid>; dirs: Record<string, Dir> };
  const root: Dir = { files: {}, dirs: {} };
  for (const [path, oid] of Object.entries(files)) {
    const segs = path.split('/');
    let d = root;
    for (const s of segs.slice(0, -1)) d = d.dirs[s] ??= { files: {}, dirs: {} };
    d.files[segs[segs.length - 1]] = oid;
  }
  const write = (d: Dir): Oid => {
    const entries: TreeEntry[] = [
      ...Object.entries(d.files).map(([name, oid]) => ({ name, mode: '100644' as const, oid })),
      ...Object.entries(d.dirs).map(([name, sub]) => ({ name, mode: '40000' as const, oid: write(sub) })),
    ];
    entries.sort((a, b) => compareBytes(sortKey(a), sortKey(b)));
    const tree: Tree = { type: 'tree', entries };
    const oid = hashTree(tree);
    if (!repo.objects[oid]) repo.objects[oid] = tree;
    return oid;
  };
  return write(root);
}

/** tree をフラットな path → blob oid に展開する */
export function readTree(repo: RepoState, treeOid: Oid, prefix = ''): Record<Path, Oid> {
  const tree = repo.objects[treeOid];
  if (!tree || tree.type !== 'tree') throw new Error(`not a tree: ${treeOid}`);
  const out: Record<Path, Oid> = {};
  for (const e of tree.entries) {
    const p = prefix + e.name;
    if (e.mode === '40000') Object.assign(out, readTree(repo, e.oid, `${p}/`));
    else out[p] = e.oid;
  }
  return out;
}

function sig(s: Signature): string {
  return `${s.name} <${s.email}> ${s.time} ${s.tz}`;
}

export function serializeCommit(c: Commit): string {
  const lines = [`tree ${c.tree}`, ...c.parents.map((p) => `parent ${p}`), `author ${sig(c.author)}`, `committer ${sig(c.committer)}`];
  return `${lines.join('\n')}\n\n${c.message}${c.noNewline ? '' : '\n'}`;
}

export function writeCommit(repo: RepoState, c: Omit<Commit, 'type'>): Oid {
  const commit: Commit = { type: 'commit', ...c };
  const oid = hashObject('commit', enc.encode(serializeCommit(commit)));
  if (!repo.objects[oid]) repo.objects[oid] = commit;
  return oid;
}

export function serializeTag(t: Tag): string {
  return `object ${t.object}\ntype ${t.objectType}\ntag ${t.tag}\ntagger ${sig(t.tagger)}\n\n${t.message}\n`;
}

export function writeTag(repo: RepoState, t: Omit<Tag, 'type'>): Oid {
  const tag: Tag = { type: 'tag', ...t };
  const oid = hashObject('tag', enc.encode(serializeTag(tag)));
  if (!repo.objects[oid]) repo.objects[oid] = tag;
  return oid;
}

/** 注釈付きタグならその指すコミットへたどる */
export function peel(repo: RepoState, oid: Oid): Oid {
  const o = repo.objects[oid];
  return o?.type === 'tag' ? peel(repo, o.object) : oid;
}

export function getCommit(repo: RepoState, oid: Oid): Commit {
  const c = repo.objects[oid];
  if (!c || c.type !== 'commit') throw new Error(`not a commit: ${oid}`);
  return c;
}

export function getBlob(repo: RepoState, oid: Oid): string {
  const b = repo.objects[oid];
  if (!b || b.type !== 'blob') throw new Error(`not a blob: ${oid}`);
  return b.content;
}

export function commitFiles(repo: RepoState, oid: Oid | null): Record<Path, Oid> {
  return oid ? readTree(repo, getCommit(repo, oid).tree) : {};
}

export const short = (oid: Oid) => oid.slice(0, 7);
export const subject = (msg: string) => msg.split('\n')[0];
