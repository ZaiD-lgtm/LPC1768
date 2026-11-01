// NXP LPC1768 system model: memory map, bus and on-chip peripherals.
import { CortexM3, SimFault } from './cpu.js';

export const FLASH_SIZE = 512 * 1024;
const SRAM_BASE = 0x10000000, SRAM_SIZE = 32 * 1024;
const AHB_BASE = 0x2007C000, AHB_SIZE = 32 * 1024;
const IRC_HZ = 4e6, OSC_HZ = 12e6, RTC_HZ = 32768;

export const IRQ = {
  WDT: 0, TIMER0: 1, TIMER1: 2, TIMER2: 3, TIMER3: 4, UART0: 5, UART1: 6, UART2: 7, UART3: 8, PWM1: 9,
  I2C0: 10, I2C1: 11, I2C2: 12, SPI: 13, SSP0: 14, SSP1: 15, PLL0: 16, RTC: 17, EINT0: 18, EINT1: 19,
  EINT2: 20, EINT3: 21, ADC: 22, BOD: 23, USB: 24, CAN: 25, DMA: 26, I2S: 27, ENET: 28, RIT: 29,
  MCPWM: 30, QEI: 31, PLL1: 32, USBACT: 33, CANACT: 34,
};

const hex = (v, n = 8) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');

// ---------------------------------------------------------------- generic register file
class Regs {
  constructor(sys, name, base) { this.sys = sys; this.name = name; this.base = base; this.regs = new Map(); }
  read(off) { return this.regs.get(off) ?? 0; }
  write(off, v, m) { const o = this.regs.get(off) ?? 0; this.regs.set(off, ((o & ~m) | (v & m)) >>> 0); }
  reset() { this.regs.clear(); }
  tick() {}
}

// ---------------------------------------------------------------- System control (clocks, PLL, EINT, PCONP)
class SysCon extends Regs {
  constructor(sys) { super(sys, 'SC', 0x400FC000); this.reset(); }
  reset() {
    super.reset();
    this.pll0con = 0; this.pll0cfg = 0; this.pll0active = { con: 0, cfg: 0 };
    this.pll1con = 0; this.pll1cfg = 0; this.pll1active = { con: 0, cfg: 0 };
    this.feed0 = 0; this.feed1 = 0;
    this.cclkcfg = 0; this.clksrcsel = 0; this.scs = 0;
    this.pclksel0 = 0; this.pclksel1 = 0;
    this.pconp = 0x042887DE;
    this.extint = 0; this.extmode = 0; this.extpolar = 0;
    this.flashcfg = 0x303A;
    this.updateClock();
  }
  srcHz() { return [IRC_HZ, OSC_HZ, RTC_HZ, IRC_HZ][this.clksrcsel & 3]; }
  updateClock() {
    const a = this.pll0active;
    let hz;
    if ((a.con & 3) === 3) {
      const m = (a.cfg & 0x7FFF) + 1, n = ((a.cfg >>> 16) & 0xFF) + 1;
      hz = (2 * m * this.srcHz() / n) / ((this.cclkcfg & 0xFF) + 1);
    } else hz = this.srcHz() / ((this.cclkcfg & 0xFF) + 1);
    this.cclk = hz;
    this.fcco = (a.con & 1) ? 2 * ((a.cfg & 0x7FFF) + 1) * this.srcHz() / (((a.cfg >>> 16) & 0xFF) + 1) : 0;
    if (this.sys) this.sys.clockChanged?.();
  }
  // peripheral clock divider: sel index in PCLKSEL0/1 bit pairs
  pclkDiv(reg, bit) {
    const v = ((reg ? this.pclksel1 : this.pclksel0) >>> bit) & 3;
    return [4, 1, 2, 8][v];
  }
  read(off) {
    switch (off) {
      case 0x000: return this.flashcfg;
      case 0x080: return this.pll0con;
      case 0x084: return this.pll0cfg;
      case 0x088: { const a = this.pll0active; return ((a.cfg & 0xFF7FFF) | ((a.con & 1) << 24) | ((a.con & 2) << 24) | ((a.con & 1) << 26)) >>> 0; }
      case 0x0A0: return this.pll1con;
      case 0x0A4: return this.pll1cfg;
      case 0x0A8: { const a = this.pll1active; return ((a.cfg & 0x7F) | ((a.con & 1) << 8) | ((a.con & 2) << 8) | ((a.con & 1) << 10)) >>> 0; }
      case 0x0C4: return this.pconp;
      case 0x104: return this.cclkcfg;
      case 0x10C: return this.clksrcsel;
      case 0x140: return this.extint;
      case 0x148: return this.extmode;
      case 0x14C: return this.extpolar;
      case 0x1A0: return (this.scs & 0x30) | ((this.scs & 0x20) ? 0x40 : 0);
      case 0x1A8: return this.pclksel0;
      case 0x1AC: return this.pclksel1;
    }
    return super.read(off);
  }
  write(off, v, m) {
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    switch (off) {
      case 0x000: this.flashcfg = merge(this.flashcfg); return;
      case 0x080: this.pll0con = merge(this.pll0con) & 3; return;
      case 0x084: this.pll0cfg = merge(this.pll0cfg) & 0xFF7FFF; return;
      case 0x08C:
        if ((v & 0xFF) === 0xAA) this.feed0 = 1;
        else if ((v & 0xFF) === 0x55 && this.feed0) {
          this.feed0 = 0;
          let con = this.pll0con;
          if (!(con & 1)) con = 0; // cannot connect without enabling
          this.pll0active = { con, cfg: this.pll0cfg };
          this.updateClock();
        } else this.feed0 = 0;
        return;
      case 0x0A0: this.pll1con = merge(this.pll1con) & 3; return;
      case 0x0A4: this.pll1cfg = merge(this.pll1cfg) & 0x7F; return;
      case 0x0AC:
        if ((v & 0xFF) === 0xAA) this.feed1 = 1;
        else if ((v & 0xFF) === 0x55 && this.feed1) { this.feed1 = 0; this.pll1active = { con: this.pll1con, cfg: this.pll1cfg }; }
        else this.feed1 = 0;
        return;
      case 0x0C4: this.pconp = merge(this.pconp); return;
      case 0x104: this.cclkcfg = merge(this.cclkcfg) & 0xFF; this.updateClock(); return;
      case 0x10C: this.clksrcsel = merge(this.clksrcsel) & 3; this.updateClock(); return;
      case 0x140: this.extint &= ~(v & m & 0xF); this.sys.eintUpdate(); return;
      case 0x148: this.extmode = merge(this.extmode) & 0xF; this.sys.eintUpdate(); return;
      case 0x14C: this.extpolar = merge(this.extpolar) & 0xF; this.sys.eintUpdate(); return;
      case 0x180: if (v & m & 1) this.sys.requestReset = true; return; // RSID
      case 0x1A0: this.scs = merge(this.scs) & 0x30; return;
      case 0x1A8: this.pclksel0 = merge(this.pclksel0); this.sys.clockChanged(); return;
      case 0x1AC: this.pclksel1 = merge(this.pclksel1); this.sys.clockChanged(); return;
    }
    super.write(off, v, m);
  }
}

