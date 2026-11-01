// Thumb-2 code generator + linker for the LPC1768.
import { CompileError } from './preprocess.js';
import { isFlonum, isInteger, ty } from './parser.js';

const COND = { eq: 0, ne: 1, hs: 2, lo: 3, mi: 4, pl: 5, hi: 8, ls: 9, ge: 10, lt: 11, gt: 12, le: 13, al: 14 };

// ------------------------------------------------------------------ assembler buffer
class Asm {
  constructor() { this.h = []; this.labels = []; this.fix = []; this.relocs = []; this.lines = []; this.refs = new Set(); }
  get pos() { return this.h.length; }
  e16(x) { this.h.push(x & 0xFFFF); }
  e32(a, b) { this.h.push(a & 0xFFFF, b & 0xFFFF); }
  newLabel() { this.labels.push(-1); return this.labels.length - 1; }
  bind(l) { this.labels[l] = this.h.length; }
  b(l) { this.fix.push({ pos: this.pos, l, kind: 'b' }); this.e32(0, 0); }
  bc(cond, l) { this.fix.push({ pos: this.pos, l, kind: 'bc', cond }); this.e32(0, 0); }
  bl(label) { this.relocs.push({ pos: this.pos, kind: 'bl', label }); this.refs.add(label); this.e32(0, 0); }
  movAddr(rd, label, addend = 0) {
    this.relocs.push({ pos: this.pos, kind: 'movw', label, addend, rd }); this.e32(0, 0);
    this.relocs.push({ pos: this.pos, kind: 'movt', label, addend, rd }); this.e32(0, 0);
    this.refs.add(label);
  }
  resolve() {
    for (const f of this.fix) {
      const t = this.labels[f.l];
      if (t < 0) throw new Error('internal: unbound label');
      const off = (t - (f.pos + 2)) * 2;
      const [a, b] = f.kind === 'b' ? encB(off, false) : encBc(f.cond, off);
      this.h[f.pos] = a; this.h[f.pos + 1] = b;
    }
  }
}

export function encB(off, link) {
  const S = (off >>> 24) & 1, I1 = (off >>> 23) & 1, I2 = (off >>> 22) & 1;
  const J1 = ((~I1) ^ S) & 1, J2 = ((~I2) ^ S) & 1;
  return [0xF000 | (S << 10) | ((off >>> 12) & 0x3FF), (link ? 0xD000 : 0x9000) | (J1 << 13) | (J2 << 11) | ((off >>> 1) & 0x7FF)];
}
function encBc(cond, off) {
  if (off < -1048576 || off > 1048574) throw new Error('conditional branch out of range');
  const S = (off >>> 20) & 1, J2 = (off >>> 19) & 1, J1 = (off >>> 18) & 1;
  return [0xF000 | (S << 10) | (cond << 6) | ((off >>> 12) & 0x3F), 0x8000 | (J1 << 13) | (J2 << 11) | ((off >>> 1) & 0x7FF)];
}
function encMovw(rd, v, top) {
  v &= 0xFFFF;
  return [(top ? 0xF2C0 : 0xF240) | (((v >>> 11) & 1) << 10) | (v >>> 12), (((v >>> 8) & 7) << 12) | (rd << 8) | (v & 0xFF)];
}
function encImm12(base, rd, rn, imm) { // ADDW / SUBW
  return [base | (((imm >>> 11) & 1) << 10) | rn, (((imm >>> 8) & 7) << 12) | (rd << 8) | (imm & 0xFF)];
}

const LDST = {
  ldr: { t3: 0xF8D0, s16: 0x6800, sh: 2 }, ldrb: { t3: 0xF890, s16: 0x7800, sh: 0 }, ldrh: { t3: 0xF8B0, s16: 0x8800, sh: 1 },
  ldrsb: { t3: 0xF990 }, ldrsh: { t3: 0xF9B0 },
  str: { t3: 0xF8C0, s16: 0x6000, sh: 2 }, strb: { t3: 0xF880, s16: 0x7000, sh: 0 }, strh: { t3: 0xF8A0, s16: 0x8000, sh: 1 },
};

const VECTORS = ['__stack_top', 'Reset_Handler', 'NMI_Handler', 'HardFault_Handler', 'MemManage_Handler', 'BusFault_Handler', 'UsageFault_Handler',
  null, null, null, null, 'SVC_Handler', 'DebugMon_Handler', null, 'PendSV_Handler', 'SysTick_Handler',
  'WDT_IRQHandler', 'TIMER0_IRQHandler', 'TIMER1_IRQHandler', 'TIMER2_IRQHandler', 'TIMER3_IRQHandler', 'UART0_IRQHandler', 'UART1_IRQHandler',
  'UART2_IRQHandler', 'UART3_IRQHandler', 'PWM1_IRQHandler', 'I2C0_IRQHandler', 'I2C1_IRQHandler', 'I2C2_IRQHandler', 'SPI_IRQHandler',
  'SSP0_IRQHandler', 'SSP1_IRQHandler', 'PLL0_IRQHandler', 'RTC_IRQHandler', 'EINT0_IRQHandler', 'EINT1_IRQHandler', 'EINT2_IRQHandler',
  'EINT3_IRQHandler', 'ADC_IRQHandler', 'BOD_IRQHandler', 'USB_IRQHandler', 'CAN_IRQHandler', 'DMA_IRQHandler', 'I2S_IRQHandler',
  'ENET_IRQHandler', 'RIT_IRQHandler', 'MCPWM_IRQHandler', 'QEI_IRQHandler', 'PLL1_IRQHandler', 'USBActivity_IRQHandler', 'CANActivity_IRQHandler'];
export { VECTORS };

