import { describe, expect, it } from 'vitest';
import type { Setup } from './world';
import { execute } from './run';
import { repoWith, text } from './testing';

const setup: Setup = {
  commits: [{ id: 'c1', msg: 'init', files: { 'app.js': 'app()\n' } }],
  branches: { main: 'c1' },
  remotes: { origin: { branches: { main: 'c1' } } },
};
const preCommit = [
  "echo '#!/bin/sh' > .git/hooks/pre-commit",
  "echo 'if git diff --cached | grep -q \"^+.*console.log\"; then' >> .git/hooks/pre-commit",
  "echo '  echo \"console.log が残っています\"; exit 1' >> .git/hooks/pre-commit",
  "echo 'fi' >> .git/hooks/pre-commit",
];

describe('hooks', () => {
  it('pre-commit が失敗するとコミットしない。--no-verify で飛ばせる', () => {
    const r = repoWith(setup, [...preCommit, 'echo "console.log(1)" >> app.js', 'git add app.js', 'git commit -m debug']);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain('console.log が残っています');
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c1);
    expect(execute(r.world, 'git commit -m debug --no-verify').ok).toBe(true);
    // 直せば通る
    const fixed = ['echo "app()" > app.js', 'echo "done()" >> app.js', 'git add app.js', 'git commit -m fix'].reduce((w, l) => execute(w, l).world, r.world);
    expect(fixed.local.refs.heads.main).not.toBe(r.aliases.c1);
  });
  it('commit-msg は $1 のファイルでメッセージを受け取る', () => {
    const hook = ["echo 'grep -qE \"^(feat|fix): \" \"$1\" || { echo \"feat: か fix: で始めてください\"; exit 1; }' > .git/hooks/commit-msg"];
    const bad = repoWith(setup, [...hook, 'echo x >> app.js', 'git commit -am "update"']);
    expect(bad.ok).toBe(false);
    expect(text(bad)).toContain('feat: か fix: で始めてください');
    expect(execute(bad.world, 'git commit -am "fix: update"').ok).toBe(true);
  });
  it('pre-push は push を止められる', () => {
    const r = repoWith(setup, ["echo 'echo \"push 先: $1\"; exit 1' > .git/hooks/pre-push", 'echo x >> app.js', 'git commit -am x', 'git push']);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain('push 先: origin');
  });
  it('cat / ls で中身を見られ、ワークツリーには出ない', () => {
    const r = repoWith(setup, [...preCommit]);
    expect(text(execute(r.world, 'ls .git/hooks'))).toBe('pre-commit');
    expect(text(execute(r.world, 'cat .git/hooks/pre-commit'))).toContain('#!/bin/sh');
    expect(r.world.local.workingTree['.git/hooks/pre-commit']).toBeUndefined();
  });
});
