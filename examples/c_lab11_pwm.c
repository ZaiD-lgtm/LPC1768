// Lab 11: PWM1.4 Intensity Variation on P1.23 (LD10) using PWM1_IRQHandler
#include <LPC17xx.h>

unsigned long int i;
unsigned char flag = 0x00, flag1 = 0x00;

void pwm_init(void)
{
    LPC_SC->PCONP |= (1 << 6);            // PWM1 is powered
    LPC_PINCON->PINSEL3 &= ~(0x0000C000);
    LPC_PINCON->PINSEL3 |= 0x00008000;    // PWM1.4 selected on P1.23
    LPC_PWM1->PCR = 0x00001000;           // Enable PWM1.4 single edge
    LPC_PWM1->MCR = 0x00000003;           // Reset & interrupt on PWMMR0
    LPC_PWM1->MR0 = 30000;                // Setup match register 0 period
    LPC_PWM1->MR4 = 0x00000100;           // Initial duty cycle
    LPC_PWM1->LER = 0x000000FF;           // Enable shadow copy register
    LPC_PWM1->TCR = 0x00000002;           // Reset counter and prescaler
    LPC_PWM1->TCR = 0x00000009;           // Enable PWM and counter
    NVIC_EnableIRQ(PWM1_IRQn);
}

void PWM1_IRQHandler(void)
{
    LPC_PWM1->IR = 0xFF; // Clear interrupts
    if (flag == 0x00) {
        LPC_PWM1->MR4 += 1500;
        LPC_PWM1->LER = 0x000000FF;
        if (LPC_PWM1->MR4 >= 27000) {
            flag1 = 0xFF;
            flag = 0xFF;
            LPC_PWM1->LER = 0x000000FF;
        }
    } else if (flag1 == 0xFF) {
        LPC_PWM1->MR4 -= 1500;
        LPC_PWM1->LER = 0x000000FF;
        if (LPC_PWM1->MR4 <= 1500) {
            flag = 0x00;
            flag1 = 0x00;
            LPC_PWM1->LER = 0x000000FF;
        }
    }
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    pwm_init();
    while(1) {
        for(i = 0; i <= 1000; i++);
    }
}
