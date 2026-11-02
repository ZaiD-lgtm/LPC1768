// ARM Cortex-M3 (ARMv7-M) core: Thumb / Thumb-2 interpreter, NVIC and exception model.

export class SimFault extends Error {
  constructor(kind, msg, addr) { super(msg); this.kind = kind; this.addr = addr; }
}

const NUM_EXC = 16 + 35; // LPC1768 has 35 external interrupts

function ror(v, n) { n &= 31; return n ? ((v >>> n) | (v << (32 - n))) >>> 0 : v >>> 0; }

// 32x32 -> 64 unsigned multiply, returns [lo, hi]
function umul64(a, b) {
  const a0 = a & 0xFFFF, a1 = a >>> 16, b0 = b & 0xFFFF, b1 = b >>> 16;
  const p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
  const mid = (p00 >>> 16) + (p01 & 0xFFFF) + (p10 & 0xFFFF);
  const lo = ((mid << 16) | (p00 & 0xFFFF)) >>> 0;
  const hi = (p11 + (p01 >>> 16) + (p10 >>> 16) + Math.floor(mid / 65536)) >>> 0;
  return [lo, hi];
}

function add64(lo, hi, alo, ahi) {
  const l = lo + alo;
  const carry = l > 0xFFFFFFFF ? 1 : 0;
  return [l >>> 0, (hi + ahi + carry) >>> 0];
}

export class CortexM3 {
  constructor(bus) {
    this.bus = bus;
    this.r = new Uint32Array(16);
    this.prio = new Uint8Array(NUM_EXC);
    this.enabled = new Uint8Array(NUM_EXC);
    this.pending = new Uint8Array(NUM_EXC);
    this.active = new Uint8Array(NUM_EXC);
    this.irqLine = new Uint8Array(NUM_EXC);
    this.breakpoints = new Set();
    this.onFault = null;
    this.reset();
  }

  reset() {
    this.r.fill(0);
    this.N = this.Z = this.C = this.V = this.Q = 0;
    this.it = 0;
    this.ipsr = 0;
    this.primask = 0; this.faultmask = 0; this.basepri = 0; this.control = 0;
    this.otherSP = 0; // inactive banked stack pointer
    this.prio.fill(0); this.enabled.fill(0); this.pending.fill(0); this.active.fill(0); this.irqLine.fill(0);
    this.vtor = 0; this.prigroup = 0; this.scr = 0;
    this.cycles = 0;
    this.sleeping = false;
    this.lockup = false;
    this.lastFault = null;
    this.checkIrq = true;
    this.exclusive = false;
    this.r[13] = this.bus.read32(0) & ~3;
    const pc = this.bus.read32(4);
    this.pc = pc & ~1;
    this.npc = this.pc;
  }

  // ---------- helpers ----------
  reg(n) { return n === 15 ? (this.pc + 4) >>> 0 : this.r[n]; }

  get xpsr() {
    return ((this.N << 31) | (this.Z << 30) | (this.C << 29) | (this.V << 28) | (this.Q << 27) |
      ((this.it & 3) << 25) | (1 << 24) | (((this.it >> 2) & 0x3F) << 10) | this.ipsr) >>> 0;
  }
  set xpsr(v) {
    this.N = (v >>> 31) & 1; this.Z = (v >>> 30) & 1; this.C = (v >>> 29) & 1; this.V = (v >>> 28) & 1; this.Q = (v >>> 27) & 1;
    this.it = ((v >>> 25) & 3) | (((v >>> 10) & 0x3F) << 2);
    this.ipsr = v & 0x1FF;
  }
  get handlerMode() { return this.ipsr !== 0; }
  get msp() { return (this.handlerMode || !(this.control & 2)) ? this.r[13] : this.otherSP; }
  get psp() { return (this.handlerMode || !(this.control & 2)) ? this.otherSP : this.r[13]; }
  setMSP(v) { if (this.handlerMode || !(this.control & 2)) this.r[13] = v & ~3; else this.otherSP = v & ~3; }
  setPSP(v) { if (this.handlerMode || !(this.control & 2)) this.otherSP = v & ~3; else this.r[13] = v & ~3; }

  cond(c) {
    switch (c) {
      case 0: return this.Z === 1;
      case 1: return this.Z === 0;
      case 2: return this.C === 1;
      case 3: return this.C === 0;
      case 4: return this.N === 1;
      case 5: return this.N === 0;
      case 6: return this.V === 1;
      case 7: return this.V === 0;
      case 8: return this.C === 1 && this.Z === 0;
      case 9: return this.C === 0 || this.Z === 1;
      case 10: return this.N === this.V;
      case 11: return this.N !== this.V;
      case 12: return this.Z === 0 && this.N === this.V;
      case 13: return this.Z === 1 || this.N !== this.V;
      default: return true;
    }
  }

  nz(r) { this.N = r >>> 31; this.Z = r === 0 ? 1 : 0; }

  addc(x, y, c, s) {
    const ur = x + y + c;
    const r = ur >>> 0;
    if (s) {
      this.C = ur > 0xFFFFFFFF ? 1 : 0;
      this.V = ((~(x ^ y) & (x ^ r)) >>> 31) & 1;
      this.N = r >>> 31; this.Z = r === 0 ? 1 : 0;
    }
    return r;
  }
  subc(x, y, c, s) { return this.addc(x, (~y) >>> 0, c, s); }

