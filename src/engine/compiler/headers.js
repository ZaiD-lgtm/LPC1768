// Built-in system headers and the C runtime library (compiled together with user code).

const LPC17XX_H = String.raw`
#ifndef __LPC17xx_H__
#define __LPC17xx_H__
#include <stdint.h>

typedef enum IRQn {
  NonMaskableInt_IRQn = -14, MemoryManagement_IRQn = -12, BusFault_IRQn = -11, UsageFault_IRQn = -10,
  SVCall_IRQn = -5, DebugMonitor_IRQn = -4, PendSV_IRQn = -2, SysTick_IRQn = -1,
  WDT_IRQn = 0, TIMER0_IRQn = 1, TIMER1_IRQn = 2, TIMER2_IRQn = 3, TIMER3_IRQn = 4, UART0_IRQn = 5, UART1_IRQn = 6,
  UART2_IRQn = 7, UART3_IRQn = 8, PWM1_IRQn = 9, I2C0_IRQn = 10, I2C1_IRQn = 11, I2C2_IRQn = 12, SPI_IRQn = 13,
  SSP0_IRQn = 14, SSP1_IRQn = 15, PLL0_IRQn = 16, RTC_IRQn = 17, EINT0_IRQn = 18, EINT1_IRQn = 19, EINT2_IRQn = 20,
  EINT3_IRQn = 21, ADC_IRQn = 22, BOD_IRQn = 23, USB_IRQn = 24, CAN_IRQn = 25, DMA_IRQn = 26, I2S_IRQn = 27,
  ENET_IRQn = 28, RIT_IRQn = 29, MCPWM_IRQn = 30, QEI_IRQn = 31, PLL1_IRQn = 32, USBActivity_IRQn = 33, CANActivity_IRQn = 34
} IRQn_Type;

#define __CM3_REV 0x0200
#define __MPU_PRESENT 1
#define __NVIC_PRIO_BITS 5
#define __Vendor_SysTickConfig 0

#include <core_cm3.h>
#include <system_LPC17xx.h>

typedef struct {
  __IO uint32_t FLASHCFG; uint32_t RESERVED0[31];
  __IO uint32_t PLL0CON; __IO uint32_t PLL0CFG; __I uint32_t PLL0STAT; __O uint32_t PLL0FEED; uint32_t RESERVED1[4];
  __IO uint32_t PLL1CON; __IO uint32_t PLL1CFG; __I uint32_t PLL1STAT; __O uint32_t PLL1FEED; uint32_t RESERVED2[4];
  __IO uint32_t PCON; __IO uint32_t PCONP; uint32_t RESERVED3[15];
  __IO uint32_t CCLKCFG; __IO uint32_t USBCLKCFG; __IO uint32_t CLKSRCSEL; __IO uint32_t CANSLEEPCLR; __IO uint32_t CANWAKEFLAGS; uint32_t RESERVED4[10];
  __IO uint32_t EXTINT; uint32_t RESERVED5; __IO uint32_t EXTMODE; __IO uint32_t EXTPOLAR; uint32_t RESERVED6[12];
  __IO uint32_t RSID; uint32_t RESERVED7[7];
  __IO uint32_t SCS; __IO uint32_t IRCTRIM; __IO uint32_t PCLKSEL0; __IO uint32_t PCLKSEL1; uint32_t RESERVED8[4];
  __IO uint32_t USBIntSt; __IO uint32_t DMAREQSEL; __IO uint32_t CLKOUTCFG;
} LPC_SC_TypeDef;

typedef struct {
  __IO uint32_t PINSEL0; __IO uint32_t PINSEL1; __IO uint32_t PINSEL2; __IO uint32_t PINSEL3; __IO uint32_t PINSEL4; __IO uint32_t PINSEL5;
  __IO uint32_t PINSEL6; __IO uint32_t PINSEL7; __IO uint32_t PINSEL8; __IO uint32_t PINSEL9; __IO uint32_t PINSEL10; uint32_t RESERVED0[5];
  __IO uint32_t PINMODE0; __IO uint32_t PINMODE1; __IO uint32_t PINMODE2; __IO uint32_t PINMODE3; __IO uint32_t PINMODE4;
  __IO uint32_t PINMODE5; __IO uint32_t PINMODE6; __IO uint32_t PINMODE7; __IO uint32_t PINMODE8; __IO uint32_t PINMODE9;
  __IO uint32_t PINMODE_OD0; __IO uint32_t PINMODE_OD1; __IO uint32_t PINMODE_OD2; __IO uint32_t PINMODE_OD3; __IO uint32_t PINMODE_OD4;
  __IO uint32_t I2CPADCFG;
} LPC_PINCON_TypeDef;

typedef struct {
  union { __IO uint32_t FIODIR; struct { __IO uint16_t FIODIRL; __IO uint16_t FIODIRH; }; struct { __IO uint8_t FIODIR0; __IO uint8_t FIODIR1; __IO uint8_t FIODIR2; __IO uint8_t FIODIR3; }; };
  uint32_t RESERVED0[3];
  union { __IO uint32_t FIOMASK; struct { __IO uint16_t FIOMASKL; __IO uint16_t FIOMASKH; }; struct { __IO uint8_t FIOMASK0; __IO uint8_t FIOMASK1; __IO uint8_t FIOMASK2; __IO uint8_t FIOMASK3; }; };
  union { __IO uint32_t FIOPIN; struct { __IO uint16_t FIOPINL; __IO uint16_t FIOPINH; }; struct { __IO uint8_t FIOPIN0; __IO uint8_t FIOPIN1; __IO uint8_t FIOPIN2; __IO uint8_t FIOPIN3; }; };
  union { __IO uint32_t FIOSET; struct { __IO uint16_t FIOSETL; __IO uint16_t FIOSETH; }; struct { __IO uint8_t FIOSET0; __IO uint8_t FIOSET1; __IO uint8_t FIOSET2; __IO uint8_t FIOSET3; }; };
  union { __O uint32_t FIOCLR; struct { __O uint16_t FIOCLRL; __O uint16_t FIOCLRH; }; struct { __O uint8_t FIOCLR0; __O uint8_t FIOCLR1; __O uint8_t FIOCLR2; __O uint8_t FIOCLR3; }; };
} LPC_GPIO_TypeDef;

typedef struct {
  __I uint32_t IntStatus; __I uint32_t IO0IntStatR; __I uint32_t IO0IntStatF; __O uint32_t IO0IntClr; __IO uint32_t IO0IntEnR; __IO uint32_t IO0IntEnF;
  uint32_t RESERVED0[3];
  __I uint32_t IO2IntStatR; __I uint32_t IO2IntStatF; __O uint32_t IO2IntClr; __IO uint32_t IO2IntEnR; __IO uint32_t IO2IntEnF;
} LPC_GPIOINT_TypeDef;

typedef struct {
  __IO uint32_t IR; __IO uint32_t TCR; __IO uint32_t TC; __IO uint32_t PR; __IO uint32_t PC; __IO uint32_t MCR;
  __IO uint32_t MR0; __IO uint32_t MR1; __IO uint32_t MR2; __IO uint32_t MR3; __IO uint32_t CCR; __I uint32_t CR0; __I uint32_t CR1;
  uint32_t RESERVED0[2]; __IO uint32_t EMR; uint32_t RESERVED1[12]; __IO uint32_t CTCR;
} LPC_TIM_TypeDef;

typedef struct {
  __IO uint32_t IR; __IO uint32_t TCR; __IO uint32_t TC; __IO uint32_t PR; __IO uint32_t PC; __IO uint32_t MCR;
  __IO uint32_t MR0; __IO uint32_t MR1; __IO uint32_t MR2; __IO uint32_t MR3; __IO uint32_t CCR;
  __I uint32_t CR0; __I uint32_t CR1; __I uint32_t CR2; __I uint32_t CR3; uint32_t RESERVED0;
  __IO uint32_t MR4; __IO uint32_t MR5; __IO uint32_t MR6; __IO uint32_t PCR; __IO uint32_t LER; uint32_t RESERVED1[7]; __IO uint32_t CTCR;
} LPC_PWM_TypeDef;

typedef struct {
  union { __I uint8_t RBR; __O uint8_t THR; __IO uint8_t DLL; uint32_t RESERVED0; };
  union { __IO uint8_t DLM; __IO uint32_t IER; };
  union { __I uint32_t IIR; __O uint8_t FCR; };
  __IO uint8_t LCR; uint8_t RESERVED1[7];
  __I uint8_t LSR; uint8_t RESERVED2[7];
  __IO uint8_t SCR; uint8_t RESERVED3[3];
  __IO uint32_t ACR; __IO uint8_t ICR; uint8_t RESERVED4[3];
  __IO uint8_t FDR; uint8_t RESERVED5[7];
  __IO uint8_t TER; uint8_t RESERVED6[39];
  __I uint8_t FIFOLVL;
} LPC_UART_TypeDef;

typedef struct {
  union { __I uint8_t RBR; __O uint8_t THR; __IO uint8_t DLL; uint32_t RESERVED0; };
  union { __IO uint8_t DLM; __IO uint32_t IER; };
  union { __I uint32_t IIR; __O uint8_t FCR; };
  __IO uint8_t LCR; uint8_t RESERVED1[3];
  __IO uint8_t MCR; uint8_t RESERVED2[3];
  __I uint8_t LSR; uint8_t RESERVED3[3];
  __I uint8_t MSR; uint8_t RESERVED4[3];
  __IO uint8_t SCR; uint8_t RESERVED5[3];
  __IO uint32_t ACR; uint32_t RESERVED6;
  __IO uint32_t FDR; uint32_t RESERVED7;
  __IO uint8_t TER; uint8_t RESERVED8[27];
  __IO uint8_t RS485CTRL; uint8_t RESERVED9[3];
  __IO uint8_t ADRMATCH; uint8_t RESERVED10[3];
  __IO uint8_t RS485DLY; uint8_t RESERVED11[3];
  __I uint8_t FIFOLVL;
} LPC_UART1_TypeDef;

typedef struct {
  __IO uint32_t ADCR; __IO uint32_t ADGDR; uint32_t RESERVED0; __IO uint32_t ADINTEN;
  __I uint32_t ADDR0; __I uint32_t ADDR1; __I uint32_t ADDR2; __I uint32_t ADDR3; __I uint32_t ADDR4; __I uint32_t ADDR5; __I uint32_t ADDR6; __I uint32_t ADDR7;
  __I uint32_t ADSTAT; __IO uint32_t ADTRM;
} LPC_ADC_TypeDef;

typedef struct { __IO uint32_t DACR; __IO uint32_t DACCTRL; __IO uint16_t DACCNTVAL; } LPC_DAC_TypeDef;

typedef struct {
  __IO uint8_t ILR; uint8_t RESERVED0[7]; __IO uint8_t CCR; uint8_t RESERVED1[3]; __IO uint8_t CIIR; uint8_t RESERVED2[3];
  __IO uint8_t AMR; uint8_t RESERVED3[3]; __I uint32_t CTIME0; __I uint32_t CTIME1; __I uint32_t CTIME2;
  __IO uint8_t SEC; uint8_t RESERVED4[3]; __IO uint8_t MIN; uint8_t RESERVED5[3]; __IO uint8_t HOUR; uint8_t RESERVED6[3];
  __IO uint8_t DOM; uint8_t RESERVED7[3]; __IO uint8_t DOW; uint8_t RESERVED8[3]; __IO uint16_t DOY; uint16_t RESERVED9;
  __IO uint8_t MONTH; uint8_t RESERVED10[3]; __IO uint16_t YEAR; uint16_t RESERVED11; __IO uint32_t CALIBRATION;
  __IO uint32_t GPREG0; __IO uint32_t GPREG1; __IO uint32_t GPREG2; __IO uint32_t GPREG3; __IO uint32_t GPREG4;
  __IO uint8_t RTC_AUXEN; uint8_t RESERVED12[3]; __IO uint8_t RTC_AUX; uint8_t RESERVED13[3];
  __IO uint8_t ALSEC; uint8_t RESERVED14[3]; __IO uint8_t ALMIN; uint8_t RESERVED15[3]; __IO uint8_t ALHOUR; uint8_t RESERVED16[3];
  __IO uint8_t ALDOM; uint8_t RESERVED17[3]; __IO uint8_t ALDOW; uint8_t RESERVED18[3]; __IO uint16_t ALDOY; uint16_t RESERVED19;
  __IO uint8_t ALMON; uint8_t RESERVED20[3]; __IO uint16_t ALYEAR; uint16_t RESERVED21;
} LPC_RTC_TypeDef;

typedef struct { __IO uint8_t WDMOD; uint8_t RESERVED0[3]; __IO uint32_t WDTC; __O uint8_t WDFEED; uint8_t RESERVED1[3]; __I uint32_t WDTV; __IO uint32_t WDCLKSEL; } LPC_WDT_TypeDef;

typedef struct {
  __IO uint32_t I2CONSET; __I uint32_t I2STAT; __IO uint32_t I2DAT; __IO uint32_t I2ADR0; __IO uint32_t I2SCLH; __IO uint32_t I2SCLL;
  __O uint32_t I2CONCLR; __IO uint32_t MMCTRL; __IO uint32_t I2ADR1; __IO uint32_t I2ADR2; __IO uint32_t I2ADR3; __I uint32_t I2DATA_BUFFER;
  __IO uint32_t I2MASK0; __IO uint32_t I2MASK1; __IO uint32_t I2MASK2; __IO uint32_t I2MASK3;
} LPC_I2C_TypeDef;

typedef struct { __IO uint32_t SPCR; __I uint32_t SPSR; __IO uint32_t SPDR; __IO uint32_t SPCCR; uint32_t RESERVED0[3]; __IO uint32_t SPINT; } LPC_SPI_TypeDef;
typedef struct { __IO uint32_t CR0; __IO uint32_t CR1; __IO uint32_t DR; __I uint32_t SR; __IO uint32_t CPSR; __IO uint32_t IMSC; __IO uint32_t RIS; __IO uint32_t MIS; __IO uint32_t ICR; __IO uint32_t DMACR; } LPC_SSP_TypeDef;
typedef struct { __IO uint32_t RICOMPVAL; __IO uint32_t RIMASK; __IO uint8_t RICTRL; uint8_t RESERVED0[3]; __IO uint32_t RICOUNTER; } LPC_RIT_TypeDef;

#define LPC_FLASH_BASE (0x00000000UL)
#define LPC_RAM_BASE (0x10000000UL)
#define LPC_GPIO_BASE (0x2009C000UL)
#define LPC_APB0_BASE (0x40000000UL)
#define LPC_APB1_BASE (0x40080000UL)
#define LPC_AHB_BASE (0x50000000UL)
#define LPC_CM3_BASE (0xE0000000UL)

#define LPC_WDT_BASE (LPC_APB0_BASE + 0x00000)
#define LPC_TIM0_BASE (LPC_APB0_BASE + 0x04000)
#define LPC_TIM1_BASE (LPC_APB0_BASE + 0x08000)
#define LPC_UART0_BASE (LPC_APB0_BASE + 0x0C000)
#define LPC_UART1_BASE (LPC_APB0_BASE + 0x10000)
#define LPC_PWM1_BASE (LPC_APB0_BASE + 0x18000)
#define LPC_I2C0_BASE (LPC_APB0_BASE + 0x1C000)
#define LPC_SPI_BASE (LPC_APB0_BASE + 0x20000)
#define LPC_RTC_BASE (LPC_APB0_BASE + 0x24000)
#define LPC_GPIOINT_BASE (LPC_APB0_BASE + 0x28080)
#define LPC_PINCON_BASE (LPC_APB0_BASE + 0x2C000)
#define LPC_SSP1_BASE (LPC_APB0_BASE + 0x30000)
#define LPC_ADC_BASE (LPC_APB0_BASE + 0x34000)
#define LPC_I2C1_BASE (LPC_APB0_BASE + 0x5C000)
#define LPC_SSP0_BASE (LPC_APB1_BASE + 0x08000)
#define LPC_DAC_BASE (LPC_APB1_BASE + 0x0C000)
#define LPC_TIM2_BASE (LPC_APB1_BASE + 0x10000)
#define LPC_TIM3_BASE (LPC_APB1_BASE + 0x14000)
#define LPC_UART2_BASE (LPC_APB1_BASE + 0x18000)
#define LPC_UART3_BASE (LPC_APB1_BASE + 0x1C000)
#define LPC_I2C2_BASE (LPC_APB1_BASE + 0x20000)
#define LPC_RIT_BASE (LPC_APB1_BASE + 0x30000)
#define LPC_SC_BASE (LPC_APB1_BASE + 0x7C000)
#define LPC_GPIO0_BASE (LPC_GPIO_BASE + 0x00000)
#define LPC_GPIO1_BASE (LPC_GPIO_BASE + 0x00020)
#define LPC_GPIO2_BASE (LPC_GPIO_BASE + 0x00040)
#define LPC_GPIO3_BASE (LPC_GPIO_BASE + 0x00060)
#define LPC_GPIO4_BASE (LPC_GPIO_BASE + 0x00080)

#define LPC_SC ((LPC_SC_TypeDef *) LPC_SC_BASE)
#define LPC_GPIO0 ((LPC_GPIO_TypeDef *) LPC_GPIO0_BASE)
#define LPC_GPIO1 ((LPC_GPIO_TypeDef *) LPC_GPIO1_BASE)
#define LPC_GPIO2 ((LPC_GPIO_TypeDef *) LPC_GPIO2_BASE)
#define LPC_GPIO3 ((LPC_GPIO_TypeDef *) LPC_GPIO3_BASE)
#define LPC_GPIO4 ((LPC_GPIO_TypeDef *) LPC_GPIO4_BASE)
#define LPC_WDT ((LPC_WDT_TypeDef *) LPC_WDT_BASE)
#define LPC_TIM0 ((LPC_TIM_TypeDef *) LPC_TIM0_BASE)
#define LPC_TIM1 ((LPC_TIM_TypeDef *) LPC_TIM1_BASE)
#define LPC_TIM2 ((LPC_TIM_TypeDef *) LPC_TIM2_BASE)
#define LPC_TIM3 ((LPC_TIM_TypeDef *) LPC_TIM3_BASE)
#define LPC_UART0 ((LPC_UART_TypeDef *) LPC_UART0_BASE)
#define LPC_UART1 ((LPC_UART1_TypeDef *) LPC_UART1_BASE)
#define LPC_UART2 ((LPC_UART_TypeDef *) LPC_UART2_BASE)
#define LPC_UART3 ((LPC_UART_TypeDef *) LPC_UART3_BASE)
#define LPC_PWM1 ((LPC_PWM_TypeDef *) LPC_PWM1_BASE)
#define LPC_I2C0 ((LPC_I2C_TypeDef *) LPC_I2C0_BASE)
#define LPC_I2C1 ((LPC_I2C_TypeDef *) LPC_I2C1_BASE)
#define LPC_I2C2 ((LPC_I2C_TypeDef *) LPC_I2C2_BASE)
#define LPC_SPI ((LPC_SPI_TypeDef *) LPC_SPI_BASE)
#define LPC_RTC ((LPC_RTC_TypeDef *) LPC_RTC_BASE)
#define LPC_GPIOINT ((LPC_GPIOINT_TypeDef *) LPC_GPIOINT_BASE)
#define LPC_PINCON ((LPC_PINCON_TypeDef *) LPC_PINCON_BASE)
#define LPC_SSP0 ((LPC_SSP_TypeDef *) LPC_SSP0_BASE)
#define LPC_SSP1 ((LPC_SSP_TypeDef *) LPC_SSP1_BASE)
#define LPC_ADC ((LPC_ADC_TypeDef *) LPC_ADC_BASE)
#define LPC_DAC ((LPC_DAC_TypeDef *) LPC_DAC_BASE)
#define LPC_RIT ((LPC_RIT_TypeDef *) LPC_RIT_BASE)
#endif
`;

