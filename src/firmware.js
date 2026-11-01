// In-browser firmware build + execution: C compiler and Cortex-M3/LPC1768 model run in this page (no server).
import { compile } from './engine/compiler/index.js';
import { LPC1768 } from './engine/sim/lpc1768.js';
import { parseHex, toHex } from './engine/sim/hex.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const FLASH_SIZE = 512 * 1024;
const EXIT_REG = 0x400FCFF8, PUTC_REG = 0x400FCFFC; // simulator-only exit code / character output
const MAX_EVENTS = 2048;
// Straight-through FRC connector pins (connector pin n -> [port, bit]).
const PINS = {
  CNA: [4, 5, 6, 7, 8, 9, 10, 11].map(b => [0, b]),
  CNB: [[1, 23], [1, 24], [1, 25], [1, 26], [2, 10], [2, 11], [2, 12], [2, 13]],
  CNC: [15, 16, 17, 18, 19, 20, 21, 22].map(b => [0, b]).concat([[2, 13]]),
  CND: [[0, 23], [0, 24], [0, 25], [0, 26], [0, 27], [0, 28], [2, 0], [2, 1]],
};
// Registers whose current value the board UI mirrors after a write.
const mirrored = a => (a >= 0x4002C000 && a < 0x4002C014) || (a >= 0x40018000 && a <= 0x40018050) || a === 0x40034000 || a === 0x400FC0C4;

function formatDiagnostic(d, kind) {
  return `${d.file ? `${d.file}:${d.line}${d.col ? ':' + d.col : ''}: ` : ''}${kind}: ${d.msg}`;
}

function compileSource(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Source is empty. Upload or enter a C program with main().');
  if (new TextEncoder().encode(source).length > 256 * 1024) throw new Error('C source exceeds the 256 KiB limit.');
  const result = compile({ 'program.c': source });
  const warnings = (result.warnings || []).filter(w => !w.file || w.file[0] !== '<').map(w => formatDiagnostic(w, 'warning'));
  if (result.errors?.length) throw new Error([...result.errors.map(e => formatDiagnostic(e, 'error')), ...warnings].join('\n'));
  return { segments: [{ addr: 0, data: result.image }], hex: toHex(result.image), diagnostics: warnings.join('\n') };
}

function loadHex(text) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('Invalid or oversized HEX file.');
  if (!/^:00000001FF\s*$/im.test(text)) throw new Error('HEX requires an EOF record.');
  let parsed;
  try { parsed = parseHex(text); } catch (error) { throw new Error(`HEX ${error.message}.`); }
  for (const segment of parsed.segments) {
    if (segment.addr + segment.data.length > FLASH_SIZE) throw new Error('HEX data must fit in LPC1768 flash (512 KiB).');
  }
  return parsed.segments;
}

class Firmware extends LPC1768 {
  constructor(segments) {
    super();
    this.inputs = {};
    this.events = [];
    this.output = '';
    this.halted = false;
    this.exitCode = null;
    this.fault = null;
    this.error = null;
    this.loadSegments(segments);
    const sp = this.flash32[0], pc = this.flash32[1];
    if (!((sp > 0x10000000 && sp <= 0x10008000) || (sp > 0x2007C000 && sp <= 0x20084000)) || sp % 4 || !(pc & 1) || pc >= FLASH_SIZE) {
      throw new Error('Invalid Cortex-M stack pointer or Thumb reset vector.');
    }
    this.board = {
      onUart: (n, c) => { if (n === 0) this.putc(c); },
      analogIn: ch => this.analog(ch),
    };
    this.cpu.onFault = message => { this.fault ??= message; };
    this.reset();
  }

  putc(c) { if (this.output.length < 8192) this.output += String.fromCharCode(c & 255); }

  analog(ch) {
    const inputs = this.inputs;
    if (ch === 4) return (inputs.jumpers?.JP18 ?? true) ? Number(inputs.pot4Voltage ?? 0.85) : 0;
    if (ch === 5) return Number(inputs.pot1Voltage ?? 1.65);
    return 0;
  }

  // Undriven inputs read low; switches and the keypad drive pins high through the patch-bay cables.
  pinValues(port) {
    const pins = [0, 1, 2, 3, 4].map(p => (this.gpio.latch[p] & this.outMask(p)) >>> 0);
    const drive = ([p, b]) => { pins[p] |= (1 << b) & ~this.outMask(p); };
    const { cables = {}, jumpers = {}, sw2Pressed, activeKey } = this.inputs;
    for (const [connector, peripheral] of Object.entries(cables)) {
      const mapping = PINS[connector];
      if (!mapping) continue;
      if (peripheral === 'CNB1' && sw2Pressed && mapping.length >= 7) drive(mapping[6]);
      if (peripheral === 'CNB3' && jumpers.JP4 && activeKey && mapping.length >= 8) {
        const row = Number(activeKey.row ?? -1), col = Number(activeKey.col ?? -1);
        if (row >= 0 && row < 4 && col >= 0 && col < 4) {
          const [rp, rb] = mapping[4 + row];
          if (pins[rp] & (1 << rb)) drive(mapping[col]);
        }
      }
    }
    return pins[port] >>> 0;
  }

