// C lexer + preprocessor (#include, #define with function-like macros, #, ##, conditionals).

export class CompileError extends Error {
  constructor(msg, file, line, col) { super(msg); this.file = file; this.line = line; this.col = col; }
}

const PUNCT = [
  '>>=', '<<=', '...', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '^=', '|=', '##',
  '[', ']', '(', ')', '{', '}', '.', '&', '*', '+', '-', '~', '!', '/', '%', '<', '>', '^', '|',
  '?', ':', ';', '=', ',', '#',
];

export function tokenize(src, file) {
  const toks = [];
  let i = 0, line = 1, lineStart = 0, bol = true, space = false;
  const n = src.length;
  const err = (m) => { throw new CompileError(m, file, line, i - lineStart + 1); };
  while (i < n) {
    const c = src[i];
    if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
      i += src[i + 1] === '\r' ? 3 : 2; line++; lineStart = i; continue;
    }
    if (c === '\n') { i++; line++; lineStart = i; bol = true; space = false; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; space = true; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; space = true; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { line++; lineStart = i + 1; } i++; }
      if (i >= n) err('unterminated comment');
      i += 2; space = true; continue;
    }
    const col = i - lineStart + 1;
    const mk = (t, v) => { toks.push({ t, v, file, line, col, bol, space, hide: null }); bol = false; space = false; };
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      mk('id', src.slice(i, j)); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      let j = i;
      while (j < n) {
        const d = src[j];
        if (/[0-9A-Za-z_.]/.test(d)) { j++; continue; }
        if ((d === '+' || d === '-') && /[eEpP]/.test(src[j - 1]) && !/^0[xX]/.test(src.slice(i, j - 1)) ) { j++; continue; }
        if ((d === '+' || d === '-') && /[pP]/.test(src[j - 1])) { j++; continue; }
        break;
      }
      mk('num', src.slice(i, j)); i = j; continue;
    }
    if (c === '"' || c === "'" || ((c === 'L' || c === 'u' || c === 'U') && (src[i + 1] === '"' || src[i + 1] === "'"))) {
      let j = i; if (c !== '"' && c !== "'") j++;
      const q = src[j]; j++;
      while (j < n && src[j] !== q) { if (src[j] === '\\') j++; if (src[j] === '\n') err('unterminated literal'); j++; }
      if (j >= n) err('unterminated literal');
      j++;
      mk(q === '"' ? 'str' : 'chr', src.slice(i, j)); i = j; continue;
    }
    let p = null;
    for (const s of PUNCT) if (src.startsWith(s, i)) { p = s; break; }
    if (!p) err(`stray '${c}' in program`);
    mk('punct', p); i += p.length;
  }
  toks.push({ t: 'eof', v: '', file, line, col: 1, bol: true, space: false, hide: null });
  return toks;
}

// ---- string / char literal decoding
export function decodeEscapes(body, file, line) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    let c = body.charCodeAt(i);
    if (body[i] !== '\\') { out.push(c); continue; }
    i++;
    const e = body[i];
    switch (e) {
      case 'n': out.push(10); break; case 't': out.push(9); break; case 'r': out.push(13); break;
      case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
        let v = 0, k = 0;
        while (k < 3 && /[0-7]/.test(body[i])) { v = v * 8 + (body.charCodeAt(i) - 48); i++; k++; }
        i--; out.push(v & 0xFF); break;
      }
      case 'x': {
        let v = 0; i++;
        while (/[0-9a-fA-F]/.test(body[i])) { v = v * 16 + parseInt(body[i], 16); i++; }
        i--; out.push(v & 0xFF); break;
      }
      case 'a': out.push(7); break; case 'b': out.push(8); break; case 'f': out.push(12); break; case 'v': out.push(11); break;
      case 'e': out.push(27); break;
      default: out.push(body.charCodeAt(i));
    }
  }
  return out;
}

// ---- preprocessor
export class Preprocessor {
  constructor(opts) {
    this.files = opts.files;            // { name: source } user project files
    this.builtins = opts.builtins;      // { name: source } system headers
    this.macros = new Map();
    this.warnings = opts.warnings || [];
    this.onceFiles = new Set();
    this.depth = 0;
    const pre = {
      __STDC__: '1', __arm__: '1', __thumb__: '1', __thumb2__: '1', __ARM_ARCH_7M__: '1', __SIM_LPC1768__: '1',
      __CORTEX_M: '3', __STDC_VERSION__: '199901L', __CHAR_UNSIGNED__: '1', __ARMEL__: '1',
    };
    for (const k in pre) this.macros.set(k, { name: k, obj: true, body: tokenize(pre[k], '<builtin>').slice(0, -1) });
    for (const k in (opts.defines || {})) this.macros.set(k, { name: k, obj: true, body: tokenize(String(opts.defines[k]), '<cmdline>').slice(0, -1) });
  }

