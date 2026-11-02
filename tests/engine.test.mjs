// Headless checks for the in-browser compiler/emulator: node tests/engine.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { runFirmware } from '../src/firmware.js';
import { LAB_TEMPLATES } from '../src/templates.js';

async function run(source, { mode = 'c', inputs = {}, frames = 40 } = {}) {
  const result = { events: [], output: '', halted: false, exitCode: null, build: null };
  let n = 0;
  await runFirmware({
    mode, source,
    isCurrent: () => n < frames,
    getInputs: () => ({ isPowered: true, isRunning: true, simSpeed: 1, cables: {}, jumpers: {}, ...inputs }),
    onBuild: build => { result.build = build; },
    onFrame: frame => { n++; result.events.push(...frame.events); result.output += frame.output; },
    onHalt: code => { result.halted = true; result.exitCode = code; },
  });
  return result;
}

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const gpioWrites = r => r.events.filter(([a]) => a >= 0x2009C000 && a < 0x2009C0A0).length;

for (const t of LAB_TEMPLATES.filter(t => t.mode === 'c')) {
  await check(`template: ${t.name || t.id}`, async () => {
    const r = await run(t.code, { inputs: { cables: t.cables, jumpers: t.jumpers || {} } });
    if (/PWM1_IRQHandler/.test(t.code)) assert(r.events.filter(([a]) => a === 0x40018040).length > 2, 'PWM interrupt never updated MR4');
    else assert(gpioWrites(r) > 0, 'no GPIO activity');
  });
}
for (const f of readdirSync(new URL('../examples/', import.meta.url))) {
  await check(`example: ${f}`, async () => {
    const r = await run(readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8'));
    assert(r.build.hex.includes(':00000001FF'), 'no HEX');
  });
}
await check('printf and exit code', async () => {
  const r = await run('#include <stdio.h>\nint main(void){ printf("x=%d %s\\n", 42, "ok"); return 3; }', { frames: 200 });
  assert(r.output === 'x=42 ok\n', `output ${JSON.stringify(r.output)}`);
  assert(r.halted && r.exitCode === 3, `exit ${r.exitCode}`);
});
await check('HEX round trip', async () => {
  const c = await run('#include <LPC17xx.h>\nint main(void){ LPC_GPIO0->FIODIR = 0xFF0; LPC_GPIO0->FIOSET = 0x10; return 0; }', { frames: 50 });
  const h = await run(c.build.hex, { mode: 'hex', frames: 50 });
  assert(h.halted && h.exitCode === 0 && gpioWrites(h) === gpioWrites(c), 'HEX run differs');
});
await check('compile errors are reported', async () => {
  let message = '';
  await run('int main(void){ return undefined_thing; }').catch(e => { message = e.message; });
  assert(/program\.c:1/.test(message), message || 'no error');
});
await check('malformed HEX rejected', async () => {
  let message = '';
  await run(':10000000FFFF\n:00000001FF\n', { mode: 'hex' }).catch(e => { message = e.message; });
  assert(message, 'accepted bad HEX');
});
await check('switch input via CNB1', async () => {
  const src = '#include <LPC17xx.h>\nint main(void){ LPC_GPIO0->FIODIR = 1<<4; while(1){ if (LPC_GPIO2->FIOPIN & (1<<12)) LPC_GPIO0->FIOSET = 1<<4; else LPC_GPIO0->FIOCLR = 1<<4; } }';
  const up = await run(src, { frames: 3, inputs: { cables: { CNB: 'CNB1' } } });
  const down = await run(src, { frames: 3, inputs: { cables: { CNB: 'CNB1' }, sw2Pressed: true } });
  const last = r => r.events.filter(([a]) => a === 0x2009C018 || a === 0x2009C01C).at(-1)[0];
  assert(last(up) === 0x2009C01C && last(down) === 0x2009C018, 'switch not seen');
});
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