// ------------------------------------------------------------------ function code generator
export class FuncGen {
  constructor(fn, warnings) {
    this.fn = fn; this.a = new Asm(); this.warnings = warnings;
    this.brk = []; this.cont = [];
  }
  err(msg, tok) { throw new CompileError(msg, tok?.file, tok?.line, tok?.col); }

  // ---- low level emitters
  loadImm(rd, v) {
    v = v >>> 0;
    if (v < 256 && rd < 8) { this.a.e16(0x2000 | (rd << 8) | v); return; }
    const [a, b] = encMovw(rd, v & 0xFFFF, false); this.a.e32(a, b);
    if (v > 0xFFFF) { const [c, d] = encMovw(rd, v >>> 16, true); this.a.e32(c, d); }
  }
  mov(rd, rm) { if (rd !== rm) this.a.e16(0x4600 | ((rd & 8) << 4) | (rm << 3) | (rd & 7)); }
  push(mask) { this.a.e16(0xB400 | mask); }   // low regs only
  pop(mask) { this.a.e16(0xBC00 | mask); }
  // rd = rn + imm (imm signed, any range)
  addImm(rd, rn, imm) {
    if (imm === 0) { this.mov(rd, rn); return; }
    if (rd === rn && rd < 8 && imm > 0 && imm < 256) { this.a.e16(0x3000 | (rd << 8) | imm); return; }
    if (rd === rn && rd < 8 && imm < 0 && imm > -256) { this.a.e16(0x3800 | (rd << 8) | -imm); return; }
    if (imm > 0 && imm < 4096) { const [a, b] = encImm12(0xF200, rd, rn, imm); this.a.e32(a, b); return; }
    if (imm < 0 && imm > -4096) { const [a, b] = encImm12(0xF2A0, rd, rn, -imm); this.a.e32(a, b); return; }
    const tmp = rd === 3 || rn === 3 ? 2 : 3;
    this.loadImm(tmp, imm);
    this.a.e16(0x4400 | ((rd & 8) << 4) | (tmp << 3) | (rd & 7)); // add rd, tmp (rd must == rn)
    if (rd !== rn) this.err('internal addImm');
  }
  ldst(op, rt, rn, off) {
    const d = LDST[op];
    if (d.s16 !== undefined && rt < 8 && rn < 8 && off >= 0 && (off & ((1 << d.sh) - 1)) === 0 && (off >> d.sh) < 32) {
      this.a.e16(d.s16 | ((off >> d.sh) << 6) | (rn << 3) | rt); return;
    }
    if (off >= 0 && off < 4096) { this.a.e32(d.t3 | rn, (rt << 12) | off); return; }
    if (off < 0 && off > -256) { this.a.e32((d.t3 & ~0x80) | rn, (rt << 12) | 0xC00 | (-off)); return; }
    const tmp = rt === 2 || rn === 2 ? 3 : 2;
    this.addImmTo(tmp, rn, off);
    this.ldst(op, rt, tmp, 0);
  }
  addImmTo(rd, rn, off) { this.mov(rd, rn); if (off) { if (Math.abs(off) < 4096) this.addImm(rd, rd, off); else { const t = rd === 3 ? 1 : 3; this.loadImm(t, off); this.a.e16(0x1800 | (t << 6) | (rd << 3) | rd); } } }

  loadOp(t) {
    if (t.size === 1) return t.unsigned || t.kind === 'bool' ? 'ldrb' : 'ldrsb';
    if (t.size === 2) return t.unsigned ? 'ldrh' : 'ldrsh';
    return 'ldr';
  }
  storeOp(t) { return t.size === 1 ? 'strb' : t.size === 2 ? 'strh' : 'str'; }
  load(t, rt, rn, off = 0) {
    if (t.kind === 'array' || t.kind === 'struct' || t.kind === 'union' || t.kind === 'func') { this.addImmTo(rt, rn, off); return; }
    this.ldst(this.loadOp(t), rt, rn, off);
  }
  store(t, rt, rn, off = 0) { this.ldst(this.storeOp(t), rt, rn, off); }

  call(label) { this.a.bl(label); }
  line(tok) { if (tok && tok.line) { const L = this.a.lines; const last = L[L.length - 1]; if (!last || last.line !== tok.line || last.file !== tok.file) L.push({ pos: this.a.pos, file: tok.file, line: tok.line }); } }

  // ---- frame
  layout() {
    const fn = this.fn;
    let off = 0;
    const variadic = fn.type.variadic;
    fn.params.forEach((p, i) => {
      if (variadic) p.fpOff = 20 + 4 * i;
      else if (i >= 4) p.fpOff = 20 + 4 * (i - 4);
    });
    for (const v of fn.locals) {
      if (v.fpOff !== undefined) continue;
      const align = (v.type.kind === 'array' || v.type.kind === 'struct' || v.type.kind === 'union') ? Math.max(4, v.type.align) : v.type.align;
      off += Math.max(v.type.size, 1);
      off = Math.ceil(off / align) * align;
      v.fpOff = -off;
    }
    this.frame = Math.ceil(off / 8) * 8;
  }

  gen() {
    const fn = this.fn, a = this.a;
    this.layout();
    this.retLabel = a.newLabel();
    this.userLabels = new Map();
    for (const name of fn.labels.keys()) this.userLabels.set(name, a.newLabel());
    this.line(fn.tok);
    if (fn.type.variadic) a.e16(0xB40F);
    a.e16(0xB5F0);            // push {r4-r7, lr}
    a.e16(0x466F);            // mov r7, sp
    const fr = this.frame;
    if (fr > 0) {
      if (fr <= 508) a.e16(0xB080 | (fr >> 2));
      else if (fr < 4096) { const [x, y] = encImm12(0xF2A0, 13, 13, fr); a.e32(x, y); }
      else { this.loadImm(3, fr); a.e16(0x466A); a.e16(0x1AD2); a.e16(0x4695); } // mov r2,sp; subs r2,r2,r3; mov sp,r2
    }
    if (!fn.type.variadic) fn.params.forEach((p, i) => { if (i < 4) this.store(p.type, i, 7, p.fpOff); });
    this.stmt(fn.body);
    a.bind(this.retLabel);
    a.e16(0x46BD);            // mov sp, r7
    if (fn.type.variadic) { a.e32(0xE8BD, 0x40F0); a.e16(0xB004); a.e16(0x4770); }
    else a.e16(0xBDF0);       // pop {r4-r7, pc}
    a.resolve();
    return a;
  }