  findInclude(name, angle, fromFile) {
    const lower = name.toLowerCase();
    const tryUser = () => {
      for (const f in this.files) if (f.toLowerCase() === lower || f.toLowerCase().endsWith('/' + lower)) return { name: f, src: this.files[f] };
      return null;
    };
    const tryBuiltin = () => {
      for (const f in this.builtins) if (f.toLowerCase() === lower) return { name: '<' + f + '>', src: this.builtins[f] };
      return null;
    };
    return angle ? (tryBuiltin() || tryUser()) : (tryUser() || tryBuiltin());
  }

  run(fileName, src) {
    const out = [];
    this.processFile(fileName, src, out);
    out.push({ t: 'eof', v: '', file: fileName, line: 0, col: 0 });
    return out;
  }

  processFile(fileName, src, out) {
    if (this.onceFiles.has(fileName)) return;
    if (++this.depth > 64) throw new CompileError('#include nested too deeply', fileName, 1);
    const toks = tokenize(src, fileName);
    const cond = []; // {active, taken, parent}
    const active = () => cond.length === 0 || cond[cond.length - 1].active;
    let i = 0;
    let pending = [];
    const flush = () => { if (pending.length) { this.expandInto(pending, out); pending = []; } };
    while (toks[i].t !== 'eof') {
      const t = toks[i];
      if (t.bol && t.t === 'punct' && t.v === '#') {
        // directive line
        const line = [];
        i++;
        while (toks[i].t !== 'eof' && !toks[i].bol) line.push(toks[i++]);
        const d = line[0];
        if (!d) continue;
        const dn = d.v;
        const rest = line.slice(1);
        const err = (m) => { throw new CompileError(m, t.file, t.line, t.col); };
        if (dn === 'if' || dn === 'ifdef' || dn === 'ifndef') {
          const par = active();
          let v = false;
          if (par) {
            if (dn === 'if') v = this.evalIf(rest, t);
            else { if (!rest[0] || rest[0].t !== 'id') err(`#${dn} expects a macro name`); v = this.macros.has(rest[0].v) === (dn === 'ifdef'); }
          }
          cond.push({ active: par && v, taken: v, parent: par });
          continue;
        }
        if (dn === 'elif') {
          const c = cond[cond.length - 1]; if (!c) err('#elif without #if');
          if (c.taken || !c.parent) c.active = false;
          else { const v = this.evalIf(rest, t); c.active = v; c.taken = v; }
          continue;
        }
        if (dn === 'else') {
          const c = cond[cond.length - 1]; if (!c) err('#else without #if');
          c.active = c.parent && !c.taken; c.taken = true; continue;
        }
        if (dn === 'endif') { if (!cond.length) err('#endif without #if'); cond.pop(); continue; }
        if (!active()) continue;
        flush();
        switch (dn) {
          case 'define': this.define(rest, t); break;
          case 'undef': if (rest[0]) this.macros.delete(rest[0].v); break;
          case 'include': {
            let name, angle;
            let r = rest;
            if (r[0] && r[0].t !== 'str' && !(r[0].t === 'punct' && r[0].v === '<')) r = this.expandList(r);
            if (r[0] && r[0].t === 'str') { name = r[0].v.slice(1, -1); angle = false; }
            else if (r[0] && r[0].v === '<') {
              name = ''; let k = 1;
              while (r[k] && r[k].v !== '>') { name += (r[k].space && name ? ' ' : '') + r[k].v; k++; }
              angle = true;
            } else err('#include expects "FILENAME" or <FILENAME>');
            const f = this.findInclude(name, angle, t.file);
            if (!f) err(`cannot open include file '${name}'`);
            this.processFile(f.name, f.src, out);
            break;
          }
          case 'error': err('#error ' + rest.map(x => x.v).join(' '));
          // falls through
          case 'warning': this.warnings.push({ msg: '#warning ' + rest.map(x => x.v).join(' '), file: t.file, line: t.line }); break;
          case 'pragma': if (rest[0] && rest[0].v === 'once') this.onceFiles.add(fileName); break;
          case 'line': break;
          default: err(`invalid preprocessing directive #${dn}`);
        }
        continue;
      }
      if (active()) pending.push(t);
      i++;
    }
    flush();
    if (cond.length) throw new CompileError('unterminated #if', fileName, toks[toks.length - 1].line);
    this.depth--;
  }

