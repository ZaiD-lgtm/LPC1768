#ifndef SIM_AN_LCD_H
#define SIM_AN_LCD_H
extern unsigned long temp1;
void lcd_init(void);
void lcd_com(void);
void lcd_data(void);
void lcd_puts(const unsigned char *text);
void delay_lcd(unsigned int cycles);
void delay_ms(unsigned int ms);
#endif