const CORE_CM3_H = String.raw`
#ifndef __CORE_CM3_H__
#define __CORE_CM3_H__
#include <stdint.h>
#define __I volatile const
#define __O volatile
#define __IO volatile
#define __INLINE inline
#define __STATIC_INLINE static inline
#define __ASM __asm

typedef struct {
  __IO uint32_t ISER[8]; uint32_t RESERVED0[24]; __IO uint32_t ICER[8]; uint32_t RSERVED1[24];
  __IO uint32_t ISPR[8]; uint32_t RESERVED2[24]; __IO uint32_t ICPR[8]; uint32_t RESERVED3[24];
  __IO uint32_t IABR[8]; uint32_t RESERVED4[56]; __IO uint8_t IP[240]; uint32_t RESERVED5[644]; __O uint32_t STIR;
} NVIC_Type;
typedef struct {
  __I uint32_t CPUID; __IO uint32_t ICSR; __IO uint32_t VTOR; __IO uint32_t AIRCR; __IO uint32_t SCR; __IO uint32_t CCR;
  __IO uint8_t SHP[12]; __IO uint32_t SHCSR; __IO uint32_t CFSR; __IO uint32_t HFSR; __IO uint32_t DFSR; __IO uint32_t MMFAR;
  __IO uint32_t BFAR; __IO uint32_t AFSR; __I uint32_t PFR[2]; __I uint32_t DFR; __I uint32_t ADR; __I uint32_t MMFR[4]; __I uint32_t ISAR[5];
} SCB_Type;
typedef struct { __IO uint32_t CTRL; __IO uint32_t LOAD; __IO uint32_t VAL; __I uint32_t CALIB; } SysTick_Type;
typedef struct { __IO uint32_t CTRL; __IO uint32_t CYCCNT; } DWT_Type;

#define SCS_BASE (0xE000E000UL)
#define SysTick_BASE (SCS_BASE + 0x0010UL)
#define NVIC_BASE (SCS_BASE + 0x0100UL)
#define SCB_BASE (SCS_BASE + 0x0D00UL)
#define SCB ((SCB_Type *) SCB_BASE)
#define SysTick ((SysTick_Type *) SysTick_BASE)
#define NVIC ((NVIC_Type *) NVIC_BASE)
#define DWT ((DWT_Type *) 0xE0001000UL)

#define SysTick_CTRL_COUNTFLAG_Msk (1UL << 16)
#define SysTick_CTRL_CLKSOURCE_Msk (1UL << 2)
#define SysTick_CTRL_TICKINT_Msk (1UL << 1)
#define SysTick_CTRL_ENABLE_Msk (1UL << 0)
#define SysTick_LOAD_RELOAD_Msk (0xFFFFFFUL)
#define SCB_AIRCR_VECTKEY_Pos 16
#define SCB_AIRCR_PRIGROUP_Pos 8
#define SCB_AIRCR_PRIGROUP_Msk (7UL << 8)
#define SCB_AIRCR_SYSRESETREQ_Msk (1UL << 2)
#define SCB_SCR_SLEEPONEXIT_Msk (1UL << 1)
#define SCB_SCR_SLEEPDEEP_Msk (1UL << 2)

static inline void NVIC_EnableIRQ(IRQn_Type IRQn) { NVIC->ISER[((uint32_t)(IRQn) >> 5)] = (1UL << ((uint32_t)(IRQn) & 0x1F)); }
static inline void NVIC_DisableIRQ(IRQn_Type IRQn) { NVIC->ICER[((uint32_t)(IRQn) >> 5)] = (1UL << ((uint32_t)(IRQn) & 0x1F)); }
static inline uint32_t NVIC_GetPendingIRQ(IRQn_Type IRQn) { return ((NVIC->ISPR[(uint32_t)(IRQn) >> 5] & (1UL << ((uint32_t)(IRQn) & 0x1F))) ? 1 : 0); }
static inline void NVIC_SetPendingIRQ(IRQn_Type IRQn) { NVIC->ISPR[((uint32_t)(IRQn) >> 5)] = (1UL << ((uint32_t)(IRQn) & 0x1F)); }
static inline void NVIC_ClearPendingIRQ(IRQn_Type IRQn) { NVIC->ICPR[((uint32_t)(IRQn) >> 5)] = (1UL << ((uint32_t)(IRQn) & 0x1F)); }
static inline uint32_t NVIC_GetActive(IRQn_Type IRQn) { return ((NVIC->IABR[(uint32_t)(IRQn) >> 5] & (1UL << ((uint32_t)(IRQn) & 0x1F))) ? 1 : 0); }
static inline void NVIC_SetPriority(IRQn_Type IRQn, uint32_t priority) {
  if (IRQn < 0) SCB->SHP[((uint32_t)(IRQn) & 0xF) - 4] = ((priority << (8 - __NVIC_PRIO_BITS)) & 0xFF);
  else NVIC->IP[(uint32_t)(IRQn)] = ((priority << (8 - __NVIC_PRIO_BITS)) & 0xFF);
}
static inline uint32_t NVIC_GetPriority(IRQn_Type IRQn) {
  if (IRQn < 0) return ((uint32_t)(SCB->SHP[((uint32_t)(IRQn) & 0xF) - 4] >> (8 - __NVIC_PRIO_BITS)));
  return ((uint32_t)(NVIC->IP[(uint32_t)(IRQn)] >> (8 - __NVIC_PRIO_BITS)));
}
static inline void NVIC_SetPriorityGrouping(uint32_t PriorityGroup) {
  uint32_t reg = SCB->AIRCR;
  reg &= ~((0xFFFFUL << 16) | (7UL << 8));
  reg |= (0x5FAUL << 16) | ((PriorityGroup & 7) << 8);
  SCB->AIRCR = reg;
}
static inline uint32_t NVIC_GetPriorityGrouping(void) { return (SCB->AIRCR >> 8) & 7; }
static inline void NVIC_SystemReset(void) { SCB->AIRCR = (0x5FAUL << 16) | (SCB->AIRCR & (7UL << 8)) | (1UL << 2); __DSB(); while (1); }
static inline uint32_t SysTick_Config(uint32_t ticks) {
  if ((ticks - 1) > SysTick_LOAD_RELOAD_Msk) return 1;
  SysTick->LOAD = ticks - 1;
  NVIC_SetPriority(SysTick_IRQn, (1 << __NVIC_PRIO_BITS) - 1);
  SysTick->VAL = 0;
  SysTick->CTRL = SysTick_CTRL_CLKSOURCE_Msk | SysTick_CTRL_TICKINT_Msk | SysTick_CTRL_ENABLE_Msk;
  return 0;
}
#endif
`;

