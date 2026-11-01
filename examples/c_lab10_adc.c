// Lab 10: 12-Bit Internal ADC (AD0.5 on P1.31) with AN_LCD.h
#include <LPC17xx.h>
#include <stdio.h>
#include "AN_LCD.h"

#define Ref_Vtg 3.300
#define Full_Scale 0xFFF

int main(void)
{
    unsigned long adc_temp;
    unsigned int i;
    float in_vtg;
    unsigned char vtg[7], dval[7];
    unsigned char Msg3[11] = {"ANALOG IP:"};
    unsigned char Msg4[12] = {"ADC OUTPUT:"};

    SystemInit();
    SystemCoreClockUpdate();

    LPC_SC->PCONP |= (1 << 15); // Power for GPIO block
    lcd_init();
    LPC_PINCON->PINSEL3 |= 0xC0000000; // P1.31 as AD0.5
    LPC_SC->PCONP |= (1 << 12); // Enable peripheral ADC

    // Also enable P0.4-P0.11 LEDs to show upper 8 bits of ADC!
    LPC_GPIO0->FIODIR |= 0x00000FF0;

    temp1 = 0x80;
    lcd_com();
    delay_lcd(800);
    lcd_puts(&Msg3[0]);

    temp1 = 0xC0;
    lcd_com();
    delay_lcd(800);
    lcd_puts(&Msg4[0]);

    while(1)
    {
        // Start AD0.5 conversion (bit 5 = ch5, bit 21 = PDN, bit 24 = START)
        LPC_ADC->ADCR = (1 << 5) | (1 << 21) | (1 << 24);
        while((LPC_ADC->ADGDR & 0x80000000) == 0); // Wait till DONE bit 31 is 1

        adc_temp = LPC_ADC->ADGDR;
        adc_temp >>= 4;
        adc_temp &= 0x00000FFF;

        // Output upper 8 bits to CNA LEDs (P0.4-P0.11)
        LPC_GPIO0->FIOPIN = ((adc_temp >> 4) << 4);

        in_vtg = (((float)adc_temp * (float)Ref_Vtg)) / ((float)Full_Scale);
        sprintf(vtg, "%3.2fV", in_vtg);
        sprintf(dval, "%03X", adc_temp);

        temp1 = 0x8A;
        lcd_com();
        delay_lcd(800);
        lcd_puts(&vtg[0]);

        temp1 = 0xCB;
        lcd_com();
        delay_lcd(800);
        lcd_puts(&dval[0]);

        for(i = 0; i < 8000; i++);
    }
}
