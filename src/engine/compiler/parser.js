// C parser + semantic analysis -> typed AST.
import { CompileError, decodeEscapes } from './preprocess.js';

// ------------------------------------------------------------------ types
const mk = (kind, size, align, unsigned, name) => ({ kind, size, align, unsigned, name });
export const ty = {
  void: mk('void', 1, 1, false, 'void'),
  bool: mk('bool', 1, 1, true, '_Bool'),
  char: mk('char', 1, 1, true, 'char'),
  schar: mk('char', 1, 1, false, 'signed char'),
  uchar: mk('char', 1, 1, true, 'unsigned char'),
  short: mk('short', 2, 2, false, 'short'),
  ushort: mk('short', 2, 2, true, 'unsigned short'),
  int: mk('int', 4, 4, false, 'int'),
  uint: mk('int', 4, 4, true, 'unsigned int'),
  long: mk('int', 4, 4, false, 'long'),
  ulong: mk('int', 4, 4, true, 'unsigned long'),
  float: mk('float', 4, 4, false, 'float'),
  double: mk('float', 4, 4, false, 'double'),
};
export const isInteger = (t) => t.kind === 'bool' || t.kind === 'char' || t.kind === 'short' || t.kind === 'int' || t.kind === 'enum';
export const isFlonum = (t) => t.kind === 'float';
export const isNumeric = (t) => isInteger(t) || isFlonum(t);
export const isPtr = (t) => t.kind === 'ptr' || t.kind === 'array';
export const isScalar = (t) => isNumeric(t) || t.kind === 'ptr';
export const pointerTo = (base) => ({ kind: 'ptr', size: 4, align: 4, unsigned: true, base });
export const arrayOf = (base, len) => ({ kind: 'array', size: base.size * Math.max(len, 0), align: base.align, base, len });
export const funcType = (ret) => ({ kind: 'func', size: 1, align: 1, ret, params: [], variadic: false });
export function typeName(t) {
  if (!t) return '?';
  switch (t.kind) {
    case 'ptr': return typeName(t.base) + ' *';
    case 'array': return `${typeName(t.base)}[${t.len < 0 ? '' : t.len}]`;
    case 'func': return `${typeName(t.ret)}(${t.params.map(typeName).join(', ')})`;
    case 'struct': case 'union': return `${t.kind} ${t.tag || '<anon>'}`;
    default: return t.name || t.kind;
  }
}
const alignTo = (n, a) => Math.ceil(n / a) * a;

const KEYWORDS = new Set(['void', '_Bool', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', 'struct', 'union', 'enum',
  'typedef', 'static', 'extern', 'inline', '__inline', '__inline__', 'const', 'volatile', 'register', 'auto', 'restrict', '__restrict',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto', 'sizeof', '_Alignof',
  '__attribute__', '__asm', '__asm__', 'asm', '__volatile__', '__packed', '__irq', '_Noreturn', '__weak', '__forceinline', '__STATIC_INLINE']);

export const BUILTINS = new Set(['__enable_irq', '__disable_irq', '__WFI', '__WFE', '__NOP', '__SEV', '__DSB', '__ISB', '__DMB',
  '__get_PRIMASK', '__set_PRIMASK', '__get_MSP', '__set_MSP', '__get_PSP', '__set_PSP', '__get_CONTROL', '__set_CONTROL',
  '__get_BASEPRI', '__set_BASEPRI', '__REV', '__REV16', '__RBIT', '__CLZ', '__umulh', '__smulh', '__builtin_va_start', '__BKPT',
  '__enable_fault_irq', '__disable_fault_irq', '__builtin_expect']);

// ------------------------------------------------------------------ parser
export class Parser {
  constructor(tokens, opts) {
    this.toks = tokens; this.p = 0;
    this.tu = opts.tu;           // translation unit id (for static name mangling)
    this.file = opts.file;
    this.warnings = opts.warnings;
    this.globals = [];
    this.functions = [];
    this.scopes = [{ vars: new Map(), tags: new Map() }];
    this.strCount = 0;
    this.uid = opts.uidGen;
    this.curFn = null;
  }

  // ---- token helpers
  get tok() { return this.toks[this.p]; }
  peek(n = 1) { return this.toks[this.p + n]; }
  err(msg, t = this.tok) { throw new CompileError(msg, t.file, t.line, t.col); }
  warn(msg, t = this.tok) { this.warnings.push({ msg, file: t.file, line: t.line }); }
  is(v) { const t = this.tok; return (t.t === 'punct' || t.t === 'id') && t.v === v; }
  next() { return this.toks[this.p++]; }
  consume(v) { if (this.is(v)) { this.p++; return true; } return false; }
  expect(v) {
    if (!this.is(v)) {
      const t = this.tok;
      const prev = this.toks[this.p - 1];
      if ((v === ';' || v === ')') && prev && prev.line !== t.line) this.err(`expected '${v}' after '${prev.v}'`, prev);
      this.err(`expected '${v}' but found '${t.t === 'eof' ? 'end of file' : t.v}'`);
    }
    return this.next();
  }
  declSep() {
    if (this.consume(',')) return;
    const prev = this.toks[this.p - 1];
    this.err(`expected ';' after '${prev.v}'`, prev.line !== this.tok.line ? prev : this.tok);
  }
  ident() { const t = this.tok; if (t.t !== 'id' || KEYWORDS.has(t.v)) this.err(`expected identifier but found '${t.v}'`); this.p++; return t; }

