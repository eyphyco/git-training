import { describe, expect, it } from 'vitest';
import { matchPathspec, OptionError, parseArgs, tokenize } from './parser';

describe('tokenize', () => {
  it('引用符とリダイレクトを扱う', () => {
    expect(tokenize('git commit -m "first commit"').tokens).toEqual(['git', 'commit', '-m', 'first commit']);
    expect(tokenize("echo 'a b' > x.txt")).toEqual({ tokens: ['echo', 'a b'], redirect: { op: '>', path: 'x.txt' } });
    expect(tokenize('echo hi >> x.txt').redirect).toEqual({ op: '>>', path: 'x.txt' });
    expect(tokenize('echo "a').error).toBeTruthy();
  });
});

describe('parseArgs', () => {
  const spec = { short: { m: 'message', a: 'all' }, multiple: ['message'], long: ['amend'] };
  it('短いオプションの連結と複数の -m', () => {
    expect(parseArgs(['-am', 'x', '-m', 'y'], spec).opts).toEqual({ all: true, message: ['x', 'y'] });
    expect(parseArgs(['--message=z'], spec).opts).toEqual({ message: ['z'] });
  });
  it('-- 以降はパス', () => {
    expect(parseArgs(['main', '--', 'a.txt'], spec)).toMatchObject({ positional: ['main'], afterDashDash: ['a.txt'] });
  });
  it('未知のオプションはエラー', () => {
    expect(() => parseArgs(['--nope'], spec)).toThrow(OptionError);
    expect(() => parseArgs(['-z'], spec)).toThrow(OptionError);
  });
});

describe('matchPathspec', () => {
  it('., ディレクトリ, グロブ', () => {
    expect(matchPathspec('.', 'a/b.txt')).toBe(true);
    expect(matchPathspec('src', 'src/a.ts')).toBe(true);
    expect(matchPathspec('src/', 'srcx/a.ts')).toBe(false);
    expect(matchPathspec('*.md', 'README.md')).toBe(true);
    expect(matchPathspec('./a.txt', 'a.txt')).toBe(true);
  });
});
