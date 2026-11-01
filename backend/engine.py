"""Compile actual Cortex-M3 firmware and execute bounded instruction slices."""
import io
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

from elftools.elf.elffile import ELFFile
from unicorn import Uc, UcError, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_XPSR, UC_ARM_REG_PRIMASK

ROOT = Path(__file__).resolve().parents[1]
GPIO = 0x2009C000
GPIO_NAMES = {0: 'FIODIR', 16: 'FIOMASK', 20: 'FIOPIN', 24: 'FIOSET', 28: 'FIOCLR'}
PINS = {
    'CNA': [(0, b) for b in range(4, 12)],
    'CNB': [(1, b) for b in range(23, 27)] + [(2, b) for b in range(10, 14)],
    'CNC': [(0, b) for b in range(15, 23)] + [(2, 13)],
    'CND': [(0, b) for b in range(23, 29)] + [(2, 0), (2, 1)],
}
MASK = 0xFFFFFFFF


def tool(name):
    override = os.environ.get('ARM_TOOLCHAIN_BIN')
    candidates = ([str(Path(override) / name)] if override else []) + [str(ROOT / '.toolchain/usr/bin' / name), shutil.which(name)]
    for path in candidates:
        if path and Path(path).is_file():
            return path
    raise ValueError('ARM compiler is missing. Run npm run setup first.')


def compile_source(source):
    if not isinstance(source, str) or not source.strip():
        raise ValueError('Source is empty. Upload or enter a C program with main().')
    if len(source.encode()) > 256 * 1024:
        raise ValueError('C source exceeds the 256 KiB limit.')
    with tempfile.TemporaryDirectory(prefix='lpc1768-') as folder:
        path = Path(folder)
        (path / 'program.c').write_text(source)
        compiler = tool('arm-none-eabi-gcc')
        args = [compiler, '-mcpu=cortex-m3', '-mthumb', '-mfloat-abi=soft', '-std=gnu11', '-O0', '-g',
                '-Wall', '-Wextra', '-Werror=implicit-function-declaration', '-ffunction-sections', '-fdata-sections',
                '-fno-common', '-nostartfiles', '-I', str(ROOT / 'backend/include')]
        # Ubuntu packages extracted locally have absolute newlib symlinks. Resolve explicitly.
        local = ROOT / '.toolchain/usr'
        if compiler.startswith(str(local)):
            args += ['-isystem', str(local / 'include/newlib'), '-L', str(local / 'lib/arm-none-eabi/newlib/thumb/v7-m/nofp')]
        args += ['program.c', str(ROOT / 'backend/runtime.c'), '-T', str(ROOT / 'backend/lpc1768.ld'),
                 '-Wl,--gc-sections', '-Wl,--build-id=none', '-Wl,--start-group', '-lc', '-lm', '-lgcc', '-Wl,--end-group', '-o', 'firmware.elf']
        try:
            result = subprocess.run(args, cwd=path, capture_output=True, text=True, timeout=20)
        except subprocess.TimeoutExpired:
            raise ValueError('Compilation exceeded 20 seconds.') from None
        diagnostics = result.stderr.replace(str(ROOT) + '/', '').replace(folder + '/', '')
        if result.returncode:
            raise ValueError(diagnostics[-16000:] or 'C compilation failed.')
        subprocess.run([tool('arm-none-eabi-objcopy'), '-O', 'ihex', 'firmware.elf', 'firmware.hex'], cwd=path, check=True, capture_output=True, timeout=10)
        data = (path / 'firmware.elf').read_bytes()
        elf = ELFFile(io.BytesIO(data))
        segments = [(seg['p_paddr'], seg.data()) for seg in elf.iter_segments() if seg['p_type'] == 'PT_LOAD']
        symbols = {s.name: s['st_value'] for s in elf.get_section_by_name('.symtab').iter_symbols()}
        return Firmware(segments, symbols), (path / 'firmware.hex').read_text(), diagnostics


def load_hex(text):
    if not isinstance(text, str) or len(text) > 2 * 1024 * 1024:
        raise ValueError('Invalid or oversized HEX file.')
    base, eof, memory = 0, False, {}
    for number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if eof or not line.startswith(':'):
            raise ValueError(f'HEX line {number}: expected an Intel HEX record before EOF.')
        try:
            record = bytes.fromhex(line[1:])
        except ValueError:
            raise ValueError(f'HEX line {number}: invalid hex digits.') from None
        if len(record) < 5 or len(record) != record[0] + 5 or sum(record) & 255:
            raise ValueError(f'HEX line {number}: invalid length or checksum.')
        count, high, low, kind = record[:4]
        address = high * 256 + low
        data = record[4:-1]
        if kind == 0:
            for i, value in enumerate(data):
                addr = base + address + i
                if addr >= 512 * 1024:
                    raise ValueError('HEX data must fit in LPC1768 flash (512 KiB).')
                memory[addr] = value
        elif kind == 1 and count == 0 and address == 0:
            eof = True
        elif kind in (2, 4) and count == 2 and address == 0:
            base = int.from_bytes(data, 'big') << (4 if kind == 2 else 16)
        elif kind in (3, 5) and count == 4 and address == 0:
            pass  # Cortex-M starts from its vector table.
        else:
            raise ValueError(f'HEX line {number}: unsupported or malformed record type {kind}.')
    if not eof or not all(i in memory for i in range(8)):
        raise ValueError('HEX requires EOF and an initial stack/reset vector at address 0.')
    image = bytearray(max(memory) + 1)
    for address, value in memory.items():
        image[address] = value
    return Firmware([(0, bytes(image))], {})