  // shift with carry out. type: 0 LSL,1 LSR,2 ASR,3 ROR, 4 RRX
  shiftC(v, type, n, s) {
    v >>>= 0;
    let c = this.C, r = v;
    switch (type) {
      case 0:
        if (n === 0) break;
        if (n < 32) { c = (v >>> (32 - n)) & 1; r = (v << n) >>> 0; }
        else if (n === 32) { c = v & 1; r = 0; } else { c = 0; r = 0; }
        break;
      case 1:
        if (n === 0) break;
        if (n < 32) { c = (v >>> (n - 1)) & 1; r = v >>> n; }
        else if (n === 32) { c = v >>> 31; r = 0; } else { c = 0; r = 0; }
        break;
      case 2:
        if (n === 0) break;
        if (n < 32) { c = (v >>> (n - 1)) & 1; r = (v | 0) >> n >>> 0; }
        else { c = v >>> 31; r = c ? 0xFFFFFFFF : 0; }
        break;
      case 3:
        if (n === 0) break;
        n &= 31;
        r = ror(v, n); c = r >>> 31;
        if (n === 0) c = v >>> 31;
        break;
      case 4:
        r = ((this.C << 31) | (v >>> 1)) >>> 0; c = v & 1;
        break;
    }
    if (s) this.C = c;
    return r;
  }

  // immediate shift decode
  immShift(v, type, imm5, s) {
    if (type === 0) return this.shiftC(v, 0, imm5, s);
    if (type === 1 || type === 2) return this.shiftC(v, type, imm5 === 0 ? 32 : imm5, s);
    return imm5 === 0 ? this.shiftC(v, 4, 1, s) : this.shiftC(v, 3, imm5, s);
  }

  expandImm(imm12, s) {
    if ((imm12 >>> 10) === 0) {
      const b = imm12 & 0xFF;
      switch ((imm12 >>> 8) & 3) {
        case 0: return b;
        case 1: return ((b << 16) | b) >>> 0;
        case 2: return ((b << 24) | (b << 8)) >>> 0;
        default: return ((b << 24) | (b << 16) | (b << 8) | b) >>> 0;
      }
    }
    const v = ror(0x80 | (imm12 & 0x7F), imm12 >>> 7);
    if (s) this.C = v >>> 31;
    return v;
  }

  // ---------- memory ----------
  rd8(a) { return this.bus.read8(a >>> 0); }
  rd16(a) { return this.bus.read16(a >>> 0); }
  rd32(a) { return this.bus.read32(a >>> 0); }
  wr8(a, v) { this.bus.write8(a >>> 0, v & 0xFF); }
  wr16(a, v) { this.bus.write16(a >>> 0, v & 0xFFFF); }
  wr32(a, v) { this.bus.write32(a >>> 0, v >>> 0); }

  // ---------- PC writes ----------
  branch(addr) { this.npc = (addr & ~1) >>> 0; this.cycles += 2; }
  bxWrite(v) {
    v >>>= 0;
    if (this.handlerMode && (v >>> 28) === 0xF) { this.exceptionReturn(v); return; }
    if ((v & 1) === 0) throw new SimFault('UsageFault', `INVSTATE: branch to ARM state address 0x${v.toString(16)}`);
    this.npc = (v & ~1) >>> 0; this.cycles += 2;
  }

  // ---------- NVIC / exceptions ----------
  setIrq(n, level) {
    const e = n + 16;
    if (this.irqLine[e] === (level ? 1 : 0)) return;
    this.irqLine[e] = level ? 1 : 0;
    if (level) { this.pending[e] = 1; this.checkIrq = true; }
  }
  pendException(e) { this.pending[e] = 1; this.checkIrq = true; }

  excPriority(e) {
    if (e === 1) return -3; if (e === 2) return -2; if (e === 3) return -1;
    return this.prio[e];
  }
  groupPrio(p) {
    if (p < 0) return p;
    const sub = (2 << this.prigroup) - 1;
    return p & ~sub & 0xFF;
  }
  execPriority() {
    let p = 256;
    for (let e = 1; e < NUM_EXC; e++) if (this.active[e]) { const g = this.groupPrio(this.excPriority(e)); if (g < p) p = g; }
    if (this.basepri && this.groupPrio(this.basepri) < p) p = this.groupPrio(this.basepri);
    if (this.primask && p > 0) p = 0;
    if (this.faultmask && p > -1) p = -1;
    return p;
  }
  highestPending() {
    let best = -1, bp = 1e9;
    for (let e = 2; e < NUM_EXC; e++) {
      if (!this.pending[e]) continue;
      if (e >= 16 && !this.enabled[e]) continue;
      const p = this.excPriority(e);
      if (p < bp) { bp = p; best = e; }
    }
    return best;
  }
  anyPendingEnabled() {
    for (let e = 2; e < NUM_EXC; e++) if (this.pending[e] && (e < 16 || this.enabled[e])) return true;
    return false;
  }

  checkInterrupts() {
    this.checkIrq = false;
    const e = this.highestPending();
    if (e < 0) return false;
    if (this.groupPrio(this.excPriority(e)) < this.execPriority()) {
      this.sleeping = false;
      this.enterException(e, this.pc);
      return true;
    }
    return false;
  }

  enterException(exc, returnAddr) {
    const usePSP = !this.handlerMode && (this.control & 2);
    let sp = this.r[13];
    const align = (sp >>> 2) & 1;
    sp = ((sp - 0x20) & ~(align << 2)) >>> 0;
    const psr = (this.xpsr & ~(1 << 9)) | (align << 9);
    const w = [this.r[0], this.r[1], this.r[2], this.r[3], this.r[12], this.r[14], returnAddr >>> 0, psr >>> 0];
    for (let i = 0; i < 8; i++) this.wr32(sp + 4 * i, w[i]);
    this.r[13] = sp;
    this.r[14] = this.handlerMode ? 0xFFFFFFF1 : (usePSP ? 0xFFFFFFFD : 0xFFFFFFF9);
    if (usePSP) { const t = this.r[13]; this.r[13] = this.otherSP; this.otherSP = t; }
    this.control &= ~2;
    this.ipsr = exc;
    this.it = 0;
    this.pending[exc] = 0;
    this.active[exc] = 1;
    this.exclusive = false;
    const vec = this.rd32(this.vtor + 4 * exc);
    this.pc = this.npc = (vec & ~1) >>> 0;
    this.cycles += 12;
    this.checkIrq = true;
  }

