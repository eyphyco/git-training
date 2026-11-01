import { describe, expect, it } from 'vitest';
import { isIgnored, parseIgnore } from './ignore';

describe('.gitignore', () => {
  const rules = parseIgnore('# comment\n*.log\nnode_modules/\n/build\n.env\n!keep.log\ndocs/**/*.tmp\n');
  it.each([
    ['debug.log', true],
    ['logs/app.log', true],
    ['keep.log', false],
    ['node_modules/react/index.js', true],
    ['node_modules', false],
    ['build/out.js', true],
    ['src/build/out.js', false],
    ['.env', true],
    ['config/.env', true],
    ['docs/a/b/x.tmp', true],
    ['src/app.ts', false],
  ])('%s → %s', (path, expected) => {
    expect(isIgnored(rules, path)).toBe(expected);
  });
});