  // ---- statements
  stmt(n) {
    const a = this.a;
    switch (n.kind) {
      case 'block': for (const s of n.body) this.stmt(s); return;
      case 'expr': this.line(n.tok); this.expr(n.expr); return;
      case 'return':
        this.line(n.tok);
        if (n.expr) this.expr(n.expr);
        a.b(this.retLabel);
        return;
      case 'if': {
        this.line(n.tok);
        const els = a.newLabel(), end = a.newLabel();
        this.cond(n.cond, els, false);
        this.stmt(n.then);
        if (n.els) { a.b(end); a.bind(els); this.stmt(n.els); a.bind(end); }
        else a.bind(els);
        return;
      }
      case 'for': {
        if (n.init) this.stmt(n.init);
        const top = a.newLabel(), brk = a.newLabel(), cont = a.newLabel();
        a.bind(top);
        if (n.cond) { this.line(n.cond.tok || n.tok); this.cond(n.cond, brk, false); }
        this.brk.push(brk); this.cont.push(cont);
        this.stmt(n.body);
        this.brk.pop(); this.cont.pop();
        a.bind(cont);
        if (n.inc) { this.line(n.inc.tok || n.tok); this.expr(n.inc); }
        a.b(top);
        a.bind(brk);
        return;
      }
      case 'do': {
        const top = a.newLabel(), brk = a.newLabel(), cont = a.newLabel();
        a.bind(top);
        this.brk.push(brk); this.cont.push(cont);
        this.stmt(n.body);
        this.brk.pop(); this.cont.pop();
        a.bind(cont);
        this.line(n.cond.tok || n.tok);
        this.cond(n.cond, top, true);
        a.bind(brk);
        return;
      }
      case 'switch': {
        this.line(n.tok);
        this.expr(n.cond);
        const brk = a.newLabel();
        for (const c of n.cases) {
          c.label = a.newLabel();
          if (c.hi === c.val) {
            this.cmpImm(0, c.val);
            a.bc(COND.eq, c.label);
          } else {
            const skip = a.newLabel();
            this.cmpImm(0, c.val); a.bc(COND.lt, skip);
            this.cmpImm(0, c.hi); a.bc(COND.le, c.label);
            a.bind(skip);
          }
        }
        if (n.def) { n.def.label = a.newLabel(); a.b(n.def.label); } else a.b(brk);
        this.brk.push(brk);
        this.stmt(n.body);
        this.brk.pop();
        a.bind(brk);
        return;
      }
      case 'case': a.bind(n.label); this.stmt(n.body); return;
      case 'break': a.b(this.brk[this.brk.length - 1]); return;
      case 'continue': a.b(this.cont[this.cont.length - 1]); return;
      case 'goto': a.b(this.userLabels.get(n.label)); return;
      case 'label': a.bind(this.userLabels.get(n.label)); this.stmt(n.body); return;
      case 'asm': this.line(n.tok); this.inlineAsm(n); return;
    }
    this.err('internal: unknown statement ' + n.kind, n.tok);
  }

  inlineAsm(n) {
    const map = { 'nop': [0xBF00], 'wfi': [0xBF30], 'wfe': [0xBF20], 'sev': [0xBF40], 'cpsie i': [0xB662], 'cpsid i': [0xB672],
      'cpsie f': [0xB661], 'cpsid f': [0xB671], 'bkpt': [0xBE00], 'bkpt 0': [0xBE00], 'bkpt #0': [0xBE00], 'dsb': [0xF3BF, 0x8F4F], 'isb': [0xF3BF, 0x8F6F], 'dmb': [0xF3BF, 0x8F5F], '': [] };
    for (const ins of n.text.split(/[\n;]+/).map(s => s.trim().toLowerCase().replace(/\s+/g, ' '))) {
      const code = map[ins];
      if (!code) this.err(`inline assembly '${ins}' is not supported by the simulator compiler`, n.tok);
      for (const h of code) this.a.e16(h);
    }
  }

  cmpImm(r, v) {
    v |= 0;
    if (v >= 0 && v < 256 && r < 8) { this.a.e16(0x2800 | (r << 8) | v); return; }
    this.loadImm(1, v >>> 0);
    this.a.e16(0x4288 | 0); // cmp r0, r1
  }