  exceptionReturn(val) {
    const exc = this.ipsr;
    this.active[exc] = 0;
    if (exc >= 16 && this.irqLine[exc]) this.pending[exc] = 1; // level-sensitive re-pend
    const kind = val & 0xF;
    if (kind === 1) { /* handler, MSP */ }
    else if (kind === 9) { /* thread, MSP */ }
    else if (kind === 0xD) { this.control |= 2; const t = this.r[13]; this.r[13] = this.otherSP; this.otherSP = t; }
    else throw new SimFault('UsageFault', `INVPC: bad EXC_RETURN 0x${val.toString(16)}`);
    let sp = this.r[13];
    const r0 = this.rd32(sp), r1 = this.rd32(sp + 4), r2 = this.rd32(sp + 8), r3 = this.rd32(sp + 12);
    const r12 = this.rd32(sp + 16), lr = this.rd32(sp + 20), pc = this.rd32(sp + 24), psr = this.rd32(sp + 28);
    this.r[0] = r0; this.r[1] = r1; this.r[2] = r2; this.r[3] = r3; this.r[12] = r12; this.r[14] = lr;
    sp = (sp + 0x20) >>> 0;
    if (psr & (1 << 9)) sp = (sp | 4) >>> 0;
    this.r[13] = sp;
    this.xpsr = psr;
    this.npc = (pc & ~1) >>> 0;
    this.cycles += 10;
    this.checkIrq = true;
    // sleep-on-exit
    if (kind !== 1 && (this.scr & 2)) this.sleeping = true;
  }

  takeFault(f) {
    const msg = `${f.kind}: ${f.message} (PC=0x${this.pc.toString(16).padStart(8, '0')})`;
    this.lastFault = msg;
    if (this.onFault) this.onFault(msg);
    if (this.active[3] || this.active[2] || this.ipsr === 3) {
      this.lockup = true;
      return;
    }
    try { this.enterException(3, this.pc); }
    catch (e) { this.lockup = true; }
  }

  // ---------- run ----------
  // Execute up to n instructions or until cycles >= limit. Returns reason or null.
  run(maxCycles) {
    const end = this.cycles + maxCycles;
    const bps = this.breakpoints;
    const useBp = bps.size > 0;
    let first = true;
    while (this.cycles < end) {
      if (this.lockup) return 'lockup';
      if (this.checkIrq) this.checkInterrupts();
      if (this.sleeping) return 'sleep';
      if (useBp && !first && bps.has(this.pc)) return 'break';
      first = false;
      this.step();
    }
    return null;
  }

  step() {
    const pc = this.pc;
    try {
      const hw1 = this.bus.fetch16(pc);
      const it = this.it;
      if ((hw1 & 0xF800) >= 0xE800) {
        const hw2 = this.bus.fetch16(pc + 2);
        this.npc = (pc + 4) >>> 0;
        this.cycles++;
        if (it & 0xF) {
          if (this.cond(it >>> 4)) this.exec32(hw1, hw2);
          this.advanceIT(it);
        } else this.exec32(hw1, hw2);
      } else {
        this.npc = (pc + 2) >>> 0;
        this.cycles++;
        if (it & 0xF) {
          if (this.cond(it >>> 4)) this.exec16(hw1, true);
          this.advanceIT(it);
        } else this.exec16(hw1, false);
      }
      this.pc = this.npc;
    } catch (e) {
      if (e instanceof SimFault) { this.pc = pc; this.takeFault(e); }
      else throw e;
    }
  }

  advanceIT(it) {
    if (this.it !== it) return; // instruction changed IT (exception entry etc.)
    if ((it & 7) === 0) this.it = 0;
    else this.it = (it & 0xE0) | ((it << 1) & 0x1F);
  }

  undef(hw, hw2) {
    const h = hw2 === undefined ? hw.toString(16).padStart(4, '0') : hw.toString(16).padStart(4, '0') + ' ' + hw2.toString(16).padStart(4, '0');
    throw new SimFault('UsageFault', `UNDEFINSTR: undefined instruction ${h}`);
  }

