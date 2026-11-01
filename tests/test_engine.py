import json
from pathlib import Path
import subprocess
import unittest

from backend.engine import compile_source, load_hex, ROOT


def run_to_end(engine, inputs=None, limit=150):
    for _ in range(limit):
        frame = engine.step(inputs)
        if frame['halted']:
            if frame['error']:
                raise AssertionError(frame['error'])
            return frame
    raise AssertionError('Program did not terminate within the test budget')


class CompilerTests(unittest.TestCase):
    def test_custom_c_semantics_and_gpio(self):
        source = r'''
#include <LPC17xx.h>
#include <stdint.h>
#define BIT(n) (1u << (n))
typedef struct { uint32_t value; } Pattern;
static uint32_t output(Pattern *p) { return p->value << 4; }
int main(void) {
  // unicode remains valid in C comments: →
  Pattern p = { 0xA5 };
  volatile uint32_t *pin = &LPC_GPIO0->FIOPIN;
  uint32_t values[] = {1, 2, 3};
  unsigned char wrap = 255; wrap++;
  int q = 7 / 2;
  int x = 0; do { x++; } while(x < 2);
  for (int i=0; i<3; i++) { if(values[i] == 2) continue; x += values[i]; }
  LPC_GPIO0->FIODIR = 0xff0;
  *pin = output(&p);
  if (wrap || q != 3 || x != 6 || '\0' != 0) return 1;
  LPC_GPIO0->FIOSET = BIT(5);
  LPC_GPIO0->FIOCLR = BIT(4);
  return 0;
}'''
        engine, _, _ = compile_source(source)
        frame = run_to_end(engine)
        self.assertEqual(frame['exitCode'], 0)
        self.assertEqual(frame['gpio'][0]['FIOPIN'], 0xA60)

    def test_all_bundled_c_examples_compile_and_run(self):
        for path in (ROOT / 'examples').glob('*.c'):
            with self.subTest(path=path.name):
                engine, hex_text, _ = compile_source(path.read_text())
                self.assertNotIn('__SIM_META__', hex_text)
                for _ in range(30):
                    self.assertIsNone(engine.step()['error'])

    def test_true_hex_round_trip(self):
        engine, hex_text, _ = compile_source('#include <LPC17xx.h>\nint main(void){LPC_GPIO0->FIODIR=0xff0; LPC_GPIO0->FIOSET=0x650;return 0;}')
        from_hex = load_hex(hex_text)
        self.assertEqual(run_to_end(engine)['gpio'], run_to_end(from_hex)['gpio'])
        damaged = hex_text.replace(':', ':FF', 1)
        with self.assertRaisesRegex(ValueError, 'length or checksum'):
            load_hex(damaged)
        with self.assertRaises(ValueError):
            load_hex(':00000001FF')

    def test_diagnostics(self):
        for source, match in [('int main(void) { invalid syntax; }', 'program.c:1:'), ('void foo(void) {}', 'main'), ('#include "missing.h"\nint main() {}', 'missing.h')]:
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, match):
                compile_source(source)

    def test_infinite_loops_are_bounded(self):
        engine, _, _ = compile_source('int main(void) { while(1); }')
        for _ in range(5):
            frame = engine.step(count=1000)
            self.assertFalse(frame['halted'])

    def test_input_switch_and_adc(self):
        source = '''#include <LPC17xx.h>
int main(void){
 LPC_GPIO0->FIODIR=0xff0;
 LPC_ADC->ADCR=(1<<5)|(1<<21)|(1<<24);
 while(!(LPC_ADC->ADGDR & 0x80000000));
 LPC_GPIO0->FIOPIN=(LPC_ADC->ADGDR >> 4)&0xff0;
 return (LPC_GPIO2->FIOPIN & (1<<12)) ? 12 : 0;
}'''
        engine, _, _ = compile_source(source)
        frame = run_to_end(engine, {'pot1Voltage':3.3, 'sw2Pressed':True, 'cables':{'CNB':'CNB1'}})
        self.assertEqual(frame['exitCode'],12)
        self.assertEqual(frame['gpio'][0]['FIOPIN'],0xff0)

    def test_gpio_mask_and_byte_access(self):
        source='''#include <LPC17xx.h>
int main(void) {
 LPC_GPIO0->FIODIR=0xffff;
 LPC_GPIO0->FIOMASK=0x00f0;
 LPC_GPIO0->FIOSET=0xffff;
 LPC_GPIO0->FIOCLR=0x0f00;
 LPC_GPIO0->FIOPIN0=0x55;
 return 0;
}'''
        engine,_,_=compile_source(source)
        frame=run_to_end(engine)
        self.assertEqual(frame['gpio'][0]['FIOPIN'],0xf005)

    def test_keypad_live_row_scan(self):
        source='''#include <LPC17xx.h>
int main(void) {
 LPC_GPIO2->FIODIR=0x3c00;
 LPC_GPIO2->FIOSET=1<<11;
 return (LPC_GPIO1->FIOPIN >> 23) & 15;
}'''
        engine,_,_=compile_source(source)
        frame=run_to_end(engine, {'cables':{'CNB':'CNB3'},'jumpers':{'JP4':True},'activeKey':{'row':1,'col':2}})
        self.assertEqual(frame['exitCode'],4)

    def test_pwm_irq_executes(self):
        engine,_,_=compile_source((ROOT/'examples/c_lab11_pwm.c').read_text())
        for _ in range(10):
            frame=engine.step()
            self.assertIsNone(frame['error'])
        self.assertGreater(engine.registers[0x40018040], 256)

    def test_memory_fault_is_reported(self):
        engine,_,_=compile_source('int main(void) { *(volatile unsigned int *)0xDEAD0000=1; return 0; }')
        frame=engine.step()
        self.assertTrue(frame['halted'])
        self.assertIn('CPU fault',frame['error'])

    def test_printf_float_and_string(self):
        engine,_,_=compile_source('#include <stdio.h>\nint main(void){printf("value=%0.2f, %s\\n", 1.65, "OK");return 0;}')
        output=''
        for _ in range(100):
            frame=engine.step()
            self.assertIsNone(frame['error'])
            output+=frame['output']
            if frame['halted']: break
        self.assertIn('value=1.65, OK',output)


if __name__ == '__main__':
    unittest.main()
