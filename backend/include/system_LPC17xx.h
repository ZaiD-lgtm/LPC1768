#ifndef SIM_SYSTEM_LPC17XX_H
#define SIM_SYSTEM_LPC17XX_H
#include <stdint.h>
extern uint32_t SystemCoreClock;
void SystemInit(void);
void SystemCoreClockUpdate(void);
#endif