  // ---------- 16-bit ----------
  exec16(h, inIT) {
    const r = this.r;
    const s = !inIT;
    switch (h >>> 12) {
      case 0: case 1: {
        const op = (h >>> 11) & 3;
        const rd = h & 7, rm = (h >>> 3) & 7;
        if (op < 3) {
          const imm5 = (h >>> 6) & 0x1F;
          const v = this.immShift(r[rm], op, imm5, s);
          r[rd] = v; if (s) this.nz(v);
        } else {
          const rn = rm, x = r[rn];
          const y = (h & 0x400) ? (h >>> 6) & 7 : r[(h >>> 6) & 7];
          r[rd] = (h & 0x200) ? this.subc(x, y, 1, s) : this.addc(x, y, 0, s);
        }
        return;
      }
      case 2: case 3: {
        const rd = (h >>> 8) & 7, imm = h & 0xFF;
        switch ((h >>> 11) & 3) {
          case 0: r[rd] = imm; if (s) this.nz(imm); break;
          case 1: this.subc(r[rd], imm, 1, true); break;
          case 2: r[rd] = this.addc(r[rd], imm, 0, s); break;
          case 3: r[rd] = this.subc(r[rd], imm, 1, s); break;
        }
        return;
      }
      case 4: {
        if ((h & 0xFC00) === 0x4000) {
          const rdn = h & 7, rm = (h >>> 3) & 7;
          const a = r[rdn], b = r[rm];
          let v;
          switch ((h >>> 6) & 0xF) {
            case 0: v = (a & b) >>> 0; r[rdn] = v; if (s) this.nz(v); break;
            case 1: v = (a ^ b) >>> 0; r[rdn] = v; if (s) this.nz(v); break;
            case 2: v = this.shiftC(a, 0, b & 0xFF, s); r[rdn] = v; if (s) this.nz(v); break;
            case 3: v = this.shiftC(a, 1, b & 0xFF, s); r[rdn] = v; if (s) this.nz(v); break;
            case 4: v = this.shiftC(a, 2, b & 0xFF, s); r[rdn] = v; if (s) this.nz(v); break;
            case 5: r[rdn] = this.addc(a, b, this.C, s); break;
            case 6: r[rdn] = this.subc(a, b, this.C, s); break;
            case 7: v = this.shiftC(a, 3, b & 0xFF, s); r[rdn] = v; if (s) this.nz(v); break;
            case 8: this.nz((a & b) >>> 0); break;
            case 9: r[rdn] = this.subc(0, b, 1, s); break;
            case 10: this.subc(a, b, 1, true); break;
            case 11: this.addc(a, b, 0, true); break;
            case 12: v = (a | b) >>> 0; r[rdn] = v; if (s) this.nz(v); break;
            case 13: v = Math.imul(a, b) >>> 0; r[rdn] = v; if (s) this.nz(v); break;
            case 14: v = (a & ~b) >>> 0; r[rdn] = v; if (s) this.nz(v); break;
            case 15: v = (~b) >>> 0; r[rdn] = v; if (s) this.nz(v); break;
          }
          return;
        }
        if ((h & 0xFC00) === 0x4400) {
          const rm = (h >>> 3) & 0xF;
          const rdn = (h & 7) | ((h >>> 4) & 8);
          switch ((h >>> 8) & 3) {
            case 0: {
              const v = (this.reg(rdn) + this.reg(rm)) >>> 0;
              if (rdn === 15) this.branch(v); else r[rdn] = v;
              return;
            }
            case 1: this.subc(this.reg(rdn), this.reg(rm), 1, true); return;
            case 2: {
              const v = this.reg(rm);
              if (rdn === 15) this.branch(v); else r[rdn] = v;
              return;
            }
            case 3: {
              const target = this.reg(rm);
              if (h & 0x80) { r[14] = ((this.pc + 2) | 1) >>> 0; }
              this.bxWrite(target);
              return;
            }
          }
        }
        // LDR literal
        {
          const rt = (h >>> 8) & 7;
          const addr = ((this.pc + 4) & ~3) + (h & 0xFF) * 4;
          r[rt] = this.rd32(addr); this.cycles++;
        }
        return;
      }
      case 5: {
        const rt = h & 7, rn = (h >>> 3) & 7, rm = (h >>> 6) & 7;
        const addr = (r[rn] + r[rm]) >>> 0;
        this.cycles++;
        switch ((h >>> 9) & 7) {
          case 0: this.wr32(addr, r[rt]); break;
          case 1: this.wr16(addr, r[rt]); break;
          case 2: this.wr8(addr, r[rt]); break;
          case 3: r[rt] = (this.rd8(addr) << 24 >> 24) >>> 0; break;
          case 4: r[rt] = this.rd32(addr); break;
          case 5: r[rt] = this.rd16(addr); break;
          case 6: r[rt] = this.rd8(addr); break;
          case 7: r[rt] = (this.rd16(addr) << 16 >> 16) >>> 0; break;
        }
        return;
      }
      case 6: {
        const rt = h & 7, rn = (h >>> 3) & 7, addr = (r[rn] + ((h >>> 6) & 0x1F) * 4) >>> 0;
        this.cycles++;
        if (h & 0x800) r[rt] = this.rd32(addr); else this.wr32(addr, r[rt]);
        return;
      }
      case 7: {
        const rt = h & 7, rn = (h >>> 3) & 7, addr = (r[rn] + ((h >>> 6) & 0x1F)) >>> 0;
        this.cycles++;
        if (h & 0x800) r[rt] = this.rd8(addr); else this.wr8(addr, r[rt]);
        return;
      }
      case 8: {
        const rt = h & 7, rn = (h >>> 3) & 7, addr = (r[rn] + ((h >>> 6) & 0x1F) * 2) >>> 0;
        this.cycles++;
        if (h & 0x800) r[rt] = this.rd16(addr); else this.wr16(addr, r[rt]);
        return;
      }
      case 9: {
        const rt = (h >>> 8) & 7, addr = (r[13] + (h & 0xFF) * 4) >>> 0;
        this.cycles++;
        if (h & 0x800) r[rt] = this.rd32(addr); else this.wr32(addr, r[rt]);
        return;
      }
      case 10: {
        const rd = (h >>> 8) & 7, imm = (h & 0xFF) * 4;
        r[rd] = (h & 0x800) ? (r[13] + imm) >>> 0 : ((((this.pc + 4) & ~3) + imm) >>> 0);
        return;
      }
      case 11: return this.misc16(h, inIT);
      case 12: {
        const rn = (h >>> 8) & 7, list = h & 0xFF;
        let addr = r[rn];
        if (h & 0x800) {
          for (let i = 0; i < 8; i++) if (list & (1 << i)) { r[i] = this.rd32(addr); addr += 4; this.cycles++; }
          if (!(list & (1 << rn))) r[rn] = addr >>> 0;
        } else {
          for (let i = 0; i < 8; i++) if (list & (1 << i)) { this.wr32(addr, r[i]); addr += 4; this.cycles++; }
          r[rn] = addr >>> 0;
        }
        return;
      }
      case 13: {
        const c = (h >>> 8) & 0xF;
        if (c === 0xF) { this.pendException(11); return; }
        if (c === 0xE) this.undef(h);
        if (this.cond(c)) {
          const off = ((h & 0xFF) << 24) >> 23;
          this.branch(this.pc + 4 + off);
        }
        return;
      }
      case 14: {
        if (h & 0x800) this.undef(h);
        const off = ((h & 0x7FF) << 21) >> 20;
        this.branch(this.pc + 4 + off);
        return;
      }
    }
    this.undef(h);
  }