  periphWrite(a, v, size) {
    const aligned = (a & ~3) >>> 0, shifted = (v << ((a & 3) * 8)) >>> 0;
    if (aligned === EXIT_REG) { this.halted = true; this.exitCode = v | 0; return; }
    if (aligned === PUTC_REG) { this.putc(v); return; }
    super.periphWrite(a, v, size);
    if (this.bitband(a)) return; // the aligned word write was recorded by the recursive call
    if (aligned >= 0x2009C000 && aligned < 0x2009C0A0) {
      const port = (aligned - 0x2009C000) >> 5, reg = (aligned - 0x2009C000) & 31;
      const value = reg === 0 ? this.gpio.dir[port] : reg === 16 ? this.gpio.mask[port] : reg === 20 ? this.gpio.latch[port] : reg === 24 || reg === 28 ? shifted : null;
      if (value !== null) this.events.push([aligned, value]);
    } else {
      this.events.push([aligned, mirrored(aligned) ? this.periphRead(aligned, 4) : shifted]);
    }
  }

  step(inputs, count = 20000) {
    this.inputs = inputs || {};
    this.events = [];
    this.output = '';
    for (let p = 0; p < 5; p++) this.inputsChanged(p);
    let left = Math.min(100000, Math.max(1, Math.round(count) || 1));
    while (left > 0 && !this.halted && this.events.length < MAX_EVENTS) {
      const slice = Math.min(500, left);
      const reason = this.run(slice);
      left -= slice;
      if (this.fault || reason === 'lockup') {
        this.halted = true;
        this.error = `CPU fault: ${this.fault || 'core lockup'}. Check pointers and supported peripherals.`;
      }
    }
    const cpu = this.cpu;
    return {
      events: this.events,
      armRegs: [...cpu.r.slice(0, 15), cpu.pc],
      xpsr: cpu.xpsr >>> 0,
      sram: Array.from(this.sram32.slice(0, 8)),
      halted: this.halted, error: this.error, exitCode: this.exitCode, output: this.output,
    };
  }
}

export async function runFirmware({ mode, source, isCurrent, getInputs, onBuild, onFrame, onHalt }) {
  const build = mode === 'hex' ? { segments: loadHex(source), hex: source, diagnostics: '' } : compileSource(source);
  const firmware = new Firmware(build.segments);
  if (!isCurrent()) return;
  onBuild(build);
  while (isCurrent()) {
    // Yield first so React can commit wiring/state changes made alongside this run before any firmware executes.
    await wait(20);
    if (!isCurrent()) return;
    const inputs = getInputs();
    if (!inputs.isPowered || !inputs.isRunning) { await wait(20); continue; }
    const frame = firmware.step(inputs, 20000 * inputs.simSpeed);
    onFrame(frame);
    if (frame.error) throw new Error(frame.error);
    if (frame.halted) { onHalt(frame.exitCode); return; }
  }
}

const GPIO_NAMES = { 0: 'FIODIR', 16: 'FIOMASK', 20: 'FIOPIN', 24: 'FIOSET', 28: 'FIOCLR' };
const PWM_NAMES = { 0: 'IR', 4: 'TCR', 8: 'TC', 12: 'PR', 16: 'PC', 20: 'MCR', 24: 'MR0', 28: 'MR1', 32: 'MR2', 36: 'MR3', 64: 'MR4', 68: 'MR5', 72: 'MR6', 76: 'PCR', 80: 'LER' };
export function applyFirmwareFrame(frame, hw, gpioProxies, sync) {
  // Replay each MMIO edge so LCD nibbles and multiplexed displays survive batching.
  for (const [address, value] of frame.events) {
    if (address >= 0x2009C000 && address < 0x2009C080) {
      const offset = address - 0x2009C000;
      const name = GPIO_NAMES[offset % 32];
      if (name) gpioProxies[Math.floor(offset / 32)][name] = value;
    } else if (address >= 0x4002C000 && address < 0x4002C014) {
      hw.pincon[`PINSEL${(address - 0x4002C000) / 4}`] = value;
    } else if (address >= 0x40018000 && address <= 0x40018050) {
      const name = PWM_NAMES[address - 0x40018000];
      if (name) hw.pwm1[name] = value;
    } else if (address === 0x40034000) {
      hw.adc.ADCR = value;
    } else if (address === 0x400FC0C4) {
      hw.sc.PCONP = value;
    }
  }
  hw.arm.r.set(frame.armRegs);
  hw.arm.flags = { N: (frame.xpsr >>> 31) & 1, Z: (frame.xpsr >>> 30) & 1, C: (frame.xpsr >>> 29) & 1, V: (frame.xpsr >>> 28) & 1 };
  frame.sram.forEach((word, index) => { for (let byte = 0; byte < 4; byte++) hw.arm.memory[0x10000000 + index * 4 + byte] = (word >>> (byte * 8)) & 255; });
  sync();
}