  // ---- conditions: jump to label when truthiness == jumpIf
  cond(n, label, jumpIf) {
    const a = this.a;
    if (n.kind === 'num') { if ((n.val !== 0) === jumpIf) a.b(label); return; }
    if (n.kind === 'logand') {
      if (!jumpIf) { this.cond(n.lhs, label, false); this.cond(n.rhs, label, false); }
      else { const skip = a.newLabel(); this.cond(n.lhs, skip, false); this.cond(n.rhs, label, true); a.bind(skip); }
      return;
    }
    if (n.kind === 'logor') {
      if (jumpIf) { this.cond(n.lhs, label, true); this.cond(n.rhs, label, true); }
      else { const skip = a.newLabel(); this.cond(n.lhs, skip, true); this.cond(n.rhs, label, false); a.bind(skip); }
      return;
    }
    if (n.kind === 'not') { this.cond(n.lhs, label, !jumpIf); return; }
    if (['eq', 'ne', 'lt', 'le'].includes(n.kind) && !isFlonum(n.cmpTy)) {
      const cc = this.compare(n);
      a.bc(jumpIf ? cc : cc ^ 1, label);
      return;
    }
    this.expr(n);
    this.test(n.ty);
    a.bc(jumpIf ? COND.ne : COND.eq, label);
  }
  test(t) {
    if (isFlonum(t)) this.a.e16(0x0040); // lsls r0, r0, #1
    else this.a.e16(0x2800);             // cmp r0, #0
  }
  // emits CMP for an integer comparison node, returns condition code meaning "true"
  compare(n) {
    const r = n.rhs;
    if (r.kind === 'num' && (r.val | 0) >= 0 && (r.val | 0) < 256) { this.expr(n.lhs); this.a.e16(0x2800 | (r.val & 0xFF)); }
    else { this.binOperands(n.lhs, n.rhs); this.a.e16(0x4288); }
    const uns = n.cmpTy.unsigned || n.cmpTy.kind === 'ptr';
    switch (n.kind) {
      case 'eq': return COND.eq; case 'ne': return COND.ne;
      case 'lt': return uns ? COND.lo : COND.lt;
      case 'le': return uns ? COND.ls : COND.le;
    }
  }
  setCond(cc) { // r0 = cond ? 1 : 0
    const mask = (((~cc) & 1) << 3) | 4;
    this.a.e16(0xBF00 | (cc << 4) | mask);
    this.a.e16(0x2001); this.a.e16(0x2000);
  }

  // ---- expression helpers
  isSimple(n) {
    if (n.kind === 'num') return true;
    if (n.kind === 'var' && n.ty.kind !== 'array' && n.ty.kind !== 'struct' && n.ty.kind !== 'union') return true;
    if (n.kind === 'addr' && n.lhs.kind === 'var') return true;
    if (n.kind === 'addr' && n.lhs.kind === 'func') return true;
    if (this.constAddr(n) !== null) return true;
    return false;
  }
  simple(n, rd) {
    if (n.kind === 'num') { this.loadImm(rd, this.numBits(n)); return; }
    const ca = this.constAddr(n);
    if (ca !== null) { this.loadImm(rd, ca); return; }
    if (n.kind === 'var') {
      if (n.v.isLocal) this.load(n.ty, rd, 7, n.v.fpOff);
      else { this.a.movAddr(rd, n.v.label); this.load(n.ty, rd, rd, 0); }
      return;
    }
    if (n.kind === 'addr') {
      if (n.lhs.kind === 'func') { this.a.movAddr(rd, n.lhs.fn.label); return; }
      const v = n.lhs.v;
      if (v.isLocal) this.addImmTo(rd, 7, v.fpOff); else this.a.movAddr(rd, v.label);
      return;
    }
    this.err('internal simple');
  }
  numBits(n) {
    if (isFlonum(n.ty)) { const f = new Float32Array([n.val]); return new Uint32Array(f.buffer)[0]; }
    return n.val >>> 0;
  }
  // compile-time constant address (e.g. LPC_GPIO0->FIOSET)
  constAddr(n) {
    if (n.kind === 'cast' && n.lhs.kind === 'num' && (n.ty.kind === 'ptr')) return n.lhs.val >>> 0;
    if (n.kind === 'addr' && n.lhs.kind === 'member') { const b = this.constAddrOfLvalue(n.lhs); return b; }
    if (n.kind === 'add' && n.ty.kind === 'ptr') { const l = this.constAddr(n.lhs); if (l !== null && n.rhs.kind === 'num') return (l + n.rhs.val) >>> 0; }
    return null;
  }
  constAddrOfLvalue(n) {
    if (n.kind === 'deref') return this.constAddr(n.lhs);
    if (n.kind === 'member') { const b = this.constAddrOfLvalue(n.lhs); return b === null ? null : (b + n.mem.offset) >>> 0; }
    return null;
  }

  // evaluate l -> r0, r -> r1
  binOperands(l, r) {
    if (this.isSimple(r)) { this.expr(l); this.simple(r, 1); return; }
    if (this.isSimple(l)) { this.expr(r); this.mov(1, 0); this.simple(l, 0); return; }
    this.expr(l); this.push(1); this.expr(r); this.mov(1, 0); this.pop(1);
  }

  addr(n) {
    const ca = this.constAddrOfLvalue(n);
    if (ca !== null) { this.loadImm(0, ca); return; }
    switch (n.kind) {
      case 'var':
        if (n.v.isLocal) this.addImmTo(0, 7, n.v.fpOff); else this.a.movAddr(0, n.v.label);
        return;
      case 'func': this.a.movAddr(0, n.fn.label); return;
      case 'deref': this.expr(n.lhs); return;
      case 'member': this.addr(n.lhs); if (n.mem.offset) this.addImm(0, 0, n.mem.offset); return;
      case 'comma': this.expr(n.lhs); this.addr(n.rhs); return;
      case 'cond': case 'assign': case 'funcall': this.expr(n); return;
    }
    this.err('lvalue required', n.tok);
  }

  // narrow/extend r0 from type f to type t
  cast(f, t) {
    const a = this.a;
    if (t.kind === 'void') return;
    if (t.kind === 'bool') {
      if (isFlonum(f)) a.e16(0x0040); else a.e16(0x2800);
      this.setCond(COND.ne);
      return;
    }
    const fF = isFlonum(f), tF = isFlonum(t);
    if (fF && tF) return;
    if (!fF && tF) { this.call(f.unsigned || f.kind === 'ptr' ? '__aeabi_ui2f' : '__aeabi_i2f'); return; }
    if (fF && !tF) {
      this.call(t.unsigned ? '__aeabi_f2uiz' : '__aeabi_f2iz');
      f = t.unsigned ? ty.uint : ty.int;
    }
    if (t.size >= 4) return;
    if (f.size < t.size && (f.unsigned || !t.unsigned)) return;
    if (f.size === t.size && !!f.unsigned === !!t.unsigned) return;
    if (t.size === 1) a.e16(t.unsigned ? 0xB2C0 : 0xB240);
    else a.e16(t.unsigned ? 0xB280 : 0xB200);
  }

