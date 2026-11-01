// .gitignore の判定（ルート直下の .gitignore のみ対応。入れ子の .gitignore は未対応）。
import type { Path } from './types';

type Rule = { negate: boolean; dirOnly: boolean; anchored: boolean; re: RegExp };

function globToRe(glob: string): string {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

export function parseIgnore(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split('\n')) {
    let line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    rules.push({ negate, dirOnly, anchored, re: new RegExp(`^${globToRe(line)}$`) });
  }
  return rules;
}

function matchesRule(rule: Rule, path: Path, isDir: boolean): boolean {
  if (rule.dirOnly && !isDir) return false;
  if (rule.anchored) return rule.re.test(path);
  return rule.re.test(path.split('/').pop()!);
}

/** パス（またはその親ディレクトリ）が無視対象か */
export function isIgnored(rules: Rule[], path: Path): boolean {
  if (rules.length === 0) return false;
  const segs = path.split('/');
  // 親ディレクトリが無視されていれば中身も無視（実 Git と同じく、親が除外されると ! で戻せない）
  for (let i = 1; i < segs.length; i++) {
    const dir = segs.slice(0, i).join('/');
    if (decide(rules, dir, true)) return true;
  }
  return decide(rules, path, false);
}

function decide(rules: Rule[], path: Path, isDir: boolean): boolean {
  let ignored = false;
  for (const r of rules) if (matchesRule(r, path, isDir)) ignored = !r.negate;
  return ignored;
}