  // ---- scopes
  enterScope() { this.scopes.push({ vars: new Map(), tags: new Map() }); }
  leaveScope() { this.scopes.pop(); }
  findVar(name) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].vars.get(name); if (v) return v; } return null; }
  findTag(name) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].tags.get(name); if (v) return v; } return null; }
  pushVar(name, entry) { this.scopes[this.scopes.length - 1].vars.set(name, entry); return entry; }

  isTypedef(t) { if (t.t !== 'id') return false; const v = this.findVar(t.v); return v && v.kind === 'typedef'; }
  isTypename(t = this.tok) {
    if (t.t !== 'id') return false;
    return ['void', '_Bool', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', 'struct', 'union', 'enum',
      'typedef', 'static', 'extern', 'inline', '__inline', '__inline__', 'const', 'volatile', 'register', 'auto', 'restrict', '__restrict',
      '__attribute__', '__packed', '_Noreturn', '__weak', '__forceinline', '__irq', '__STATIC_INLINE'].includes(t.v) || this.isTypedef(t);
  }

  // ---- program
  parse() {
    while (this.tok.t !== 'eof') {
      if (this.consume(';')) continue;
      const attr = {};
      const base = this.declspec(attr);
      if (attr.isTypedef) { this.parseTypedef(base); continue; }
      if (this.consume(';')) continue; // struct declaration
      if (this.isFunction()) { this.functionDef(base, attr); continue; }
      this.globalVars(base, attr);
    }
    return { globals: this.globals, functions: this.functions };
  }

  isFunction() {
    if (this.is(';')) return false;
    const save = this.p;
    const d = this.declarator({ ...ty.int });
    this.p = save;
    return d.type.kind === 'func';
  }

  skipAttributes() {
    for (;;) {
      if (this.is('__attribute__')) {
        this.next(); this.expect('('); let depth = 1;
        while (depth && this.tok.t !== 'eof') { const t = this.next(); if (t.v === '(') depth++; else if (t.v === ')') depth--; }
        continue;
      }
      if (this.is('__packed') || this.is('__weak') || this.is('__irq')) { this.next(); continue; }
      break;
    }
  }

  // ---- declaration specifiers
  declspec(attr) {
    const VOID = 1, BOOL = 2, CHAR = 4, SHORT = 16, INT = 64, LONG = 256, FLOAT = 1024, DOUBLE = 4096, OTHER = 16384, SIGNED = 65536, UNSIGNED = 131072;
    let counter = 0, t = { ...ty.int };
    let isConst = false;
    const start = this.tok;
    while (this.isTypename()) {
      const tk = this.tok;
      if (['typedef', 'static', 'extern', 'inline', '__inline', '__inline__', '_Noreturn', '__forceinline', '__STATIC_INLINE'].includes(tk.v)) {
        if (!attr) this.err('storage class specifier is not allowed in this context');
        if (tk.v === 'typedef') attr.isTypedef = true;
        else if (tk.v === 'static' || tk.v === '__STATIC_INLINE') attr.isStatic = true;
        else if (tk.v === 'extern') attr.isExtern = true;
        else attr.isInline = true;
        this.next(); continue;
      }
      if (['const'].includes(tk.v)) { isConst = true; this.next(); continue; }
      if (['volatile', 'register', 'auto', 'restrict', '__restrict'].includes(tk.v)) { this.next(); continue; }
      if (['__attribute__', '__packed', '__weak', '__irq'].includes(tk.v)) { this.skipAttributes(); continue; }
      if (tk.v === 'struct' || tk.v === 'union' || tk.v === 'enum' || this.isTypedef(tk)) {
        if (counter) break;
        if (tk.v === 'struct' || tk.v === 'union') { this.next(); t = this.structDecl(tk.v); }
        else if (tk.v === 'enum') { this.next(); t = this.enumSpec(); }
        else { t = this.findVar(tk.v).type; this.next(); }
        counter += OTHER;
        continue;
      }
      switch (tk.v) {
        case 'void': counter += VOID; break; case '_Bool': counter += BOOL; break; case 'char': counter += CHAR; break;
        case 'short': counter += SHORT; break; case 'int': counter += INT; break; case 'long': counter += LONG; break;
        case 'float': counter += FLOAT; break; case 'double': counter += DOUBLE; break;
        case 'signed': counter |= SIGNED; break; case 'unsigned': counter |= UNSIGNED; break;
      }
      this.next();
      switch (counter) {
        case VOID: t = ty.void; break;
        case BOOL: t = ty.bool; break;
        case CHAR: t = ty.char; break;
        case SIGNED + CHAR: t = ty.schar; break;
        case UNSIGNED + CHAR: t = ty.uchar; break;
        case SHORT: case SHORT + INT: case SIGNED + SHORT: case SIGNED + SHORT + INT: t = ty.short; break;
        case UNSIGNED + SHORT: case UNSIGNED + SHORT + INT: t = ty.ushort; break;
        case INT: case SIGNED: case SIGNED + INT: t = ty.int; break;
        case UNSIGNED: case UNSIGNED + INT: t = ty.uint; break;
        case LONG: case LONG + INT: case SIGNED + LONG: case SIGNED + LONG + INT: t = ty.long; break;
        case LONG + LONG: case LONG + LONG + INT: case SIGNED + LONG + LONG: case SIGNED + LONG + LONG + INT:
          this.warnOnce('llong', '64-bit "long long" is not supported by the simulator compiler; treated as 32-bit', tk); t = ty.long; break;
        case UNSIGNED + LONG: case UNSIGNED + LONG + INT: t = ty.ulong; break;
        case UNSIGNED + LONG + LONG: case UNSIGNED + LONG + LONG + INT:
          this.warnOnce('llong', '64-bit "long long" is not supported by the simulator compiler; treated as 32-bit', tk); t = ty.ulong; break;
        case FLOAT: t = ty.float; break;
        case DOUBLE: case LONG + DOUBLE: t = ty.double; break;
        default: this.err('invalid type', tk);
      }
    }
    if (this.tok === start && !counter) {
      // implicit int (old style) - only allowed for declarations following storage class
      if (attr && this.tok.t === 'id' && this.peek().v === '(') this.warn(`return type defaults to 'int'`);
      else if (!attr || !(attr.isStatic || attr.isExtern || attr.isTypedef)) this.err(`unknown type name '${this.tok.v}'`);
    }
    if (isConst) t = { ...t, isConst: true };
    return t;
  }
  warnOnce(key, msg, t) { if (t && t.file && t.file[0] === '<') return; this.warned = this.warned || new Set(); if (!this.warned.has(key)) { this.warned.add(key); this.warn(msg, t); } }

  // ---- declarators
  pointers(t) {
    while (this.consume('*')) {
      t = pointerTo(t);
      while (['const', 'volatile', 'restrict', '__restrict'].includes(this.tok.v) && this.tok.t === 'id') {
        if (this.tok.v === 'const') t = { ...t, isConst: true };
        this.next();
      }
    }
    return t;
  }
  declarator(t) {
    t = this.pointers(t);
    this.skipAttributes();
    if (this.is('(') && !this.isTypename(this.peek()) && !this.peek().v.match(/^\)$/)) {
      const start = this.p;
      this.next();
      this.declarator({ ...ty.int }); // skip
      this.expect(')');
      t = this.typeSuffix(t);
      const after = this.p;
      this.p = start + 1;
      const d = this.declarator(t);
      this.p = after;
      return d;
    }
    let name = null;
    if (this.tok.t === 'id' && !KEYWORDS.has(this.tok.v)) name = this.next();
    t = this.typeSuffix(t);
    this.skipAttributes();
    return { type: t, name };
  }
  abstractDeclarator(t) {
    t = this.pointers(t);
    if (this.is('(') && (this.peek().v === '*' || this.peek().v === '(' || this.peek().v === '[')) {
      const start = this.p;
      this.next();
      this.abstractDeclarator({ ...ty.int });
      this.expect(')');
      t = this.typeSuffix(t);
      const after = this.p;
      this.p = start + 1;
      const d = this.abstractDeclarator(t);
      this.p = after;
      return d;
    }
    return this.typeSuffix(t);
  }
  typeName() { const b = this.declspec(null); return this.abstractDeclarator(b); }

  typeSuffix(t) {
    if (this.is('(')) { this.next(); return this.funcParams(t); }
    if (this.is('[')) {
      this.next();
      while (['static', 'const', 'restrict'].includes(this.tok.v)) this.next();
      if (this.consume(']')) { const r = this.typeSuffix(t); return arrayOf(r, -1); }
      const n = this.constExpr();
      if (n < 0) this.err('size of array is negative');
      this.expect(']');
      const r = this.typeSuffix(t);
      return arrayOf(r, n);
    }
    return t;
  }

  funcParams(ret) {
    const ft = funcType(ret);
    ft.paramNames = [];
    if (this.is('void') && this.peek().v === ')') { this.next(); this.next(); return ft; }
    if (this.consume(')')) { ft.oldStyle = true; return ft; }
    for (;;) {
      if (this.consume('...')) { ft.variadic = true; this.expect(')'); break; }
      const b = this.declspec(null);
      const d = this.declarator(b);
      let pt = d.type;
      if (pt.kind === 'array') pt = pointerTo(pt.base);
      else if (pt.kind === 'func') pt = pointerTo(pt);
      ft.params.push(pt);
      ft.paramNames.push(d.name);
      if (this.consume(')')) break;
      this.expect(',');
    }
    return ft;
  }

  // ---- struct / union / enum
  structDecl(kind) {
    this.skipAttributes();
    let tag = null;
    if (this.tok.t === 'id' && !KEYWORDS.has(this.tok.v)) tag = this.next().v;
    if (tag && !this.is('{')) {
      const t = this.findTag(tag);
      if (t) return t;
      const nt = { kind, size: -1, align: 1, tag, members: [], incomplete: true };
      this.scopes[this.scopes.length - 1].tags.set(tag, nt);
      return nt;
    }
    this.expect('{');
    let t;
    if (tag) {
      const existing = this.scopes[this.scopes.length - 1].tags.get(tag);
      if (existing && existing.incomplete) t = existing;
    }
    if (!t) t = { kind, size: 0, align: 1, tag, members: [] };
    if (tag) this.scopes[this.scopes.length - 1].tags.set(tag, t);
    const members = [];
    while (!this.consume('}')) {
      const b = this.declspec(null);
      if ((b.kind === 'struct' || b.kind === 'union') && this.consume(';')) { members.push({ name: null, type: b }); continue; }
      let first = true;
      while (!this.consume(';')) {
        if (!first) this.expect(',');
        first = false;
        const d = this.declarator(b);
        if (this.is(':')) this.err('bit-fields are not supported by the simulator compiler');
        members.push({ name: d.name ? d.name.v : null, type: d.type });
      }
    }
    let off = 0, align = 1, size = 0;
    for (const m of members) {
      const mt = m.type;
      if (mt.kind === 'array' && mt.len < 0) { m.offset = alignTo(off, mt.align); continue; }
      if (mt.size < 0) this.err(`member has incomplete type`);
      if (kind === 'struct') { off = alignTo(off, mt.align); m.offset = off; off += mt.size; size = off; }
      else { m.offset = 0; size = Math.max(size, mt.size); }
      align = Math.max(align, mt.align);
    }
    this.skipAttributes();
    t.members = members; t.align = align; t.size = alignTo(size, align); t.incomplete = false;
    return t;
  }

  enumSpec() {
    let tag = null;
    if (this.tok.t === 'id' && !KEYWORDS.has(this.tok.v)) tag = this.next().v;
    const t = { ...ty.int, name: tag ? 'enum ' + tag : 'enum' };
    if (tag && !this.is('{')) { const e = this.findTag(tag); return e || t; }
    this.expect('{');
    let val = 0;
    while (!this.consume('}')) {
      const name = this.ident();
      if (this.consume('=')) val = this.constExpr();
      this.pushVar(name.v, { kind: 'enumconst', value: val, type: ty.int });
      val++;
      if (this.consume('}')) break;
      this.expect(',');
    }
    if (tag) this.scopes[this.scopes.length - 1].tags.set(tag, t);
    return t;
  }

  parseTypedef(base) {
    let first = true;
    while (!this.consume(';')) {
      if (!first) this.expect(',');
      first = false;
      const d = this.declarator(base);
      if (!d.name) this.err('typedef name omitted');
      this.pushVar(d.name.v, { kind: 'typedef', type: d.type });
    }
  }

  // ---- globals & functions
  linkName(name, isStatic) { return isStatic ? `${name}@${this.tu}` : name; }

  declareGlobal(name, t, attr, tok) {
    let v = this.scopes[0].vars.get(name.v);
    if (v && v.kind === 'var') {
      if (t.kind === 'array' && v.type.kind === 'array' && v.type.len < 0) v.type = t;
      return v;
    }
    v = { kind: 'var', name: name.v, type: t, isLocal: false, isStatic: !!attr.isStatic, label: this.linkName(name.v, attr.isStatic), isDefinition: false, init: null, tok };
    this.pushVar(name.v, v);
    if (!this.allGlobals) this.allGlobals = new Map();
    return v;
  }

  globalVars(base, attr) {
    let first = true;
    while (!this.consume(';')) {
      if (!first) this.declSep();
      first = false;
      const d = this.declarator(base);
      if (!d.name) this.err('variable name omitted');
      if (d.type.kind === 'func') { this.declareFunction(d, attr); continue; }
      const v = this.declareGlobal(d.name, d.type, attr, d.name);
      if (this.is('=')) {
        this.next();
        this.curGlobal = v;
        v.init = this.gvarInitializer(v);
        v.isDefinition = true;
        if (!this.globals.includes(v)) this.globals.push(v);
      } else if (!attr.isExtern) {
        v.isDefinition = true; v.tentative = true;
        if (!this.globals.includes(v)) this.globals.push(v);
      }
      if (v.type.kind === 'array' && v.type.len < 0 && v.isDefinition && !v.init) v.type = arrayOf(v.type.base, 1);
      if (attr.isExtern === undefined && d.type.isConst) v.isConst = true;
      if (d.type.isConst || (d.type.kind === 'array' && this.elemConst(d.type))) v.isConst = true;
    }
  }
  elemConst(t) { while (t.kind === 'array') t = t.base; return !!t.isConst; }

  declareFunction(d, attr) {
    const name = d.name.v;
    let f = this.scopes[0].vars.get(name);
    if (f && f.kind === 'func') { if (!f.type.oldStyle || d.type.oldStyle) {} else f.type = d.type; return f; }
    f = { kind: 'func', name, type: d.type, isStatic: !!attr.isStatic, label: this.linkName(name, attr.isStatic), tok: d.name };
    this.scopes[0].vars.set(name, f);
    return f;
  }

  functionDef(base, attr) {
    const d = this.declarator(base);
    const f = this.declareFunction(d, attr);
    f.type = d.type;
    if (this.consume(';')) return;
    if (f.defined) this.err(`redefinition of '${f.name}'`, d.name);
    f.defined = true;
    const fn = { name: f.name, label: f.label, type: d.type, sym: f, params: [], locals: [], isStatic: f.isStatic, tok: d.name, file: d.name.file, labels: new Map(), gotos: [] };
    this.curFn = fn;
    this.enterScope();
    d.type.params.forEach((pt, i) => {
      const nm = d.type.paramNames[i];
      const v = this.newLocal(nm ? nm.v : `__p${i}`, pt);
      fn.params.push(v);
    });
    this.expect('{');
    fn.body = this.compoundStmt(true);
    this.leaveScope();
    for (const g of fn.gotos) if (!fn.labels.has(g.label)) this.err(`label '${g.label}' used but not defined`, g.tok);
    this.curFn = null;
    this.functions.push(fn);
  }

  newLocal(name, t) {
    const v = { kind: 'var', name, type: t, isLocal: true, offset: 0 };
    this.pushVar(name, v);
    this.curFn.locals.push(v);
    return v;
  }

  newAnonGlobal(t, prefix = 'L') {
    const label = `.${prefix}${this.uid()}`;
    const v = { kind: 'var', name: label, type: t, isLocal: false, isStatic: true, label, isDefinition: true, init: null };
    this.globals.push(v);
    return v;
  }

  newStringLiteral(bytes, tok) {
    const t = arrayOf(ty.char, bytes.length);
    const v = this.newAnonGlobal(t, 'str');
    v.init = { bytes: Uint8Array.from(bytes), relocs: [] };
    v.isConst = true;
    v.isString = true;
    return v;
  }

  // ---- initializers
  newInit(t, allowFlex) {
    const init = { ty: t, children: null, expr: null, isFlexible: false };
    if (t.kind === 'array') {
      if (allowFlex && t.len < 0) { init.isFlexible = true; return init; }
      init.children = [];
      for (let i = 0; i < t.len; i++) init.children.push(this.newInit(t.base, false));
    } else if (t.kind === 'struct' || t.kind === 'union') {
      init.children = t.members.map(m => this.newInit(m.type, false));
    }
    return init;
  }

  skipExcessElement() {
    if (this.is('{')) { this.next(); this.skipExcessElement(); this.expect('}'); return; }
    this.assign();
  }

  stringInitializer(init) {
    const t = this.next();
    const bytes = this.stringBytes(t);
    if (init.isFlexible) { Object.assign(init, this.newInit(arrayOf(init.ty.base, bytes.length), false)); }
    const len = Math.min(init.ty.len, bytes.length);
    for (let i = 0; i < len; i++) init.children[i].expr = { kind: 'num', val: bytes[i], ty: ty.int, tok: t };
  }

  countArrayElems(t) {
    const save = this.p;
    const dummy = this.newInit(t.base, true);
    let i = 0, max = 0;
    const braced = this.consume('{');
    while (braced ? !this.is('}') : !this.is(';') && !this.is(',')) {
      if (i > 0 && braced) this.expect(',');
      if (braced && this.is('}')) break;
      if (this.is('[')) { this.next(); i = this.constExpr(); this.expect(']'); this.consume('='); }
      this.initializer2(this.newInit(t.base, false));
      i++; max = Math.max(max, i);
      if (!braced) break;
      if (this.is(',') && this.peek().v === '}') { this.next(); break; }
    }
    void dummy;
    this.p = save;
    return max;
  }

  arrayInitializer1(init) {
    if (init.isFlexible) {
      const len = this.countArrayElems({ ...init.ty });
      Object.assign(init, this.newInit(arrayOf(init.ty.base, len), false));
    }
    this.expect('{');
    let i = 0, first = true;
    while (!this.consumeEnd()) {
      if (!first) this.expect(',');
      first = false;
      if (this.is('}')) { this.next(); break; }
      if (this.is('[')) { this.next(); i = this.constExpr(); this.expect(']'); this.expect('='); }
      if (i < init.ty.len) this.initializer2(init.children[i]); else this.skipExcessElement();
      i++;
    }
  }
  consumeEnd() {
    if (this.is('}')) { this.next(); return true; }
    if (this.is(',') && this.peek().v === '}') { this.next(); this.next(); return true; }
    return false;
  }
  arrayInitializer2(init) {
    if (init.isFlexible) {
      // count by brace elision
      const save = this.p; let n = 0;
      const sub = init.ty.base;
      for (;;) {
        this.initializer2(this.newInit(sub, false)); n++;
        if (this.is(',') && !this.isEndAhead()) { this.next(); continue; }
        break;
      }
      this.p = save;
      Object.assign(init, this.newInit(arrayOf(init.ty.base, n), false));
    }
    for (let i = 0; i < init.ty.len && !this.isEnd(); i++) {
      if (i > 0) this.expect(',');
      this.initializer2(init.children[i]);
    }
  }
  isEnd() { return this.is('}') || (this.is(',') && this.peek().v === '}'); }
  isEndAhead() { return this.peek().v === '}'; }

  structInitializer1(init) {
    this.expect('{');
    let i = 0, first = true;
    const mem = init.ty.members;
    while (!this.consumeEnd()) {
      if (!first) this.expect(',');
      first = false;
      if (this.is('}')) { this.next(); break; }
      if (this.is('.') && this.peek().t === 'id') {
        this.next(); const nm = this.ident().v; this.expect('=');
        i = mem.findIndex(m => m.name === nm);
        if (i < 0) this.err(`no member named '${nm}'`);
      }
      if (i < mem.length) { this.initializer2(init.children[i]); i++; if (init.ty.kind === 'union') i = mem.length; }
      else this.skipExcessElement();
    }
  }
  structInitializer2(init) {
    const n = init.ty.kind === 'union' ? 1 : init.ty.members.length;
    for (let i = 0; i < n && !this.isEnd(); i++) {
      if (i > 0) this.expect(',');
      this.initializer2(init.children[i]);
    }
  }

  initializer2(init) {
    const t = init.ty;
    if (t.kind === 'array' && isInteger(t.base) && t.base.size === 1 && this.tok.t === 'str') { this.stringInitializer(init); return; }
    if (t.kind === 'array' && isInteger(t.base) && t.base.size === 1 && this.is('{') && this.peek().t === 'str' && (this.peek(2).v === '}')) {
      this.next(); this.stringInitializer(init); this.consume(','); this.expect('}'); return;
    }
    if (t.kind === 'array') { if (this.is('{')) this.arrayInitializer1(init); else this.arrayInitializer2(init); return; }
    if (t.kind === 'struct' || t.kind === 'union') {
      if (this.is('{')) { this.structInitializer1(init); return; }
      const save = this.p;
      const e = this.assign();
      if (e.ty.kind === t.kind) { init.expr = e; return; }
      this.p = save;
      this.structInitializer2(init);
      return;
    }
    if (this.is('{')) { this.next(); init.expr = this.assign(); this.consume(','); this.expect('}'); return; }
    init.expr = this.assign();
  }

  initializer(t) {
    const init = this.newInit(t, true);
    this.initializer2(init);
    if (init.isFlexible) Object.assign(init, this.newInit(arrayOf(t.base, 0), false));
    return { init, type: init.ty };
  }

  gvarInitializer(v) {
    const { init, type } = this.initializer(v.type);
    v.type = type;
    const bytes = new Uint8Array(type.size);
    const relocs = [];
    this.writeGvarData(init, type, bytes, relocs, 0);
    return { bytes, relocs };
  }

  writeGvarData(init, t, bytes, relocs, off) {
    if (t.kind === 'array') {
      if (!init.children) return;
      for (let i = 0; i < t.len; i++) this.writeGvarData(init.children[i], t.base, bytes, relocs, off + t.base.size * i);
      return;
    }
    if (t.kind === 'struct') {
      if (init.expr) this.err('struct initializer from expression not supported for globals');
      t.members.forEach((m, i) => this.writeGvarData(init.children[i], m.type, bytes, relocs, off + m.offset));
      return;
    }
    if (t.kind === 'union') {
      if (!init.children) return;
      const idx = init.children.findIndex(c => c.expr || (c.children && c.children.some(x => x.expr)));
      if (idx >= 0) this.writeGvarData(init.children[idx], t.members[idx].type, bytes, relocs, off);
      return;
    }
    if (!init.expr) return;
    const e = this.castTo(init.expr, t);
    const val = this.evalConst(e, true);
    if (typeof val === 'object') {
      if (t.size !== 4) this.err('initializer element is not a compile-time constant', init.expr.tok);
      relocs.push({ offset: off, label: val.label, addend: val.addend });
      return;
    }
    let iv;
    if (isFlonum(t)) { const f = new Float32Array([val]); iv = new Uint32Array(f.buffer)[0]; }
    else iv = Number(BigInt.asUintN(32, BigInt(Math.trunc(val))));
    for (let k = 0; k < t.size; k++) bytes[off + k] = (iv >>> (8 * k)) & 0xFF;
  }

  // local initialization: returns list of expression nodes
  lvarInitializer(v, tok) {
    const { init, type } = this.initializer(v.type);
    v.type = type;
    const aggregate = !isScalar(type);
    const exprs = aggregate ? [{ kind: 'memzero', v, ty: ty.void, tok }] : [];
    const build = (init, t, lv) => {
      if (t.kind === 'array') {
        if (!init.children) return;
        for (let i = 0; i < t.len; i++) {
          const elem = this.newDeref(this.newAdd(lv, { kind: 'num', val: i, ty: ty.int, tok }, tok), tok);
          build(init.children[i], t.base, elem);
        }
        return;
      }
      if ((t.kind === 'struct' || t.kind === 'union') && !init.expr) {
        t.members.forEach((m, i) => {
          if (t.kind === 'union' && !(init.children[i].expr || init.children[i].children)) return;
          build(init.children[i], m.type, { kind: 'member', lhs: lv, mem: m, ty: m.type, tok });
        });
        return;
      }
      if (!init.expr) return;
      if (aggregate && init.expr.kind === 'num' && init.expr.val === 0 && !isFlonum(t)) return; // already zeroed
      exprs.push(this.newAssign(lv, init.expr, tok));
    };
    build(init, type, { kind: 'var', v, ty: type, tok });
    return exprs;
  }

  // ---- constant evaluation
  evalConst(n, allowAddr = false) {
    const ev = (n) => this.evalConst(n, allowAddr);
    const err = () => this.err('initializer element is not a compile-time constant', n.tok || this.tok);
    switch (n.kind) {
      case 'num': return n.val;
      case 'add': case 'sub': {
        const a = ev(n.lhs), b = ev(n.rhs);
        if (typeof a === 'object' && typeof b === 'number') return { label: a.label, addend: a.addend + (n.kind === 'add' ? b : -b) };
        if (typeof b === 'object' && typeof a === 'number' && n.kind === 'add') return { label: b.label, addend: b.addend + a };
        if (typeof a === 'object' || typeof b === 'object') err();
        return this.wrap(n.kind === 'add' ? a + b : a - b, n.ty);
      }
      case 'mul': return this.wrap(isFlonum(n.ty) ? ev(n.lhs) * ev(n.rhs) : Math.imul(this.num(ev(n.lhs)), this.num(ev(n.rhs))), n.ty);
      case 'div': { const b = this.num(ev(n.rhs)); if (b === 0 && !isFlonum(n.ty)) this.err('division by zero', n.tok); return isFlonum(n.ty) ? ev(n.lhs) / b : this.wrap(this.idiv(ev(n.lhs), b, n.ty), n.ty); }
      case 'mod': { const b = this.num(ev(n.rhs)); if (b === 0) this.err('division by zero', n.tok); return this.wrap(this.imod(ev(n.lhs), b, n.ty), n.ty); }
      case 'band': return this.wrap(this.num(ev(n.lhs)) & this.num(ev(n.rhs)), n.ty);
      case 'bor': return this.wrap(this.num(ev(n.lhs)) | this.num(ev(n.rhs)), n.ty);
      case 'bxor': return this.wrap(this.num(ev(n.lhs)) ^ this.num(ev(n.rhs)), n.ty);
      case 'shl': return this.wrap(this.num(ev(n.lhs)) << this.num(ev(n.rhs)), n.ty);
      case 'shr': return this.wrap(n.ty.unsigned ? (this.num(ev(n.lhs)) >>> 0) >>> this.num(ev(n.rhs)) : this.num(ev(n.lhs)) >> this.num(ev(n.rhs)), n.ty);
      case 'eq': return ev(n.lhs) === ev(n.rhs) ? 1 : 0;
      case 'ne': return ev(n.lhs) !== ev(n.rhs) ? 1 : 0;
      case 'lt': return this.cmpv(ev(n.lhs), ev(n.rhs), n.lhs.ty) < 0 ? 1 : 0;
      case 'le': return this.cmpv(ev(n.lhs), ev(n.rhs), n.lhs.ty) <= 0 ? 1 : 0;
      case 'cond': return this.num(ev(n.cond)) ? ev(n.then) : ev(n.els);
      case 'comma': return ev(n.rhs);
      case 'not': return this.num(ev(n.lhs)) ? 0 : 1;
      case 'bitnot': return this.wrap(~this.num(ev(n.lhs)), n.ty);
      case 'neg': return isFlonum(n.ty) ? -ev(n.lhs) : this.wrap(-ev(n.lhs), n.ty);
      case 'logand': return this.num(ev(n.lhs)) && this.num(ev(n.rhs)) ? 1 : 0;
      case 'logor': return this.num(ev(n.lhs)) || this.num(ev(n.rhs)) ? 1 : 0;
      case 'cast': {
        const v = ev(n.lhs);
        if (typeof v === 'object') { if (n.ty.size === 4) return v; err(); }
        if (isFlonum(n.ty)) return Math.fround(v);
        if (n.ty.kind === 'bool') return v ? 1 : 0;
        return this.wrap(Math.trunc(v), n.ty);
      }
      case 'addr': if (!allowAddr) err(); return this.evalAddr(n.lhs);
      case 'var':
        if (!allowAddr) err();
        if (n.ty.kind === 'array' || n.ty.kind === 'func') return this.evalAddr(n);
        err();
        break;
      case 'member': case 'deref':
        if (allowAddr && n.ty.kind === 'array') return this.evalAddr(n);
        err();
    }
    err();
  }
  evalAddr(n) {
    if (n.kind === 'var') { if (n.v.isLocal) this.err('initializer element is not a compile-time constant', n.tok); return { label: n.v.label, addend: 0 }; }
    if (n.kind === 'deref') { const v = this.evalConst(n.lhs, true); return typeof v === 'object' ? v : { label: null, addend: v }; }
    if (n.kind === 'member') { const b = this.evalAddr(n.lhs); return { label: b.label, addend: b.addend + n.mem.offset }; }
    if (n.kind === 'func') return { label: n.fn.label, addend: 0 };
    this.err('initializer element is not a compile-time constant', n.tok);
  }
  num(v) { if (typeof v === 'object') { if (v.label === null) return v.addend; this.err('initializer element is not a compile-time constant'); } return v; }
  wrap(v, t) {
    if (typeof v === 'object') return v;
    if (!t || isFlonum(t)) return v;
    v = Math.trunc(v);
    const bits = t.size * 8;
    if (t.kind === 'bool') return v ? 1 : 0;
    let u = Number(BigInt.asUintN(bits, BigInt(v)));
    if (!t.unsigned && u >= 2 ** (bits - 1)) u -= 2 ** bits;
    return u;
  }
  idiv(a, b, t) { return Math.trunc(a / b); }
  imod(a, b, t) { return a % b; }
  cmpv(a, b, t) { if (t && t.unsigned) { a >>>= 0; b >>>= 0; } return a - b; }
  constExpr() {
    const n = this.conditional();
    const v = this.evalConst(n);
    if (typeof v !== 'number') this.err('expected integer constant expression');
    return Math.trunc(v);
  }

  // ------------------------------------------------------------------ statements
  compoundStmt(isFnBody) {
    const tok = this.toks[this.p - 1];
    const stmts = [];
    if (!isFnBody) this.enterScope();
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.err("expected '}' at end of input", tok);
      if (this.isTypename() && this.peek().v !== ':') {
        const attr = {};
        const base = this.declspec(attr);
        if (attr.isTypedef) { this.parseTypedef(base); continue; }
        if (this.isFunctionDeclHere()) { const d = this.declarator(base); this.declareFunction(d, attr); this.pushVar(d.name.v, this.scopes[0].vars.get(d.name.v)); this.expect(';'); continue; }
        if (attr.isExtern) { this.localExtern(base, attr); continue; }
        if (attr.isStatic) { this.localStatic(base, attr); continue; }
        stmts.push(this.declaration(base));
        continue;
      }
      stmts.push(this.stmt());
    }
    this.next();
    if (!isFnBody) this.leaveScope();
    return { kind: 'block', body: stmts, tok };
  }
  isFunctionDeclHere() {
    const save = this.p;
    if (this.is(';')) return false;
    const d = this.declarator({ ...ty.int });
    this.p = save;
    return d.type.kind === 'func';
  }
  localExtern(base, attr) {
    let first = true;
    while (!this.consume(';')) {
      if (!first) this.expect(','); first = false;
      const d = this.declarator(base);
      const g = this.scopes[0].vars.get(d.name.v) || this.declareGlobal(d.name, d.type, { isExtern: true }, d.name);
      if (!this.scopes[0].vars.has(d.name.v)) this.scopes[0].vars.set(d.name.v, g);
      this.pushVar(d.name.v, g);
    }
  }
  localStatic(base, attr) {
    let first = true;
    while (!this.consume(';')) {
      if (!first) this.expect(','); first = false;
      const d = this.declarator(base);
      const label = `${d.name.v}.${this.curFn.name}@${this.tu}.${this.uid()}`;
      const v = { kind: 'var', name: d.name.v, type: d.type, isLocal: false, isStatic: true, label, isDefinition: true, init: null };
      this.pushVar(d.name.v, v);
      this.globals.push(v);
      if (this.consume('=')) v.init = this.gvarInitializer(v);
      else v.tentative = true;
      if (d.type.isConst || (d.type.kind === 'array' && this.elemConst(d.type))) v.isConst = true;
    }
  }

  declaration(base) {
    const tok = this.tok;
    const stmts = [];
    let first = true;
    while (!this.consume(';')) {
      if (!first) this.declSep();
      first = false;
      const d = this.declarator(base);
      if (!d.name) this.err('variable name omitted');
      if (d.type.kind === 'void') this.err(`variable '${d.name.v}' declared void`, d.name);
      const v = this.newLocal(d.name.v, d.type);
      if (this.consume('=')) {
        const exprs = this.lvarInitializer(v, d.name);
        for (const e of exprs) stmts.push({ kind: 'expr', expr: e, tok: d.name });
      } else if (d.type.size < 0 || (d.type.kind === 'array' && d.type.len < 0)) this.err(`storage size of '${d.name.v}' isn't known`, d.name);
    }
    return { kind: 'block', body: stmts, tok, noScope: true };
  }

  stmt() {
    const tok = this.tok;
    if (this.consume('return')) {
      if (this.consume(';')) return { kind: 'return', tok };
      let e = this.expr();
      this.expect(';');
      const rt = this.curFn.type.ret;
      if (rt.kind === 'void') { this.warn('return with a value in function returning void', tok); return { kind: 'block', body: [{ kind: 'expr', expr: e, tok }, { kind: 'return', tok }], tok }; }
      if (rt.kind !== 'struct' && rt.kind !== 'union') e = this.castTo(e, rt);
      return { kind: 'return', expr: e, tok };
    }
    if (this.consume('if')) {
      this.expect('(');
      const cond = this.toBoolCond(this.expr());
      this.expect(')');
      const then = this.stmt();
      let els = null;
      if (this.consume('else')) els = this.stmt();
      return { kind: 'if', cond, then, els, tok };
    }
    if (this.consume('switch')) {
      this.expect('(');
      const cond = this.castTo(this.expr(), ty.int, true);
      this.expect(')');
      const sw = { kind: 'switch', cond, cases: [], def: null, tok };
      const prev = this.curSwitch; this.curSwitch = sw;
      const prevBrk = this.brkOk; this.brkOk = true;
      sw.body = this.stmt();
      this.curSwitch = prev; this.brkOk = prevBrk;
      return sw;
    }
    if (this.consume('case')) {
      if (!this.curSwitch) this.err('case label not within a switch statement', tok);
      const val = this.constExpr();
      let hi = val;
      if (this.consume('...')) hi = this.constExpr();
      this.expect(':');
      const node = { kind: 'case', val, hi, tok, label: null };
      this.curSwitch.cases.push(node);
      node.body = this.is('}') ? { kind: 'block', body: [], tok } : this.stmt();
      return node;
    }
    if (this.consume('default')) {
      if (!this.curSwitch) this.err("'default' label not within a switch statement", tok);
      this.expect(':');
      const node = { kind: 'case', isDefault: true, tok };
      this.curSwitch.def = node;
      node.body = this.is('}') ? { kind: 'block', body: [], tok } : this.stmt();
      return node;
    }
    if (this.consume('for')) {
      this.expect('(');
      this.enterScope();
      let init = null;
      if (this.isTypename()) init = this.declaration(this.declspec(null));
      else if (!this.consume(';')) { init = { kind: 'expr', expr: this.expr(), tok }; this.expect(';'); }
      let cond = null;
      if (!this.is(';')) cond = this.toBoolCond(this.expr());
      this.expect(';');
      let inc = null;
      if (!this.is(')')) inc = this.expr();
      this.expect(')');
      const body = this.loopBody();
      this.leaveScope();
      return { kind: 'for', init, cond, inc, body, tok };
    }
    if (this.consume('while')) {
      this.expect('(');
      const cond = this.toBoolCond(this.expr());
      this.expect(')');
      return { kind: 'for', init: null, cond, inc: null, body: this.loopBody(), tok };
    }
    if (this.consume('do')) {
      const body = this.loopBody();
      this.expect('while');
      this.expect('(');
      const cond = this.toBoolCond(this.expr());
      this.expect(')');
      this.expect(';');
      return { kind: 'do', body, cond, tok };
    }
    if (this.consume('break')) { if (!this.brkOk) this.err('break statement not within loop or switch', tok); this.expect(';'); return { kind: 'break', tok }; }
    if (this.consume('continue')) { if (!this.contOk) this.err('continue statement not within a loop', tok); this.expect(';'); return { kind: 'continue', tok }; }
    if (this.consume('goto')) {
      const l = this.ident(); this.expect(';');
      const g = { kind: 'goto', label: l.v, tok: l };
      this.curFn.gotos.push(g);
      return g;
    }
    if (this.tok.t === 'id' && this.peek().v === ':' && !KEYWORDS.has(this.tok.v)) {
      const l = this.next(); this.next();
      const node = { kind: 'label', label: l.v, tok: l, body: this.is('}') ? { kind: 'block', body: [], tok } : this.stmt() };
      this.curFn.labels.set(l.v, node);
      return node;
    }
    if (this.consume('{')) return this.compoundStmt(false);
    if (this.is('__asm') || this.is('__asm__') || this.is('asm')) return this.asmStmt();
    if (this.consume(';')) return { kind: 'block', body: [], tok };
    const e = this.expr();
    this.expect(';');
    return { kind: 'expr', expr: e, tok };
  }
  asmStmt() {
    const tok = this.next();
    while (this.is('volatile') || this.is('__volatile__')) this.next();
    this.expect('(');
    let text = '';
    while (this.tok.t === 'str') text += this.stringBytes(this.next()).slice(0, -1).map(c => String.fromCharCode(c)).join('');
    while (!this.is(')')) this.next();
    this.expect(')'); this.expect(';');
    return { kind: 'asm', text: text.trim(), tok };
  }
  loopBody() {
    const pb = this.brkOk, pc = this.contOk;
    this.brkOk = true; this.contOk = true;
    const prevSw = this.curSwitch;
    const b = this.stmt();
    this.brkOk = pb; this.contOk = pc; this.curSwitch = prevSw;
    return b;
  }

  // ------------------------------------------------------------------ expressions
  expr() {
    let n = this.assign();
    while (this.is(',')) {
      const tok = this.next();
      const r = this.assign();
      n = { kind: 'comma', lhs: n, rhs: r, ty: r.ty, tok };
    }
    return n;
  }

  assign() {
    const n = this.conditional();
    const tok = this.tok;
    if (this.consume('=')) return this.newAssign(n, this.assign(), tok);
    const ops = { '+=': 'add', '-=': 'sub', '*=': 'mul', '/=': 'div', '%=': 'mod', '&=': 'band', '|=': 'bor', '^=': 'bxor', '<<=': 'shl', '>>=': 'shr' };
    if (tok.t === 'punct' && ops[tok.v]) {
      this.next();
      const rhs = this.assign();
      return this.newOpAssign(ops[tok.v], n, rhs, tok);
    }
    return n;
  }

  checkLvalue(n, tok) {
    if (!['var', 'deref', 'member'].includes(n.kind)) this.err('lvalue required as left operand of assignment', tok);
    if (n.ty.kind === 'array') this.err('assignment to expression with array type', tok);
    if (n.kind === 'var' && n.v.isConst) this.warn(`assignment of read-only variable '${n.v.name}'`, tok);
  }

  newAssign(lhs, rhs, tok) {
    this.checkLvalue(lhs, tok);
    if (lhs.ty.kind === 'struct' || lhs.ty.kind === 'union') {
      if (rhs.ty.kind !== lhs.ty.kind) this.err('incompatible types in assignment', tok);
      return { kind: 'assign', lhs, rhs, ty: lhs.ty, tok };
    }
    return { kind: 'assign', lhs, rhs: this.castTo(rhs, lhs.ty), ty: lhs.ty, tok };
  }

  newOpAssign(op, lhs, rhs, tok) {
    this.checkLvalue(lhs, tok);
    const lt = lhs.ty;
    if (lt.kind === 'ptr' && (op === 'add' || op === 'sub')) {
      if (!isInteger(rhs.ty)) this.err('invalid operands to compound assignment', tok);
      const scaled = this.newBinaryRaw('mul', this.castTo(rhs, ty.int), { kind: 'num', val: lt.base.size, ty: ty.int, tok }, ty.int, tok);
      return { kind: 'opassign', op, lhs, rhs: scaled, opTy: ty.int, ty: lt, tok, ptr: true };
    }
    if (!isNumeric(lt) || !isNumeric(rhs.ty)) this.err(`invalid operands to binary ${op}`, tok);
    // compute in the common type
    let ct;
    if (op === 'shl' || op === 'shr') ct = this.promote(lt);
    else ct = this.commonType(lt, rhs.ty);
    if ((op === 'mod' || ['band', 'bor', 'bxor', 'shl', 'shr'].includes(op)) && isFlonum(ct)) this.err('invalid operands to binary operator (float)', tok);
    return { kind: 'opassign', op, lhs, rhs: this.castTo(rhs, op === 'shl' || op === 'shr' ? ty.int : ct), opTy: ct, ty: lt, tok };
  }

  conditional() {
    const c = this.logor();
    if (!this.is('?')) return c;
    const tok = this.next();
    const then = this.expr();
    this.expect(':');
    const els = this.conditional();
    let t;
    if (then.ty.kind === 'void' || els.ty.kind === 'void') t = ty.void;
    else if (isNumeric(then.ty) && isNumeric(els.ty)) t = this.commonType(then.ty, els.ty);
    else if (isPtr(then.ty)) t = pointerTo(then.ty.base);
    else if (isPtr(els.ty)) t = pointerTo(els.ty.base);
    else t = then.ty;
    const cv = (e) => (t.kind === 'void' || t.kind === 'struct' || t.kind === 'union') ? e : this.castTo(e, t);
    return { kind: 'cond', cond: this.toBoolCond(c), then: cv(then), els: cv(els), ty: t, tok };
  }

  toBoolCond(n) {
    if (!isScalar(n.ty) && n.ty.kind !== 'array') this.err('used struct type value where scalar is required', n.tok);
    return n;
  }

  logor() {
    let n = this.logand();
    while (this.is('||')) { const tok = this.next(); n = { kind: 'logor', lhs: this.toBoolCond(n), rhs: this.toBoolCond(this.logand()), ty: ty.int, tok }; }
    return n;
  }
  logand() {
    let n = this.bitor();
    while (this.is('&&')) { const tok = this.next(); n = { kind: 'logand', lhs: this.toBoolCond(n), rhs: this.toBoolCond(this.bitor()), ty: ty.int, tok }; }
    return n;
  }
  bitor() { let n = this.bitxor(); while (this.is('|')) { const tok = this.next(); n = this.newBinary('bor', n, this.bitxor(), tok); } return n; }
  bitxor() { let n = this.bitand(); while (this.is('^')) { const tok = this.next(); n = this.newBinary('bxor', n, this.bitand(), tok); } return n; }
  bitand() { let n = this.equality(); while (this.is('&')) { const tok = this.next(); n = this.newBinary('band', n, this.equality(), tok); } return n; }
  equality() {
    let n = this.relational();
    for (;;) {
      const tok = this.tok;
      if (this.consume('==')) n = this.newCompare('eq', n, this.relational(), tok);
      else if (this.consume('!=')) n = this.newCompare('ne', n, this.relational(), tok);
      else return n;
    }
  }
  relational() {
    let n = this.shift();
    for (;;) {
      const tok = this.tok;
      if (this.consume('<')) n = this.newCompare('lt', n, this.shift(), tok);
      else if (this.consume('<=')) n = this.newCompare('le', n, this.shift(), tok);
      else if (this.consume('>')) n = this.newCompare('lt', this.shift(), n, tok);
      else if (this.consume('>=')) n = this.newCompare('le', this.shift(), n, tok);
      else return n;
    }
  }
  shift() {
    let n = this.add();
    for (;;) {
      const tok = this.tok;
      if (this.consume('<<')) n = this.newShift('shl', n, this.add(), tok);
      else if (this.consume('>>')) n = this.newShift('shr', n, this.add(), tok);
      else return n;
    }
  }
  add() {
    let n = this.mul();
    for (;;) {
      const tok = this.tok;
      if (this.consume('+')) n = this.newAdd(n, this.mul(), tok);
      else if (this.consume('-')) n = this.newSub(n, this.mul(), tok);
      else return n;
    }
  }
  mul() {
    let n = this.cast();
    for (;;) {
      const tok = this.tok;
      if (this.consume('*')) n = this.newBinary('mul', n, this.cast(), tok);
      else if (this.consume('/')) n = this.newBinary('div', n, this.cast(), tok);
      else if (this.consume('%')) n = this.newBinary('mod', n, this.cast(), tok);
      else return n;
    }
  }

  // ---- type conversion helpers
  promote(t) {
    if (t.kind === 'bool' || t.kind === 'char' || t.kind === 'short' || t.kind === 'enum') return ty.int;
    if (t.kind === 'int') return t.unsigned ? ty.uint : ty.int;
    return t;
  }
  commonType(a, b) {
    if (isFlonum(a) || isFlonum(b)) return ty.float;
    if (a.kind === 'ptr') return a;
    if (b.kind === 'ptr') return b;
    a = this.promote(a); b = this.promote(b);
    return (a.unsigned || b.unsigned) ? ty.uint : ty.int;
  }
  castTo(n, t, silent) {
    if (t.kind === 'void') return { kind: 'cast', lhs: n, ty: t, tok: n.tok };
    let from = n.ty;
    if (from.kind === 'array' || from.kind === 'func') { n = this.decay(n); from = n.ty; }
    if (from.kind === 'struct' || from.kind === 'union') {
      if (t.kind === from.kind) return n;
      this.err(`cannot convert '${typeName(from)}' to '${typeName(t)}'`, n.tok);
    }
    if (t.kind === 'struct' || t.kind === 'union') this.err(`cannot convert to '${typeName(t)}'`, n.tok);
    if (from === t) return n;
    if (from.kind === t.kind && from.size === t.size && !!from.unsigned === !!t.unsigned && t.kind !== 'ptr') return n;
    if (n.kind === 'num' && isInteger(t) && !isFlonum(from)) return { kind: 'num', val: this.wrap(n.val, t), ty: t, tok: n.tok };
    if (n.kind === 'num' && isFlonum(t)) return { kind: 'num', val: Math.fround(n.val), ty: t, tok: n.tok };
    if (n.kind === 'num' && isFlonum(from) && isInteger(t)) return { kind: 'num', val: this.wrap(Math.trunc(n.val), t), ty: t, tok: n.tok };
    return { kind: 'cast', lhs: n, ty: t, tok: n.tok };
  }
  decay(n) {
    if (n.ty.kind === 'array') return { kind: 'addr', lhs: n, ty: pointerTo(n.ty.base), tok: n.tok, decay: true };
    if (n.ty.kind === 'func') return { kind: 'addr', lhs: n, ty: pointerTo(n.ty), tok: n.tok, decay: true };
    return n;
  }
  rv(n) { return this.decay(n); }

  fold(n) {
    // constant folding for pure numeric nodes
    const isN = (x) => x.kind === 'num';
    if (n.lhs && isN(n.lhs) && (!n.rhs || isN(n.rhs)) && ['add', 'sub', 'mul', 'div', 'mod', 'band', 'bor', 'bxor', 'shl', 'shr', 'eq', 'ne', 'lt', 'le', 'neg', 'bitnot', 'not'].includes(n.kind)) {
      if ((n.kind === 'div' || n.kind === 'mod') && n.rhs.val === 0) return n;
      try { const v = this.evalConst(n); if (typeof v === 'number') return { kind: 'num', val: v, ty: n.ty, tok: n.tok }; } catch (e) { /* not foldable */ }
    }
    return n;
  }

  newBinaryRaw(kind, l, r, t, tok) { return this.fold({ kind, lhs: l, rhs: r, ty: t, tok }); }

  newBinary(kind, l, r, tok) {
    l = this.rv(l); r = this.rv(r);
    if (!isNumeric(l.ty) || !isNumeric(r.ty)) this.err(`invalid operands to binary '${tok.v}' (have '${typeName(l.ty)}' and '${typeName(r.ty)}')`, tok);
    const t = this.commonType(l.ty, r.ty);
    if (isFlonum(t) && ['mod', 'band', 'bor', 'bxor'].includes(kind)) this.err(`invalid operands to binary '${tok.v}' (have 'float')`, tok);
    return this.newBinaryRaw(kind, this.castTo(l, t), this.castTo(r, t), t, tok);
  }
  newShift(kind, l, r, tok) {
    l = this.rv(l); r = this.rv(r);
    if (!isInteger(l.ty) || !isInteger(r.ty)) this.err(`invalid operands to binary '${tok.v}'`, tok);
    const t = this.promote(l.ty);
    return this.newBinaryRaw(kind, this.castTo(l, t), this.castTo(r, ty.int), t, tok);
  }
  newCompare(kind, l, r, tok) {
    l = this.rv(l); r = this.rv(r);
    let ct;
    if (isNumeric(l.ty) && isNumeric(r.ty)) ct = this.commonType(l.ty, r.ty);
    else if (l.ty.kind === 'ptr' || r.ty.kind === 'ptr') ct = ty.uint;
    else this.err('invalid operands to comparison', tok);
    const n = { kind, lhs: this.castTo(l, ct), rhs: this.castTo(r, ct), ty: ty.int, tok, cmpTy: ct };
    return this.fold(n);
  }
  newAdd(l, r, tok) {
    l = this.rv(l); r = this.rv(r);
    if (isNumeric(l.ty) && isNumeric(r.ty)) return this.newBinary('add', l, r, tok);
    if (l.ty.kind === 'ptr' && r.ty.kind === 'ptr') this.err('invalid operands to binary + (two pointers)', tok);
    if (r.ty.kind === 'ptr') { const t = l; l = r; r = t; }
    if (l.ty.kind !== 'ptr' || !isInteger(r.ty)) this.err('invalid operands to binary +', tok);
    const sz = l.ty.base.size < 0 ? 1 : (l.ty.base.kind === 'void' ? 1 : l.ty.base.size);
    const off = sz === 1 ? this.castTo(r, ty.int) : this.newBinaryRaw('mul', this.castTo(r, ty.int), { kind: 'num', val: sz, ty: ty.int, tok }, ty.int, tok);
    return this.newBinaryRaw('add', l, off, l.ty, tok);
  }
  newSub(l, r, tok) {
    l = this.rv(l); r = this.rv(r);
    if (isNumeric(l.ty) && isNumeric(r.ty)) return this.newBinary('sub', l, r, tok);
    if (l.ty.kind === 'ptr' && isInteger(r.ty)) {
      const sz = l.ty.base.kind === 'void' ? 1 : l.ty.base.size;
      const off = sz === 1 ? this.castTo(r, ty.int) : this.newBinaryRaw('mul', this.castTo(r, ty.int), { kind: 'num', val: sz, ty: ty.int, tok }, ty.int, tok);
      return this.newBinaryRaw('sub', l, off, l.ty, tok);
    }
    if (l.ty.kind === 'ptr' && r.ty.kind === 'ptr') {
      const sz = l.ty.base.kind === 'void' ? 1 : l.ty.base.size;
      const d = { kind: 'sub', lhs: l, rhs: r, ty: ty.int, tok };
      return sz === 1 ? d : { kind: 'div', lhs: d, rhs: { kind: 'num', val: sz, ty: ty.int, tok }, ty: ty.int, tok };
    }
    this.err('invalid operands to binary -', tok);
  }
  newDeref(n, tok) {
    n = this.rv(n);
    if (n.ty.kind !== 'ptr') this.err('invalid type argument of unary \'*\'', tok);
    if (n.ty.base.kind === 'void') this.err('dereferencing \'void *\' pointer', tok);
    if (n.kind === 'addr' && n.lhs.ty.kind !== 'func') return n.lhs;
    return { kind: 'deref', lhs: n, ty: n.ty.base, tok };
  }

  cast() {
    if (this.is('(') && this.isTypename(this.peek())) {
      const tok = this.tok;
      const save = this.p;
      this.next();
      const t = this.typeName();
      this.expect(')');
      if (this.is('{')) { this.p = save; return this.unary(); } // compound literal (unsupported -> error later)
      const e = this.cast();
      if (t.kind === 'void') return { kind: 'cast', lhs: e, ty: ty.void, tok };
      if (!isScalar(t)) this.err('conversion to non-scalar type requested', tok);
      const n = this.castTo(this.rv(e), t);
      if (n.kind !== 'cast' && n.kind !== 'num') return { kind: 'cast', lhs: n, ty: t, tok };
      return n;
    }
    return this.unary();
  }

  unary() {
    const tok = this.tok;
    if (this.consume('+')) { const e = this.rv(this.cast()); return this.castTo(e, this.promote(e.ty)); }
    if (this.consume('-')) {
      const e = this.rv(this.cast());
      if (!isNumeric(e.ty)) this.err("wrong type argument to unary minus", tok);
      const t = this.promote(e.ty);
      return this.fold({ kind: 'neg', lhs: this.castTo(e, t), ty: t, tok });
    }
    if (this.consume('&')) {
      const e = this.cast();
      if (e.kind === 'var' && e.v.isRegister) this.err('address of register variable requested', tok);
      if (!['var', 'deref', 'member', 'func', 'str'].includes(e.kind)) this.err('lvalue required as unary \'&\' operand', tok);
      if (e.kind === 'deref') return this.rv(e.lhs);
      return { kind: 'addr', lhs: e, ty: pointerTo(e.ty), tok };
    }
    if (this.consume('*')) {
      const e = this.cast();
      if (e.ty.kind === 'func') return e;
      if (e.ty.kind === 'ptr' && e.ty.base.kind === 'func') return e;
      return this.newDeref(e, tok);
    }
    if (this.consume('!')) { const e = this.rv(this.cast()); return this.fold({ kind: 'not', lhs: this.toBoolCond(e), ty: ty.int, tok }); }
    if (this.consume('~')) {
      const e = this.rv(this.cast());
      if (!isInteger(e.ty)) this.err("wrong type argument to bit-complement", tok);
      const t = this.promote(e.ty);
      return this.fold({ kind: 'bitnot', lhs: this.castTo(e, t), ty: t, tok });
    }
    if (this.consume('++')) return this.newIncDec(this.unary(), true, 1, tok);
    if (this.consume('--')) return this.newIncDec(this.unary(), true, -1, tok);
    if (this.is('sizeof')) {
      this.next();
      if (this.is('(') && this.isTypename(this.peek())) {
        this.next(); const t = this.typeName(); this.expect(')');
        if (t.size < 0) this.err('invalid application of sizeof to incomplete type', tok);
        return { kind: 'num', val: t.size, ty: ty.uint, tok };
      }
      const e = this.unary();
      return { kind: 'num', val: e.ty.kind === 'array' ? e.ty.size : e.ty.size, ty: ty.uint, tok };
    }
    if (this.is('_Alignof')) {
      this.next(); this.expect('('); const t = this.typeName(); this.expect(')');
      return { kind: 'num', val: t.align, ty: ty.uint, tok };
    }
    return this.postfix();
  }

  newIncDec(n, pre, delta, tok) {
    this.checkLvalue(n, tok);
    if (!isScalar(n.ty)) this.err('wrong type argument to increment', tok);
    let d = delta;
    if (n.ty.kind === 'ptr') d = delta * (n.ty.base.kind === 'void' ? 1 : n.ty.base.size);
    return { kind: 'incdec', lhs: n, pre, delta: d, ty: n.ty, tok };
  }

  getMember(t, name) {
    for (const m of t.members) {
      if (m.name === name) return { ...m };
      if (!m.name && (m.type.kind === 'struct' || m.type.kind === 'union')) {
        const sub = this.getMember(m.type, name);
        if (sub) return { ...sub, offset: sub.offset + m.offset };
      }
    }
    return null;
  }
  structRef(n, tok) {
    const nameTok = this.ident();
    if (n.ty.kind !== 'struct' && n.ty.kind !== 'union') this.err(`request for member '${nameTok.v}' in something not a structure or union`, tok);
    if (n.ty.incomplete) this.err(`dereferencing pointer to incomplete type '${typeName(n.ty)}'`, tok);
    const m = this.getMember(n.ty, nameTok.v);
    if (!m) this.err(`'${typeName(n.ty)}' has no member named '${nameTok.v}'`, nameTok);
    return { kind: 'member', lhs: n, mem: m, ty: m.type, tok: nameTok };
  }

  postfix() {
    let n = this.primary();
    for (;;) {
      const tok = this.tok;
      if (this.is('(')) { n = this.funcall(n); continue; }
      if (this.consume('[')) {
        const idx = this.expr();
        this.expect(']');
        n = this.newDeref(this.newAdd(n, idx, tok), tok);
        continue;
      }
      if (this.consume('.')) { n = this.structRef(n, tok); continue; }
      if (this.consume('->')) {
        n = this.rv(n);
        if (n.ty.kind !== 'ptr') this.err("invalid type argument of '->'", tok);
        n = this.structRef({ kind: 'deref', lhs: n, ty: n.ty.base, tok }, tok);
        continue;
      }
      if (this.consume('++')) { n = this.newIncDec(n, false, 1, tok); continue; }
      if (this.consume('--')) { n = this.newIncDec(n, false, -1, tok); continue; }
      return n;
    }
  }

  funcall(fnNode) {
    const tok = this.next(); // '('
    let ft;
    if (fnNode.kind === 'builtin') {
      const args = [];
      while (!this.is(')')) { if (args.length) this.expect(','); args.push(this.rv(this.assign())); }
      this.expect(')');
      const name = fnNode.name;
      const retInt = ['__get_PRIMASK', '__get_MSP', '__get_PSP', '__get_CONTROL', '__get_BASEPRI', '__REV', '__REV16', '__RBIT', '__CLZ', '__umulh', '__smulh', '__builtin_expect'];
      if (name === '__builtin_va_start') return { kind: 'builtin', name, args, ty: pointerTo(ty.char), tok: fnNode.tok };
      return { kind: 'builtin', name, args: args.map(a => this.castTo(a, ty.uint)), ty: retInt.includes(name) ? ty.uint : ty.void, tok: fnNode.tok };
    }
    if (fnNode.ty.kind === 'func') ft = fnNode.ty;
    else if (fnNode.ty.kind === 'ptr' && fnNode.ty.base.kind === 'func') ft = fnNode.ty.base;
    else {
      const prev = this.toks[this.p - 2];
      if (prev && prev.line !== tok.line) this.err(`expected ';' after '${prev.v}'`, prev);
      this.err('called object is not a function or function pointer', tok);
    }
    const args = [];
    while (!this.is(')')) {
      if (args.length) this.expect(',');
      let a = this.rv(this.assign());
      const i = args.length;
      if (i < ft.params.length) a = this.castTo(a, ft.params[i]);
      else {
        if (!ft.variadic && !ft.oldStyle) this.err(`too many arguments to function '${fnNode.kind === 'func' ? fnNode.fn.name : 'call'}'`, a.tok);
        if (a.ty.kind === 'struct' || a.ty.kind === 'union') this.err('passing structs by value is not supported', a.tok);
        if (isInteger(a.ty)) a = this.castTo(a, this.promote(a.ty));
      }
      if (a.ty.kind === 'struct' || a.ty.kind === 'union') this.err('passing structs by value is not supported by the simulator compiler', a.tok);
      args.push(a);
    }
    this.expect(')');
    if (args.length < ft.params.length) this.err(`too few arguments to function '${fnNode.kind === 'func' ? fnNode.fn.name : 'call'}'`, tok);
    if (ft.ret.kind === 'struct' || ft.ret.kind === 'union') this.err('functions returning structs are not supported by the simulator compiler', tok);
    return { kind: 'funcall', fn: fnNode, args, fnTy: ft, ty: ft.ret, tok: fnNode.tok };
  }

  stringBytes(t) {
    let s = t.v;
    if (s[0] !== '"') s = s.slice(1);
    const bytes = decodeEscapes(s.slice(1, -1), t.file, t.line);
    bytes.push(0);
    return bytes;
  }

  primary() {
    const tok = this.tok;
    if (this.consume('(')) {
      if (this.is('{')) this.err('statement expressions are not supported', tok);
      const e = this.expr();
      this.expect(')');
      return e;
    }
    if (tok.t === 'num') { this.next(); return this.parseNumber(tok); }
    if (tok.t === 'chr') {
      this.next();
      let s = tok.v; if (s[0] !== "'") s = s.slice(1);
      const b = decodeEscapes(s.slice(1, -1), tok.file, tok.line);
      let v = b[0] || 0;
      if (b.length > 1) { v = 0; for (const x of b) v = (v << 8) | x; }
      return { kind: 'num', val: v, ty: ty.int, tok };
    }
    if (tok.t === 'str') {
      let bytes = [];
      while (this.tok.t === 'str') { const b = this.stringBytes(this.next()); bytes.pop(); bytes = bytes.concat(b); }
      bytes.push(0);
      const v = this.newStringLiteral(bytes, tok);
      return { kind: 'var', v, ty: v.type, tok };
    }
    if (tok.t === 'id') {
      if (KEYWORDS.has(tok.v)) this.err(`expected expression before '${tok.v}'`);
      this.next();
      const v = this.findVar(tok.v);
      if (v) {
        if (v.kind === 'enumconst') return { kind: 'num', val: v.value, ty: ty.int, tok };
        if (v.kind === 'typedef') this.err(`unexpected type name '${tok.v}': expected expression`, tok);
        if (v.kind === 'func') return { kind: 'func', fn: v, ty: v.type, tok };
        if (v.isRegister) {}
        return { kind: 'var', v, ty: v.type, tok };
      }
      if (BUILTINS.has(tok.v) && this.is('(')) return { kind: 'builtin', name: tok.v, tok };
      if (tok.v === '__func__' || tok.v === '__FUNCTION__') {
        const name = this.curFn ? this.curFn.name : '';
        const bytes = [...name].map(c => c.charCodeAt(0)); bytes.push(0);
        const sv = this.newStringLiteral(bytes, tok);
        return { kind: 'var', v: sv, ty: sv.type, tok };
      }
      if (this.is('(')) {
        this.warn(`implicit declaration of function '${tok.v}'`, tok);
        const ft = funcType(ty.int); ft.oldStyle = true; ft.paramNames = [];
        const f = { kind: 'func', name: tok.v, type: ft, isStatic: false, label: tok.v, tok };
        this.scopes[0].vars.set(tok.v, f);
        return { kind: 'func', fn: f, ty: ft, tok };
      }
      this.err(`'${tok.v}' undeclared`, tok);
    }
    this.err(`expected expression before '${tok.t === 'eof' ? 'end of file' : tok.v}'`);
  }

  parseNumber(tok) {
    let s = tok.v;
    const isHex = /^0[xX]/.test(s);
    if (!isHex && /[.eE]/.test(s) || (isHex && /[pP]/.test(s)) || (!isHex && /[fF]$/.test(s) && /[.eE]/.test(s))) {
      const m = s.replace(/[fFlL]$/, '');
      const v = Number(m);
      if (isNaN(v)) this.err(`invalid floating constant '${s}'`, tok);
      const isF = /[fF]$/.test(s);
      return { kind: 'num', val: Math.fround(v), ty: isF ? ty.float : ty.double, tok };
    }
    const sfx = (s.match(/[uUlL]+$/) || [''])[0];
    s = s.slice(0, s.length - sfx.length);
    let v;
    if (isHex) v = parseInt(s.slice(2), 16);
    else if (/^0[bB]/.test(s)) v = parseInt(s.slice(2), 2);
    else if (/^0[0-7]*$/.test(s)) v = s.length > 1 ? parseInt(s.slice(1), 8) : 0;
    else if (/^[0-9]+$/.test(s)) v = parseInt(s, 10);
    else this.err(`invalid suffix on integer constant '${tok.v}'`, tok);
    if (isNaN(v)) this.err(`invalid integer constant '${tok.v}'`, tok);
    if (v > 0xFFFFFFFF) { this.warn(`integer constant '${tok.v}' is too large for 32 bits; truncated`, tok); v = Number(BigInt.asUintN(32, BigInt(v))); }
    const uns = /[uU]/.test(sfx);
    let t;
    if (uns) t = ty.uint;
    else if (v > 0x7FFFFFFF) t = (isHex || /^0/.test(s)) ? ty.uint : ty.uint;
    else t = /[lL]/.test(sfx) ? ty.long : ty.int;
    if (t.unsigned === false && v > 0x7FFFFFFF) t = ty.uint;
    return { kind: 'num', val: t.unsigned ? v >>> 0 : v | 0, ty: t, tok };
  }
}