  // r0 = r0 op r1 in type t
  arith(op, t) {
    const a = this.a;
    if (isFlonum(t)) {
      const fn = { add: '__aeabi_fadd', sub: '__aeabi_fsub', mul: '__aeabi_fmul', div: '__aeabi_fdiv' }[op];
      if (!fn) this.err('invalid float operation');
      this.call(fn); return;
    }
    const uns = t.unsigned || t.kind === 'ptr';
    switch (op) {
      case 'add': a.e16(0x1840); return;
      case 'sub': a.e16(0x1A40); return;
      case 'mul': a.e16(0x4348); return;
      case 'div': a.e32(uns ? 0xFBB0 : 0xFB90, 0xF0F1); return;            // [su]div r0, r0, r1
      case 'mod': a.e32(uns ? 0xFBB0 : 0xFB90, 0xF2F1); a.e32(0xFB02, 0x0010 | 0x0001 | (0 << 12)); return;
      case 'band': a.e16(0x4008); return;
      case 'bor': a.e16(0x4308); return;
      case 'bxor': a.e16(0x4048); return;
      case 'shl': a.e16(0x4088); return;
      case 'shr': a.e16(uns ? 0x40C8 : 0x4108); return;
    }
    this.err('internal arith ' + op);
  }

  expr(n) {
    const a = this.a;
    switch (n.kind) {
      case 'num': this.loadImm(0, this.numBits(n)); return;
      case 'var': case 'member': case 'deref': {
        if (n.kind === 'var' && this.isSimple(n)) { this.simple(n, 0); return; }
        this.addr(n);
        this.load(n.ty, 0, 0, 0);
        return;
      }
      case 'func': this.a.movAddr(0, n.fn.label); return;
      case 'addr': {
        const ca = this.constAddr(n);
        if (ca !== null) { this.loadImm(0, ca); return; }
        this.addr(n.lhs); return;
      }
      case 'cast': {
        const ca = this.constAddr(n);
        if (ca !== null) { this.loadImm(0, ca); return; }
        this.expr(n.lhs);
        this.cast(n.lhs.ty, n.ty);
        return;
      }
      case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'band': case 'bor': case 'bxor': case 'shl': case 'shr': {
        if (n.kind === 'add' && n.ty.kind === 'ptr') { const ca = this.constAddr(n); if (ca !== null) { this.loadImm(0, ca); return; } }
        if (!isFlonum(n.ty) && n.rhs.kind === 'num' && (n.kind === 'add' || n.kind === 'sub') && (n.rhs.val | 0) > -4096 && (n.rhs.val | 0) < 4096) {
          this.expr(n.lhs);
          this.addImm(0, 0, n.kind === 'add' ? n.rhs.val | 0 : -(n.rhs.val | 0));
          return;
        }
        if (!isFlonum(n.ty) && n.rhs.kind === 'num' && (n.kind === 'shl' || n.kind === 'shr') && n.rhs.val > 0 && n.rhs.val < 32) {
          this.expr(n.lhs);
          const uns = n.ty.unsigned;
          const imm = n.rhs.val & 31;
          a.e16((n.kind === 'shl' ? 0x0000 : uns ? 0x0800 : 0x1000) | (imm << 6) | 0);
          return;
        }
        this.binOperands(n.lhs, n.rhs);
        this.arith(n.kind, n.ty);
        return;
      }
      case 'eq': case 'ne': case 'lt': case 'le': {
        if (isFlonum(n.cmpTy)) {
          this.binOperands(n.lhs, n.rhs);
          const fn = { eq: '__aeabi_fcmpeq', ne: '__aeabi_fcmpeq', lt: '__aeabi_fcmplt', le: '__aeabi_fcmple' }[n.kind];
          this.call(fn);
          if (n.kind === 'ne') { a.e16(0x2101); a.e16(0x4048); } // movs r1,#1 ; eors r0,r1
          return;
        }
        const cc = this.compare(n);
        this.setCond(cc);
        return;
      }
      case 'logand': case 'logor': case 'not': {
        const f = a.newLabel(), end = a.newLabel();
        this.cond(n, f, false);
        a.e16(0x2001); a.b(end);
        a.bind(f); a.e16(0x2000);
        a.bind(end);
        return;
      }
      case 'neg':
        this.expr(n.lhs);
        if (isFlonum(n.ty)) { this.loadImm(1, 0x80000000); a.e16(0x4048); }
        else a.e16(0x4240);
        return;
      case 'bitnot': this.expr(n.lhs); a.e16(0x43C0); return;
      case 'cond': {
        const els = a.newLabel(), end = a.newLabel();
        this.cond(n.cond, els, false);
        this.expr(n.then); a.b(end);
        a.bind(els); this.expr(n.els);
        a.bind(end);
        return;
      }
      case 'comma': this.expr(n.lhs); this.expr(n.rhs); return;
      case 'assign': return this.assign(n);
      case 'opassign': return this.opAssign(n);
      case 'incdec': return this.incdec(n);
      case 'funcall': return this.funcall(n);
      case 'builtin': return this.builtin(n);
      case 'memzero': return this.memzero(n.v);
    }
    this.err('internal: unknown expression ' + n.kind, n.tok);
  }