// ---------------------------------------------------------------- Pin connect block
class PinCon extends Regs {
  constructor(sys) { super(sys, 'PINCON', 0x4002C000); this.reset(); }
  reset() { this.pinsel = new Uint32Array(11); this.pinmode = new Uint32Array(10); this.od = new Uint32Array(5); this.i2cpad = 0; }
  read(off) {
    if (off < 0x2C) return this.pinsel[off >> 2];
    if (off >= 0x40 && off < 0x68) return this.pinmode[(off - 0x40) >> 2];
    if (off >= 0x68 && off < 0x7C) return this.od[(off - 0x68) >> 2];
    if (off === 0x7C) return this.i2cpad;
    return 0;
  }
  write(off, v, m) {
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    if (off < 0x2C) { this.pinsel[off >> 2] = merge(this.pinsel[off >> 2]); this.sys.pinFunctionsChanged(); return; }
    if (off >= 0x40 && off < 0x68) { const i = (off - 0x40) >> 2; this.pinmode[i] = merge(this.pinmode[i]); this.sys.pinFunctionsChanged(); return; }
    if (off >= 0x68 && off < 0x7C) { const i = (off - 0x68) >> 2; this.od[i] = merge(this.od[i]); return; }
    if (off === 0x7C) this.i2cpad = merge(this.i2cpad);
  }
  func(port, pin) { return (this.pinsel[port * 2 + (pin >> 4)] >>> ((pin & 15) * 2)) & 3; }
  mode(port, pin) { return (this.pinmode[port * 2 + (pin >> 4)] >>> ((pin & 15) * 2)) & 3; }
}

// ---------------------------------------------------------------- GPIO (FIO, AHB)
class GPIO {
  constructor(sys) { this.sys = sys; this.name = 'GPIO'; this.base = 0x2009C000; this.reset(); }
  reset() {
    this.dir = new Uint32Array(5); this.mask = new Uint32Array(5); this.latch = new Uint32Array(5);
  }
  read(off) {
    const port = off >> 5, r = off & 0x1F;
    if (port > 4) return 0;
    switch (r) {
      case 0x00: return this.dir[port];
      case 0x10: return this.mask[port];
      case 0x14: return (this.sys.pinValues(port) & ~this.mask[port]) >>> 0;
      case 0x18: return (this.latch[port] & ~this.mask[port]) >>> 0;
    }
    return 0;
  }
  write(off, v, m) {
    const port = off >> 5, r = off & 0x1F;
    if (port > 4) return;
    const fm = this.mask[port];
    switch (r) {
      case 0x00: this.dir[port] = ((this.dir[port] & ~m) | (v & m)) >>> 0; break;
      case 0x10: this.mask[port] = ((fm & ~m) | (v & m)) >>> 0; return;
      case 0x14: { const w = m & ~fm; this.latch[port] = ((this.latch[port] & ~w) | (v & w)) >>> 0; break; }
      case 0x18: this.latch[port] = (this.latch[port] | (v & m & ~fm)) >>> 0; break;
      case 0x1C: this.latch[port] = (this.latch[port] & ~(v & m & ~fm)) >>> 0; break;
      default: return;
    }
    this.sys.outputsChanged(port);
  }
  tick() {}
}

// ---------------------------------------------------------------- GPIO interrupts (shares EINT3)
class GPIOInt {
  constructor(sys) { this.sys = sys; this.name = 'GPIOINT'; this.base = 0x40028000; this.reset(); }
  reset() { this.enR = [0, 0, 0]; this.enF = [0, 0, 0]; this.statR = [0, 0, 0]; this.statF = [0, 0, 0]; }
  edges(port, rise, fall) {
    if (port !== 0 && port !== 2) return;
    const r = rise & this.enR[port], f = fall & this.enF[port];
    if (r | f) { this.statR[port] = (this.statR[port] | r) >>> 0; this.statF[port] = (this.statF[port] | f) >>> 0; this.sys.eintUpdate(); }
  }
  pending() { return (this.statR[0] | this.statF[0] | this.statR[2] | this.statF[2]) !== 0; }
  read(off) {
    switch (off) {
      case 0x80: return ((this.statR[0] | this.statF[0]) ? 1 : 0) | ((this.statR[2] | this.statF[2]) ? 4 : 0);
      case 0x84: return this.statR[0]; case 0x88: return this.statF[0];
      case 0x90: return this.enR[0]; case 0x94: return this.enF[0];
      case 0xA4: return this.statR[2]; case 0xA8: return this.statF[2];
      case 0xB0: return this.enR[2]; case 0xB4: return this.enF[2];
    }
    return 0;
  }
  write(off, v, m) {
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    switch (off) {
      case 0x8C: this.statR[0] &= ~(v & m); this.statF[0] &= ~(v & m); break;
      case 0x90: this.enR[0] = merge(this.enR[0]); break;
      case 0x94: this.enF[0] = merge(this.enF[0]); break;
      case 0xAC: this.statR[2] &= ~(v & m); this.statF[2] &= ~(v & m); break;
      case 0xB0: this.enR[2] = merge(this.enR[2]); break;
      case 0xB4: this.enF[2] = merge(this.enF[2]); break;
      default: return;
    }
    this.statR[0] >>>= 0; this.statF[0] >>>= 0; this.statR[2] >>>= 0; this.statF[2] >>>= 0;
    this.sys.eintUpdate();
  }
  tick() {}
}

