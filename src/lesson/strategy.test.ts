import { describe, expect, it } from 'vitest';
import { runCommand, scoreOf, startSession, undo } from './session';
import { strategySetup } from './strategy';
import type { Lesson } from './types';

const lessonFor = (setup: Lesson['setup'], extra: Partial<Lesson> = {}): Lesson => ({ id: 't', title: 't', level: 'advanced', setup, steps: [], ...extra });

function run(lesson: Lesson, lines: string[]) {
  let s = startSession(lesson);
  const outs: string[] = [];
  for (const l of lines) {
    const r = runCommand(lesson, s, l);
    outs.push(...r.result.output.map((o) => o.text));
    s = r.session;
  }
  return { s, out: outs.join('\n') };
}

describe('ブランチ戦略のルール違反', () => {
  it('GitHub Flow：main への直接コミットを警告し、World に記録する（Undo で消える）', () => {
    const l = lessonFor(strategySetup('github-flow'));
    const { s, out } = run(l, ['echo x >> app.js', 'git commit -am x']);
    expect(out).toContain('⚠️ ルール違反 GitHub Flow：main に直接コミットしました');
    expect(s.world.hosting.violations).toHaveLength(1);
    expect(undo(s).world.hosting.violations ?? []).toHaveLength(0);
    expect(run(l, ['git switch -c feature/a', 'echo x >> app.js', 'git commit -am x']).s.world.hosting.violations ?? []).toHaveLength(0);
  });
  it('Git Flow：feature は develop から、main には release / hotfix だけ', () => {
    const l = lessonFor(strategySetup('git-flow'));
    expect(run(l, ['git switch -c feature/a']).out).toContain('feature/ ブランチは develop から作ります');
    const ok = run(l, ['git switch develop', 'git switch -c feature/a', 'echo x >> app.js', 'git commit -am x', 'git switch develop', 'git merge --no-ff feature/a -m "merge"']);
    expect(ok.s.world.hosting.violations ?? []).toEqual([]);
    const bad = run(l, ['git switch develop', 'git switch -c feature/a', 'echo x >> app.js', 'git commit -am x', 'git switch main', 'git merge feature/a']);
    expect(bad.out).toContain('main にマージしてよいのは release/ と hotfix/ だけです');
  });
  it('GitLab Flow：production には main からだけ', () => {
    const l = lessonFor(strategySetup('gitlab-flow'));
    expect(run(l, ['git switch -c fix/a', 'echo x >> app.js', 'git commit -am x', 'git switch production', 'git merge fix/a']).out).toContain('upstream first');
  });
  it('トランクベース：main に入っていないコミットが3つを超えたら警告', () => {
    const l = lessonFor(strategySetup('trunk'));
    const lines = ['git switch -c long'];
    for (let i = 0; i < 4; i++) lines.push(`echo ${i} >> app.js`, `git commit -am c${i}`);
    expect(run(l, lines).out).toContain('ブランチは短命に');
  });
});

describe('実戦シナリオのきっかけとスコア', () => {
  const l = lessonFor(
    { commits: [{ id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } }], branches: { main: 'c1' }, remotes: { origin: { branches: { main: 'c1' } } } },
    {
      scenario: { summary: 's', members: ['Sato'] },
      triggers: [
        { id: 'hello', when: { type: 'start' }, actions: [{ type: 'message', from: 'Sato', text: 'よろしく' }] },
        { id: 'race', when: { type: 'command', match: 'git commit' }, actions: [{ type: 'message', from: 'Sato', text: '先に push しました' }, { type: 'teammatePush', author: 'Sato', message: 'sato work', files: { 's.txt': 's\n' } }] },
        { id: 'thanks', after: 'race', when: { type: 'event', event: 'PUSHED' }, actions: [{ type: 'message', from: 'Sato', text: 'ありがとう' }] },
      ],
    },
  );
  it('開始時・コマンド・イベントで1回ずつ起きる', () => {
    const { s, out } = run(l, ['echo b > b.txt', 'git add b.txt', 'git commit -m b', 'git push', 'git pull', 'git push', 'git push']);
    expect(s.chat.map((c) => c.text)).toEqual(['よろしく', '先に push しました', 'ありがとう']);
    expect(out).toContain('💬 Sato: 先に push しました');
    expect(out).toContain('rejected');
  });
  it('スコアはヒント・違反・force push・Undo で減点', () => {
    const { s } = run(l, ['echo b > b.txt', 'git add b.txt', 'git commit -m b', 'git push --force']);
    const sc = scoreOf(undo(s), 1);
    expect(sc.score).toBe(100 - 5 - 15 - 2);
  });
  it('--force-with-lease は減点しない（自分のブランチを書き換えた後の正しい送り方）', () => {
    const { s } = run(l, ['echo b > b.txt', 'git add b.txt', 'git commit -m b', 'git push --force-with-lease', 'git push -f', 'git push origin +main']);
    expect(scoreOf(s, 0).items).toEqual([{ label: 'force push（--force）2 回', points: -30 }]);
  });
});