  isVarLvalue(n) { return n.kind === 'var' && n.ty.kind !== 'array'; }
  storeVar(n, rt) {
    if (n.v.isLocal) this.store(n.ty, rt, 7, n.v.fpOff);
    else { const tmp = rt === 1 ? 2 : 1; this.a.movAddr(tmp, n.v.label); this.store(n.ty, rt, tmp, 0); }
  }

  assign(n) {
    const lhs = n.lhs, t = lhs.ty;
    if (t.kind === 'struct' || t.kind === 'union') {
      this.expr(n.rhs); this.push(1);
      this.addr(lhs); this.pop(2);
      this.loadImm(2, t.size);
      this.call('memcpy');
      return;
    }
    if (this.isVarLvalue(lhs)) { this.expr(n.rhs); this.storeVar(lhs, 0); return; }
    const ca = this.constAddrOfLvalue(lhs);
    if (ca !== null) { this.expr(n.rhs); this.loadImm(1, ca); this.store(t, 0, 1, 0); return; }
    if (this.isSimple(n.rhs)) { this.addr(lhs); this.mov(1, 0); this.simple(n.rhs, 0); this.store(t, 0, 1, 0); return; }
    this.addr(lhs); this.push(1);
    this.expr(n.rhs);
    this.pop(2);
    this.store(t, 0, 1, 0);
  }

  opAssign(n) {
    const lhs = n.lhs, t = lhs.ty, ot = n.opTy;
    const ca = this.constAddrOfLvalue(lhs);
    const viaVar = this.isVarLvalue(lhs);
    if (!viaVar) {
      if (ca !== null) this.loadImm(0, ca); else this.addr(lhs);
      this.push(1);                       // address on stack
      this.load(t, 0, 0, 0);
    } else this.simple(lhs, 0);
    this.cast(t, ot);
    if (this.isSimple(n.rhs)) this.simple(n.rhs, 1);
    else { this.push(1); this.expr(n.rhs); this.mov(1, 0); this.pop(1); }
    if (n.op === 'shr' || n.op === 'shl') this.arith(n.op, ot.kind === 'ptr' ? ty.uint : ot);
    else this.arith(n.op, n.ptr ? ty.uint : ot);
    this.cast(ot, t);
    if (viaVar) this.storeVar(lhs, 0);
    else { this.pop(2); this.store(t, 0, 1, 0); }
  }

  incdec(n) {
    const lhs = n.lhs, t = lhs.ty, a = this.a;
    const viaVar = this.isVarLvalue(lhs);
    if (isFlonum(t)) {
      this.addr(lhs); this.push(1);
      this.load(t, 0, 0, 0); this.push(1);
      this.loadImm(1, 0x3F800000);
      this.call(n.delta > 0 ? '__aeabi_fadd' : '__aeabi_fsub');
      this.pop(8); this.pop(4);           // r3 = old, r2 = addr
      this.store(t, 0, 2, 0);
      if (!n.pre) this.mov(0, 3);
      return;
    }
    if (viaVar) this.simple(lhs, 0);
    else { const ca = this.constAddrOfLvalue(lhs); if (ca !== null) this.loadImm(0, ca); else this.addr(lhs); this.mov(2, 0); this.load(t, 0, 2, 0); }
    if (!n.pre) this.mov(3, 0);
    const d = n.delta;
    if (d > 0 && d < 256) a.e16(0x3000 | d);
    else if (d < 0 && d > -256) a.e16(0x3800 | (-d));
    else { this.loadImm(1, d >>> 0); a.e16(0x1840); }
    this.cast(ty.int, t);
    if (viaVar) {
      if (lhs.v.isLocal) this.store(t, 0, 7, lhs.v.fpOff);
      else { this.a.movAddr(1, lhs.v.label); this.store(t, 0, 1, 0); }
    } else this.store(t, 0, 2, 0);
    if (!n.pre) this.mov(0, 3);
  }

  funcall(n) {
    const args = n.args, a = this.a;
    const direct = n.fn.kind === 'func';
    if (args.length <= 4 && args.every(x => this.isSimple(x)) && direct) {
      args.forEach((x, i) => this.simple(x, i));
    } else {
      for (let i = args.length - 1; i >= 0; i--) { this.expr(args[i]); this.push(1); }
      if (!direct) { this.expr(n.fn); this.mov(12, 0); }
      const k = Math.min(args.length, 4);
      if (k) this.pop((1 << k) - 1);
    }
    if (direct) {
      if (args.length <= 4 && args.every(x => this.isSimple(x))) { /* already in regs */ }
      this.call(n.fn.fn.label);
    } else {
      if (args.length <= 4 && args.every(x => this.isSimple(x))) { /* handled above */ }
      a.e16(0x47E0); // blx r12
    }
    if (args.length > 4) { const sz = 4 * (args.length - 4); if (sz <= 508) a.e16(0xB000 | (sz >> 2)); else this.err('too many arguments'); }
    // normalize narrow return values
    const rt = n.ty;
    if (isInteger(rt) && rt.size < 4) this.cast(ty.uint, rt);
  }

