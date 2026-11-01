// LIVE EXECUTABLE EMBEDDED C — Edit anything and click "Compile & Run (F7)"!
#include <LPC17xx.h>

unsigned int i, j;
unsigned long LED = 0x00000010;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFF0000FF; // Configure P0.4-P0.11 as GPIO
    LPC_GPIO0->FIODIR   |= 0x00000FF0; // Configure P0.4-P0.11 as Output

    while(1)
    {
        LED = 0x00000010; // Start at P0.4 (LD1)
        for(i = 1; i < 9; i++) // Turn ON LEDs serially
        {
            LPC_GPIO0->FIOSET = LED;
            for(j = 0; j < 10000; j++); // Delay loop
            LED <<= 1;
        }

        LED = 0x00000010;
        for(i = 1; i < 9; i++) // Turn OFF LEDs serially
        {
            LPC_GPIO0->FIOCLR = LED;
            for(j = 0; j < 10000; j++); // Delay loop
            LED <<= 1;
        }
    }
}