  misc16(h, inIT) {
    const r = this.r;
    if ((h & 0xFF00) === 0xB000) {
      const imm = (h & 0x7F) * 4;
      r[13] = (h & 0x80) ? (r[13] - imm) >>> 0 : (r[13] + imm) >>> 0;
      return;
    }
    if ((h & 0xF500) === 0xB100) {
      const rn = h & 7;
      const imm = (((h >>> 9) & 1) << 6) | (((h >>> 3) & 0x1F) << 1);
      const nz = (h & 0x800) !== 0;
      if ((r[rn] !== 0) === nz) this.branch(this.pc + 4 + imm);
      return;
    }
    if ((h & 0xFF00) === 0xB200) {
      const rd = h & 7, v = r[(h >>> 3) & 7];
      switch ((h >>> 6) & 3) {
        case 0: r[rd] = (v << 16 >> 16) >>> 0; break;
        case 1: r[rd] = (v << 24 >> 24) >>> 0; break;
        case 2: r[rd] = v & 0xFFFF; break;
        case 3: r[rd] = v & 0xFF; break;
      }
      return;
    }
    if ((h & 0xFE00) === 0xB400) {
      const list = (h & 0xFF) | ((h & 0x100) ? 0x4000 : 0);
      let n = 0; for (let i = 0; i < 16; i++) if (list & (1 << i)) n++;
      let addr = (r[13] - 4 * n) >>> 0;
      const base = addr;
      for (let i = 0; i < 15; i++) if (list & (1 << i)) { this.wr32(addr, r[i]); addr += 4; this.cycles++; }
      r[13] = base;
      return;
    }
    if ((h & 0xFE00) === 0xBC00) {
      let addr = r[13];
      for (let i = 0; i < 8; i++) if (h & (1 << i)) { r[i] = this.rd32(addr); addr += 4; this.cycles++; }
      if (h & 0x100) {
        const v = this.rd32(addr); addr += 4;
        r[13] = addr >>> 0;
        this.bxWrite(v);
      } else r[13] = addr >>> 0;
      return;
    }
    if ((h & 0xFFE8) === 0xB660) {
      const dis = (h & 0x10) !== 0;
      if (h & 2) { this.primask = dis ? 1 : 0; }
      if (h & 1) { this.faultmask = dis ? 1 : 0; }
      this.checkIrq = true;
      return;
    }
    if ((h & 0xFF00) === 0xBA00) {
      const rd = h & 7, v = r[(h >>> 3) & 7];
      switch ((h >>> 6) & 3) {
        case 0: r[rd] = (((v & 0xFF) << 24) | ((v & 0xFF00) << 8) | ((v >>> 8) & 0xFF00) | (v >>> 24)) >>> 0; return;
        case 1: r[rd] = (((v & 0x00FF00FF) << 8) | ((v >>> 8) & 0x00FF00FF)) >>> 0; return;
        case 3: r[rd] = ((((v & 0xFF) << 24) >> 16) | ((v >>> 8) & 0xFF)) >>> 0; return;
      }
      this.undef(h);
    }
    if ((h & 0xFF00) === 0xBE00) {
      throw new SimFault('Debug', `BKPT #${h & 0xFF}`);
    }
    if ((h & 0xFF00) === 0xBF00) {
      if (h & 0xF) { this.it = h & 0xFF; return; }
      switch ((h >>> 4) & 0xF) {
        case 0: case 1: case 4: return;
        case 2: // WFE
        case 3: // WFI
          if (!this.anyPendingEnabled()) this.sleeping = true;
          return;
      }
      return;
    }
    this.undef(h);
  }

  // ---------- 32-bit ----------
  exec32(h1, h2) {
    const op1 = (h1 >>> 11) & 3;
    if (op1 === 1) {
      if ((h1 & 0xFE40) === 0xE800) return this.ldmstm(h1, h2);
      if ((h1 & 0xFE40) === 0xE840) return this.dualExcl(h1, h2);
      if ((h1 & 0xFE00) === 0xEA00) return this.dpShiftReg(h1, h2);
      return this.undef(h1, h2);
    }
    if (op1 === 2) {
      if (h2 & 0x8000) return this.branchMisc(h1, h2);
      if (h1 & 0x200) return this.plainImm(h1, h2);
      return this.dpModImm(h1, h2);
    }
    // op1 === 3
    if ((h1 & 0xFE00) === 0xF800) return this.ldst(h1, h2);
    if ((h1 & 0xFF00) === 0xFA00) return this.dpReg(h1, h2);
    if ((h1 & 0xFF80) === 0xFB00) return this.mul32(h1, h2);
    if ((h1 & 0xFF80) === 0xFB80) return this.mulLong(h1, h2);
    return this.undef(h1, h2);
  }

  dpOp(op, rd, rn, a, b, s, carryFromShift) {
    const r = this.r;
    let v;
    switch (op) {
      case 0: v = (a & b) >>> 0; if (rd === 15 && s) { this.nz(v); return; } break;
      case 1: v = (a & ~b) >>> 0; break;
      case 2: v = rn === 15 ? b : (a | b) >>> 0; break;
      case 3: v = rn === 15 ? (~b) >>> 0 : (a | ~b) >>> 0; break;
      case 4: v = (a ^ b) >>> 0; if (rd === 15 && s) { this.nz(v); return; } break;
      case 8: if (rd === 15 && s) { this.addc(a, b, 0, true); return; } r[rd] = this.addc(a, b, 0, s); return;
      case 10: r[rd] = this.addc(a, b, this.C, s); return;
      case 11: r[rd] = this.subc(a, b, this.C, s); return;
      case 13: if (rd === 15 && s) { this.subc(a, b, 1, true); return; } r[rd] = this.subc(a, b, 1, s); return;
      case 14: r[rd] = this.subc(b, a, 1, s); return;
      default: return this.undef(op);
    }
    if (s) this.nz(v);
    if (rd === 15) this.branch(v); else r[rd] = v;
  }

  dpModImm(h1, h2) {
    const op = (h1 >>> 5) & 0xF, s = (h1 >>> 4) & 1, rn = h1 & 0xF, rd = (h2 >>> 8) & 0xF;
    const imm12 = (((h1 >>> 10) & 1) << 11) | (((h2 >>> 12) & 7) << 8) | (h2 & 0xFF);
    const logical = op <= 4;
    const b = this.expandImm(imm12, s && logical);
    const a = rn === 15 ? ((this.pc + 4) & ~3) >>> 0 : this.r[rn];
    this.dpOp(op, rd, rn, a, b, s);
  }