const STDINT_H = String.raw`
#ifndef __STDINT_H
#define __STDINT_H
typedef signed char int8_t; typedef unsigned char uint8_t;
typedef short int16_t; typedef unsigned short uint16_t;
typedef int int32_t; typedef unsigned int uint32_t;
typedef long long int64_t; typedef unsigned long long uint64_t;
typedef int intptr_t; typedef unsigned int uintptr_t;
typedef signed char int_least8_t; typedef unsigned char uint_least8_t; typedef short int_least16_t; typedef unsigned short uint_least16_t;
typedef int int_least32_t; typedef unsigned int uint_least32_t; typedef int int_fast8_t; typedef unsigned int uint_fast8_t;
typedef int int_fast16_t; typedef unsigned int uint_fast16_t; typedef int int_fast32_t; typedef unsigned int uint_fast32_t;
#define INT8_MAX 127
#define INT8_MIN (-128)
#define UINT8_MAX 255
#define INT16_MAX 32767
#define INT16_MIN (-32768)
#define UINT16_MAX 65535
#define INT32_MAX 2147483647
#define INT32_MIN (-2147483647-1)
#define UINT32_MAX 4294967295U
#endif
`;

const STDDEF_H = String.raw`
#ifndef __STDDEF_H
#define __STDDEF_H
typedef unsigned int size_t;
typedef int ptrdiff_t;
typedef unsigned short wchar_t;
#ifndef NULL
#define NULL ((void *)0)
#endif
#define offsetof(T, m) ((size_t)&(((T *)0)->m))
#endif
`;

