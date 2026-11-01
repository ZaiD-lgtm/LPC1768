# LPC1768 Lab Simulator

A browser-based simulator of the **ALS-SDA-ARMCTXM3-01** trainer kit, built around the NXP LPC1768 (ARM Cortex-M3). Write embedded C or ARM assembly, wire up the patch bay, and see LEDs, the 7-segment display, the 16x2 LCD, the keypad, the ADC and PWM respond as they would on the real board. There's nothing to install: the compiler and the chip emulator both run in your browser.

**Live:** https://lpc1768-trainer-sim.lamp-light.workers.dev

**Idea & creation:** Pragyan Das and Zaid Akhtar

## What it does

- **Compiles real C.** A C compiler written in JavaScript turns your `LPC17xx.h` program into Thumb-2 machine code and an Intel HEX image you can download.
- **Runs it on an emulated chip.** An ARMv7-M core with NVIC, SysTick and exceptions executes the firmware against modelled LPC1768 peripherals: GPIO, PINCON, timers, PWM1, UART, ADC, DAC and external interrupts.
- **Shows the kit.** A patch bay with FRC connectors CNA–CND links to the LED bank, SW2, a multiplexed 4-digit 7-segment display, an HD44780 LCD, a 4x4 keypad, ADC potentiometers and a PWM scope.
- **Loads HEX files.** Firmware built with Keil or GCC runs as-is, using its actual Thumb/Thumb-2 instructions.
- **Teaches assembly.** An ARM assembly interpreter steps through code one instruction at a time, with register and SRAM views.
- **Keeps your code private.** Source never leaves the browser.

## Included labs

Pick one from the **Example program** menu and it sets up the wiring and starts running.

| Lab | Program | Wiring |
| --- | --- | --- |
| 1–5 (ASM) | Bubble sort + GPIO LED output | CNA→CNA1, CNB→CNB1 |
| 6 & 7 | Serial LED chaser | CNA→CNA1, CNB→CNB1 |
| 7 Ex 2 | 8-bit up/down counter with SW2 | CNA→CNA1, CNB→CNB1 |
| 8 | Multiplexed 4-digit 7-segment counter | CNA→CNA2, CNB→CNB2 |
| 9 | 16x2 LCD 4-bit driver + keypad scan | CND→CNAD, CNB→CNB3 |
| 10 | 12-bit ADC (POT1) to LCD | CND→CNAD, CNA→CNA1 |
| 11 | PWM1.4 interrupt-driven LED dimmer | CNA→CNA1, CNB→CNB1 |
| Custom | Blank C playground | CNA, CNB, CND |

The C sources are also in [`examples/`](examples/).

## Writing your own C

1. Open **C / Assembly Editor**. Click **Upload .c File** (up to 256 KiB), or paste or edit source.
2. Connect the patch bay for the pins your program uses. For example, CNA → CNA1 connects the LEDs to P0.4–P0.11. Uploading a file keeps your current wiring.
3. Click **Compile & Run** or press **F7**.
4. Compiler errors, warnings and `printf` output appear below the editor. **MMIO Registers** shows pin states; **ASM Debugger & RAM** shows core registers and SRAM.
5. Press **F5** or the Running/Paused button to pause or resume. **SW1 RST** rebuilds and restarts. **Download compiled .hex** saves the firmware.

Available headers: `LPC17xx.h`, `stdint.h`, `stdio.h`, `string.h`, `stdlib.h`, `math.h`, `stdbool.h`, `ctype.h`, and the lab header `AN_LCD.h` (`lcd_init`, `lcd_com`, `lcd_data`, `lcd_puts`, `delay_lcd`). Your own definitions override the `AN_LCD.h` helpers. `printf` writes to UART0.

Programs are a single `.c` file that defines `main`. The compiler does not support `long long`/64-bit integers, bit-fields, or passing and returning structs by value, and `double` is treated as a 32-bit `float`. Keil-specific extensions aren't translated.

### SW2 and the FRC cable

With **CNB → CNB1**, SW2 connects through connector pin 7 to **P2.12**. P1.26 is on CNB pin 4, which goes to an unused pin on CNB1, so changing the GPIO number in C does not reroute the cable. The simulator models straight-through FRC connections only. Check the connector mapping against your board's schematic before running the examples on real hardware.

## Run it locally

Requires Node.js 18 or newer.

```bash
git clone https://github.com/ZaiD-lgtm/LPC1768.git
cd LPC1768
npm install
npm run dev        # http://127.0.0.1:5173
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the static site into `dist/` |
| `npm test` | Headless engine tests (`tests/engine.test.mjs`) |
| `npm run test:ui` | Playwright browser tests (run `npx playwright install chromium` once first) |
| `npm run deploy` | Build and publish to Cloudflare Workers static assets (`wrangler.toml`) |

The engine tests compile and run every bundled template and example. They also check `printf`, exit codes, HEX round trips, malformed HEX, compiler diagnostics, switch input and PWM interrupts. The browser tests cover startup, upload/compile, GPIO and LCD output, ADC, PWM, pause, HEX download, diagnostics and returning from `main`.

## Project layout

```
src/App.jsx          board UI, patch bay, peripherals, assembly interpreter
src/firmware.js      builds and runs firmware, feeds MMIO activity to the UI
src/templates.js     bundled lab programs and their wiring
src/engine/compiler  C preprocessor, parser, Thumb-2 code generator, runtime library
src/engine/sim       Cortex-M3 core, LPC1768 peripherals, Intel HEX
examples/            lab C sources
backend/             earlier GCC + Unicorn service (no longer used by the app)
```

## Simulation scope

This is an educational model, not cycle-accurate hardware. Firmware runs in bounded batches, so an infinite loop can't freeze the page. Pause, reset and recompile cancel earlier runs, and CPU faults appear in the build output.

- GPIO0–3 connect to the board UI. Direction, masks, set/clear and byte/halfword accesses are modelled.
- Switch and keypad inputs follow the patch-bay wiring. ADC channels 4 and 5 follow the two sliders.
- The LCD supports the lab 4-bit initialisation, character writes, clear/home and cursor addressing, but not full HD44780 timing.
- TIMER0–3, PWM1, UART0–3, ADC, DAC, EINT and GPIO interrupts are modelled. I2C, SPI, RTC, watchdog, DMA, USB and networking are register stubs.
- Firmware must fit in 512 KiB flash and 32 KiB SRAM. No physical serial flashing takes place.

## Credits

Idea and creation by **Pragyan Das** and **Zaid Akhtar**.

`backend/include/LPC17xx.h` is the NXP peripheral-layout header from [ARMmbed/mbed-os](https://github.com/ARMmbed/mbed-os/blob/master/targets/TARGET_NXP/TARGET_LPC176X/device/LPC17xx.h), with its upstream copyright and license notice retained.
