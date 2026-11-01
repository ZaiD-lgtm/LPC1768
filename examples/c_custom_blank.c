// WRITE ANY CUSTOM LPC1768 EMBEDDED C PROGRAM HERE!
#include <LPC17xx.h>
#include "AN_LCD.h"

unsigned int k = 0, d;
unsigned char banner[] = {"CUSTOM C RUNNING"};

int main(void)
{
    SystemInit();
    // 1. Setup P0.4-P0.11 (CNA) as GPIO Outputs
    LPC_GPIO0->FIODIR |= 0x00000FF0;

    // 2. Initialize 16x2 LCD (CND -> CNAD)
    lcd_init();
    temp1 = 0x80; lcd_com();
    lcd_puts(banner);

    // 3. Alternating pattern on LD1-LD8
    while(1)
    {
        if (k % 2 == 0) {
            LPC_GPIO0->FIOPIN = (0xAA << 4);
        } else {
            LPC_GPIO0->FIOPIN = (0x55 << 4);
        }
        k++;
        for(d = 0; d < 10000; d++);
    }
}