const STDARG_H = String.raw`
#ifndef __STDARG_H
#define __STDARG_H
typedef char *va_list;
#define __va_slot(T) ((sizeof(T) + 3) & ~3)
#define va_start(ap, last) ((ap) = __builtin_va_start())
#define va_arg(ap, T) (*(T *)(((ap) += __va_slot(T)) - __va_slot(T)))
#define va_end(ap) ((void)0)
#define va_copy(d, s) ((d) = (s))
#endif
`;

const STDIO_H = String.raw`
#ifndef __STDIO_H
#define __STDIO_H
#include <stddef.h>
#include <stdarg.h>
typedef struct __FILE FILE;
extern FILE __stdout;
extern FILE __stdin;
#define stdout (&__stdout)
#define stdin (&__stdin)
#define stderr (&__stdout)
#define EOF (-1)
int fputc(int ch, FILE *f);
int fgetc(FILE *f);
int putchar(int c);
int getchar(void);
int puts(const char *s);
int fputs(const char *s, FILE *f);
int printf(const char *fmt, ...);
int sprintf(char *buf, const char *fmt, ...);
int snprintf(char *buf, size_t n, const char *fmt, ...);
int vsprintf(char *buf, const char *fmt, va_list ap);
int vsnprintf(char *buf, size_t n, const char *fmt, va_list ap);
int vprintf(const char *fmt, va_list ap);
int sscanf(const char *s, const char *fmt, ...);
char *gets(char *s);
#endif
`;

const STRING_H = String.raw`
#ifndef __STRING_H
#define __STRING_H
#include <stddef.h>
void *memcpy(void *d, const void *s, size_t n);
void *memmove(void *d, const void *s, size_t n);
void *memset(void *d, int c, size_t n);
int memcmp(const void *a, const void *b, size_t n);
size_t strlen(const char *s);
char *strcpy(char *d, const char *s);
char *strncpy(char *d, const char *s, size_t n);
char *strcat(char *d, const char *s);
char *strncat(char *d, const char *s, size_t n);
int strcmp(const char *a, const char *b);
int strncmp(const char *a, const char *b, size_t n);
char *strchr(const char *s, int c);
char *strrchr(const char *s, int c);
char *strstr(const char *h, const char *n);
#endif
`;

const STDLIB_H = String.raw`
#ifndef __STDLIB_H
#define __STDLIB_H
#include <stddef.h>
#define RAND_MAX 32767
int abs(int x);
long labs(long x);
int atoi(const char *s);
long atol(const char *s);
float atof(const char *s);
long strtol(const char *s, char **end, int base);
unsigned long strtoul(const char *s, char **end, int base);
int rand(void);
void srand(unsigned int seed);
void *malloc(size_t n);
void *calloc(size_t n, size_t m);
void free(void *p);
char *itoa(int value, char *str, int base);
void exit(int code);
#endif
`;

const MATH_H = String.raw`
#ifndef __MATH_H
#define __MATH_H
#define M_PI 3.14159265358979f
#define PI 3.14159265358979f
float sqrtf(float x); float sinf(float x); float cosf(float x); float tanf(float x); float fabsf(float x);
float floorf(float x); float ceilf(float x); float fmodf(float x, float y); float expf(float x); float logf(float x);
float log10f(float x); float powf(float x, float y); float atanf(float x); float atan2f(float y, float x); float roundf(float x);
#define sqrt sqrtf
#define sin sinf
#define cos cosf
#define tan tanf
#define fabs fabsf
#define floor floorf
#define ceil ceilf
#define fmod fmodf
#define exp expf
#define log logf
#define log10 log10f
#define pow powf
#define atan atanf
#define atan2 atan2f
#define round roundf
#endif
`;

const SYSTEM_H = String.raw`
#ifndef __SYSTEM_LPC17xx_H
#define __SYSTEM_LPC17xx_H
#include <stdint.h>
extern uint32_t SystemCoreClock;
extern void SystemInit(void);
extern void SystemCoreClockUpdate(void);
#endif
`;

const STDBOOL_H = String.raw`
#ifndef __STDBOOL_H
#define __STDBOOL_H
#define bool _Bool
#define true 1
#define false 0
#endif
`;

const CTYPE_H = String.raw`
#ifndef __CTYPE_H
#define __CTYPE_H
#define isdigit(c) ((c) >= '0' && (c) <= '9')
#define isalpha(c) (((c) >= 'a' && (c) <= 'z') || ((c) >= 'A' && (c) <= 'Z'))
#define isalnum(c) (isdigit(c) || isalpha(c))
#define isupper(c) ((c) >= 'A' && (c) <= 'Z')
#define islower(c) ((c) >= 'a' && (c) <= 'z')
#define isspace(c) ((c) == ' ' || (c) == '\t' || (c) == '\n' || (c) == '\r' || (c) == '\f' || (c) == '\v')
#define isxdigit(c) (isdigit(c) || ((c) >= 'a' && (c) <= 'f') || ((c) >= 'A' && (c) <= 'F'))
#define toupper(c) (islower(c) ? (c) - 32 : (c))
#define tolower(c) (isupper(c) ? (c) + 32 : (c))
#endif
`;

