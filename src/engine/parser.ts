// コマンド文字列 → トークン → オプションと位置引数。

export type Redirect = { op: '>' | '>>'; path: string };

/** シェル風の分割（"..." と '...' とバックスラッシュ、> / >> リダイレクト） */
export function tokenize(line: string): { tokens: string[]; redirect?: Redirect; error?: string } {
  const tokens: string[] = [];
  let cur = '';
  let has = false;
  let quote: '"' | "'" | null = null;
  let redirect: Redirect | undefined;
  let pendingRedirect: Redirect['op'] | null = null;
  const push = () => {
    if (!has) return;
    if (pendingRedirect) {
      redirect = { op: pendingRedirect, path: cur };
      pendingRedirect = null;
    } else tokens.push(cur);
    cur = '';
    has = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && (line[i + 1] === '"' || line[i + 1] === '\\')) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(c)) push();
    else if (c === '>') {
      push();
      pendingRedirect = line[i + 1] === '>' ? (i++, '>>') : '>';
    } else {
      cur += c;
      has = true;
    }
  }
  if (quote) return { tokens: [], error: '引用符が閉じられていません' };
  push();
  if (pendingRedirect) return { tokens: [], error: 'リダイレクト先のファイル名がありません' };
  return { tokens, redirect };
}

export type OptSpec = {
  /** 短いオプション文字 → 正式名 */
  short?: Record<string, string>;
  /** 値を取るオプションの正式名 */
  valued?: string[];
  /** 何度でも指定できる値付きオプション（-m など） */
  multiple?: string[];
  /** 長いオプション名（正式名と同じ） */
  long?: string[];
};

export type ParsedArgs = {
  opts: Record<string, string | boolean | string[]>;
  positional: string[];
  /** -- 以降の引数（パス） */
  afterDashDash: string[] | null;
};

export class OptionError extends Error {}

export function parseArgs(args: string[], spec: OptSpec): ParsedArgs {
  const short = spec.short ?? {};
  const valued = new Set(spec.valued ?? []);
  const multiple = new Set(spec.multiple ?? []);
  const long = new Set([...(spec.long ?? []), ...Object.values(short), ...valued, ...multiple]);
  const opts: ParsedArgs['opts'] = {};
  const positional: string[] = [];
  let afterDashDash: string[] | null = null;
  const set = (name: string, value: string | boolean) => {
    if (multiple.has(name)) opts[name] = [...((opts[name] as string[]) ?? []), String(value)];
    else opts[name] = value;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      afterDashDash = args.slice(i + 1);
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (!long.has(name)) throw new OptionError(`error: unknown option \`${name}'`);
      if (valued.has(name) || multiple.has(name)) {
        const v = eq > 0 ? a.slice(eq + 1) : args[++i];
        if (v === undefined) throw new OptionError(`error: option \`${name}' requires a value`);
        set(name, v);
      } else set(name, true);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      // -am "msg" のような短いオプションの連結
      for (let j = 1; j < a.length; j++) {
        const name = short[a[j]];
        if (!name) throw new OptionError(`error: unknown switch \`${a[j]}'`);
        if (valued.has(name) || multiple.has(name)) {
          const rest = a.slice(j + 1);
          const v = rest || args[++i];
          if (v === undefined) throw new OptionError(`error: switch \`${a[j]}' requires a value`);
          set(name, v);
          break;
        }
        set(name, true);
      }
    } else positional.push(a);
  }
  return { opts, positional, afterDashDash };
}

/** パス指定（"." / ディレクトリ / * を含むグロブ / 完全一致）にパスが当てはまるか */
export function matchPathspec(spec: string, path: string): boolean {
  const s = spec.replace(/^\.\//, '').replace(/\/$/, '');
  if (s === '.' || s === '' || s === ':/') return true;
  if (path === s || path.startsWith(`${s}/`)) return true;
  if (/[*?]/.test(s)) {
    const re = new RegExp(`^${s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return re.test(path);
  }
  return false;
}