  builtin(n) {
    const a = this.a, args = n.args;
    const one = () => { if (args[0]) this.expr(args[0]); };
    switch (n.name) {
      case '__enable_irq': a.e16(0xB662); return;
      case '__disable_irq': a.e16(0xB672); return;
      case '__enable_fault_irq': a.e16(0xB661); return;
      case '__disable_fault_irq': a.e16(0xB671); return;
      case '__WFI': a.e16(0xBF30); return;
      case '__WFE': a.e16(0xBF20); return;
      case '__SEV': a.e16(0xBF40); return;
      case '__NOP': a.e16(0xBF00); return;
      case '__BKPT': a.e16(0xBE00); return;
      case '__DSB': a.e32(0xF3BF, 0x8F4F); return;
      case '__ISB': a.e32(0xF3BF, 0x8F6F); return;
      case '__DMB': a.e32(0xF3BF, 0x8F5F); return;
      case '__get_PRIMASK': a.e32(0xF3EF, 0x8010); return;
      case '__get_BASEPRI': a.e32(0xF3EF, 0x8011); return;
      case '__get_MSP': a.e32(0xF3EF, 0x8008); return;
      case '__get_PSP': a.e32(0xF3EF, 0x8009); return;
      case '__get_CONTROL': a.e32(0xF3EF, 0x8014); return;
      case '__set_PRIMASK': one(); a.e32(0xF380, 0x8810); return;
      case '__set_BASEPRI': one(); a.e32(0xF380, 0x8811); return;
      case '__set_MSP': one(); a.e32(0xF380, 0x8808); return;
      case '__set_PSP': one(); a.e32(0xF380, 0x8809); return;
      case '__set_CONTROL': one(); a.e32(0xF380, 0x8814); return;
      case '__REV': one(); a.e16(0xBA00); return;
      case '__REV16': one(); a.e16(0xBA40); return;
      case '__RBIT': one(); a.e32(0xFA90, 0xF0A0); return;
      case '__CLZ': one(); a.e32(0xFAB0, 0xF080); return;
      case '__builtin_expect': one(); return;
      case '__umulh': case '__smulh':
        this.binOperands(args[0], args[1]);
        a.e32(n.name === '__umulh' ? 0xFBA0 : 0xFB80, 0x2001); // [us]mull r2, r0, r0, r1
        return;
      case '__builtin_va_start': {
        const np = this.fn.params.length;
        this.addImmTo(0, 7, 20 + 4 * np);
        return;
      }
    }
    this.err(`unsupported builtin ${n.name}`, n.tok);
  }

  memzero(v) {
    const a = this.a, size = v.type.size;
    this.addImmTo(0, 7, v.fpOff);
    a.e16(0x2100); // movs r1, #0
    const words = size >> 2;
    if (words <= 16) {
      for (let i = 0; i < words; i++) this.ldst('str', 1, 0, i * 4);
    } else {
      this.loadImm(2, words);
      const l = a.newLabel(); a.bind(l);
      a.e16(0xC002);          // stmia r0!, {r1}
      a.e16(0x3A01);          // subs r2, #1
      a.bc(COND.ne, l);
      this.addImm(0, 0, -words * 4);
    }
    for (let i = words * 4; i < size; i++) this.ldst('strb', 1, 0, i);
  }
}

