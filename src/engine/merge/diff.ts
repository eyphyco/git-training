// 行単位の差分（git diff の unified 形式と、diffstat の行数集計）。
import { diffComm } from 'node-diff3';
import type { Tone } from '../model/types';

export type Op = { type: ' ' | '-' | '+'; line: string };

/** 改行を含めたまま行に分ける（末尾改行なしの最終行を区別するため） */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export function lineOps(a: string, b: string): Op[] {
  const ops: Op[] = [];
  for (const block of diffComm(splitLines(a), splitLines(b))) {
    if ('common' in block && block.common) for (const line of block.common) ops.push({ type: ' ', line });
    else {
      for (const line of block.buffer1 ?? []) ops.push({ type: '-', line });
      for (const line of block.buffer2 ?? []) ops.push({ type: '+', line });
    }
  }
  return ops;
}

export function countChanges(a: string, b: string): { ins: number; del: number } {
  let ins = 0;
  let del = 0;
  for (const op of lineOps(a, b)) {
    if (op.type === '+') ins++;
    else if (op.type === '-') del++;
  }
  return { ins, del };
}

const CONTEXT = 3;

function range(start: number, count: number): string {
  if (count === 1) return `${start}`;
  return `${count === 0 ? start - 1 : start},${count}`;
}

/** unified diff の @@ ハンク部分を行の配列で返す */
export function hunks(a: string, b: string): { text: string; tone: Tone }[] {
  const ops = lineOps(a, b);
  const changed = ops.map((o, i) => (o.type !== ' ' ? i : -1)).filter((i) => i >= 0);
  if (!changed.length) return [];
  // 変更箇所の前後 CONTEXT 行をまとめてハンクにする
  const groups: [number, number][] = [];
  for (const i of changed) {
    const lo = Math.max(0, i - CONTEXT);
    const hi = Math.min(ops.length - 1, i + CONTEXT);
    const last = groups[groups.length - 1];
    if (last && lo <= last[1] + 1) last[1] = hi;
    else groups.push([lo, hi]);
  }
  const out: { text: string; tone: Tone }[] = [];
  for (const [lo, hi] of groups) {
    let aLine = 1;
    let bLine = 1;
    for (let i = 0; i < lo; i++) {
      if (ops[i].type !== '+') aLine++;
      if (ops[i].type !== '-') bLine++;
    }
    const slice = ops.slice(lo, hi + 1);
    const aCount = slice.filter((o) => o.type !== '+').length;
    const bCount = slice.filter((o) => o.type !== '-').length;
    out.push({ text: `@@ -${range(aLine, aCount)} +${range(bLine, bCount)} @@`, tone: 'cyan' });
    for (const o of slice) {
      const noEol = !o.line.endsWith('\n');
      out.push({ text: o.type + o.line.replace(/\n$/, ''), tone: o.type === '+' ? 'green' : o.type === '-' ? 'red' : 'normal' });
      if (noEol) out.push({ text: '\\ No newline at end of file', tone: 'normal' });
    }
  }
  return out;
}