// ---------------------------------------------------------------- match counter (Timer / PWM core)
class MatchCounter {
  constructor(sys, name, base, irq, pclkReg, pclkBit, nMatch, pconpBit) {
    this.sys = sys; this.name = name; this.base = base; this.irq = irq;
    this.pclkReg = pclkReg; this.pclkBit = pclkBit; this.nMatch = nMatch; this.pconpBit = pconpBit;
    this.reset();
  }
  reset() {
    this.ir = 0; this.tcr = 0; this.tc = 0; this.pr = 0; this.pc = 0; this.mcr = 0;
    this.mr = new Uint32Array(this.nMatch); this.ccr = 0; this.cr = new Uint32Array(4); this.emr = 0; this.ctcr = 0;
    this.last = 0; this.frac = 0; this.resetArmed = -1;
  }
  get div() { return this.sys.sc.pclkDiv(this.pclkReg, this.pclkBit); }
  running() { return (this.tcr & 3) === 1; }
  sync() {
    const now = this.sys.cpu.cycles;
    let dt = now - this.last;
    this.last = now;
    if (!this.running() || dt <= 0) return;
    const div = this.div;
    const total = dt + this.frac;
    let ticks = Math.floor(total / div);
    this.frac = total - ticks * div;
    if (ticks <= 0) return;
    const pre = this.pr + 1;
    const t = this.pc + ticks;
    let incs = Math.floor(t / pre);
    this.pc = t % pre;
    this.advance(incs);
  }
  matchActions() { return this.mcr; }
  // advance TC by n increments, processing matches
  advance(n) {
    let guard = 0;
    while (n > 0 && this.running()) {
      if (++guard > 100000) { this.tc = (this.tc + n) >>> 0; break; }
      if (this.resetArmed >= 0) { this.tc = 0; this.resetArmed = -1; n--; this.onPeriod(); this.checkMatch(); continue; }
      let best = 0x100000000;
      for (let i = 0; i < this.nMatch; i++) {
        if (!this.matchEnabled(i)) continue;
        let d = (this.matchValue(i) - this.tc) >>> 0;
        if (d === 0) d = 0x100000000;
        if (d < best) best = d;
      }
      if (n < best) { this.tc = (this.tc + n) >>> 0; return; }
      this.tc = (this.tc + best) >>> 0;
      n -= best;
      this.checkMatch();
    }
  }
  matchValue(i) { return this.mr[i]; }
  matchEnabled(i) { return ((this.mcr >>> (3 * i)) & 7) !== 0 || (i < 4 && ((this.emr >>> (4 + 2 * i)) & 3) !== 0); }
  checkMatch() {
    for (let i = 0; i < this.nMatch; i++) {
      if (this.matchValue(i) !== this.tc) continue;
      const a = (this.mcr >>> (3 * i)) & 7;
      if (a & 1) this.ir |= this.irBit(i);
      if (a & 2) this.resetArmed = i;
      if (a & 4) { this.tcr &= ~1; }
      if (i < 4) {
        const emc = (this.emr >>> (4 + 2 * i)) & 3;
        if (emc === 1) this.emr &= ~(1 << i); else if (emc === 2) this.emr |= 1 << i; else if (emc === 3) this.emr ^= 1 << i;
      }
    }
    this.updateIrq();
  }
  irBit(i) { return 1 << i; }
  onPeriod() {}
  updateIrq() { this.sys.cpu.setIrq(this.irq, (this.ir & 0x7FF) !== 0); }
  tick() { this.sync(); }
  read(off) {
    this.sync();
    switch (off) {
      case 0x00: return this.ir; case 0x04: return this.tcr; case 0x08: return this.tc; case 0x0C: return this.pr;
      case 0x10: return this.pc; case 0x14: return this.mcr;
      case 0x18: case 0x1C: case 0x20: case 0x24: return this.mr[(off - 0x18) >> 2];
      case 0x28: return this.ccr; case 0x2C: return this.cr[0]; case 0x30: return this.cr[1];
      case 0x3C: return this.emr; case 0x70: return this.ctcr;
    }
    return 0;
  }
  write(off, v, m) {
    this.sync();
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    switch (off) {
      case 0x00: this.ir &= ~(v & m); this.updateIrq(); return;
      case 0x04: {
        const was = this.tcr;
        this.tcr = merge(this.tcr);
        if (this.tcr & 2) { this.tc = 0; this.pc = 0; this.resetArmed = -1; }
        if (!(was & 1) && (this.tcr & 1)) { this.last = this.sys.cpu.cycles; this.frac = 0; this.onStart(); }
        return;
      }
      case 0x08: this.tc = merge(this.tc); return;
      case 0x0C: this.pr = merge(this.pr); return;
      case 0x10: this.pc = merge(this.pc); return;
      case 0x14: this.mcr = merge(this.mcr); return;
      case 0x18: case 0x1C: case 0x20: case 0x24: { const i = (off - 0x18) >> 2; this.mr[i] = merge(this.mr[i]); return; }
      case 0x28: this.ccr = merge(this.ccr); return;
      case 0x3C: this.emr = merge(this.emr); return;
      case 0x70: this.ctcr = merge(this.ctcr); return;
    }
  }
  onStart() {}
}

class Timer extends MatchCounter {
  constructor(sys, n) {
    const bases = [0x40004000, 0x40008000, 0x40090000, 0x40094000];
    const pclk = [[0, 2], [0, 4], [1, 12], [1, 14]];
    const pconp = [1, 2, 22, 23];
    super(sys, 'TIMER' + n, bases[n], IRQ.TIMER0 + n, pclk[n][0], pclk[n][1], 4, pconp[n]);
  }
}

class PWM extends MatchCounter {
  constructor(sys) { super(sys, 'PWM1', 0x40018000, IRQ.PWM1, 0, 12, 7, 6); }
  reset() { super.reset(); this.shadow = new Uint32Array(7); this.pcr = 0; this.ler = 0; }
  irBit(i) { return i < 4 ? 1 << i : 1 << (i + 4); }
  onPeriod() { this.latch(); }
  onStart() { this.latch(); }
  latch() {
    if (!this.ler) return;
    for (let i = 0; i < 7; i++) if (this.ler & (1 << i)) this.mr[i] = this.shadow[i];
    this.ler = 0;
    this.sys.pwmChanged();
  }
  pwmMode() { return (this.tcr & 8) !== 0; }
  read(off) {
    if (off >= 0x40 && off <= 0x48) { this.sync(); return this.mr[4 + ((off - 0x40) >> 2)]; }
    if (off === 0x4C) return this.pcr;
    if (off === 0x50) return this.ler;
    if (off >= 0x18 && off <= 0x24) { this.sync(); return this.mr[(off - 0x18) >> 2]; }
    return super.read(off);
  }
  write(off, v, m) {
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    let idx = -1;
    if (off >= 0x18 && off <= 0x24) idx = (off - 0x18) >> 2;
    else if (off >= 0x40 && off <= 0x48) idx = 4 + ((off - 0x40) >> 2);
    if (idx >= 0) {
      this.sync();
      this.shadow[idx] = merge(this.shadow[idx]);
      if (!this.pwmMode() || !this.running()) { this.mr[idx] = this.shadow[idx]; }
      this.sys.pwmChanged();
      return;
    }
    if (off === 0x4C) { this.pcr = merge(this.pcr); this.sys.pwmChanged(); return; }
    if (off === 0x50) { this.ler = merge(this.ler) & 0x7F; return; }
    super.write(off, v, m);
    if (off === 0x04) this.sys.pwmChanged();
  }
  // duty (0..1) of PWM channel n=1..6, or null when output not active
  duty(n) {
    if (!(this.pcr & (1 << (8 + n)))) return null;
    if (!this.pwmMode() || !this.running()) return 0;
    const period = this.mr[0] + 1;
    if (period <= 1) return 0;
    const dbl = n >= 2 && (this.pcr & (1 << n));
    let on;
    if (dbl) {
      const s = Math.min(this.mr[n - 1], period), e = Math.min(this.mr[n], period);
      on = e >= s ? e - s : period - s + e;
    } else on = Math.min(this.mr[n], period);
    return Math.max(0, Math.min(1, on / period));
  }
  freq() {
    const period = this.mr[0] + 1;
    return this.sys.sc.cclk / this.div / (this.pr + 1) / period;
  }
}