// ------------------------------------------------------------------ linker
export function link(units, opts = {}) {
  // units: [{ prog: {globals, functions}, isLib }]
  const funcDefs = new Map(), varDefs = new Map();
  const errors = [];
  const define = (map, label, item, isLib, kind) => {
    const prev = map.get(label);
    if (prev) {
      if (prev.isLib && !isLib) { map.set(label, { item, isLib }); return; }
      if (!prev.isLib && isLib) return;
      if (kind === 'var' && (prev.item.tentative || item.tentative)) { if (prev.item.tentative) map.set(label, { item, isLib }); return; }
      errors.push({ msg: `multiple definition of '${label}'`, file: item.tok?.file, line: item.tok?.line });
      return;
    }
    map.set(label, { item, isLib });
  };
  for (const u of units) {
    for (const f of u.prog.functions) define(funcDefs, f.label, f, u.isLib, 'func');
    for (const g of u.prog.globals) if (g.isDefinition) define(varDefs, g.label, g, u.isLib, 'var');
  }
  if (errors.length) return { errors };
  if (!funcDefs.has('main')) return { errors: [{ msg: "undefined reference to 'main'" }] };

  // generate code for all functions lazily (reachability)
  const asmOf = new Map();
  const warnings = opts.warnings || [];
  const getAsm = (label) => {
    if (asmOf.has(label)) return asmOf.get(label);
    const d = funcDefs.get(label);
    const g = new FuncGen(d.item, warnings);
    const a = g.gen();
    asmOf.set(label, a);
    return a;
  };

  const LINKER_SYMS = new Set(['__stack_top', '__data_load', '__data_start', '__data_end', '__bss_start', '__bss_end', '__heap_start', '__heap_end']);
  const reachedF = [], reachedV = [];
  const seen = new Set();
  const work = [];
  const enqueue = (label, from) => {
    if (seen.has(label)) return;
    seen.add(label);
    if (LINKER_SYMS.has(label)) return;
    if (funcDefs.has(label)) { reachedF.push(label); work.push({ f: label }); return; }
    if (varDefs.has(label)) { reachedV.push(label); work.push({ v: label }); return; }
    const pretty = label.replace(/@.*$/, '');
    errors.push({ msg: `undefined reference to '${pretty}'` + (from ? ` (referenced from ${from.replace(/@.*$/, '')})` : ''), file: undefined });
  };
  enqueue('Reset_Handler');
  enqueue('Default_Handler');
  for (const v of VECTORS) if (v && v !== '__stack_top' && funcDefs.has(v)) enqueue(v);
  enqueue('main');
  while (work.length) {
    const w = work.pop();
    if (w.f) { let a; try { a = getAsm(w.f); } catch (e) { if (e instanceof CompileError) { errors.push({ msg: e.message, file: e.file, line: e.line }); continue; } throw e; } for (const r of a.refs) enqueue(r, w.f); }
    else { const g = varDefs.get(w.v).item; if (g.init) for (const r of g.init.relocs) if (r.label) enqueue(r.label, w.v); }
  }
  if (errors.length) return { errors };

  // ---- layout
  const FLASH_CODE = 0x300;
  const addr = new Map();
  let pc = FLASH_CODE;
  const order = reachedF.slice().sort((x, y) => (x === 'Reset_Handler' ? -1 : y === 'Reset_Handler' ? 1 : 0));
  for (const l of order) { pc = Math.ceil(pc / 4) * 4; addr.set(l, pc); pc += asmOf.get(l).h.length * 2; }
  const codeEnd = pc;
  const ro = [], data = [], bss = [];
  for (const l of reachedV) {
    const g = varDefs.get(l).item;
    if (g.isConst || g.isString) ro.push(g);
    else if (g.init && g.init.bytes.some(b => b !== 0) || (g.init && g.init.relocs.length)) data.push(g);
    else bss.push(g);
  }
  const place = (list, start) => {
    let p = start;
    for (const g of list) { const al = Math.max(g.type.align, g.type.kind === 'array' || g.type.kind === 'struct' ? 4 : 1); p = Math.ceil(p / al) * al; addr.set(g.label, p); p += Math.max(g.type.size, 0); }
    return p;
  };
  const roStart = Math.ceil(codeEnd / 4) * 4;
  const roEnd = place(ro, roStart);
  const dataLoad = Math.ceil(roEnd / 4) * 4;
  const RAM = 0x10000000, RAM_END = 0x10008000;
  const dataStart = RAM;
  const dataEnd = Math.ceil(place(data, dataStart) / 4) * 4;
  const bssStart = dataEnd;
  const bssEnd = Math.ceil(place(bss, bssStart) / 4) * 4;
  const imageEnd = dataLoad + (dataEnd - dataStart);
  addr.set('__stack_top', RAM_END); addr.set('__data_load', dataLoad); addr.set('__data_start', dataStart); addr.set('__data_end', dataEnd);
  addr.set('__bss_start', bssStart); addr.set('__bss_end', bssEnd); addr.set('__heap_start', bssEnd); addr.set('__heap_end', RAM_END - 2048);
  if (imageEnd > 512 * 1024) return { errors: [{ msg: `program does not fit in flash (${imageEnd} bytes)` }] };
  if (bssEnd > RAM_END - 1024) return { errors: [{ msg: `RAM overflow: ${bssEnd - RAM} bytes of variables, only 32 KB available (leave room for the stack)` }] };

  const symAddr = (label) => {
    const a = addr.get(label);
    if (a === undefined) throw new Error('internal: no address for ' + label);
    return funcDefs.has(label) ? (a | 1) >>> 0 : a;
  };

  // ---- emit image
  const image = new Uint8Array(imageEnd);
  image.fill(0xFF, 0, FLASH_CODE);
  const w32 = (o, v) => { image[o] = v & 0xFF; image[o + 1] = (v >>> 8) & 0xFF; image[o + 2] = (v >>> 16) & 0xFF; image[o + 3] = (v >>> 24) & 0xFF; };
  const lineMap = [];
  const funcRanges = [];
  for (const l of order) {
    const a = asmOf.get(l);
    const base = addr.get(l);
    for (const r of a.relocs) {
      if (r.kind === 'bl') {
        const target = addr.get(r.label);
        const off = target - (base + r.pos * 2 + 4);
        const [h1, h2] = encB(off, true);
        a.h[r.pos] = h1; a.h[r.pos + 1] = h2;
      } else {
        const v = (symAddr(r.label) + (r.addend || 0)) >>> 0;
        const [h1, h2] = encMovw(r.rd, r.kind === 'movw' ? v & 0xFFFF : v >>> 16, r.kind === 'movt');
        a.h[r.pos] = h1; a.h[r.pos + 1] = h2;
      }
    }
    for (let i = 0; i < a.h.length; i++) { image[base + 2 * i] = a.h[i] & 0xFF; image[base + 2 * i + 1] = a.h[i] >>> 8; }
    for (const ln of a.lines) lineMap.push({ addr: base + ln.pos * 2, file: ln.file, line: ln.line });
    const fd = funcDefs.get(l).item;
    funcRanges.push({ name: fd.name, start: base, end: base + a.h.length * 2, file: fd.file, isLib: funcDefs.get(l).isLib });
  }
  const writeVar = (g, at) => {
    if (!g.init) return;
    image.set(g.init.bytes, at);
    for (const r of g.init.relocs) w32(at + r.offset, ((r.label ? symAddr(r.label) : 0) + r.addend) >>> 0);
  };
  for (const g of ro) writeVar(g, addr.get(g.label));
  for (const g of data) writeVar(g, dataLoad + (addr.get(g.label) - dataStart));

  // vector table
  for (let i = 0; i < VECTORS.length; i++) {
    const v = VECTORS[i];
    let val;
    if (i === 0) val = RAM_END;
    else if (!v) val = 0;
    else val = symAddr(funcDefs.has(v) && seen.has(v) ? v : 'Default_Handler');
    w32(i * 4, val);
  }
  let sum = 0;
  for (let i = 0; i < 7; i++) sum = (sum + (image[i * 4] | (image[i * 4 + 1] << 8) | (image[i * 4 + 2] << 16) | (image[i * 4 + 3] << 24))) >>> 0;
  w32(7 * 4, (-sum) >>> 0);

  lineMap.sort((x, y) => x.addr - y.addr);
  const symbols = [];
  for (const l of reachedV) {
    const g = varDefs.get(l).item;
    if (g.isString || g.label.startsWith('.')) continue;
    symbols.push({ name: g.name, addr: addr.get(l), type: g.type, isLib: varDefs.get(l).isLib });
  }
  return {
    image, lineMap, funcRanges, symbols, errors: [],
    stats: { code: codeEnd - FLASH_CODE, rodata: roEnd - roStart, data: dataEnd - dataStart, bss: bssEnd - bssStart, flash: imageEnd },
  };
}
