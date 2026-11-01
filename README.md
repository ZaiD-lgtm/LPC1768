# LPC1768 lab simulator

A runnable version of the supplied React simulator. It retains the patch bay, LED bank, multiplexed display, LCD, keypad, ADC controls, PWM view, and assembly teaching interpreter.

## Run

Install Git, Node.js 22+, and Python 3 with venv support, then clone and start the project:

```bash
git clone https://github.com/ZaiD-lgtm/LPC1768.git
cd LPC1768
npm run setup
npm run dev
```

Open http://127.0.0.1:5173. The command starts both Vite and the local Python compiler/emulator service. Stop them with Ctrl+C. After the first setup, use `npm run dev` to restart.

The supplied scripts target Linux/POSIX environments; Windows users can use Ubuntu under WSL. On Ubuntu/Debian, setup downloads and extracts the ARM GCC/newlib packages into `.toolchain/` without sudo or changing system packages. On other POSIX platforms, install Arm GNU Toolchain and put `arm-none-eabi-gcc` and `arm-none-eabi-objcopy` on PATH, or set `ARM_TOOLCHAIN_BIN` to their directory. Python dependencies live in `.venv/`.

Production build and local server:

```bash
npm run build
npm start
```

Then open http://127.0.0.1:8765. A static JSX preview alone cannot run this compiler; the local service must be running. Source stays on this machine.

## Custom C files

1. Open **C / Assembly Editor**, then **Upload .c File** (up to 256 KiB), or paste/edit source.
2. Connect the patch bay for the pins used by your program. Uploading preserves your current wiring. For example, CNA → CNA1 connects LEDs to P0.4–P0.11.
3. Click **Compile & Run** or press **F7**.
4. See compiler errors, warnings, and `printf` output below the editor. Use **MMIO Registers** to inspect pins and **ASM Debugger & RAM** to inspect core registers/SRAM.
5. Use **F5** or the Running/Paused button to pause/resume. SW1 RST rebuilds and restarts the source. Download the actual generated firmware with **Download compiled .hex**.

Includes supplied: `LPC17xx.h`, standard newlib C headers (`stdint.h`, `stdio.h`, `string.h`, etc.), and the lab compatibility header `AN_LCD.h`. Custom functions, pointers, structs, macros, arrays, integer overflow/conversions, and floating point use the actual C compiler. Single-file programs must define `main`. Additional project-specific headers/source files and Keil-specific compiler extensions are not uploaded or translated automatically.

Examples are in `examples/` and selectable in the app. Choosing an example configures its wiring and starts it. F11 steps the existing assembly interpreter; it is not a C source-level debugger.

### SW2 and the FRC cable

With **CNB → CNB1**, SW2 connects through connector pin 7 to **P2.12**. P1.26 is on CNB pin 4, which connects to an unused pin on CNB1. Changing the GPIO number in C does not reroute the cable. The simulator models straight-through FRC connections; individual jumper-wire routing is not implemented. Confirm the connector mapping against your physical board's schematic when using the examples on hardware.

## What was broken

- The uploaded source already had inline SVG icons. The new app uses one pinned React/ReactDOM 18.2.0 runtime throughout, with no external icon packages, global React mutation, or mixed JSX runtimes.
- On initial render, the old HEX generator called `btoa(JSON.stringify(...))` on a template containing an em dash. `btoa` cannot encode that Unicode character, causing a render-time exception before the board appeared.
- The regex C-to-JavaScript transpiler could consume function bodies as declarations, redeclare `temp1` and library functions, change C semantics, and miss yielding inside loops. It has been removed.
- The old HEX generator emitted a fixed stub plus source metadata instead of compiled code. Firmware now comes from ARM GCC and `objcopy`, and its actual instructions execute in Unicorn's Cortex-M3 mode. HEX loads validate record lengths, checksums, EOF, flash bounds, and reset vectors.
- LCD initialization now distinguishes its initial 8-bit mode from subsequent 4-bit commands. GPIO events are replayed in order, preserving LCD enable edges and multiplexed display writes.

## Simulation scope

This is an educational peripheral model, not cycle-accurate LPC1768 hardware. Execution uses bounded instruction batches; infinite loops cannot lock the UI. Pause, reset, and recompile invalidate earlier runs. Emulator faults appear in build output rather than silently continuing.

- GPIO0–3 are connected to the board UI; GPIO4 is available in the emulator. Direction, masks, set/clear, and byte/halfword accesses are modeled.
- Switch and keypad inputs follow patch-bay wiring. ADC channels 4/5 follow the two sliders with simplified conversion timing.
- LCD supports the lab 4-bit initialization, character writes, clear/home, and address commands. Full HD44780 timing/command behavior is not modeled.
- PWM duty registers drive the display. PWM1 interrupts invoke the firmware handler with saved CPU state at simulated intervals; this is not a complete NVIC/exception-priority model. TIM0/TIM1 have approximate counters and match/reset/stop behavior. Other IRQs, SysTick, DMA, USB, networking, and full peripheral timing are not implemented.
- `SystemInit`/`SystemCoreClockUpdate` use a fixed 100 MHz model. Arbitrary vendor startup code that waits for PLL lock or unimplemented peripherals may wait indefinitely. Pause/reset remain available.
- Raw HEX runs its actual Thumb/Thumb-2 bytes, not the partial disassembler preview. Firmware must fit the flash/RAM map and use supported peripherals. No physical serial flashing occurs.
- This service is intended for locally authored/trusted lab code. It binds to loopback and rejects cross-site browser requests; it is not a public multi-user compilation sandbox.

## Validation

```bash
npm test
npx playwright install chromium  # once, for browser tests
npm run test:ui
npm run build
```

Engine tests exercise all bundled C templates, custom C semantics, real HEX round trips and malformed records, compiler diagnostics, infinite loops, GPIO masks/byte writes, switch/keypad inputs, ADC, PWM callbacks, CPU faults, and printf. Browser tests cover startup, upload/edit/compile, visible GPIO/LCD output, pause, HEX download, diagnostics, and returning from main.

## Implementation references

ARM flags follow the [GCC ARM options](https://gcc.gnu.org/onlinedocs/gcc/ARM-Options.html). CPU execution uses [Unicorn](https://www.unicorn-engine.org/). `backend/include/LPC17xx.h` is the NXP peripheral-layout header from [ARMmbed/mbed-os](https://github.com/ARMmbed/mbed-os/blob/master/targets/TARGET_NXP/TARGET_LPC176X/device/LPC17xx.h); its upstream copyright/license notice is retained. `core_cm3.h` and `system_LPC17xx.h` here are deliberately small simulator compatibility headers, not the full CMSIS implementation.