// ---------------------------------------------------------------- UART
class UART {
  constructor(sys, n) {
    const bases = [0x4000C000, 0x40010000, 0x40098000, 0x4009C000];
    const pclk = [[0, 6], [0, 8], [1, 16], [1, 18]];
    this.sys = sys; this.n = n; this.name = 'UART' + n; this.base = bases[n]; this.irq = IRQ.UART0 + n;
    this.pclkReg = pclk[n][0]; this.pclkBit = pclk[n][1];
    this.reset();
  }
  reset() {
    this.dll = 1; this.dlm = 0; this.ier = 0; this.lcr = 0; this.fcr = 0; this.scr = 0; this.fdr = 0x10; this.mcr = 0; this.ter = 0x80;
    this.rx = []; this.tx = []; this.shiftEnd = 0; this.threPending = false; this.last = 0;
  }
  baud() {
    const pclk = this.sys.sc.cclk / this.sys.sc.pclkDiv(this.pclkReg, this.pclkBit);
    const d = this.dlm * 256 + this.dll;
    if (!d) return 0;
    const mul = (this.fdr >>> 4) & 0xF || 1, add = this.fdr & 0xF;
    return pclk / (16 * d * (1 + add / mul));
  }
  charCycles() {
    const b = this.baud(); if (!b) return 1;
    const bits = 1 + ((this.lcr & 3) + 5) + ((this.lcr & 8) ? 1 : 0) + ((this.lcr & 4) ? 2 : 1);
    return Math.max(1, Math.round(this.sys.sc.cclk / b * bits));
  }
  sync() {
    const now = this.sys.cpu.cycles;
    while (this.tx.length && now >= this.shiftEnd) {
      const c = this.tx.shift();
      const start = this.shiftEnd;
      this.sys.uartOut(this.n, c, this.baud());
      if (this.tx.length) this.shiftEnd = start + this.charCycles();
      if (!this.tx.length) { this.threPending = true; this.updateIrq(); }
    }
  }
  tick() { this.sync(); }
  lsr() {
    let v = 0;
    if (this.rx.length) v |= 1;
    if (this.tx.length === 0) v |= 0x60;
    return v;
  }
  iir() {
    if ((this.ier & 4) && false) return 0x06;
    if ((this.ier & 1) && this.rx.length) return 0x04 | ((this.fcr & 1) ? 0xC0 : 0);
    if ((this.ier & 2) && this.threPending) return 0x02 | ((this.fcr & 1) ? 0xC0 : 0);
    return 0x01 | ((this.fcr & 1) ? 0xC0 : 0);
  }
  updateIrq() { this.sys.cpu.setIrq(this.irq, (this.iir() & 1) === 0); }
  receive(c) { this.rx.push(c & 0xFF); this.updateIrq(); }
  read(off) {
    this.sync();
    const dlab = this.lcr & 0x80;
    switch (off) {
      case 0x00: {
        if (dlab) return this.dll;
        const c = this.rx.length ? this.rx.shift() : 0;
        this.updateIrq(); return c;
      }
      case 0x04: return dlab ? this.dlm : this.ier;
      case 0x08: { const v = this.iir(); if ((v & 0xF) === 2) { this.threPending = false; this.updateIrq(); } return v; }
      case 0x0C: return this.lcr;
      case 0x10: return this.mcr;
      case 0x14: return this.lsr();
      case 0x18: return 0;
      case 0x1C: return this.scr;
      case 0x28: return this.fdr;
      case 0x30: return this.ter;
    }
    return 0;
  }
  write(off, v, m) {
    this.sync();
    const b = v & m;
    const val = (b >>> (Math.clz32(m) === 32 ? 0 : (31 - Math.clz32(m & -m)))) & 0xFF;
    const dlab = this.lcr & 0x80;
    switch (off) {
      case 0x00:
        if (dlab) { this.dll = val; return; }
        this.thr(val); return;
      case 0x04: if (dlab) this.dlm = val; else { this.ier = val & 0x307; if (this.ier & 2 && !this.tx.length) this.threPending = true; this.updateIrq(); } return;
      case 0x08: this.fcr = val; if (val & 2) this.rx = []; if (val & 4) this.tx = []; return;
      case 0x0C: this.lcr = val; return;
      case 0x10: this.mcr = val; return;
      case 0x1C: this.scr = val; return;
      case 0x28: this.fdr = val; return;
      case 0x30: this.ter = val; return;
    }
  }
  thr(c) {
    if (this.n === 0 && !this.sys.warnedUart && this.sys.pincon.func(0, 2) !== 1) {
      this.sys.warnedUart = true;
      this.sys.warn('UART0 transmit while P0.2 is not configured as TXD0 (PINSEL0[5:4] should be 01). A real board would output nothing.');
    }
    if (this.tx.length >= 16) return; // FIFO overflow: char lost
    const now = this.sys.cpu.cycles;
    if (!this.tx.length) this.shiftEnd = Math.max(now, this.shiftEnd) + this.charCycles();
    this.tx.push(c);
    this.threPending = false;
    this.updateIrq();
  }
}

