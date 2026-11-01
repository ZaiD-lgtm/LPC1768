// Lab 7 Ex 2: 8-Bit Up/Down Counter controlled by SW2 (CNB1 Pin 7 -> P2.12)
#include <LPC17xx.h>

unsigned int count = 0;
unsigned int j;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFF0000FF; // P0.4 - P0.11 as GPIO
    LPC_GPIO0->FIODIR   |= 0x00000FF0; // P0.4 - P0.11 as Output
    LPC_GPIO2->FIODIR   &= ~(1 << 12); // P2.12 (SW2) as Input

    while(1)
    {
        // Read live pin P2.12 driven by SW2 button on CNB1
        if (LPC_GPIO2->FIOPIN & (1 << 12)) {
            count = (count + 1) & 0xFF; // Up Counter when SW2 = HIGH
        } else {
            count = (count - 1) & 0xFF; // Down Counter when SW2 = LOW
        }

        LPC_GPIO0->FIOCLR = 0x00000FF0;
        LPC_GPIO0->FIOSET = (count << 4);

        for(j = 0; j < 12000; j++);
    }
}