  define(rest, t) {
    const name = rest[0];
    if (!name || name.t !== 'id') throw new CompileError('macro name missing', t.file, t.line);
    if (rest[1] && rest[1].v === '(' && !rest[1].space) {
      const params = [];
      let k = 2, variadic = false;
      while (rest[k] && rest[k].v !== ')') {
        if (rest[k].v === '...') { variadic = true; params.push('__VA_ARGS__'); }
        else if (rest[k].t === 'id') params.push(rest[k].v);
        k++;
        if (rest[k] && rest[k].v === ',') k++;
      }
      this.macros.set(name.v, { name: name.v, obj: false, params, variadic, body: rest.slice(k + 1) });
    } else {
      this.macros.set(name.v, { name: name.v, obj: true, body: rest.slice(1) });
    }
  }

  evalIf(rest, t) {
    // handle defined()
    const r = [];
    for (let k = 0; k < rest.length; k++) {
      if (rest[k].t === 'id' && rest[k].v === 'defined') {
        let nm;
        if (rest[k + 1] && rest[k + 1].v === '(') { nm = rest[k + 2]; k += 3; } else { nm = rest[k + 1]; k += 1; }
        r.push({ ...rest[k], t: 'num', v: nm && this.macros.has(nm.v) ? '1' : '0' });
      } else r.push(rest[k]);
    }
    const ex = this.expandList(r).map(x => x.t === 'id' ? { ...x, t: 'num', v: '0' } : x);
    let p = 0;
    const err = () => { throw new CompileError('invalid #if expression', t.file, t.line); };
    const peek = () => ex[p] ? ex[p].v : '';
    const num = (s) => {
      if (s.t === 'chr') { const b = decodeEscapes(s.v.slice(1, -1)); return b[0] || 0; }
      const m = s.v.replace(/[uUlL]+$/, '');
      if (/^0[xX]/.test(m)) return parseInt(m, 16);
      if (/^0[bB]/.test(m)) return parseInt(m.slice(2), 2);
      if (/^0[0-7]+$/.test(m)) return parseInt(m, 8);
      const v = Number(m); if (isNaN(v)) err(); return v;
    };
    const prim = () => {
      const s = ex[p++]; if (!s) err();
      if (s.v === '(') { const v = cond(); if (peek() !== ')') err(); p++; return v; }
      if (s.v === '!') return prim() ? 0 : 1;
      if (s.v === '~') return ~prim();
      if (s.v === '-') return -prim();
      if (s.v === '+') return prim();
      if (s.t === 'num' || s.t === 'chr') return num(s);
      err();
    };
    const BIN = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
    const bin = (lvl) => {
      if (lvl >= BIN.length) return prim();
      let a = bin(lvl + 1);
      while (BIN[lvl].includes(peek())) {
        const op = ex[p++].v; const b = bin(lvl + 1);
        switch (op) {
          case '||': a = (a || b) ? 1 : 0; break; case '&&': a = (a && b) ? 1 : 0; break;
          case '|': a = a | b; break; case '^': a = a ^ b; break; case '&': a = a & b; break;
          case '==': a = a === b ? 1 : 0; break; case '!=': a = a !== b ? 1 : 0; break;
          case '<': a = a < b ? 1 : 0; break; case '>': a = a > b ? 1 : 0; break;
          case '<=': a = a <= b ? 1 : 0; break; case '>=': a = a >= b ? 1 : 0; break;
          case '<<': a = a << b; break; case '>>': a = a >> b; break;
          case '+': a = a + b; break; case '-': a = a - b; break; case '*': a = a * b; break;
          case '/': if (!b) err(); a = Math.trunc(a / b); break; case '%': if (!b) err(); a = a % b; break;
        }
      }
      return a;
    };
    const cond = () => {
      const c = bin(0);
      if (peek() === '?') { p++; const a = cond(); if (peek() !== ':') err(); p++; const b = cond(); return c ? a : b; }
      return c;
    };
    const v = cond();
    return v !== 0;
  }

  expandList(toks) { const out = []; this.expandInto(toks, out); return out; }