// ---------------------------------------------------------------- ADC
class ADC {
  constructor(sys) { this.sys = sys; this.name = 'ADC'; this.base = 0x40034000; this.reset(); }
  reset() {
    this.adcr = 1; this.inten = 0x100; this.dr = new Uint32Array(8); this.gdr = 0; this.busyUntil = -1; this.convCh = -1; this.burstCh = 0; this.trm = 0xF00;
  }
  clk() { const pclk = this.sys.sc.cclk / this.sys.sc.pclkDiv(0, 24); return pclk / (((this.adcr >>> 8) & 0xFF) + 1); }
  convCycles() { return Math.max(1, Math.round(this.sys.sc.cclk / this.clk() * 65)); }
  start(ch) {
    this.convCh = ch;
    this.busyUntil = this.sys.cpu.cycles + this.convCycles();
  }
  sel() { return this.adcr & 0xFF; }
  firstSel(from = 0) { const s = this.sel(); for (let k = 0; k < 8; k++) { const c = (from + k) & 7; if (s & (1 << c)) return c; } return -1; }
  sync() {
    let guard = 0;
    while (this.convCh >= 0 && this.sys.cpu.cycles >= this.busyUntil && guard++ < 64) {
      const ch = this.convCh;
      if (!(this.adcr & (1 << 21))) { this.convCh = -1; break; }
      const volts = this.sys.analogIn(ch);
      const code = Math.max(0, Math.min(4095, Math.round(volts / 3.3 * 4095)));
      const prevDone = this.dr[ch] & 0x80000000;
      this.dr[ch] = (0x80000000 | (prevDone ? 0x40000000 : 0) | (code << 4)) >>> 0;
      this.gdr = (0x80000000 | (ch << 24) | (code << 4)) >>> 0;
      const end = this.busyUntil;
      if (this.adcr & (1 << 16)) {
        const nx = this.firstSel(ch + 1);
        this.convCh = nx; this.busyUntil = end + this.convCycles();
      } else this.convCh = -1;
      this.updateIrq();
    }
  }
  tick() { this.sync(); }
  updateIrq() {
    let lv = false;
    for (let i = 0; i < 8; i++) if ((this.inten & (1 << i)) && (this.dr[i] & 0x80000000)) lv = true;
    if ((this.inten & 0x100) && (this.gdr & 0x80000000)) lv = true;
    this.sys.cpu.setIrq(IRQ.ADC, lv);
  }
  read(off) {
    this.sync();
    switch (off) {
      case 0x00: return this.adcr;
      case 0x04: { const v = this.gdr; this.gdr &= 0x7FFFFFFF; this.updateIrq(); return v; }
      case 0x0C: return this.inten;
      case 0x30: { let s = 0; for (let i = 0; i < 8; i++) { if (this.dr[i] & 0x80000000) s |= 1 << i; if (this.dr[i] & 0x40000000) s |= 1 << (8 + i); } if (this.gdr & 0x80000000) s |= 1 << 16; return s; }
      case 0x34: return this.trm;
    }
    if (off >= 0x10 && off < 0x30) {
      const i = (off - 0x10) >> 2; const v = this.dr[i]; this.dr[i] &= 0x3FFFFFFF;
      this.gdr &= 0x7FFFFFFF; this.updateIrq(); return v;
    }
    return 0;
  }
  write(off, v, m) {
    this.sync();
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    if (off === 0x00) {
      this.adcr = merge(this.adcr);
      if (!(this.sys.sc.pconp & (1 << 12)) && !this.sys.warnedAdc) { this.sys.warnedAdc = true; this.sys.warn('ADC used while PCONP.PCADC (bit 12) is 0 - on real hardware the ADC is unpowered.'); }
      const startMode = (this.adcr >>> 24) & 7;
      if (this.adcr & (1 << 16)) { if (this.convCh < 0) { const c = this.firstSel(); if (c >= 0) this.start(c); } }
      else if (startMode === 1) { const c = this.firstSel(); if (c >= 0) this.start(c); }
      return;
    }
    if (off === 0x0C) { this.inten = merge(this.inten) & 0x1FF; this.updateIrq(); return; }
    if (off === 0x34) { this.trm = merge(this.trm); }
  }
}

// ---------------------------------------------------------------- DAC
class DAC {
  constructor(sys) { this.sys = sys; this.name = 'DAC'; this.base = 0x4008C000; this.reset(); }
  reset() { this.dacr = 0; this.ctrl = 0; this.cntval = 0; }
  read(off) { return off === 0 ? this.dacr : off === 4 ? this.ctrl : off === 8 ? this.cntval : 0; }
  write(off, v, m) {
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    if (off === 0) { this.dacr = merge(this.dacr) & 0x1FFC0; this.sys.dacChanged(); }
    else if (off === 4) this.ctrl = merge(this.ctrl) & 0xF;
    else if (off === 8) this.cntval = merge(this.cntval) & 0xFFFF;
  }
  volts() { return ((this.dacr >>> 6) & 0x3FF) / 1024 * 3.3; }
  tick() {}
}