const AN_LCD_H = String.raw`
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
`;

export const HEADERS = {
  'LPC17xx.h': LPC17XX_H, 'lpc17xx.h': LPC17XX_H, 'LPC17xx.H': LPC17XX_H, 'core_cm3.h': CORE_CM3_H,
  'system_LPC17xx.h': SYSTEM_H, 'stdint.h': STDINT_H, 'stddef.h': STDDEF_H, 'stdarg.h': STDARG_H, 'stdio.h': STDIO_H,
  'string.h': STRING_H, 'stdlib.h': STDLIB_H, 'math.h': MATH_H, 'stdbool.h': STDBOOL_H, 'ctype.h': CTYPE_H,
  'AN_LCD.h': AN_LCD_H, 'an_lcd.h': AN_LCD_H,
  'cmsis.h': '#include <LPC17xx.h>\n', 'lpc_types.h': '#include <stdint.h>\n#include <stdbool.h>\n#define TRUE 1\n#define FALSE 0\n#ifndef NULL\n#define NULL ((void*)0)\n#endif\n',
};

// ------------------------------------------------------------------ runtime library (C)
const LIB_STARTUP = String.raw`
#include <LPC17xx.h>
extern unsigned int __data_load[], __data_start[], __data_end[], __bss_start[], __bss_end[];
extern int main(void);
void Reset_Handler(void) {
  unsigned int *s = __data_load, *d = __data_start;
  while (d < __data_end) *d++ = *s++;
  for (d = __bss_start; d < __bss_end; ) *d++ = 0;
  SystemInit();
  /* returning from main reports the exit code to the simulator */
  *(volatile unsigned int *)0x400FCFF8 = (unsigned int)main();
  while (1);
}
void Default_Handler(void) { while (1); }

#define CLOCK_SETUP 1
#define SCS_Val 0x00000020
#define CLKSRCSEL_Val 0x00000001
#define PLL0_SETUP 1
#define PLL0CFG_Val 0x00050063
#define PLL1_SETUP 1
#define PLL1CFG_Val 0x00000023
#define CCLKCFG_Val 0x00000003
#define USBCLKCFG_Val 0x00000000
#define PCLKSEL0_Val 0x00000000
#define PCLKSEL1_Val 0x00000000
#define PCONP_Val 0x042887DE
#define CLKOUTCFG_Val 0x00000000
#define FLASHCFG_Val 0x0000303A

uint32_t SystemCoreClock = 100000000;

void SystemCoreClockUpdate(void) {
  uint32_t src;
  switch (LPC_SC->CLKSRCSEL & 0x03) { case 1: src = 12000000; break; case 2: src = 32768; break; default: src = 4000000; break; }
  if (((LPC_SC->PLL0STAT >> 24) & 3) == 3)
    SystemCoreClock = (src * ((2 * ((LPC_SC->PLL0STAT & 0x7FFF) + 1))) / (((LPC_SC->PLL0STAT >> 16) & 0xFF) + 1) / ((LPC_SC->CCLKCFG & 0xFF) + 1));
  else
    SystemCoreClock = src / ((LPC_SC->CCLKCFG & 0xFF) + 1);
}

void SystemInit(void) {
  LPC_SC->SCS = SCS_Val;
  if (SCS_Val & (1 << 5)) { while ((LPC_SC->SCS & (1 << 6)) == 0); }
  LPC_SC->CCLKCFG = CCLKCFG_Val;
  LPC_SC->PCLKSEL0 = PCLKSEL0_Val;
  LPC_SC->PCLKSEL1 = PCLKSEL1_Val;
  LPC_SC->CLKSRCSEL = CLKSRCSEL_Val;
  LPC_SC->PLL0CFG = PLL0CFG_Val;
  LPC_SC->PLL0FEED = 0xAA; LPC_SC->PLL0FEED = 0x55;
  LPC_SC->PLL0CON = 0x01;
  LPC_SC->PLL0FEED = 0xAA; LPC_SC->PLL0FEED = 0x55;
  while (!(LPC_SC->PLL0STAT & (1 << 26)));
  LPC_SC->PLL0CON = 0x03;
  LPC_SC->PLL0FEED = 0xAA; LPC_SC->PLL0FEED = 0x55;
  while (!(LPC_SC->PLL0STAT & ((1 << 25) | (1 << 24))));
  LPC_SC->PLL1CFG = PLL1CFG_Val;
  LPC_SC->PLL1FEED = 0xAA; LPC_SC->PLL1FEED = 0x55;
  LPC_SC->PLL1CON = 0x01;
  LPC_SC->PLL1FEED = 0xAA; LPC_SC->PLL1FEED = 0x55;
  while (!(LPC_SC->PLL1STAT & (1 << 10)));
  LPC_SC->PLL1CON = 0x03;
  LPC_SC->PLL1FEED = 0xAA; LPC_SC->PLL1FEED = 0x55;
  while (!(LPC_SC->PLL1STAT & ((1 << 9) | (1 << 8))));
  LPC_SC->USBCLKCFG = USBCLKCFG_Val;
  LPC_SC->PCONP = PCONP_Val;
  LPC_SC->CLKOUTCFG = CLKOUTCFG_Val;
  LPC_SC->FLASHCFG = (LPC_SC->FLASHCFG & ~0x0000F000) | FLASHCFG_Val;
  SystemCoreClock = 100000000;
}
`;

