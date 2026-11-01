export const LAB_TEMPLATES = [
  {
    id: 'c_lab7_chaser',
    mode: 'c',
    labNo: 'Lab 6 & 7 (C)',
    title: 'Serial LED Chaser (LPC_GPIO0->FIOSET/FIOCLR)',
    cables: { CNA: 'CNA1', CNB: 'CNB1' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// LIVE EXECUTABLE EMBEDDED C — Edit anything and click "Compile & Run (F7)"!
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
}`
  },
  {
    id: 'c_lab7_updown',
    mode: 'c',
    labNo: 'Lab 7 Ex 2 (C)',
    title: '8-Bit Binary Up/Down Counter with SW2 (P2.12)',
    cables: { CNA: 'CNA1', CNB: 'CNB1' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// Lab 7 Ex 2: 8-Bit Up/Down Counter controlled by SW2 (CNB1 Pin 7 -> P2.12)
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
}`
  },
  {
    id: 'c_lab8_7seg',
    mode: 'c',
    labNo: 'Lab 8 (C)',
    title: 'Multiplexed 4-Digit 7-Segment BCD Counter',
    cables: { CNA: 'CNA2', CNB: 'CNB2' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// Lab 8: Real Multiplexed 7-Segment BCD Up Counter (CNA->CNA2, CNB->CNB2)
#include <LPC17xx.h>

#define FIRST_SEG   0xF87FFFFF
#define SECOND_SEG  0xF8FFFFFF
#define THIRD_SEG   0xF97FFFFF
#define FOURTH_SEG  0xF9FFFFFF
#define DISABLE_ALL 0xFA7FFFFF

unsigned int dig1 = 0x00, dig2 = 0x00, dig3 = 0x00, dig4 = 0x00;
unsigned int twenty_count = 0x00, dig_count = 0x00, temp1 = 0x00;
unsigned char array_dec[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
unsigned char one_sec_flg = 0x00;
unsigned long int temp2 = 0x00000000, i = 0;

void Delay(void)
{
    for(i = 0; i < 500; i++);
    if (twenty_count == 12) {
        one_sec_flg = 0xFF;
        twenty_count = 0x00;
    } else {
        twenty_count += 1;
    }
}

void Display(void)
{
    if (dig_count == 0x01) {
        temp1 = dig1;
        LPC_GPIO1->FIOPIN = FIRST_SEG;
    } else if (dig_count == 0x02) {
        temp1 = dig2;
        LPC_GPIO1->FIOPIN = SECOND_SEG;
    } else if (dig_count == 0x03) {
        temp1 = dig3;
        LPC_GPIO1->FIOPIN = THIRD_SEG;
    } else if (dig_count == 0x04) {
        temp1 = dig4;
        LPC_GPIO1->FIOPIN = FOURTH_SEG;
    }
    temp1 &= 0x0F;
    temp2 = array_dec[temp1];
    temp2 = temp2 << 4;
    LPC_GPIO0->FIOPIN = temp2;
    for(i = 0; i < 500; i++);
    LPC_GPIO0->FIOCLR = 0x00000FF0;
    LPC_GPIO1->FIOPIN = DISABLE_ALL;
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFF0000FF; // P0.4 to P0.11 Data Lines
    LPC_PINCON->PINSEL3 &= 0xFFC03FFF; // P1.23 to P1.26 Enable Lines
    LPC_GPIO0->FIODIR   |= 0x00000FF0;
    LPC_GPIO1->FIODIR   |= 0x07800000;

    while(1)
    {
        Delay();
        dig_count += 1;
        if (dig_count == 0x05) {
            dig_count = 0x01;
        }
        if (one_sec_flg == 0xFF) {
            one_sec_flg = 0x00;
            dig1 += 1;
            if (dig1 == 0x0A) {
                dig1 = 0;
                dig2 += 1;
                if (dig2 == 0x0A) {
                    dig2 = 0;
                    dig3 += 1;
                    if (dig3 == 0x0A) {
                        dig3 = 0;
                        dig4 += 1;
                        if (dig4 == 0x0A) {
                            dig4 = 0;
                        }
                    }
                }
            }
        }
        Display();
    }
}`
  },
  {
    id: 'c_lab9_lcd',
    mode: 'c',
    labNo: 'Lab 9 (C)',
    title: '16x2 LCD 4-Bit Nibble Driver & Matrix Keypad Scan',
    cables: { CND: 'CNAD', CNB: 'CNB3' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// Lab 9: Real 4-Bit HD44780 LCD Nibble Protocol + 4x4 Keypad Matrix Scanner
#include <LPC17xx.h>

#define RS_CTRL 0x08000000 // P0.27 (CNAD Pin 5)
#define EN_CTRL 0x10000000 // P0.28 (CNAD Pin 6)
#define DT_CTRL 0x07800000 // P0.23 to P0.26 (CNAD Pins 1-4 -> D4-D7)

unsigned long int temp1 = 0, temp2 = 0, i, r;
unsigned char flag1 = 0, flag2 = 0;
unsigned char msg[] = {"MIT ICT3143 LAB"};
unsigned long int init_command[] = {0x30, 0x30, 0x30, 0x20, 0x28, 0x0C, 0x06, 0x01, 0x80};

unsigned char row, col, flag;
unsigned long int var1, temp3;
unsigned char hex_chars[] = {"0123456789ABCDEF"};

void delay_lcd(unsigned int r1) {
    for(r = 0; r < r1; r++);
}

void port_write(void) {
    LPC_GPIO0->FIOPIN = temp2;
    if (flag1 == 0)
        LPC_GPIO0->FIOCLR = RS_CTRL;
    else
        LPC_GPIO0->FIOSET = RS_CTRL;

    LPC_GPIO0->FIOSET = EN_CTRL;
    delay_lcd(25);
    LPC_GPIO0->FIOCLR = EN_CTRL;
    delay_lcd(500);
}

void lcd_write(void) {
    flag2 = (flag1 == 1) ? 0 : ((temp1 == 0x30) || (temp1 == 0x20)) ? 1 : 0;
    temp2 = temp1 & 0xF0;
    temp2 = temp2 << 19;
    port_write();
    if (flag2 == 0) {
        temp2 = temp1 & 0x0F;
        temp2 = temp2 << 23;
        port_write();
    }
}

void scan(void) {
    temp3 = LPC_GPIO1->FIOPIN;
    temp3 &= 0x07800000; // Read Cols P1.23 - P1.26
    if (temp3 != 0x00000000) {
        flag = 1;
        if (temp3 == 0x00800000) col = 0;
        else if (temp3 == 0x01000000) col = 1;
        else if (temp3 == 0x02000000) col = 2;
        else if (temp3 == 0x04000000) col = 3;
    }
}

int main(void) {
    SystemInit();
    SystemCoreClockUpdate();

    // Configure LCD Pins P0.23 - P0.28 as Output
    LPC_GPIO0->FIODIR |= DT_CTRL | RS_CTRL | EN_CTRL;

    // Configure Keypad Rows (P2.10-P2.13) as Output, Cols (P1.23-P1.26) as Input
    LPC_GPIO2->FIODIR |= 0x00003C00;
    LPC_GPIO1->FIODIR &= 0xF87FFFFF;

    flag1 = 0; // Command Mode
    for(i = 0; i < 9; i++) {
        temp1 = init_command[i];
        lcd_write();
    }

    flag1 = 1; // Data Mode
    i = 0;
    while (msg[i] != '\\0') {
        temp1 = msg[i];
        lcd_write();
        i += 1;
    }

    // Move cursor to Line 2 (0xC0) and display "KEY PRESSED: "
    flag1 = 0; temp1 = 0xC0; lcd_write();
    flag1 = 1;
    temp1 = 'K'; lcd_write();
    temp1 = 'E'; lcd_write();
    temp1 = 'Y'; lcd_write();
    temp1 = ':'; lcd_write();
    temp1 = ' '; lcd_write();

    while(1) {
        for(row = 1; row < 5; row++) {
            if (row == 1) var1 = 0x00000400;      // P2.10 (ROW1)
            else if (row == 2) var1 = 0x00000800; // P2.11 (ROW2)
            else if (row == 3) var1 = 0x00001000; // P2.12 (ROW3)
            else if (row == 4) var1 = 0x00002000; // P2.13 (ROW4)

            LPC_GPIO2->FIOCLR = 0x00003C00;
            LPC_GPIO2->FIOSET = var1;
            flag = 0;
            scan();
            if (flag == 1) {
                flag1 = 0; temp1 = 0xC5; lcd_write(); // Cursor at Line 2 Pos 5
                flag1 = 1;
                temp1 = hex_chars[(row - 1) * 4 + col];
                lcd_write();
                break;
            }
        }
        delay_lcd(2000);
    }
}`
  },
  {
    id: 'c_lab10_adc',
    mode: 'c',
    labNo: 'Lab 10 (C)',
    title: '12-Bit ADC (AD0.5 / POT1) to LCD via AN_LCD.h',
    cables: { CND: 'CNAD', CNA: 'CNA1' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// Lab 10: 12-Bit Internal ADC (AD0.5 on P1.31) with AN_LCD.h
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
}`
  },
  {
    id: 'c_lab11_pwm',
    mode: 'c',
    labNo: 'Lab 11 (C)',
    title: 'PWM1.4 Hardware Interrupt Dimmer (LD10 & TP5/TP6)',
    cables: { CNB: 'CNB1', CNA: 'CNA1' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// Lab 11: PWM1.4 Intensity Variation on P1.23 (LD10) using PWM1_IRQHandler
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
}`
  },
  {
    id: 'asm_lab1_5',
    mode: 'asm',
    labNo: 'Labs 1–5 (ASM)',
    title: 'ARM Cortex-M3 Assembly: Bubble Sort + GPIO LED Output',
    cables: { CNA: 'CNA1', CNB: 'CNB1' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `; LIVE ARMv7-M ASSEMBLY ENGINE (Labs 1 to 5 + Hardware MMIO!)
; Step line-by-line (F11) or Run (F5) and inspect R0-R15, CPSR flags, & Memory!
    AREA RESET, DATA, READONLY
    EXPORT __Vectors
__Vectors
    DCD 0x10001000      ; Stack pointer value when stack is empty
    DCD Reset_Handler   ; Reset vector
    ALIGN

    AREA mycode, CODE, READONLY
    ENTRY
    EXPORT Reset_Handler

Reset_Handler
    ; 1. Configure P0.4-P0.11 (GPIO0 FIODIR = 0x2009C000) as Output
    LDR R10, =0x2009C000
    MOV R11, #0xFF0
    STR R11, [R10]

    ; 2. Copy 6 numbers from Flash (LIST) to SRAM (RESULT = 0x10000000)
    MOV R4, #0
    MOV R1, #6
    LDR R0, =LIST
    LDR R2, =RESULT
COPY_LOOP
    LDR R3, [R0, R4]
    STR R3, [R2, R4]
    ADD R4, R4, #4
    SUBS R1, R1, #1
    BNE COPY_LOOP

    ; 3. Bubble Sort in SRAM (0x10000000) and display current value on LEDs!
    LDR R0, =RESULT
    MOV R3, #5          ; n - 1 passes
OUTER_LOOP
    MOV R5, R0
    MOV R4, R3
INNER_LOOP
    LDR R6, [R5], #4
    LDR R7, [R5]
    CMP R7, R6
    STRLS R6, [R5]
    STRLS R7, [R5, #-4]
    ; Output lower byte of R6 shifted by 4 to GPIO0 FIOPIN (0x2009C014)
    LSL R8, R6, #4
    STR R8, [R10, #0x14]
    SUBS R4, R4, #1
    BNE INNER_LOOP
    SUBS R3, R3, #1
    BNE OUTER_LOOP

STOP
    B STOP

LIST DCD 0x55, 0x0F, 0xAA, 0x03, 0xF0, 0x12

    AREA data1, DATA, READWRITE
RESULT DCD 0, 0, 0, 0, 0, 0
    END`
  },
  {
    id: 'c_custom_blank',
    mode: 'c',
    labNo: 'Custom C',
    title: 'Blank Custom Embedded C Playground (LPC17xx.h)',
    cables: { CNA: 'CNA1', CNB: 'CNB1', CND: 'CNAD' },
    jumpers: { JP3: false, SW21: false, JP4: true, JP5: true, JP16: true, JP18: true },
    code: `// WRITE ANY CUSTOM LPC1768 EMBEDDED C PROGRAM HERE!
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
}`
  }
];