// ---------------------------------------------------------------- System Control Space (NVIC, SCB, SysTick)
class SCS {
  constructor(sys) { this.sys = sys; this.name = 'SCS'; this.base = 0xE000C000; this.reset(); }
  reset() { this.stCtrl = 0; this.stLoad = 0; this.stVal = 0; this.stLast = 0; this.ccr = 0x200; this.shcsr = 0; this.cfsr = 0; this.hfsr = 0; this.demcr = 0; }
  get cpu() { return this.sys.cpu; }
  stSync() {
    const now = this.cpu.cycles;
    const dt = now - this.stLast;
    this.stLast = now;
    if (!(this.stCtrl & 1) || dt <= 0) return;
    if (this.stLoad === 0) { this.stVal = 0; return; }
    const period = this.stLoad + 1;
    const d = this.stVal === 0 ? period : this.stVal; // cycles until the counter next reaches 0
    if (dt < d) { this.stVal = d - dt; return; }
    const m = (dt - d) % period;
    this.stVal = m === 0 ? 0 : period - m;
    this.stCtrl |= 0x10000;
    if (this.stCtrl & 2) this.cpu.pendException(15);
  }
  tick() { this.stSync(); }
  read(off) {
    const cpu = this.cpu;
    off -= 0x2000; // offsets relative to 0xE000E000
    switch (off) {
      case 0x004: return 1;
      case 0x010: { this.stSync(); const v = this.stCtrl; this.stCtrl &= ~0x10000; return v | 4; }
      case 0x014: return this.stLoad;
      case 0x018: this.stSync(); return this.stVal & 0xFFFFFF;
      case 0x01C: return 0x000F423F;
      case 0xD00: return 0x412FC230;
      case 0xD04: {
        let v = cpu.ipsr & 0x1FF;
        const p = cpu.highestPending();
        if (p > 0) v |= (p & 0x1FF) << 12;
        for (let e = 16; e < cpu.pending.length; e++) if (cpu.pending[e]) { v |= 1 << 22; break; }
        if (cpu.pending[15]) v |= 1 << 26;
        if (cpu.pending[14]) v |= 1 << 28;
        let act = 0; for (let e = 1; e < cpu.active.length; e++) if (cpu.active[e]) act++;
        if (act <= 1) v |= 1 << 11;
        return v >>> 0;
      }
      case 0xD08: return cpu.vtor;
      case 0xD0C: return (0xFA050000 | (cpu.prigroup << 8)) >>> 0;
      case 0xD10: return cpu.scr;
      case 0xD14: return this.ccr;
      case 0xD18: case 0xD1C: case 0xD20: {
        const e0 = 4 + (off - 0xD18);
        return (cpu.prio[e0] | (cpu.prio[e0 + 1] << 8) | (cpu.prio[e0 + 2] << 16) | (cpu.prio[e0 + 3] << 24)) >>> 0;
      }
      case 0xD24: return this.shcsr;
      case 0xD28: return this.cfsr;
      case 0xD2C: return this.hfsr;
      case 0xDFC: return this.demcr;
    }
    if (off >= 0x100 && off < 0x120) return this.bits(cpu.enabled, (off - 0x100) >> 2);
    if (off >= 0x180 && off < 0x1A0) return this.bits(cpu.enabled, (off - 0x180) >> 2);
    if (off >= 0x200 && off < 0x220) return this.bits(cpu.pending, (off - 0x200) >> 2);
    if (off >= 0x280 && off < 0x2A0) return this.bits(cpu.pending, (off - 0x280) >> 2);
    if (off >= 0x300 && off < 0x320) return this.bits(cpu.active, (off - 0x300) >> 2);
    if (off >= 0x400 && off < 0x420) {
      const e0 = 16 + (off - 0x400);
      let v = 0; for (let i = 0; i < 4; i++) if (e0 + i < cpu.prio.length) v |= cpu.prio[e0 + i] << (8 * i);
      return v >>> 0;
    }
    return 0;
  }
  bits(arr, word) {
    let v = 0;
    for (let i = 0; i < 32; i++) { const e = 16 + word * 32 + i; if (e < arr.length && arr[e]) v |= 1 << i; }
    return v >>> 0;
  }
  write(off, v, m) {
    const cpu = this.cpu;
    off -= 0x2000;
    const merge = (o) => ((o & ~m) | (v & m)) >>> 0;
    const b = (v & m) >>> 0;
    switch (off) {
      case 0x010: this.stSync(); { const was = this.stCtrl & 1; this.stCtrl = (this.stCtrl & 0x10000) | (merge(this.stCtrl) & 7); if (!was && (this.stCtrl & 1)) this.stLast = cpu.cycles; } return;
      case 0x014: this.stLoad = merge(this.stLoad) & 0xFFFFFF; return;
      case 0x018: this.stSync(); this.stVal = 0; this.stCtrl &= ~0x10000; return;
      case 0xD04:
        if (b & (1 << 31)) cpu.pendException(2);
        if (b & (1 << 28)) cpu.pendException(14);
        if (b & (1 << 27)) cpu.pending[14] = 0;
        if (b & (1 << 26)) cpu.pendException(15);
        if (b & (1 << 25)) cpu.pending[15] = 0;
        return;
      case 0xD08: cpu.vtor = merge(cpu.vtor) & 0x3FFFFF80; return;
      case 0xD0C:
        if ((v >>> 16) === 0x05FA) {
          cpu.prigroup = (v >>> 8) & 7;
          if (v & 4) this.sys.requestReset = true;
          cpu.checkIrq = true;
        }
        return;
      case 0xD10: cpu.scr = merge(cpu.scr) & 0x16; return;
      case 0xD14: this.ccr = merge(this.ccr); return;
      case 0xD18: case 0xD1C: case 0xD20: {
        const e0 = 4 + (off - 0xD18);
        for (let i = 0; i < 4; i++) if (m & (0xFF << (8 * i))) cpu.prio[e0 + i] = (v >>> (8 * i)) & 0xF8;
        cpu.checkIrq = true; return;
      }
      case 0xD24: this.shcsr = merge(this.shcsr); return;
      case 0xD28: this.cfsr &= ~b; return;
      case 0xD2C: this.hfsr &= ~b; return;
      case 0xDFC: this.demcr = merge(this.demcr); return;
      case 0xF00: { const n = v & 0x1FF; if (16 + n < cpu.pending.length) cpu.pendException(16 + n); return; }
    }
    const setBits = (arr, word, val) => { for (let i = 0; i < 32; i++) if (val & (1 << i)) { const e = 16 + word * 32 + i; if (e < arr.length) arr[e] = 1; } };
    const clrBits = (arr, word, val) => { for (let i = 0; i < 32; i++) if (val & (1 << i)) { const e = 16 + word * 32 + i; if (e < arr.length) arr[e] = 0; } };
    if (off >= 0x100 && off < 0x120) { setBits(cpu.enabled, (off - 0x100) >> 2, b); cpu.checkIrq = true; return; }
    if (off >= 0x180 && off < 0x1A0) { clrBits(cpu.enabled, (off - 0x180) >> 2, b); return; }
    if (off >= 0x200 && off < 0x220) { setBits(cpu.pending, (off - 0x200) >> 2, b); cpu.checkIrq = true; return; }
    if (off >= 0x280 && off < 0x2A0) {
      const w = (off - 0x280) >> 2;
      for (let i = 0; i < 32; i++) if (b & (1 << i)) { const e = 16 + w * 32 + i; if (e < cpu.pending.length && !cpu.irqLine[e]) cpu.pending[e] = 0; }
      return;
    }
    if (off >= 0x400 && off < 0x420) {
      const e0 = 16 + (off - 0x400);
      for (let i = 0; i < 4; i++) if ((m & (0xFF << (8 * i))) && e0 + i < cpu.prio.length) cpu.prio[e0 + i] = (v >>> (8 * i)) & 0xF8;
      cpu.checkIrq = true;
    }
  }
}

// DWT cycle counter (0xE0001000)
class DWT {
  constructor(sys) { this.sys = sys; this.name = 'DWT'; this.base = 0xE0000000; this.ctrl = 0; this.offset = 0; }
  reset() { this.ctrl = 0; this.offset = 0; }
  read(off) {
    if (off === 0x1000) return this.ctrl;
    if (off === 0x1004) return (this.sys.cpu.cycles - this.offset) >>> 0;
    return 0;
  }
  write(off, v) { if (off === 0x1000) this.ctrl = v; if (off === 0x1004) this.offset = this.sys.cpu.cycles - v; }
  tick() {}
}

// ---------------------------------------------------------------- the chip
export class LPC1768 {
  constructor() {
    this.flashBuf = new ArrayBuffer(FLASH_SIZE);
    this.flash = new Uint8Array(this.flashBuf).fill(0xFF);
    this.flash16 = new Uint16Array(this.flashBuf);
    this.flash32 = new Uint32Array(this.flashBuf);
    this.sramBuf = new ArrayBuffer(SRAM_SIZE);
    this.sram = new Uint8Array(this.sramBuf); this.sram16 = new Uint16Array(this.sramBuf); this.sram32 = new Uint32Array(this.sramBuf);
    this.ahbBuf = new ArrayBuffer(AHB_SIZE);
    this.ahb = new Uint8Array(this.ahbBuf); this.ahb16 = new Uint16Array(this.ahbBuf); this.ahb32 = new Uint32Array(this.ahbBuf);

    this.board = null;          // external world: { onOutputs(port), analogIn(ch), onUart(n,c), onDac(v), onPwm() }
    this.extMask = new Uint32Array(5);
    this.extVal = new Uint32Array(5);
    this.prevIn = new Uint32Array(5);
    this.gpioFuncMask = new Uint32Array(5).fill(0xFFFFFFFF);
    this.warnings = [];
    this.onWarn = null;

    this.sc = new SysCon(this);
    this.pincon = new PinCon(this);
    this.gpio = new GPIO(this);
    this.gpioint = new GPIOInt(this);
    this.timers = [0, 1, 2, 3].map(n => new Timer(this, n));
    this.pwm = new PWM(this);
    this.uarts = [0, 1, 2, 3].map(n => new UART(this, n));
    this.adc = new ADC(this);
    this.dac = new DAC(this);
    this.scs = new SCS(this);
    this.dwt = new DWT(this);

    this.devMap = new Map();
    this.generic = new Map();
    for (const d of [this.sc, this.pincon, this.gpio, this.gpioint, ...this.timers, this.pwm, ...this.uarts, this.adc, this.dac, this.scs, this.dwt]) {
      this.devMap.set(d.base >>> 14, d);
    }
    this.tickers = [...this.timers, this.pwm, ...this.uarts, this.adc, this.scs];
    this.cpu = new CortexM3(this);
  }

