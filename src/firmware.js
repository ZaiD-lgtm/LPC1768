const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, data) {
  let response;
  try {
    response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  } catch {
    throw new Error('Compiler service is unavailable. Start the app with npm run dev (or npm start after building).');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('Compiler service is unavailable. Start the app with npm run dev.'); }
  if (!response.ok) throw new Error(result.error || 'Compiler request failed.');
  return result;
}

export async function runFirmware({ mode, source, isCurrent, getInputs, onBuild, onFrame, onHalt }) {
  let session;
  try {
    const build = await request(mode === 'hex' ? 'hex' : 'compile', mode === 'hex' ? { hex: source } : { source });
    session = build.session;
    if (!isCurrent()) return;
    onBuild(build);
    while (isCurrent()) {
      const inputs = getInputs();
      if (!inputs.isPowered || !inputs.isRunning) { await wait(40); continue; }
      const frame = await request('step', { session, inputs, count: Math.round(20000 * inputs.simSpeed) });
      if (!isCurrent()) return;
      // A pause or power-off during the request must not update visible hardware.
      while (isCurrent() && (!getInputs().isRunning || !getInputs().isPowered)) await wait(40);
      if (!isCurrent()) return;
      onFrame(frame);
      if (frame.error) throw new Error(frame.error);
      if (frame.halted) { onHalt(frame.exitCode); return; }
      await wait(20);
    }
  } finally {
    if (session) await request('stop', { session }).catch(() => {});
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