  expandInto(input, out) {
    const q = input.slice().reverse(); // stack: pop from end
    while (q.length) {
      const t = q.pop();
      if (t.t !== 'id') { out.push(t); continue; }
      if (t.v === '__LINE__') { out.push({ ...t, t: 'num', v: String(t.line) }); continue; }
      if (t.v === '__FILE__') { out.push({ ...t, t: 'str', v: JSON.stringify(t.file) }); continue; }
      const m = this.macros.get(t.v);
      if (!m || (t.hide && t.hide.has(t.v))) { out.push(t); continue; }
      const hide = new Set(t.hide || []); hide.add(m.name);
      if (m.obj) {
        const body = this.paste(m.body.map(b => ({ ...b, file: t.file, line: t.line, col: t.col, hide })), t);
        if (body.length) body[0] = { ...body[0], space: t.space, bol: t.bol };
        for (let k = body.length - 1; k >= 0; k--) q.push(body[k]);
        continue;
      }
      // function-like: need '('
      if (!q.length || q[q.length - 1].v !== '(') { out.push(t); continue; }
      q.pop();
      const args = [[]];
      let depth = 0;
      for (;;) {
        if (!q.length) throw new CompileError(`unterminated argument list invoking macro '${m.name}'`, t.file, t.line);
        const a = q.pop();
        if (a.t === 'eof') throw new CompileError(`unterminated argument list invoking macro '${m.name}'`, t.file, t.line);
        if (a.v === '(' && a.t === 'punct') depth++;
        else if (a.v === ')' && a.t === 'punct') { if (depth === 0) break; depth--; }
        else if (a.v === ',' && a.t === 'punct' && depth === 0 && !(m.variadic && args.length === m.params.length)) { args.push([]); continue; }
        args[args.length - 1].push(a);
      }
      if (m.params.length === 0 && args.length === 1 && args[0].length === 0) args.length = 0;
      if (args.length < m.params.length && m.variadic && args.length === m.params.length - 1) args.push([]);
      if (args.length !== m.params.length) throw new CompileError(`macro '${m.name}' requires ${m.params.length} arguments, but ${args.length} given`, t.file, t.line);
      const body = this.substitute(m, args, t, hide);
      if (body.length) body[0] = { ...body[0], space: t.space };
      for (let k = body.length - 1; k >= 0; k--) q.push(body[k]);
    }
  }

  substitute(m, args, t, hide) {
    const res = [];
    const body = m.body;
    const idx = (tok) => tok.t === 'id' ? m.params.indexOf(tok.v) : -1;
    for (let k = 0; k < body.length; k++) {
      const b = body[k];
      if (b.v === '#' && b.t === 'punct' && body[k + 1] && idx(body[k + 1]) >= 0) {
        const a = args[idx(body[k + 1])];
        const s = a.map((x, n) => (n && x.space ? ' ' : '') + x.v).join('');
        res.push({ ...b, t: 'str', v: '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', file: t.file, line: t.line, hide });
        k++; continue;
      }
      const pi = idx(b);
      if (pi >= 0) {
        const adjPaste = (body[k + 1] && body[k + 1].v === '##') || (body[k - 1] && body[k - 1].v === '##');
        const a = adjPaste ? args[pi] : this.expandList(args[pi]);
        if (a.length === 0 && adjPaste) { res.push({ t: 'placemarker', v: '', file: t.file, line: t.line, hide }); continue; }
        a.forEach((x, n) => res.push({ ...x, file: t.file, line: t.line, col: t.col, space: n === 0 ? b.space : x.space, hide: new Set([...(x.hide || []), ...hide]) }));
        continue;
      }
      res.push({ ...b, file: t.file, line: t.line, col: t.col, hide });
    }
    return this.paste(res, t);
  }

  paste(toks, t) {
    if (!toks.some(x => x.v === '##')) return toks.filter(x => x.t !== 'placemarker');
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      if (toks[k].v === '##' && toks[k].t === 'punct' && out.length && toks[k + 1]) {
        const l = out.pop(), r = toks[++k];
        const text = (l.v || '') + (r.v || '');
        if (!text) { continue; }
        const nt = tokenize(text, t.file);
        if (nt.length !== 2) throw new CompileError(`pasting "${l.v}" and "${r.v}" does not give a valid token`, t.file, t.line);
        out.push({ ...nt[0], file: t.file, line: t.line, hide: l.hide, space: l.space });
      } else out.push(toks[k]);
    }
    return out.filter(x => x.t !== 'placemarker');
  }
}