  warn(msg) {
    this.warnings.push(msg);
    if (this.onWarn) this.onWarn(msg);
  }

  // ---- flash programming
  loadImage(bytes, base = 0) {
    this.flash.fill(0xFF);
    for (let i = 0; i < bytes.length && base + i < FLASH_SIZE; i++) this.flash[base + i] = bytes[i];
  }
  loadSegments(segs) {
    this.flash.fill(0xFF);
    for (const s of segs) {
      for (let i = 0; i < s.data.length; i++) {
        const a = s.addr + i;
        if (a < FLASH_SIZE) this.flash[a] = s.data[i];
      }
    }
  }
  vectorChecksumOk() {
    let sum = 0;
    for (let i = 0; i < 8; i++) sum = (sum + this.flash32[i]) >>> 0;
    return sum === 0;
  }

  reset() {
    this.sram.fill(0); this.ahb.fill(0);
    this.sc.reset(); this.pincon.reset(); this.gpio.reset(); this.gpioint.reset();
    for (const t of this.timers) t.reset();
    this.pwm.reset(); for (const u of this.uarts) u.reset();
    this.adc.reset(); this.dac.reset(); this.scs.reset(); this.dwt.reset();
    for (const g of this.generic.values()) g.reset();
    this.prevIn.fill(0);
    this.warnedUart = false; this.warnedAdc = false;
    this.requestReset = false;
    this.pinFunctionsChanged();
    this.cpu.reset();
    for (let p = 0; p < 5; p++) this.prevIn[p] = this.pinValues(p);
    if (this.board) for (let p = 0; p < 5; p++) this.board.onOutputs?.(p);
    this.board?.onPwm?.(); this.board?.onDac?.(this.dac.volts());
  }

  // ---- clocks
  clockChanged() { for (const t of this.tickers || []) t.sync?.(); }

  // ---- pins
  pinFunctionsChanged() {
    for (let p = 0; p < 5; p++) {
      let m = 0;
      for (let i = 0; i < 32; i++) if (this.pincon.func(p, i) === 0) m |= 1 << i;
      this.gpioFuncMask[p] = m >>> 0;
    }
    if (this.board) for (let p = 0; p < 5; p++) this.board.onOutputs?.(p);
    this.board?.onPwm?.();
    for (let p = 0; p < 5; p++) this.inputsChanged(p);
  }
  // bits actively driven by the MCU as GPIO outputs
  outMask(port) { return (this.gpio.dir[port] & this.gpioFuncMask[port]) >>> 0; }
  outVal(port) { return this.gpio.latch[port]; }
  pullLevel(port, pin) {
    const mode = this.pincon.mode(port, pin);
    return mode === 3 ? 0 : mode === 2 ? ((this.prevIn[port] >>> pin) & 1) : 1;
  }
  pinValues(port) {
    const om = this.outMask(port);
    let v = (this.gpio.latch[port] & om) >>> 0;
    const em = this.extMask[port] & ~om;
    v |= this.extVal[port] & em;
    const free = ~(om | em) >>> 0;
    if (free) {
      for (let i = 0; i < 32; i++) if ((free >>> i) & 1) { if (this.pullLevel(port, i)) v |= 1 << i; }
    }
    return v >>> 0;
  }
  outputsChanged(port) {
    if (this.board) this.board.onOutputs?.(port);
    this.inputsChanged(port);
  }
  // external world drives pins
  setExternal(port, mask, val) {
    if (this.extMask[port] === (mask >>> 0) && ((this.extVal[port] ^ val) & mask) === 0) return;
    this.extMask[port] = mask >>> 0; this.extVal[port] = (val & mask) >>> 0;
    this.inputsChanged(port);
  }
  inputsChanged(port) {
    const cur = this.pinValues(port), prev = this.prevIn[port];
    if (cur === prev) return;
    this.prevIn[port] = cur;
    const rise = (cur & ~prev) >>> 0, fall = (prev & ~cur) >>> 0;
    this.gpioint.edges(port, rise, fall);
    if (port === 2 && ((rise | fall) & 0x3C00)) this.eintEdges(rise, fall);
  }
  eintEdges(rise, fall) {
    const sc = this.sc;
    for (let n = 0; n < 4; n++) {
      const pin = 10 + n;
      if (this.pincon.func(2, pin) !== 1) continue;
      if (!(sc.extmode & (1 << n))) continue;
      const pol = (sc.extpolar >>> n) & 1;
      if ((pol && (rise >>> pin) & 1) || (!pol && (fall >>> pin) & 1)) sc.extint |= 1 << n;
    }
    this.eintUpdate();
  }
  eintUpdate() {
    const sc = this.sc;
    const v = this.prevIn[2];
    for (let n = 0; n < 4; n++) {
      const pin = 10 + n;
      if (this.pincon.func(2, pin) === 1 && !(sc.extmode & (1 << n))) {
        const lvl = (v >>> pin) & 1, pol = (sc.extpolar >>> n) & 1;
        if (lvl === pol) sc.extint |= 1 << n;
      }
    }
    for (let n = 0; n < 3; n++) this.cpu.setIrq(IRQ.EINT0 + n, (sc.extint >>> n) & 1);
    this.cpu.setIrq(IRQ.EINT3, ((sc.extint >>> 3) & 1) || this.gpioint.pending());
  }

  // ---- analog / misc hooks
  analogIn(ch) { return this.board?.analogIn ? this.board.analogIn(ch) : 0; }
  uartOut(n, c, baud) { this.board?.onUart?.(n, c, baud); }
  dacChanged() { this.board?.onDac?.(this.dac.volts()); }
  pwmChanged() { this.board?.onPwm?.(); }
  pwmDuty(ch) { return this.pwm.duty(ch); }

