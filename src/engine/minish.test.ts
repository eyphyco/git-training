import { describe, expect, it } from 'vitest';
import { runScript, type ShellEnv } from './minish';

const env = (files: Record<string, string> = {}, extra: Partial<ShellEnv> = {}): ShellEnv => ({
  args: [],
  readFile: (p) => files[p] ?? null,
  git: () => ({ code: 0, out: '' }),
  ...extra,
});

describe('minish（hooks 用の小さなシェル）', () => {
  it('echo と exit', () => {
    expect(runScript('#!/bin/sh\necho "hello"\nexit 3\necho no', env())).toEqual({ code: 3, out: ['hello'] });
  });
  it('if / then / else / fi と grep -q', () => {
    const s = 'if grep -q "TODO" app.js; then\n  echo "TODO が残っています" >&2\n  exit 1\nelse\n  echo ok\nfi';
    expect(runScript(s, env({ 'app.js': 'x\n// TODO\n' }))).toEqual({ code: 1, out: ['TODO が残っています'] });
    expect(runScript(s, env({ 'app.js': 'x\n' }))).toEqual({ code: 0, out: ['ok'] });
  });
  it('パイプ・!・&& / ||・$1', () => {
    const git = (argv: string[]) => ({ code: 0, out: argv.join(' ') === 'diff --cached' ? '+console.log(1)\n-old\n' : '' });
    const s = 'git diff --cached | grep -q "^+.*console\\.log" && { echo "console.log を消してください"; exit 1; }\nexit 0';
    expect(runScript(s, env({}, { git })).code).toBe(1);
    const msg = '#!/bin/sh\nif ! grep -qE "^(feat|fix|docs): " "$1"; then echo "形式: feat: 〜"; exit 1; fi';
    expect(runScript(msg, env({ '.git/COMMIT_EDITMSG': 'feat: add login\n' }, { args: ['.git/COMMIT_EDITMSG'] })).code).toBe(0);
    expect(runScript(msg, env({ '.git/COMMIT_EDITMSG': 'add login\n' }, { args: ['.git/COMMIT_EDITMSG'] }))).toEqual({ code: 1, out: ['形式: feat: 〜'] });
    expect(runScript('false || echo fallback', env()).out).toEqual(['fallback']);
    expect(runScript('true && echo yes; false && echo no', env()).out).toEqual(['yes']);
  });
  it('grep のオプション（-i -v -c -n）と cat', () => {
    expect(runScript('cat a.txt | grep -i hello', env({ 'a.txt': 'Hello\nbye\n' })).out).toEqual(['Hello']);
    expect(runScript('grep -v hello a.txt', env({ 'a.txt': 'hello\nbye\n' })).out).toEqual(['bye']);
    expect(runScript('grep -c o a.txt', env({ 'a.txt': 'one\ntwo\nx\n' })).out).toEqual(['2']);
    expect(runScript('grep -q x missing.txt', env()).code).toBe(2);
  });
  it('[ ] / test', () => {
    expect(runScript('if [ "$1" = "origin" ]; then echo yes; fi', env({}, { args: ['origin'] })).out).toEqual(['yes']);
    expect(runScript('[ -f a.txt ] && echo exists', env({ 'a.txt': '' })).out).toEqual(['exists']);
  });
  it('対応していない命令はエラーで止まる（127）', () => {
    const r = runScript('npm test', env());
    expect(r.code).toBe(127);
    expect(r.out[0]).toContain('npm');
  });
});