const LIB_SOFTFLOAT = String.raw`
typedef unsigned int u32;
static u32 fpack(u32 s, int e, u32 m) {
  u32 r = m & 7;
  m >>= 3;
  if (r > 4 || (r == 4 && (m & 1))) m++;
  if (m & 0x1000000) { m >>= 1; e++; }
  if (e >= 255) return s | 0x7F800000;
  if (e <= 0 || m == 0) return s;
  return s | ((u32)e << 23) | (m & 0x7FFFFF);
}
u32 __aeabi_fadd(u32 a, u32 b) {
  u32 t, sa, sb, ma, mb; int ea, eb, d, e;
  if ((a << 1) < (b << 1)) { t = a; a = b; b = t; }
  ea = (a >> 23) & 0xFF; eb = (b >> 23) & 0xFF; sa = a & 0x80000000; sb = b & 0x80000000;
  if (ea == 0xFF) { if (a << 9) return a; if (eb == 0xFF && sa != sb) return 0x7FC00000; return a; }
  if (eb == 0) { if (ea == 0) return (a << 1) ? a : (a & b); return a; }
  ma = (a & 0x7FFFFF) | 0x800000; mb = (b & 0x7FFFFF) | 0x800000;
  if (ea == 0) return b;
  ma <<= 3; mb <<= 3;
  d = ea - eb;
  if (d > 26) mb = 1;
  else if (d) { t = mb << (32 - d); mb = (mb >> d) | (t != 0); }
  e = ea;
  if (sa == sb) {
    ma += mb;
    if (ma & 0x8000000) { ma = (ma >> 1) | (ma & 1); e++; }
  } else {
    ma -= mb;
    if (ma == 0) return 0;
    while (!(ma & 0x4000000)) { ma <<= 1; e--; }
  }
  return fpack(sa, e, ma);
}
u32 __aeabi_fsub(u32 a, u32 b) { return __aeabi_fadd(a, b ^ 0x80000000); }
u32 __aeabi_frsub(u32 a, u32 b) { return __aeabi_fadd(b, a ^ 0x80000000); }
u32 __aeabi_fmul(u32 a, u32 b) {
  u32 s = (a ^ b) & 0x80000000, ma, mb, hi, lo, m; int ea = (a >> 23) & 0xFF, eb = (b >> 23) & 0xFF, e;
  if (ea == 0xFF || eb == 0xFF) {
    if ((ea == 0xFF && (a << 9)) || (eb == 0xFF && (b << 9))) return 0x7FC00000;
    if ((ea == 0 && eb == 0xFF) || (eb == 0 && ea == 0xFF)) return 0x7FC00000;
    return s | 0x7F800000;
  }
  if (ea == 0 || eb == 0) return s;
  ma = ((a & 0x7FFFFF) | 0x800000) << 8; mb = ((b & 0x7FFFFF) | 0x800000) << 8;
  hi = __umulh(ma, mb); lo = ma * mb;
  e = ea + eb - 127;
  if (hi & 0x80000000) e++;
  else { hi = (hi << 1) | (lo >> 31); lo <<= 1; }
  m = (hi >> 5) | (((hi & 0x1F) | lo) != 0);
  return fpack(s, e, m);
}
u32 __aeabi_fdiv(u32 a, u32 b) {
  u32 s = (a ^ b) & 0x80000000, ma, mb, q, r; int ea = (a >> 23) & 0xFF, eb = (b >> 23) & 0xFF, e, i;
  if (ea == 0xFF) { if (a << 9) return a; if (eb == 0xFF) return 0x7FC00000; return s | 0x7F800000; }
  if (eb == 0xFF) { if (b << 9) return b; return s; }
  if (eb == 0) { if (ea == 0) return 0x7FC00000; return s | 0x7F800000; }
  if (ea == 0) return s;
  ma = (a & 0x7FFFFF) | 0x800000; mb = (b & 0x7FFFFF) | 0x800000;
  e = ea - eb + 127;
  if (ma < mb) { ma <<= 1; e--; }
  q = 0; r = ma;
  for (i = 0; i < 27; i++) { q <<= 1; if (r >= mb) { r -= mb; q |= 1; } r <<= 1; }
  q |= (r != 0);
  return fpack(s, e, q);
}
static u32 u2f(u32 s, u32 u) {
  int e, sh; u32 m;
  if (u == 0) return s;
  e = 31 - __CLZ(u);
  if (e > 26) { sh = e - 26; m = (u >> sh) | ((u << (32 - sh)) != 0); }
  else m = u << (26 - e);
  return fpack(s, e + 127, m);
}
u32 __aeabi_i2f(int x) { return x < 0 ? u2f(0x80000000, (u32)(-x)) : u2f(0, (u32)x); }
u32 __aeabi_ui2f(u32 x) { return u2f(0, x); }
int __aeabi_f2iz(u32 a) {
  int e = ((a >> 23) & 0xFF) - 127; u32 m;
  if (e < 0) return 0;
  if (e > 30) { if ((a << 1) > 0xFF000000) return 0; return (a & 0x80000000) ? (int)0x80000000 : 0x7FFFFFFF; }
  m = (a & 0x7FFFFF) | 0x800000;
  if (e >= 23) m <<= (e - 23); else m >>= (23 - e);
  return (a & 0x80000000) ? -(int)m : (int)m;
}
u32 __aeabi_f2uiz(u32 a) {
  int e = ((a >> 23) & 0xFF) - 127; u32 m;
  if ((a & 0x80000000) || e < 0) return 0;
  if (e > 31) return 0xFFFFFFFF;
  m = (a & 0x7FFFFF) | 0x800000;
  if (e >= 23) m <<= (e - 23); else m >>= (23 - e);
  return m;
}
static int fcmp(u32 a, u32 b) {
  int ka, kb;
  if ((a << 1) > 0xFF000000 || (b << 1) > 0xFF000000) return 2;
  if (((a | b) << 1) == 0) return 0;
  ka = (a & 0x80000000) ? -(int)(a & 0x7FFFFFFF) : (int)a;
  kb = (b & 0x80000000) ? -(int)(b & 0x7FFFFFFF) : (int)b;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
int __aeabi_fcmpeq(u32 a, u32 b) { return fcmp(a, b) == 0; }
int __aeabi_fcmplt(u32 a, u32 b) { return fcmp(a, b) == -1; }
int __aeabi_fcmple(u32 a, u32 b) { int c = fcmp(a, b); return c == -1 || c == 0; }
int __aeabi_fcmpgt(u32 a, u32 b) { return fcmp(a, b) == 1; }
int __aeabi_fcmpge(u32 a, u32 b) { int c = fcmp(a, b); return c == 1 || c == 0; }
`;

const LIB_STRING = String.raw`
#include <string.h>
void *memcpy(void *d, const void *s, size_t n) { char *dp = d; const char *sp = s; while (n--) *dp++ = *sp++; return d; }
void *memmove(void *d, const void *s, size_t n) {
  char *dp = d; const char *sp = s;
  if (dp < sp) while (n--) *dp++ = *sp++;
  else { dp += n; sp += n; while (n--) *--dp = *--sp; }
  return d;
}
void *memset(void *d, int c, size_t n) { unsigned char *p = d; while (n--) *p++ = c; return d; }
int memcmp(const void *a, const void *b, size_t n) { const unsigned char *x = a, *y = b; while (n--) { if (*x != *y) return *x - *y; x++; y++; } return 0; }
size_t strlen(const char *s) { const char *p = s; while (*p) p++; return p - s; }
char *strcpy(char *d, const char *s) { char *r = d; while ((*d++ = *s++)); return r; }
char *strncpy(char *d, const char *s, size_t n) { char *r = d; while (n && *s) { *d++ = *s++; n--; } while (n--) *d++ = 0; return r; }
char *strcat(char *d, const char *s) { strcpy(d + strlen(d), s); return d; }
char *strncat(char *d, const char *s, size_t n) { char *p = d + strlen(d); while (n-- && *s) *p++ = *s++; *p = 0; return d; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) { a++; b++; } return (unsigned char)*a - (unsigned char)*b; }
int strncmp(const char *a, const char *b, size_t n) { while (n && *a && *a == *b) { a++; b++; n--; } return n ? (unsigned char)*a - (unsigned char)*b : 0; }
char *strchr(const char *s, int c) { while (*s) { if (*s == (char)c) return (char *)s; s++; } return c ? 0 : (char *)s; }
char *strrchr(const char *s, int c) { const char *r = 0; do { if (*s == (char)c) r = s; } while (*s++); return (char *)r; }
char *strstr(const char *h, const char *n) { size_t l = strlen(n); if (!l) return (char *)h; while (*h) { if (!strncmp(h, n, l)) return (char *)h; h++; } return 0; }
`;

const LIB_STDLIB = String.raw`
#include <stdlib.h>
int abs(int x) { return x < 0 ? -x : x; }
long labs(long x) { return x < 0 ? -x : x; }
long strtol(const char *s, char **end, int base) {
  long v = 0; int neg = 0, d;
  while (*s == ' ' || *s == '\t' || *s == '\n') s++;
  if (*s == '-') { neg = 1; s++; } else if (*s == '+') s++;
  if ((base == 0 || base == 16) && s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) { s += 2; base = 16; }
  else if (base == 0 && s[0] == '0') base = 8;
  else if (base == 0) base = 10;
  for (;;) {
    if (*s >= '0' && *s <= '9') d = *s - '0';
    else if (*s >= 'a' && *s <= 'z') d = *s - 'a' + 10;
    else if (*s >= 'A' && *s <= 'Z') d = *s - 'A' + 10;
    else break;
    if (d >= base) break;
    v = v * base + d; s++;
  }
  if (end) *end = (char *)s;
  return neg ? -v : v;
}
unsigned long strtoul(const char *s, char **end, int base) { return (unsigned long)strtol(s, end, base); }
int atoi(const char *s) { return (int)strtol(s, 0, 10); }
long atol(const char *s) { return strtol(s, 0, 10); }
float atof(const char *s) {
  float v = 0, f = 1; int neg = 0;
  while (*s == ' ') s++;
  if (*s == '-') { neg = 1; s++; } else if (*s == '+') s++;
  while (*s >= '0' && *s <= '9') { v = v * 10 + (*s - '0'); s++; }
  if (*s == '.') { s++; while (*s >= '0' && *s <= '9') { f = f / 10; v = v + (*s - '0') * f; s++; } }
  return neg ? -v : v;
}
static unsigned int __rand_seed = 1;
int rand(void) { __rand_seed = __rand_seed * 1103515245 + 12345; return (__rand_seed >> 16) & 0x7FFF; }
void srand(unsigned int seed) { __rand_seed = seed; }
extern char __heap_start[], __heap_end[];
static char *__brk = 0;
void *malloc(size_t n) {
  char *p;
  if (!__brk) __brk = __heap_start;
  n = (n + 7) & ~7;
  if (__brk + n > __heap_end) return 0;
  p = __brk; __brk += n;
  return p;
}
void *calloc(size_t n, size_t m) { char *p = malloc(n * m); size_t i; if (p) for (i = 0; i < n * m; i++) p[i] = 0; return p; }
void free(void *p) { }
char *itoa(int value, char *str, int base) {
  char tmp[34]; int i = 0, neg = 0; unsigned int v; char *p = str;
  if (base < 2 || base > 36) { *str = 0; return str; }
  if (value < 0 && base == 10) { neg = 1; v = -value; } else v = (unsigned int)value;
  do { int d = v % base; tmp[i++] = d < 10 ? '0' + d : 'a' + d - 10; v /= base; } while (v);
  if (neg) *p++ = '-';
  while (i) *p++ = tmp[--i];
  *p = 0;
  return str;
}
void exit(int code) { while (1); }
`;

