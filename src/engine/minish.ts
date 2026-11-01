// hooks と git bisect run のための小さなシェル。eval は使わず、限られた構文だけを自前で解釈する。
//   使えるもの：echo / exit / true / false / grep / cat / test・[ ] / git（呼び出し側が用意）
//   構文：; と改行、| パイプ、&& ||、! 、if … then … elif … else … fi、{ … ; }、"$1" などの位置引数、>&2

export type ShellEnv = {
  args: string[];
  /** ワークツリー（と .git/COMMIT_EDITMSG など）のファイルを読む */
  readFile(path: string): string | null;
  /** git の一部のコマンド。標準出力と終了コードを返す */
  git(argv: string[]): { code: number; out: string };
};

export type ScriptResult = { code: number; out: string[] };

type Tok = { t: 'word'; v: string; quoted: boolean } | { t: 'op'; v: string };

class ExitSignal {
  constructor(public code: number) {}
}

function tokenize(src: string, args: string[]): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const expand = (name: string) => (name === '#' ? String(args.length) : /^\d$/.test(name) ? (args[Number(name) - 1] ?? '') : '');
  while (i < src.length) {
    const c = src[i];
    if (c === '#' && (i === 0 || /\s/.test(src[i - 1]))) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\n' || c === ';') {
      toks.push({ t: 'op', v: ';' });
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (src.startsWith('&&', i) || src.startsWith('||', i)) {
      toks.push({ t: 'op', v: src.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if (src.startsWith('>&2', i) || src.startsWith('1>&2', i)) {
      i += src.startsWith('>&2', i) ? 3 : 4;
      continue; // 標準エラーも同じ出力に出す
    }
    if (src.startsWith('2>/dev/null', i)) {
      i += 11;
      continue;
    }
    if (c === '|') {
      toks.push({ t: 'op', v: '|' });
      i++;
      continue;
    }
    // 単語（引用符とバックスラッシュ、$1 の展開）
    let word = '';
    let quoted = false;
    while (i < src.length && !/[\s;|&]/.test(src[i])) {
      const ch = src[i];
      if (ch === "'") {
        quoted = true;
        const end = src.indexOf("'", i + 1);
        if (end < 0) throw new SyntaxError("引用符 ' が閉じられていません");
        word += src.slice(i + 1, end);
        i = end + 1;
      } else if (ch === '"') {
        quoted = true;
        i++;
        while (i < src.length && src[i] !== '"') {
          if (src[i] === '\\' && /["\\$`]/.test(src[i + 1] ?? '')) {
            word += src[i + 1];
            i += 2;
          } else if (src[i] === '$' && /[\d#]/.test(src[i + 1] ?? '')) {
            word += expand(src[i + 1]);
            i += 2;
          } else word += src[i++];
        }
        if (src[i] !== '"') throw new SyntaxError('引用符 " が閉じられていません');
        i++;
      } else if (ch === '\\') {
        word += src[i + 1] ?? '';
        i += 2;
      } else if (ch === '$' && /[\d#]/.test(src[i + 1] ?? '')) {
        word += expand(src[i + 1]);
        i += 2;
      } else word += src[i++];
    }
    toks.push({ t: 'word', v: word, quoted });
  }
  return toks;
}

// ---- 構文木 ----
type Cmd = { k: 'simple'; words: string[] } | { k: 'if'; branches: { cond: List; body: List }[]; else?: List } | { k: 'group'; body: List };
type Pipeline = { neg: boolean; cmds: Cmd[] };
type AndOr = { first: Pipeline; rest: { op: '&&' | '||'; p: Pipeline }[] };
type List = AndOr[];

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek() {
    return this.toks[this.i];
  }
  isWord(v: string) {
    const t = this.peek();
    return t?.t === 'word' && !t.quoted && t.v === v;
  }
  skipSeps() {
    while (this.peek()?.t === 'op' && this.peek()!.v === ';') this.i++;
  }
  expectWord(v: string) {
    this.skipSeps();
    if (!this.isWord(v)) throw new SyntaxError(`「${v}」がありません`);
    this.i++;
  }
  list(stop: string[]): List {
    const out: List = [];
    this.skipSeps();
    while (this.peek() && !stop.some((s) => this.isWord(s))) {
      out.push(this.andOr());
      this.skipSeps();
    }
    return out;
  }
  andOr(): AndOr {
    const first = this.pipeline();
    const rest: AndOr['rest'] = [];
    while (this.peek()?.t === 'op' && (this.peek()!.v === '&&' || this.peek()!.v === '||')) {
      const op = this.peek()!.v as '&&' | '||';
      this.i++;
      this.skipSeps();
      rest.push({ op, p: this.pipeline() });
    }
    return { first, rest };
  }
  pipeline(): Pipeline {
    let neg = false;
    if (this.isWord('!')) {
      neg = true;
      this.i++;
    }
    const cmds = [this.command()];
    while (this.peek()?.t === 'op' && this.peek()!.v === '|') {
      this.i++;
      cmds.push(this.command());
    }
    return { neg, cmds };
  }
  command(): Cmd {
    if (this.isWord('if')) {
      this.i++;
      const branches: { cond: List; body: List }[] = [];
      let cond = this.list(['then']);
      this.expectWord('then');
      let body = this.list(['elif', 'else', 'fi']);
      branches.push({ cond, body });
      let elseList: List | undefined;
      while (this.isWord('elif')) {
        this.i++;
        cond = this.list(['then']);
        this.expectWord('then');
        body = this.list(['elif', 'else', 'fi']);
        branches.push({ cond, body });
      }
      if (this.isWord('else')) {
        this.i++;
        elseList = this.list(['fi']);
      }
      this.expectWord('fi');
      return { k: 'if', branches, else: elseList };
    }
    if (this.isWord('{')) {
      this.i++;
      const body = this.list(['}']);
      this.expectWord('}');
      return { k: 'group', body };
    }
    const words: string[] = [];
    while (this.peek()?.t === 'word' && !(words.length === 0 && ['then', 'fi', 'else', 'elif', '}'].some((s) => this.isWord(s)))) words.push((this.toks[this.i++] as { v: string }).v);
    if (!words.length) throw new SyntaxError(`予期しない「${this.peek()?.v ?? '（行末）'}」`);
    return { k: 'simple', words };
  }
}

// ---- 実行 ----
function grepRegex(pattern: string, o: { extended: boolean; fixed: boolean; ignore: boolean }): RegExp {
  let src = pattern;
  if (o.fixed) src = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  else if (!o.extended) {
    // 基本正規表現：+ ? | ( ) { } はそのままの文字、\+ \| などが特別な意味
    src = '';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\' && '+?|(){}'.includes(pattern[i + 1] ?? '')) src += pattern[++i];
      else if (c === '\\') src += c + (pattern[++i] ?? '');
      else src += '+?|(){}'.includes(c) ? `\\${c}` : c;
    }
  }
  try {
    return new RegExp(src, o.ignore ? 'i' : '');
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.ignore ? 'i' : '');
  }
}

function lines(text: string): string[] {
  return text === '' ? [] : text.replace(/\n$/, '').split('\n');
}

export function runScript(src: string, env: ShellEnv): ScriptResult {
  const out: string[] = [];
  let list: List;
  try {
    list = new Parser(tokenize(src, env.args)).list([]);
  } catch (e) {
    return { code: 2, out: [`sh: 構文エラー：${(e as Error).message}`] };
  }

  const simple = (words: string[], stdin: string | null): { code: number; stdout: string } => {
    const [cmd, ...a] = words;
    switch (cmd) {
      case 'echo': {
        const n = a[0] === '-n';
        return { code: 0, stdout: (n ? a.slice(1) : a).join(' ') + (n ? '' : '\n') };
      }
      case 'exit':
        throw new ExitSignal(a[0] ? Number(a[0]) || 0 : 0);
      case 'true':
      case ':':
        return { code: 0, stdout: '' };
      case 'false':
        return { code: 1, stdout: '' };
      case 'cat': {
        if (!a.length) return { code: 0, stdout: stdin ?? '' };
        let s = '';
        for (const f of a) {
          const c = env.readFile(f);
          if (c === null) return { code: 1, stdout: `cat: ${f}: No such file or directory\n` };
          s += c;
        }
        return { code: 0, stdout: s };
      }
      case 'grep': {
        const flags = { q: false, extended: false, fixed: false, ignore: false, invert: false, count: false, num: false };
        const rest: string[] = [];
        for (const w of a) {
          if (/^-[qEFivcn]+$/.test(w) && !rest.length) {
            for (const f of w.slice(1)) {
              if (f === 'q') flags.q = true;
              if (f === 'E') flags.extended = true;
              if (f === 'F') flags.fixed = true;
              if (f === 'i') flags.ignore = true;
              if (f === 'v') flags.invert = true;
              if (f === 'c') flags.count = true;
              if (f === 'n') flags.num = true;
            }
          } else rest.push(w);
        }
        const [pattern, ...files] = rest;
        if (pattern === undefined) return { code: 2, stdout: 'usage: grep [-qEFivcn] PATTERN [FILE...]\n' };
        const re = grepRegex(pattern, flags);
        const sources: string[] = [];
        if (files.length) {
          for (const f of files) {
            const c = env.readFile(f);
            if (c === null) return { code: 2, stdout: flags.q ? '' : `grep: ${f}: No such file or directory\n` };
            sources.push(c);
          }
        } else sources.push(stdin ?? '');
        const hits: string[] = [];
        for (const src of sources) lines(src).forEach((l, i) => re.test(l) !== flags.invert && hits.push(flags.num ? `${i + 1}:${l}` : l));
        const code = hits.length ? 0 : 1;
        if (flags.q) return { code, stdout: '' };
        if (flags.count) return { code, stdout: `${hits.length}\n` };
        return { code, stdout: hits.map((h) => `${h}\n`).join('') };
      }
      case 'test':
      case '[': {
        const t = cmd === '[' ? a.slice(0, a[a.length - 1] === ']' ? -1 : undefined) : a;
        let ok: boolean;
        if (t[0] === '!') ok = !simple(['test', ...t.slice(1)], null).code;
        else if (t.length === 1) ok = t[0] !== '';
        else if (t[0] === '-z') ok = (t[1] ?? '') === '';
        else if (t[0] === '-n') ok = (t[1] ?? '') !== '';
        else if (t[0] === '-f' || t[0] === '-e') ok = env.readFile(t[1] ?? '') !== null;
        else if (t[1] === '=' || t[1] === '==') ok = t[0] === t[2];
        else if (t[1] === '!=') ok = t[0] !== t[2];
        else if (['-eq', '-ne', '-lt', '-gt', '-le', '-ge'].includes(t[1])) {
          const [x, y] = [Number(t[0]), Number(t[2])];
          ok = { '-eq': x === y, '-ne': x !== y, '-lt': x < y, '-gt': x > y, '-le': x <= y, '-ge': x >= y }[t[1] as '-eq'];
        } else ok = false;
        return { code: ok ? 0 : 1, stdout: '' };
      }
      case 'git': {
        const r = env.git(a);
        return { code: r.code, stdout: r.out };
      }
      default:
        return { code: 127, stdout: `sh: ${cmd}: command not found（このサイトの hooks では echo / exit / grep / cat / test / git だけが使えます）\n` };
    }
  };

  const runCmd = (c: Cmd, stdin: string | null): { code: number; stdout: string } => {
    if (c.k === 'simple') return simple(c.words, stdin);
    if (c.k === 'group') return { code: runList(c.body), stdout: '' };
    for (const b of c.branches) if (runList(b.cond) === 0) return { code: runList(b.body), stdout: '' };
    return { code: c.else ? runList(c.else) : 0, stdout: '' };
  };

  const runPipeline = (p: Pipeline): number => {
    let stdin: string | null = null;
    let code = 0;
    p.cmds.forEach((c, i) => {
      const r = runCmd(c, stdin);
      code = r.code;
      if (i === p.cmds.length - 1) out.push(...lines(r.stdout));
      else stdin = r.stdout;
    });
    return p.neg ? (code === 0 ? 1 : 0) : code;
  };

  const runList = (l: List): number => {
    let code = 0;
    for (const ao of l) {
      code = runPipeline(ao.first);
      for (const { op, p } of ao.rest) if ((op === '&&' && code === 0) || (op === '||' && code !== 0)) code = runPipeline(p);
    }
    return code;
  };

  try {
    const code = runList(list);
    return { code, out };
  } catch (e) {
    if (e instanceof ExitSignal) return { code: e.code, out };
    throw e;
  }
}
