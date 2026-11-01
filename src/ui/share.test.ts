import { describe, expect, it } from 'vitest';
import { fresh } from '../engine/testing';
import { decodeWorld, encodeWorld, parseWorldJson, worldToJson } from './share';

describe('share', () => {
  it('World を URL 用の文字列にして戻せる', async () => {
    const { world } = fresh(['echo hello > a.txt', 'git add .', 'git commit -m one']);
    const s = await encodeWorld(world);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeWorld(s)).toEqual(JSON.parse(JSON.stringify(world)));
  });
  it('JSON の書き出し・読み込みと不正なファイル', () => {
    const { world } = fresh(['touch a']);
    expect(parseWorldJson(worldToJson(world)).local.workingTree).toEqual({ a: '' });
    expect(() => parseWorldJson('{"foo":1}')).toThrow();
  });
});