class Firmware:
    def __init__(self, segments, symbols):
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        self.uc.mem_map(0, 512 * 1024)
        self.uc.mem_map(0x10000000, 32 * 1024)
        self.uc.mem_map(0x2007C000, 32 * 1024)
        self.uc.mem_map(GPIO, 4096)
        for address in (0x40004000, 0x40008000, 0x40018000, 0x4002C000, 0x40034000, 0x400FC000, 0xE000E000):
            self.uc.mem_map(address, 4096)
        for address, data in segments:
            self.uc.mem_write(address, data)
        sp, pc = struct.unpack('<II', self.uc.mem_read(0, 8))
        if not (0x10000000 < sp <= 0x10008000 or 0x2007C000 < sp <= 0x20084000) or sp % 4 or not (pc & 1) or pc >= 512 * 1024:
            raise ValueError('Invalid Cortex-M stack pointer or Thumb reset vector.')
        self.uc.reg_write(UC_ARM_REG_SP, sp)
        self.uc.reg_write(UC_ARM_REG_PC, pc)
        self.uc.reg_write(UC_ARM_REG_XPSR, 0x01000000)
        self.symbols = symbols
        self.gpio = [dict(FIODIR=0, FIOMASK=0, FIOPIN=0, FIOSET=0, FIOCLR=0) for _ in range(5)]
        self.registers = {0x400FC0C4: 0x8000}
        self.events, self.output = [], ''
        self.inputs = {}
        self.halted, self.error, self.exit_code = False, None, None
        self.ticks, self.pwm_elapsed = 0, 0
        self.uc.hook_add(UC_HOOK_MEM_READ, self.on_read, begin=GPIO, end=GPIO + 0x9F)
        self.uc.hook_add(UC_HOOK_MEM_WRITE, self.on_write, begin=GPIO, end=GPIO + 0x9F)
        for start, end in ((0x40000000, 0x400FFFFF), (0xE000E000, 0xE000EFFF)):
            self.uc.hook_add(UC_HOOK_MEM_READ, self.on_read, begin=start, end=end)
            self.uc.hook_add(UC_HOOK_MEM_WRITE, self.on_write, begin=start, end=end)

    def pin_value(self, port):
        pins = [g['FIOPIN'] & g['FIODIR'] for g in self.gpio]
        inp = self.inputs
        cables = inp.get('cables', {})
        jumpers = inp.get('jumpers', {})
        for connector, peripheral in cables.items():
            mapping = PINS.get(connector, [])
            if peripheral == 'CNB1' and inp.get('sw2Pressed') and len(mapping) >= 7:
                p, b = mapping[6]
                pins[p] |= (1 << b) & ~self.gpio[p]['FIODIR']
            key = inp.get('activeKey')
            if peripheral == 'CNB3' and jumpers.get('JP4') and key:
                row, col = int(key.get('row', -1)), int(key.get('col', -1))
                if 0 <= row < 4 and 0 <= col < 4 and len(mapping) >= 8:
                    rp, rb = mapping[4 + row]
                    cp, cb = mapping[col]
                    if pins[rp] & (1 << rb):
                        pins[cp] |= (1 << cb) & ~self.gpio[cp]['FIODIR']
        return pins[port] & MASK

    def adc(self):
        control = self.registers.get(0x40034000, 0)
        channel = next((i for i in range(8) if control & (1 << i)), 5)
        voltage = self.inputs.get('pot4Voltage', 0.85) if channel == 4 else self.inputs.get('pot1Voltage', 1.65)
        if channel == 4 and not self.inputs.get('jumpers', {}).get('JP18', True):
            voltage = 0
        value = min(4095, max(0, round(float(voltage) / 3.3 * 4095))) if channel in (4, 5) else 0
        done = bool(control & (1 << 21) and control & ((7 << 24) | (1 << 16)))
        return (int(done) << 31) | (channel << 24) | (value << 4)

    def on_read(self, uc, access, address, size, value, user):
        aligned = address & ~3
        if GPIO <= aligned < GPIO + 160:
            port, offset = divmod(aligned - GPIO, 32)
            name = GPIO_NAMES.get(offset)
            value = self.gpio[port].get(name, 0)
            if name in ('FIOPIN', 'FIOSET'):
                value = self.pin_value(port) & ~self.gpio[port]['FIOMASK']
        elif aligned == 0x40034004 or 0x40034010 <= aligned <= 0x4003402C:
            value = self.adc()
        else:
            value = self.registers.get(aligned, 0)
        uc.mem_write(aligned, struct.pack('<I', value & MASK))

    def on_write(self, uc, access, address, size, value, user):
        aligned = address & ~3
        shift = (address & 3) * 8
        byte_mask = ((1 << (size * 8)) - 1) << shift
        value = (value << shift) & MASK
        if GPIO <= aligned < GPIO + 160:
            port, offset = divmod(aligned - GPIO, 32)
            name = GPIO_NAMES.get(offset)
            if name:
                gpio = self.gpio[port]
                merged = (gpio[name] & ~byte_mask) | value
                writable = gpio['FIODIR'] & ~gpio['FIOMASK'] & byte_mask
                if name == 'FIOPIN':
                    gpio['FIOPIN'] = ((gpio['FIOPIN'] & ~writable) | (value & writable)) & MASK
                elif name == 'FIOSET':
                    gpio['FIOPIN'] |= value & writable
                    gpio[name] = value
                elif name == 'FIOCLR':
                    gpio['FIOPIN'] &= ~(value & writable)
                    gpio[name] = value
                else:
                    gpio[name] = merged & MASK
                self.events.append([aligned, value if name in ('FIOSET', 'FIOCLR') else gpio[name]])
        elif aligned == 0x400FCFF8:
            self.halted, self.exit_code = True, value
            uc.emu_stop()
        elif aligned == 0x400FCFFC:
            if len(self.output) < 8192:
                self.output += chr(value & 255)
        else:
            old = self.registers.get(aligned, 0)
            self.registers[aligned] = ((old & ~byte_mask) | value) & MASK
            if aligned in (0x40018000, 0x40004000, 0x40008000):  # interrupt flags: write one to clear
                self.registers[aligned] = old & ~value
            if aligned == 0xE000E100:
                self.registers[aligned] = old | value
            if aligned == 0xE000E180:
                self.registers[0xE000E100] = self.registers.get(0xE000E100, 0) & ~value
            self.events.append([aligned, self.registers[aligned]])
        if len(self.events) >= 2048:
            uc.emu_stop()

    def advance_timers(self, quantum):
        for base in (0x40004000, 0x40008000):
            tcr = self.registers.get(base + 4, 0)
            if tcr & 2:
                self.registers[base + 8] = 0
            elif tcr & 1:
                count = self.registers.get(base + 8, 0) + max(1, quantum // (self.registers.get(base + 12, 0) + 1))
                match = self.registers.get(base + 24, 0)
                mcr = self.registers.get(base + 20, 0)
                if match and count >= match:
                    if mcr & 1:
                        self.registers[base] = 1
                    if mcr & 2:
                        count %= match
                    if mcr & 4:
                        self.registers[base + 4] &= ~1
                self.registers[base + 8] = count & MASK
        self.pwm_elapsed += quantum
        period = max(1, self.registers.get(0x40018018, 30000))
        if (self.pwm_elapsed >= period and self.registers.get(0x40018004, 0) & 1 and
                self.registers.get(0x40018014, 0) & 1 and self.registers.get(0xE000E100, 0) & (1 << 9) and
                not self.uc.reg_read(UC_ARM_REG_PRIMASK)):
            handler = self.symbols.get('PWM1_IRQHandler') or struct.unpack('<I', self.uc.mem_read((16 + 9) * 4, 4))[0]
            if handler:
                # Educational IRQ callback model; preserves interrupted CPU state, shares RAM/MMIO.
                self.pwm_elapsed = 0
                context = self.uc.context_save()
                self.registers[0x40018000] = 1
                self.uc.reg_write(UC_ARM_REG_LR, 0x7FFF1)
                try:
                    self.uc.emu_start(handler | 1, 0x7FFF0, timeout=20000, count=10000)
                    if self.uc.reg_read(UC_ARM_REG_PC) != 0x7FFF0:
                        raise ValueError('PWM1_IRQHandler did not return within its instruction budget.')
                finally:
                    self.uc.context_restore(context)

    def step(self, inputs=None, count=20000):
        self.inputs = inputs or {}
        self.events, self.output = [], ''
        count = min(100000, max(1, int(count)))
        if not self.halted:
            try:
                self.uc.emu_start(self.uc.reg_read(UC_ARM_REG_PC) | 1, 0x7FFF0, timeout=30000, count=count)
                if not self.halted:
                    self.advance_timers(count)
            except (UcError, ValueError) as exc:
                self.halted = True
                self.error = f'CPU fault at 0x{self.uc.reg_read(UC_ARM_REG_PC):08X}: {exc}. Check pointers and supported peripherals.'
        regs = [self.uc.reg_read(UC_ARM_REG_R0 + i) for i in range(13)] + [self.uc.reg_read(r) for r in (UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC)]
        return dict(events=self.events, gpio=self.gpio, registers={str(k): v for k, v in self.registers.items()},
                    armRegs=regs, xpsr=self.uc.reg_read(UC_ARM_REG_XPSR), sram=list(struct.unpack('<8I', self.uc.mem_read(0x10000000, 32))),
                    halted=self.halted, error=self.error, exitCode=self.exit_code, output=self.output)