const LIB_STDIO = String.raw`
#include <LPC17xx.h>
#include <stdio.h>
#include <string.h>
struct __FILE { int handle; };
FILE __stdout;
FILE __stdin;
int fputc(int ch, FILE *f) {
  while (!(LPC_UART0->LSR & 0x20));
  LPC_UART0->THR = ch;
  return ch;
}
int fgetc(FILE *f) {
  while (!(LPC_UART0->LSR & 0x01));
  return LPC_UART0->RBR;
}
int putchar(int c) { return fputc(c, &__stdout); }
int getchar(void) { return fgetc(&__stdin); }
int fputs(const char *s, FILE *f) { while (*s) fputc(*s++, f); return 0; }
int puts(const char *s) { fputs(s, &__stdout); fputc('\n', &__stdout); return 0; }
char *gets(char *s) { char *p = s; int c; while ((c = getchar()) != '\n' && c != '\r') *p++ = c; *p = 0; return s; }

typedef struct { char *buf; size_t pos; size_t max; int toFile; } __pf_out;
static void __pf_put(__pf_out *o, int c) {
  if (o->toFile) { fputc(c, &__stdout); o->pos++; return; }
  if (o->pos + 1 < o->max) o->buf[o->pos] = c;
  o->pos++;
}
static void __pf_pad(__pf_out *o, int n, int c) { while (n-- > 0) __pf_put(o, c); }
static int __pf_format(__pf_out *o, const char *fmt, va_list ap) {
  char tmp[40];
  while (*fmt) {
    int left = 0, zero = 0, plus = 0, space = 0, alt = 0, width = 0, prec = -1, len, i, neg;
    char c;
    if (*fmt != '%') { __pf_put(o, *fmt++); continue; }
    fmt++;
    for (;;) {
      if (*fmt == '-') left = 1; else if (*fmt == '0') zero = 1; else if (*fmt == '+') plus = 1;
      else if (*fmt == ' ') space = 1; else if (*fmt == '#') alt = 1; else break;
      fmt++;
    }
    if (*fmt == '*') { width = va_arg(ap, int); if (width < 0) { left = 1; width = -width; } fmt++; }
    else while (*fmt >= '0' && *fmt <= '9') width = width * 10 + (*fmt++ - '0');
    if (*fmt == '.') {
      fmt++; prec = 0;
      if (*fmt == '*') { prec = va_arg(ap, int); fmt++; }
      else while (*fmt >= '0' && *fmt <= '9') prec = prec * 10 + (*fmt++ - '0');
    }
    while (*fmt == 'l' || *fmt == 'h' || *fmt == 'z' || *fmt == 'L') fmt++;
    c = *fmt++;
    if (!c) break;
    len = 0; neg = 0;
    if (c == 'd' || c == 'i' || c == 'u' || c == 'x' || c == 'X' || c == 'o' || c == 'p' || c == 'b') {
      unsigned int v; unsigned int base = 10; const char *digits = "0123456789abcdef";
      if (c == 'd' || c == 'i') { int sv = va_arg(ap, int); if (sv < 0) { neg = 1; v = -sv; } else v = sv; }
      else v = va_arg(ap, unsigned int);
      if (c == 'x' || c == 'p') base = 16;
      if (c == 'X') { base = 16; digits = "0123456789ABCDEF"; }
      if (c == 'o') base = 8;
      if (c == 'b') base = 2;
      do { tmp[len++] = digits[v % base]; v /= base; } while (v);
      if (prec >= 0) zero = 0;
      while (len < prec) tmp[len++] = '0';
      if (c == 'p') { tmp[len++] = 'x'; tmp[len++] = '0'; }
      else if (alt && base == 16) { tmp[len++] = c; tmp[len++] = '0'; }
      if (neg) tmp[len++] = '-'; else if (plus && (c == 'd' || c == 'i')) tmp[len++] = '+'; else if (space && (c == 'd' || c == 'i')) tmp[len++] = ' ';
      if (!left && zero) {
        int sign = (neg || plus || space) && (c == 'd' || c == 'i');
        if (sign) { __pf_put(o, tmp[--len]); width--; }
        __pf_pad(o, width - len, '0');
      } else if (!left) __pf_pad(o, width - len, ' ');
      for (i = len - 1; i >= 0; i--) __pf_put(o, tmp[i]);
      if (left) __pf_pad(o, width - len, ' ');
    } else if (c == 'f' || c == 'F' || c == 'e' || c == 'E' || c == 'g' || c == 'G') {
      float f = va_arg(ap, float);
      unsigned int ip, k; float frac, r;
      char ibuf[16]; int il = 0, total;
      if (prec < 0) prec = 6;
      if (prec > 9) prec = 9;
      if (f != f) { strcpy(tmp, "nan"); len = 3; }
      else {
        if (f < 0) { neg = 1; f = -f; }
        if (f > 4294967040.0f) { strcpy(tmp, "inf"); len = 3; }
        else {
          r = 0.5f; for (k = 0; k < (unsigned)prec; k++) r = r / 10.0f;
          f = f + r;
          ip = (unsigned int)f;
          frac = f - (float)ip;
          do { ibuf[il++] = '0' + ip % 10; ip /= 10; } while (ip);
          len = 0;
          while (il) tmp[len++] = ibuf[--il];
          if (prec > 0 || alt) tmp[len++] = '.';
          for (k = 0; k < (unsigned)prec; k++) { int d; frac = frac * 10.0f; d = (int)frac; if (d > 9) d = 9; tmp[len++] = '0' + d; frac = frac - (float)d; }
        }
      }
      tmp[len] = 0;
      total = len + (neg || plus || space);
      if (!left && !zero) __pf_pad(o, width - total, ' ');
      if (neg) __pf_put(o, '-'); else if (plus) __pf_put(o, '+'); else if (space) __pf_put(o, ' ');
      if (!left && zero) __pf_pad(o, width - total, '0');
      for (i = 0; i < len; i++) __pf_put(o, tmp[i]);
      if (left) __pf_pad(o, width - total, ' ');
    } else if (c == 'c') {
      int ch = va_arg(ap, int);
      if (!left) __pf_pad(o, width - 1, ' ');
      __pf_put(o, ch);
      if (left) __pf_pad(o, width - 1, ' ');
    } else if (c == 's') {
      const char *s = va_arg(ap, const char *);
      if (!s) s = "(null)";
      len = 0; while (s[len] && (prec < 0 || len < prec)) len++;
      if (!left) __pf_pad(o, width - len, ' ');
      for (i = 0; i < len; i++) __pf_put(o, s[i]);
      if (left) __pf_pad(o, width - len, ' ');
    } else if (c == '%') __pf_put(o, '%');
    else { __pf_put(o, '%'); __pf_put(o, c); }
  }
  if (!o->toFile && o->max) o->buf[o->pos < o->max ? o->pos : o->max - 1] = 0;
  return o->pos;
}
int vsnprintf(char *buf, size_t n, const char *fmt, va_list ap) { __pf_out o; o.buf = buf; o.pos = 0; o.max = n; o.toFile = 0; return __pf_format(&o, fmt, ap); }
int vsprintf(char *buf, const char *fmt, va_list ap) { return vsnprintf(buf, 0x7FFFFFFF, fmt, ap); }
int vprintf(const char *fmt, va_list ap) { __pf_out o; o.buf = 0; o.pos = 0; o.max = 0; o.toFile = 1; return __pf_format(&o, fmt, ap); }
int sprintf(char *buf, const char *fmt, ...) { va_list ap; int r; va_start(ap, fmt); r = vsprintf(buf, fmt, ap); va_end(ap); return r; }
int snprintf(char *buf, size_t n, const char *fmt, ...) { va_list ap; int r; va_start(ap, fmt); r = vsnprintf(buf, n, fmt, ap); va_end(ap); return r; }
int printf(const char *fmt, ...) { va_list ap; int r; va_start(ap, fmt); r = vprintf(fmt, ap); va_end(ap); return r; }
int sscanf(const char *s, const char *fmt, ...) {
  va_list ap; int n = 0;
  va_start(ap, fmt);
  while (*fmt && *s) {
    if (*fmt == '%') {
      fmt++;
      while (*fmt == 'l' || *fmt == 'h') fmt++;
      while (*s == ' ') s++;
      if (*fmt == 'd' || *fmt == 'u' || *fmt == 'x') {
        int base = *fmt == 'x' ? 16 : 10, neg = 0, v = 0, any = 0, d;
        if (*s == '-') { neg = 1; s++; }
        for (;;) {
          if (*s >= '0' && *s <= '9') d = *s - '0'; else if (base == 16 && *s >= 'a' && *s <= 'f') d = *s - 'a' + 10;
          else if (base == 16 && *s >= 'A' && *s <= 'F') d = *s - 'A' + 10; else break;
          v = v * base + d; s++; any = 1;
        }
        if (!any) break;
        *va_arg(ap, int *) = neg ? -v : v; n++;
      } else if (*fmt == 'c') { *va_arg(ap, char *) = *s++; n++; }
      else if (*fmt == 's') { char *d = va_arg(ap, char *); while (*s && *s != ' ') *d++ = *s++; *d = 0; n++; }
      fmt++;
    } else if (*fmt == ' ') { while (*s == ' ') s++; fmt++; }
    else { if (*fmt != *s) break; fmt++; s++; }
  }
  va_end(ap);
  return n;
}
`;

