// 全レッスンの模範解答を自動実行し、クリアできることを確かめる（設計書 §8）。
import { describe, expect, it } from 'vitest';
import { evaluateAll } from '../src/lesson/checks';
import { chapters, lessons, scenarios } from '../src/lesson/content';
import { answerQuiz, checkStep, runAnswer, startSession, toggleCheck } from '../src/lesson/session';
import glossary from './glossary.json';

const all = Object.values(lessons);

describe('教材', () => {
  it('chapters.json のレッスンが全て存在し、どの章にも属さないレッスンがない', () => {
    const listed = [...chapters.flatMap((c) => [...c.lessons, ...(c.challenge ? [c.challenge] : []), ...(c.practice ? [c.practice] : [])]), ...scenarios.map((s) => s.id)];
    for (const id of listed) expect(lessons[id], id).toBeDefined();
    expect(all.map((l) => l.id).sort()).toEqual([...listed].sort());
  });

  it('[[用語]] は全て glossary.json にある', () => {
    for (const l of all) {
      const texts = [l.body ?? '', ...l.steps.map((s) => JSON.stringify(s))];
      for (const t of texts)
        for (const m of t.matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)) expect(glossary, `${l.id}: ${m[1]}`).toHaveProperty(m[1]);
    }
  });

  it.each(all.map((l) => [l.id, l] as const))('%s の模範解答でクリアできる', (_, lesson) => {
    let s = startSession(lesson);
    lesson.steps.forEach((step, i) => {
      expect(s.stepIndex, `step ${i}`).toBe(i);
      if (step.type === 'quiz') {
        expect(step.answer).toBeLessThan(step.choices.length);
        s = answerQuiz(lesson, s, step.answer).session;
        return;
      }
      if (step.type === 'checklist') {
        step.items.forEach((_, j) => (s = toggleCheck(lesson, s, j)));
        return;
      }
      // 何もしないうちからクリア済みになっているステップは、課題として成り立っていない
      expect(evaluateAll(step.check, { world: s.world, aliases: s.aliases, commands: [] }).every((r) => r.ok), `step ${i} は最初から満たされている`).toBe(false);
      expect(step.answer?.length, `step ${i} に answer がない`).toBeTruthy();
      expect((step.hints ?? []).length).toBeLessThanOrEqual(3);
      for (const line of step.answer!) {
        const r = runAnswer(lesson, s, line);
        if (!step.expectError) expect(r.result.ok, `${JSON.stringify(line)}\n${r.result.output.map((o) => o.text).join('\n')}`).toBe(true);
        s = r.session;
      }
      expect(s.stepIndex, `step ${i} が未クリア: ${JSON.stringify(checkStep(lesson, s))}`).toBe(i + 1);
    });
    expect(s.done).toBe(true);
  });
});