  // ---- bus
  dev(a) {
    let d = this.devMap.get(a >>> 14);
    if (d) return d;
    if ((a >= 0x40000000 && a < 0x40100000) || (a >= 0x50000000 && a < 0x50200000) || (a >= 0xE0000000 && a < 0xE0100000) || (a >= 0x2009C000 && a < 0x200A0000)) {
      const base = (a & ~0x3FFF) >>> 0;
      d = new Regs(this, 'periph@' + hex(base), base);
      this.devMap.set(a >>> 14, d); this.generic.set(base, d);
      return d;
    }
    return null;
  }
  bitband(a) {
    if (a >= 0x22000000 && a < 0x24000000) { const o = a - 0x22000000; return [(0x20000000 + (o >>> 5)) & ~3, ((o >>> 2) & 7) + 8 * (((o >>> 5)) & 3)]; }
    if (a >= 0x42000000 && a < 0x44000000) { const o = a - 0x42000000; return [(0x40000000 + (o >>> 5)) & ~3, ((o >>> 2) & 7) + 8 * (((o >>> 5)) & 3)]; }
    return null;
  }
  busFault(a, what) { throw new SimFault('BusFault', `${what} at invalid address ${hex(a)}`, a); }

  fetch16(a) {
    if (a < FLASH_SIZE) return this.flash16[a >>> 1];
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) return this.sram16[(a - SRAM_BASE) >>> 1];
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) return this.ahb16[(a - AHB_BASE) >>> 1];
    throw new SimFault('MemManage', `instruction fetch from non-executable address ${hex(a)}`, a);
  }

  read32(a) {
    if (a < FLASH_SIZE) return (a & 3) ? this.readBytes(a, 4) : this.flash32[a >>> 2];
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) return (a & 3) ? this.readBytes(a, 4) : this.sram32[(a - SRAM_BASE) >>> 2];
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) return (a & 3) ? this.readBytes(a, 4) : this.ahb32[(a - AHB_BASE) >>> 2];
    return this.periphRead(a, 4);
  }
  read16(a) {
    if (a < FLASH_SIZE) return (a & 1) ? this.readBytes(a, 2) : this.flash16[a >>> 1];
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) return (a & 1) ? this.readBytes(a, 2) : this.sram16[(a - SRAM_BASE) >>> 1];
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) return (a & 1) ? this.readBytes(a, 2) : this.ahb16[(a - AHB_BASE) >>> 1];
    return this.periphRead(a, 2);
  }
  read8(a) {
    if (a < FLASH_SIZE) return this.flash[a];
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) return this.sram[a - SRAM_BASE];
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) return this.ahb[a - AHB_BASE];
    return this.periphRead(a, 1);
  }
  readBytes(a, n) { let v = 0; for (let i = 0; i < n; i++) v |= this.read8(a + i) << (8 * i); return v >>> 0; }

  write32(a, v) {
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) { if (a & 3) return this.writeBytes(a, v, 4); this.sram32[(a - SRAM_BASE) >>> 2] = v; return; }
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) { if (a & 3) return this.writeBytes(a, v, 4); this.ahb32[(a - AHB_BASE) >>> 2] = v; return; }
    this.periphWrite(a, v, 4);
  }
  write16(a, v) {
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) { if (a & 1) return this.writeBytes(a, v, 2); this.sram16[(a - SRAM_BASE) >>> 1] = v; return; }
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) { if (a & 1) return this.writeBytes(a, v, 2); this.ahb16[(a - AHB_BASE) >>> 1] = v; return; }
    this.periphWrite(a, v, 2);
  }
  write8(a, v) {
    if (a >= SRAM_BASE && a < SRAM_BASE + SRAM_SIZE) { this.sram[a - SRAM_BASE] = v; return; }
    if (a >= AHB_BASE && a < AHB_BASE + AHB_SIZE) { this.ahb[a - AHB_BASE] = v; return; }
    this.periphWrite(a, v, 1);
  }
  writeBytes(a, v, n) { for (let i = 0; i < n; i++) this.write8(a + i, (v >>> (8 * i)) & 0xFF); }

  periphRead(a, size) {
    if (a < FLASH_SIZE + 0) return 0;
    const bb = this.bitband(a);
    if (bb) { const w = this.read32(bb[0]); return (w >>> bb[1]) & 1; }
    if (a >= 0x1FFF0000 && a < 0x1FFF2000) return 0;
    const d = this.dev(a);
    if (!d) this.busFault(a, 'read');
    const off = (a - d.base) >>> 0;
    const w = d.read(off & ~3) >>> 0;
    if (size === 4) return w;
    const sh = (off & 3) * 8;
    return size === 2 ? (w >>> sh) & 0xFFFF : (w >>> sh) & 0xFF;
  }
  periphWrite(a, v, size) {
    if (a < FLASH_SIZE) { this.busFault(a, 'write to flash'); }
    const bb = this.bitband(a);
    if (bb) {
      const w = this.read32(bb[0]);
      const nv = (v & 1) ? (w | (1 << bb[1])) : (w & ~(1 << bb[1]));
      if (bb[0] >= 0x40000000) this.periphWrite(bb[0], nv >>> 0, 4); else this.write32(bb[0], nv >>> 0);
      return;
    }
    const d = this.dev(a);
    if (!d) this.busFault(a, 'write');
    const off = (a - d.base) >>> 0;
    const sh = (off & 3) * 8;
    const m = size === 4 ? 0xFFFFFFFF : size === 2 ? (0xFFFF << sh) >>> 0 : (0xFF << sh) >>> 0;
    d.write(off & ~3, (v << sh) >>> 0, m);
  }

  // ---- execution
  // Run for the given number of CPU cycles. Returns stop reason or null.
  run(cycles) {
    const cpu = this.cpu;
    const end = cpu.cycles + cycles;
    const SLICE = 2000;
    while (cpu.cycles < end) {
      const slice = Math.min(SLICE, end - cpu.cycles);
      if (cpu.sleeping) {
        cpu.cycles += slice;
      } else {
        const r = cpu.run(slice);
        if (r === 'break' || r === 'lockup') { this.tickAll(); return r; }
      }
      this.tickAll();
      if (cpu.sleeping && cpu.anyPendingEnabled()) { cpu.sleeping = false; cpu.checkIrq = true; }
      if (this.requestReset) { this.reset(); return 'reset'; }
    }
    return null;
  }
  step() {
    const cpu = this.cpu;
    if (cpu.checkIrq) cpu.checkInterrupts();
    if (cpu.sleeping) { cpu.cycles += 100; this.tickAll(); if (cpu.anyPendingEnabled()) { cpu.sleeping = false; cpu.checkIrq = true; } return; }
    cpu.step();
    this.tickAll();
  }
  tickAll() { const t = this.tickers; for (let i = 0; i < t.length; i++) t[i].tick(); }
}