const LIB_MATH = String.raw`
#include <math.h>
typedef union { float f; unsigned int u; } __fu;
float fabsf(float x) { __fu v; v.f = x; v.u &= 0x7FFFFFFF; return v.f; }
float floorf(float x) { int i; if (x >= 8388608.0f || x <= -8388608.0f) return x; i = (int)x; if ((float)i > x) i--; return (float)i; }
float ceilf(float x) { int i; if (x >= 8388608.0f || x <= -8388608.0f) return x; i = (int)x; if ((float)i < x) i++; return (float)i; }
float roundf(float x) { return x < 0 ? -floorf(-x + 0.5f) : floorf(x + 0.5f); }
float fmodf(float x, float y) { float q; int n; if (y == 0) return 0; q = x / y; n = (int)q; return x - (float)n * y; }
float sqrtf(float x) {
  __fu v; float g; int i;
  if (x <= 0) return 0;
  v.f = x; v.u = 0x1FBD1DF5 + (v.u >> 1); g = v.f;
  for (i = 0; i < 4; i++) g = 0.5f * (g + x / g);
  return g;
}
float sinf(float x) {
  float x2, r; int neg = 0;
  x = x - 6.28318530718f * floorf((x + 3.14159265359f) / 6.28318530718f);
  if (x > 1.57079632679f) x = 3.14159265359f - x;
  else if (x < -1.57079632679f) x = -3.14159265359f - x;
  x2 = x * x;
  r = x * (1.0f - x2 / 6.0f * (1.0f - x2 / 20.0f * (1.0f - x2 / 42.0f * (1.0f - x2 / 72.0f * (1.0f - x2 / 110.0f)))));
  return neg ? -r : r;
}
float cosf(float x) { return sinf(x + 1.57079632679f); }
float tanf(float x) { float c = cosf(x); if (c == 0) return 1e30f; return sinf(x) / c; }
float expf(float x) {
  int k; float r, s, t; __fu v; int i;
  if (x > 88.0f) return 1e38f * 10.0f;
  if (x < -87.0f) return 0;
  k = (int)(x * 1.44269504f + (x < 0 ? -0.5f : 0.5f));
  r = x - (float)k * 0.69314718f;
  s = 1; t = 1;
  for (i = 1; i < 10; i++) { t = t * r / (float)i; s = s + t; }
  v.u = (unsigned int)(k + 127) << 23;
  return s * v.f;
}
float logf(float x) {
  __fu v; int e; float m, s, s2, r;
  if (x <= 0) return -1e38f * 10.0f;
  v.f = x; e = (int)((v.u >> 23) & 0xFF) - 127;
  v.u = (v.u & 0x7FFFFF) | 0x3F800000; m = v.f;
  if (m > 1.41421356f) { m = m * 0.5f; e++; }
  s = (m - 1) / (m + 1); s2 = s * s;
  r = 2 * s * (1 + s2 * (1.0f / 3 + s2 * (1.0f / 5 + s2 * (1.0f / 7 + s2 * (1.0f / 9)))));
  return r + (float)e * 0.69314718f;
}
float log10f(float x) { return logf(x) * 0.43429448f; }
float powf(float x, float y) {
  int n = (int)y;
  if (y == 0) return 1;
  if (x == 0) return 0;
  if ((float)n == y && n >= -64 && n <= 64) { float r = 1, b = x; int k = n < 0 ? -n : n; while (k) { if (k & 1) r = r * b; b = b * b; k >>= 1; } return n < 0 ? 1 / r : r; }
  if (x < 0) return 0;
  return expf(y * logf(x));
}
float atanf(float x) {
  int inv = 0, neg = 0; float x2, r;
  if (x < 0) { neg = 1; x = -x; }
  if (x > 1) { inv = 1; x = 1 / x; }
  x2 = x * x;
  r = x * (0.99997726f + x2 * (-0.33262347f + x2 * (0.19354346f + x2 * (-0.11643287f + x2 * (0.05265332f + x2 * -0.01172120f)))));
  if (inv) r = 1.57079632679f - r;
  return neg ? -r : r;
}
float atan2f(float y, float x) {
  if (x > 0) return atanf(y / x);
  if (x < 0) return y >= 0 ? atanf(y / x) + 3.14159265359f : atanf(y / x) - 3.14159265359f;
  return y > 0 ? 1.57079632679f : y < 0 ? -1.57079632679f : 0;
}
`;

// Lab LCD helpers for AN_LCD.h (4-bit mode on P0.23-P0.28). Library definitions are weak: user code may replace them.
const LIB_AN_LCD = String.raw`
#include <LPC17xx.h>
unsigned long temp1;
void delay_lcd(unsigned int cycles) { volatile unsigned int i; for (i = 0; i < cycles; ++i) __NOP(); }
void delay_ms(unsigned int ms) { while (ms--) delay_lcd(1000); }
static void lcd_nibble(unsigned int value, int data) {
  LPC_GPIO0->FIOCLR = 0x1F800000;
  LPC_GPIO0->FIOSET = (value << 23) | (data ? 1u << 27 : 0);
  LPC_GPIO0->FIOSET = 1u << 28;
  LPC_GPIO0->FIOCLR = 1u << 28;
}
static void lcd_byte(unsigned int value, int data) { lcd_nibble((value >> 4) & 15, data); lcd_nibble(value & 15, data); }
void lcd_com(void) { lcd_byte(temp1, 0); }
void lcd_data(void) { lcd_byte(temp1, 1); }
void lcd_puts(const unsigned char *text) { while (*text) lcd_byte(*text++, 1); }
void lcd_init(void) {
  LPC_GPIO0->FIODIR |= 0x1F800000;
  lcd_nibble(3, 0); lcd_nibble(3, 0); lcd_nibble(3, 0); lcd_nibble(2, 0);
  lcd_byte(0x28, 0); lcd_byte(0x0C, 0); lcd_byte(0x06, 0); lcd_byte(0x01, 0); lcd_byte(0x80, 0);
}
`;

export const LIBRARY = {
  'lib/startup.c': LIB_STARTUP, 'lib/softfloat.c': LIB_SOFTFLOAT, 'lib/string.c': LIB_STRING,
  'lib/stdlib.c': LIB_STDLIB, 'lib/stdio.c': LIB_STDIO, 'lib/math.c': LIB_MATH, 'lib/an_lcd.c': LIB_AN_LCD,
};
