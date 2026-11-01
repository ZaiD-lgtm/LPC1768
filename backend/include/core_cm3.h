/* Simulator CMSIS subset. Peripheral layout comes from NXP's LPC17xx.h. */
#ifndef SIM_CORE_CM3_H
#define SIM_CORE_CM3_H
#include <stdint.h>
#define __I volatile const
#define __O volatile
#define __IO volatile
#define __NOP() __asm volatile ("nop")
#define __WFI() __asm volatile ("nop")
static inline void NVIC_EnableIRQ(IRQn_Type irq) { *(volatile uint32_t *)0xE000E100 |= 1u << irq; }
static inline void NVIC_DisableIRQ(IRQn_Type irq) { *(volatile uint32_t *)0xE000E180 = 1u << irq; }
static inline void __enable_irq(void) { __asm volatile ("cpsie i"); }
static inline void __disable_irq(void) { __asm volatile ("cpsid i"); }
#endif
