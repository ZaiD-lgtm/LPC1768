import { test, expect } from '@playwright/test';

test('boots, executes GPIO, pauses, compiles an uploaded C file, and reports errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('build-output')).toContainText('Compiled & running');
  await page.getByRole('button', { name: 'MMIO Registers', exact: true }).click();
  const pins = page.getByRole('row').filter({ hasText: 'LPC_GPIO0->FIOPIN' }).getByRole('cell').nth(1);
  await expect(pins).not.toHaveText('0x00000000');
  await page.getByRole('button', { name: 'Running', exact: true }).click();
  const paused = await pins.textContent();
  await page.waitForTimeout(250);
  await expect(pins).toHaveText(paused);
  await page.getByRole('button', { name: 'C / Assembly Editor', exact: true }).click();
  await page.getByLabel('Upload C source').setInputFiles({ name: 'custom.c', mimeType: 'text/plain', buffer: Buffer.from('#include <LPC17xx.h>\n#include <stdint.h>\n// Unicode: LED → ON\nstatic uint32_t pattern(uint32_t n) { return n << 4; }\nint main(void) { LPC_GPIO0->FIODIR=0xff0; LPC_GPIO0->FIOPIN=pattern(0xA5); return 0; }') });
  await expect(page.getByTestId('build-output')).toContainText('Loaded custom.c');
  await page.keyboard.press('F7');
  await expect(page.getByTestId('build-output')).toContainText('Program finished (exit code 0)');
  await page.getByRole('button', { name: 'MMIO Registers', exact: true }).click();
  await expect(pins).toHaveText('0x00000A50');
  await page.getByRole('button', { name: 'C / Assembly Editor', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download compiled .hex' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('custom.hex');
  await page.getByLabel('Source code').fill('int main(void) { broken syntax; }');
  await page.keyboard.press('F7');
  await expect(page.getByTestId('build-output')).toContainText('program.c:');
  await expect(page.getByTestId('build-output')).toContainText('error:');
  await page.getByLabel('Source code').fill('int main(void) { while (1); }');
  await page.keyboard.press('F7');
  await expect(page.getByTestId('build-output')).toContainText('Compiled & running');
  await page.getByRole('button', { name: 'Running', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Paused', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('custom LCD and low-level LCD templates drive the display', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Example program').selectOption('c_custom_blank');
  await expect(page.getByTestId('build-output')).toContainText('Compiled & running');
  await expect(page.getByTestId('lcd-line1')).toContainText('CUSTOM C RUNNING', { timeout: 15000 });
  await page.getByLabel('Example program').selectOption('c_lab9_lcd');
  await expect(page.getByTestId('lcd-line1')).toContainText('MIT ICT3143 LAB', { timeout: 15000 });
});

test('recompile and reset replace older runs; compiled HEX executes after reloading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('build-output')).toContainText('Compiled & running');
  const program = byte => `#include <LPC17xx.h>\nint main(void){ LPC_GPIO0->FIODIR=0xff0; while(1) LPC_GPIO0->FIOPIN=${byte} << 4; }`;
  await page.getByLabel('Source code').fill(program(0xAA));
  await page.keyboard.press('F7');
  await page.getByLabel('Source code').fill(program(0x55));
  await page.keyboard.press('F7');
  await expect(page.getByTestId('build-output')).toContainText('Compiled & running');
  await page.getByRole('button', { name: 'MMIO Registers', exact: true }).click();
  const pins = page.getByRole('row').filter({ hasText: 'LPC_GPIO0->FIOPIN' }).getByRole('cell').nth(1);
  await expect(pins).toHaveText('0x00000550');
  await page.waitForTimeout(200);
  await expect(pins).toHaveText('0x00000550');
  await page.getByRole('button', { name: 'Running', exact: true }).click();
  await page.getByRole('button', { name: 'SW1 RST', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeVisible();
  await expect(pins).toHaveText('0x00000550');
  await page.getByRole('button', { name: 'C / Assembly Editor', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download compiled .hex' }).click();
  const hexPath = await (await pending).path();
  await page.reload();
  await page.getByRole('button', { name: 'Firmware (.hex)', exact: true }).click();
  await page.getByLabel('Upload HEX firmware').setInputFiles(hexPath);
  await page.getByRole('button', { name: 'Load & Run .HEX', exact: true }).click();
  await page.getByRole('button', { name: 'MMIO Registers', exact: true }).click();
  await expect(pins).toHaveText('0x00000550');
});

test('ADC LCD output and PWM duty update from compiled instructions', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Example program').selectOption('c_lab10_adc');
  await expect(page.getByTestId('lcd-line1')).toContainText('1.65V', { timeout: 15000 });
  await expect(page.getByTestId('lcd-line2')).toContainText('800', { timeout: 15000 });
  await page.getByLabel('Example program').selectOption('c_lab11_pwm');
  await page.getByRole('button', { name: 'MMIO Registers', exact: true }).click();
  const duty = page.getByRole('row').filter({ hasText: 'LPC_PWM1->MR4' }).getByRole('cell').nth(1);
  await expect(duty).not.toHaveText('0x00000000');
  await expect(duty).not.toHaveText('0x00000100');
});