  dpShiftReg(h1, h2) {
    const op = (h1 >>> 5) & 0xF, s = (h1 >>> 4) & 1, rn = h1 & 0xF, rd = (h2 >>> 8) & 0xF, rm = h2 & 0xF;
    const imm5 = (((h2 >>> 12) & 7) << 2) | ((h2 >>> 6) & 3), type = (h2 >>> 4) & 3;
    const logical = op <= 4;
    const b = this.immShift(this.reg(rm), type, imm5, s && logical);
    this.dpOp(op, rd, rn, this.reg(rn), b, s);
  }

  plainImm(h1, h2) {
    const r = this.r;
    const op = (h1 >>> 4) & 0x1F, rn = h1 & 0xF, rd = (h2 >>> 8) & 0xF;
    const imm12 = (((h1 >>> 10) & 1) << 11) | (((h2 >>> 12) & 7) << 8) | (h2 & 0xFF);
    switch (op) {
      case 0: // ADDW / ADR
        r[rd] = rn === 15 ? ((((this.pc + 4) & ~3) + imm12) >>> 0) : (r[rn] + imm12) >>> 0; return;
      case 0xA: // SUBW / ADR
        r[rd] = rn === 15 ? ((((this.pc + 4) & ~3) - imm12) >>> 0) : (r[rn] - imm12) >>> 0; return;
      case 4: r[rd] = ((h1 & 0xF) << 12) | imm12; return;
      case 0xC: r[rd] = ((((h1 & 0xF) << 12) | imm12) << 16 | (r[rd] & 0xFFFF)) >>> 0; return;
    }
    const lsb = (((h2 >>> 12) & 7) << 2) | ((h2 >>> 6) & 3);
    const w = h2 & 0x1F;
    switch (op) {
      case 0x14: { // SBFX
        const v = (r[rn] << (31 - (lsb + w))) >> (31 - w);
        r[rd] = v >>> 0; return;
      }
      case 0x1C: { // UBFX
        const width = w + 1;
        r[rd] = width >= 32 ? r[rn] >>> lsb : (r[rn] >>> lsb) & ((1 << width) - 1) >>> 0;
        r[rd] = r[rd] >>> 0; return;
      }
      case 0x16: { // BFI / BFC
        const msb = w;
        if (msb < lsb) return this.undef(h1, h2);
        const width = msb - lsb + 1;
        const mask = (width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1)) << lsb;
        const src = rn === 15 ? 0 : (r[rn] << lsb);
        r[rd] = ((r[rd] & ~mask) | (src & mask)) >>> 0; return;
      }
      case 0x10: case 0x12: { // SSAT
        const sh = (h1 >>> 5) & 1, n = w + 1;
        if (sh && lsb === 0) return this.undef(h1, h2);
        let v = sh ? (r[rn] | 0) >> lsb : (r[rn] << lsb) | 0;
        const max = Math.pow(2, n - 1) - 1, min = -Math.pow(2, n - 1);
        if (v > max) { v = max; this.Q = 1; } else if (v < min) { v = min; this.Q = 1; }
        r[rd] = v >>> 0; return;
      }
      case 0x18: case 0x1A: { // USAT
        const sh = (h1 >>> 5) & 1, n = w;
        let v = sh ? (r[rn] | 0) >> lsb : (r[rn] << lsb) | 0;
        const max = Math.pow(2, n) - 1;
        if (v > max) { v = max; this.Q = 1; } else if (v < 0) { v = 0; this.Q = 1; }
        r[rd] = v >>> 0; return;
      }
    }
    this.undef(h1, h2);
  }

  branchMisc(h1, h2) {
    const r = this.r;
    const op1 = (h2 >>> 12) & 5;
    if (op1 === 0) {
      if (((h1 >>> 7) & 7) !== 7) {
        // B<cond>.W
        const c = (h1 >>> 6) & 0xF;
        if (this.cond(c)) {
          const S = (h1 >>> 10) & 1, J1 = (h2 >>> 13) & 1, J2 = (h2 >>> 11) & 1;
          let off = (S << 20) | (J2 << 19) | (J1 << 18) | ((h1 & 0x3F) << 12) | ((h2 & 0x7FF) << 1);
          off = (off << 11) >> 11;
          this.branch(this.pc + 4 + off);
        }
        return;
      }
      const op = (h1 >>> 4) & 0x7F;
      if (op === 0x38 || op === 0x39) { // MSR
        const sysm = h2 & 0xFF, v = r[h1 & 0xF];
        this.msr(sysm, v, (h2 >>> 10) & 3);
        return;
      }
      if (op === 0x3A) { // hints
        const hint = h2 & 0xFF;
        if (hint === 2 || hint === 3) { if (!this.anyPendingEnabled()) this.sleeping = true; }
        return;
      }
      if (op === 0x3B) { // DSB/DMB/ISB/CLREX
        if (((h2 >>> 4) & 0xF) === 2) this.exclusive = false;
        return;
      }
      if (op === 0x3E || op === 0x3F) { // MRS
        r[(h2 >>> 8) & 0xF] = this.mrs(h2 & 0xFF);
        return;
      }
      if (h1 === 0xF7F0 && (h2 & 0xF000) === 0xA000) return this.undef(h1, h2);
      return this.undef(h1, h2);
    }
    const S = (h1 >>> 10) & 1, J1 = (h2 >>> 13) & 1, J2 = (h2 >>> 11) & 1;
    const I1 = (~(J1 ^ S)) & 1, I2 = (~(J2 ^ S)) & 1;
    let off = (S << 24) | (I1 << 23) | (I2 << 22) | ((h1 & 0x3FF) << 12) | ((h2 & 0x7FF) << 1);
    off = (off << 7) >> 7;
    if (op1 === 1) { this.branch(this.pc + 4 + off); return; }
    if (op1 === 5) { r[14] = ((this.pc + 4) | 1) >>> 0; this.branch(this.pc + 4 + off); return; }
    this.undef(h1, h2);
  }

  mrs(sysm) {
    switch (sysm) {
      case 0: return (this.xpsr & 0xF8000000) >>> 0;
      case 1: return (this.xpsr & 0xF80001FF) >>> 0;
      case 2: return (this.xpsr & 0xF8000000) >>> 0;
      case 3: return (this.xpsr & 0xF80001FF) >>> 0;
      case 5: return this.ipsr;
      case 6: return 0;
      case 7: return this.ipsr;
      case 8: return this.msp;
      case 9: return this.psp;
      case 16: return this.primask;
      case 17: case 18: return this.basepri;
      case 19: return this.faultmask;
      case 20: return this.control;
    }
    return 0;
  }

  msr(sysm, v, mask) {
    switch (sysm) {
      case 0: case 1: case 2: case 3:
        if (mask & 2) { this.N = (v >>> 31) & 1; this.Z = (v >>> 30) & 1; this.C = (v >>> 29) & 1; this.V = (v >>> 28) & 1; this.Q = (v >>> 27) & 1; }
        return;
      case 8: this.setMSP(v); return;
      case 9: this.setPSP(v); return;
      case 16: this.primask = v & 1; break;
      case 17: this.basepri = v & 0xF8; break;
      case 18: { const b = v & 0xF8; if (b && (b < this.basepri || !this.basepri)) this.basepri = b; break; }
      case 19: if (this.ipsr !== 3) this.faultmask = v & 1; break;
      case 20:
        if (!this.handlerMode) {
          const newSel = v & 2;
          if (newSel !== (this.control & 2)) { const t = this.r[13]; this.r[13] = this.otherSP; this.otherSP = t; }
          this.control = v & 3;
        }
        break;
    }
    this.checkIrq = true;
  }

  ldmstm(h1, h2) {
    const r = this.r;
    const op = (h1 >>> 7) & 3, L = (h1 >>> 4) & 1, W = (h1 >>> 5) & 1, rn = h1 & 0xF;
    const list = h2;
    let n = 0; for (let i = 0; i < 16; i++) if (list & (1 << i)) n++;
    let addr = op === 1 ? r[rn] : (r[rn] - 4 * n) >>> 0;
    const start = addr;
    let pcVal = -1;
    for (let i = 0; i < 16; i++) {
      if (!(list & (1 << i))) continue;
      if (L) { const v = this.rd32(addr); if (i === 15) pcVal = v; else r[i] = v; }
      else this.wr32(addr, r[i]);
      addr = (addr + 4) >>> 0;
      this.cycles++;
    }
    if (W && !(L && (list & (1 << rn)))) r[rn] = op === 1 ? addr : start;
    if (pcVal >= 0) this.bxWrite(pcVal);
  }

  dualExcl(h1, h2) {
    const r = this.r;
    const rn = h1 & 0xF, rt = (h2 >>> 12) & 0xF;
    const P = (h1 >>> 8) & 1, W = (h1 >>> 5) & 1;
    if (!P && !W) {
      const k = (h1 >>> 4) & 0xF;
      if (k === 4) { // STREX
        const addr = (r[rn] + (h2 & 0xFF) * 4) >>> 0, rd = (h2 >>> 8) & 0xF;
        if (this.exclusive) { this.wr32(addr, r[rt]); r[rd] = 0; } else r[rd] = 1;
        this.exclusive = false; return;
      }
      if (k === 5) { r[rt] = this.rd32((r[rn] + (h2 & 0xFF) * 4) >>> 0); this.exclusive = true; return; }
      const op = (h2 >>> 4) & 0xF;
      if (k === 0xD) {
        if (op === 0 || op === 1) { // TBB / TBH
          const base = this.reg(rn), idx = r[h2 & 0xF];
          const off = op === 0 ? this.rd8(base + idx) : this.rd16(base + idx * 2);
          this.branch(this.pc + 4 + off * 2);
          return;
        }
        if (op === 4) { r[rt] = this.rd8(r[rn]); this.exclusive = true; return; }
        if (op === 5) { r[rt] = this.rd16(r[rn]); this.exclusive = true; return; }
      }
      if (k === 0xC) {
        const rd = h2 & 0xF;
        if (op === 4 || op === 5) {
          if (this.exclusive) { if (op === 4) this.wr8(r[rn], r[rt]); else this.wr16(r[rn], r[rt]); r[rd] = 0; } else r[rd] = 1;
          this.exclusive = false; return;
        }
      }
      return this.undef(h1, h2);
    }
    // LDRD / STRD
    const U = (h1 >>> 7) & 1, L = (h1 >>> 4) & 1, rt2 = (h2 >>> 8) & 0xF;
    const imm = (h2 & 0xFF) * 4;
    const base = rn === 15 ? ((this.pc + 4) & ~3) >>> 0 : r[rn];
    const offAddr = (U ? base + imm : base - imm) >>> 0;
    const addr = P ? offAddr : base;
    if (L) { const a = this.rd32(addr), b = this.rd32(addr + 4); r[rt] = a; r[rt2] = b; }
    else { this.wr32(addr, r[rt]); this.wr32(addr + 4, r[rt2]); }
    this.cycles += 2;
    if (W) r[rn] = offAddr;
  }

  ldst(h1, h2) {
    const r = this.r;
    const S = (h1 >>> 8) & 1, size = (h1 >>> 5) & 3, L = (h1 >>> 4) & 1, rn = h1 & 0xF, rt = (h2 >>> 12) & 0xF;
    let addr, wb = -1, wbVal = 0;
    if (rn === 15) {
      const base = ((this.pc + 4) & ~3) >>> 0, imm = h2 & 0xFFF;
      addr = ((h1 >>> 7) & 1) ? (base + imm) >>> 0 : (base - imm) >>> 0;
    } else if ((h1 >>> 7) & 1) {
      addr = (r[rn] + (h2 & 0xFFF)) >>> 0;
    } else if (h2 & 0x800) {
      const P = (h2 >>> 10) & 1, U = (h2 >>> 9) & 1, W = (h2 >>> 8) & 1, imm = h2 & 0xFF;
      const off = (U ? r[rn] + imm : r[rn] - imm) >>> 0;
      addr = P ? off : r[rn];
      if (W) { wb = rn; wbVal = off; }
    } else if ((h2 & 0xFC0) === 0) {
      addr = (r[rn] + ((r[h2 & 0xF] << ((h2 >>> 4) & 3)) >>> 0)) >>> 0;
    } else return this.undef(h1, h2);
    this.cycles++;
    if (L) {
      if (rt === 15 && size !== 2) { if (wb >= 0) r[wb] = wbVal; return; } // PLD / hints
      let v;
      if (size === 0) v = S ? (this.rd8(addr) << 24 >> 24) >>> 0 : this.rd8(addr);
      else if (size === 1) v = S ? (this.rd16(addr) << 16 >> 16) >>> 0 : this.rd16(addr);
      else if (size === 2) v = this.rd32(addr);
      else return this.undef(h1, h2);
      if (wb >= 0) r[wb] = wbVal;
      if (rt === 15) this.bxWrite(v); else r[rt] = v;
    } else {
      if (S) return this.undef(h1, h2);
      const v = this.reg(rt);
      if (size === 0) this.wr8(addr, v); else if (size === 1) this.wr16(addr, v); else if (size === 2) this.wr32(addr, v);
      else return this.undef(h1, h2);
      if (wb >= 0) r[wb] = wbVal;
    }
  }

  dpReg(h1, h2) {
    const r = this.r;
    const rn = h1 & 0xF, rd = (h2 >>> 8) & 0xF, rm = h2 & 0xF;
    if ((h2 & 0xF0F0) === 0xF000 && !(h1 & 0x80)) {
      const type = (h1 >>> 5) & 3, s = (h1 >>> 4) & 1;
      const v = this.shiftC(r[rn], type, r[rm] & 0xFF, s);
      r[rd] = v; if (s) this.nz(v);
      return;
    }
    if ((h2 & 0xF080) === 0xF080 && !(h1 & 0x80)) {
      const op = (h1 >>> 4) & 7, rot = ((h2 >>> 4) & 3) * 8;
      const v = ror(r[rm], rot);
      let x;
      switch (op) {
        case 0: x = (v << 16 >> 16); break;
        case 1: x = v & 0xFFFF; break;
        case 4: x = (v << 24 >> 24); break;
        case 5: x = v & 0xFF; break;
        default: return this.undef(h1, h2);
      }
      r[rd] = rn === 15 ? x >>> 0 : (r[rn] + x) >>> 0;
      return;
    }
    if ((h1 & 0xFFF0) === 0xFA90 && (h2 & 0xF0C0) === 0xF080) {
      const v = r[rm];
      switch ((h2 >>> 4) & 3) {
        case 0: r[rd] = (((v & 0xFF) << 24) | ((v & 0xFF00) << 8) | ((v >>> 8) & 0xFF00) | (v >>> 24)) >>> 0; return;
        case 1: r[rd] = (((v & 0x00FF00FF) << 8) | ((v >>> 8) & 0x00FF00FF)) >>> 0; return;
        case 2: { let x = 0; for (let i = 0; i < 32; i++) if (v & (1 << i)) x |= 1 << (31 - i); r[rd] = x >>> 0; return; }
        case 3: r[rd] = ((((v & 0xFF) << 24) >> 16) | ((v >>> 8) & 0xFF)) >>> 0; return;
      }
    }
    if ((h1 & 0xFFF0) === 0xFAB0 && (h2 & 0xF0F0) === 0xF080) {
      r[rd] = Math.clz32(r[rm]); return;
    }
    this.undef(h1, h2);
  }

  mul32(h1, h2) {
    const r = this.r;
    const rn = h1 & 0xF, ra = (h2 >>> 12) & 0xF, rd = (h2 >>> 8) & 0xF, rm = h2 & 0xF;
    const op1 = (h1 >>> 4) & 7, op2 = (h2 >>> 4) & 3;
    if (op1 === 0) {
      const p = Math.imul(r[rn], r[rm]);
      if (op2 === 0) { r[rd] = ra === 15 ? p >>> 0 : (p + r[ra]) >>> 0; return; }
      if (op2 === 1) { r[rd] = (r[ra] - p) >>> 0; return; }
    }
    this.undef(h1, h2);
  }

  mulLong(h1, h2) {
    const r = this.r;
    const rn = h1 & 0xF, rlo = (h2 >>> 12) & 0xF, rhi = (h2 >>> 8) & 0xF, rm = h2 & 0xF;
    const op1 = (h1 >>> 4) & 7, op2 = (h2 >>> 4) & 0xF;
    const a = r[rn], b = r[rm];
    if (op1 === 1 && op2 === 0xF) { // SDIV
      const d = b | 0;
      r[rhi] = d === 0 ? 0 : ((a | 0) === -2147483648 && d === -1) ? 0x80000000 : ((a | 0) / d | 0) >>> 0;
      this.cycles += 6; return;
    }
    if (op1 === 3 && op2 === 0xF) { // UDIV
      r[rhi] = b === 0 ? 0 : Math.floor(a / b) >>> 0;
      this.cycles += 6; return;
    }
    if (op2 !== 0) return this.undef(h1, h2);
    let [lo, hi] = umul64(a, b);
    if (op1 === 0 || op1 === 4) { // signed
      if (a & 0x80000000) hi = (hi - b) >>> 0;
      if (b & 0x80000000) hi = (hi - a) >>> 0;
    }
    if (op1 === 4 || op1 === 6) [lo, hi] = add64(lo, hi, r[rlo], r[rhi]);
    if (op1 === 0 || op1 === 2 || op1 === 4 || op1 === 6) { r[rlo] = lo; r[rhi] = hi; this.cycles += 3; return; }
    this.undef(h1, h2);
  }
}
