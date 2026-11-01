// フリープレイの状態を URL / JSON に書き出す（ブラウザ標準の gzip 圧縮。外部通信はしない）。
import type { World } from '../engine/model/types';

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeWorld(world: World): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ app: 'git-training', kind: 'world', version: 1, world }));
  const gz = await pipe(json, new CompressionStream('gzip'));
  let s = '';
  // 大きな配列を一度に String.fromCharCode に渡さないよう分割する
  for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decodeWorld(encoded: string): Promise<World> {
  const json = await pipe(fromBase64Url(encoded), new DecompressionStream('gzip'));
  return parseWorldJson(new TextDecoder().decode(json));
}

/** 読み込んだ JSON が World の形をしているか最低限確かめる */
export function parseWorldJson(text: string): World {
  const data = JSON.parse(text);
  const world = data?.kind === 'world' ? data.world : data;
  const ok = world && typeof world === 'object' && world.local && typeof world.local.objects === 'object' && typeof world.local.workingTree === 'object' && typeof world.clock === 'number';
  if (!ok) throw new Error('Git Training の状態ファイルではありません');
  return { remotes: {}, hosting: { pullRequests: [], protections: [] }, ...world };
}

export function worldToJson(world: World): string {
  return JSON.stringify({ app: 'git-training', kind: 'world', version: 1, world }, null, 2);
}

