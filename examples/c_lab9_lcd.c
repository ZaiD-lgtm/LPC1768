// Lab 9: Real 4-Bit HD44780 LCD Nibble Protocol + 4x4 Keypad Matrix Scanner
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
    while (msg[i] != '\0') {
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
}
