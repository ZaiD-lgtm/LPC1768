#include <LPC17xx.h>
#include <stddef.h>
#include <sys/types.h>
#include <errno.h>

uint32_t SystemCoreClock = 100000000;
void SystemInit(void) {}
void SystemCoreClockUpdate(void) {}
__attribute__((weak)) unsigned long temp1;
__attribute__((weak)) void delay_lcd(unsigned int cycles) { for (volatile unsigned int i=0; i<cycles; ++i) __NOP(); }
__attribute__((weak)) void delay_ms(unsigned int ms) { while(ms--) delay_lcd(1000); }
static void nibble(unsigned int value, int data) {
    LPC_GPIO0->FIOCLR = 0x1F800000;
    LPC_GPIO0->FIOSET = (value << 23) | (data ? 1u << 27 : 0);
    LPC_GPIO0->FIOSET = 1u << 28;
    LPC_GPIO0->FIOCLR = 1u << 28;
}
static void lcd_byte(unsigned int value, int data) { nibble((value >> 4) & 15, data); nibble(value & 15, data); }
__attribute__((weak)) void lcd_com(void) { lcd_byte(temp1, 0); }
__attribute__((weak)) void lcd_data(void) { lcd_byte(temp1, 1); }
__attribute__((weak)) void lcd_puts(const unsigned char *text) { while (*text) lcd_byte(*text++, 1); }
__attribute__((weak)) void lcd_init(void) {
    LPC_GPIO0->FIODIR |= 0x1F800000;
    nibble(3, 0); nibble(3, 0); nibble(3, 0); nibble(2, 0);
    lcd_byte(0x28, 0); lcd_byte(0x0C, 0); lcd_byte(0x06, 0); lcd_byte(0x01, 0); lcd_byte(0x80, 0);
}
// Newlib calls stay inside the emulator: no host filesystem or process access.
extern char _end;
void *_sbrk(ptrdiff_t size) {
    static char *end = &_end;
    char *old = end;
    if (size < 0 || end + size > (char *)0x10006000) { errno = ENOMEM; return (void *)-1; }
    end += size; return old;
}
int _write(int fd, const void *buf, size_t len) {
    (void)fd; const char *p = buf;
    for (size_t i=0; i<len; i++) *(volatile unsigned int *)0x400FCFFC = (unsigned char)p[i];
    return len;
}
int _read(int fd, void *buf, size_t len) { (void)fd; (void)buf; (void)len; return 0; }
int _close(int fd) { (void)fd; return -1; }
int _fstat(int fd, void *st) { (void)fd; (void)st; return -1; }
int _isatty(int fd) { (void)fd; return 1; }
int _lseek(int fd, int offset, int whence) { (void)fd; (void)offset; (void)whence; return 0; }
int _getpid(void) { return 1; }
int _kill(int pid, int sig) { (void)pid; (void)sig; return -1; }
__attribute__((noreturn)) void _exit(int code) { *(volatile unsigned int *)0x400FCFF8 = code; for (;;) {} }
extern int main(void);
extern unsigned int _sidata, _sdata, _edata, _sbss, _ebss;
void Reset_Handler(void) {
    unsigned int *src = &_sidata;
    for (unsigned int *dst = &_sdata; dst < &_edata;) *dst++ = *src++;
    for (unsigned int *dst = &_sbss; dst < &_ebss;) *dst++ = 0;
    _exit(main());
}
void Default_Handler(void) {}
void PWM1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
__attribute__((section(".vectors"), used)) const uintptr_t vectors[51] = {
    [0] = 0x10008000, [1] = (uintptr_t)Reset_Handler, [16 + 9] = (uintptr_t)PWM1_IRQHandler
};
