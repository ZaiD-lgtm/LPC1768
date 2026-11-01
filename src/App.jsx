import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LAB_TEMPLATES } from './templates.js';
import { runFirmware, applyFirmwareFrame } from './firmware.js';

// ============================================================================
// SELF-CONTAINED SVG ICONS (Prevents React 18 UMD / React 19 $$typeof mismatch)
// ============================================================================
const IconWrapper = ({ children, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const Cpu = ({ className }) => (
  <IconWrapper className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </IconWrapper>
);

const Cable = ({ className }) => (
  <IconWrapper className={className}>
    <path d="M4 9a2 2 0 0 1-2-2V5h6v2a2 2 0 0 1-2 2Z" />
    <path d="M3 5V3M7 5V3M19 15V6.5a3.5 3.5 0 0 0-7 0v11a3.5 3.5 0 0 1-7 0V9" />
    <path d="M17 21v-2M21 21v-2M22 19h-6v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2Z" />
  </IconWrapper>
);

const Play = ({ className }) => (
  <IconWrapper className={className}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </IconWrapper>
);

const Pause = ({ className }) => (
  <IconWrapper className={className}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </IconWrapper>
);

const RotateCcw = ({ className }) => (
  <IconWrapper className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </IconWrapper>
);

const Upload = ({ className }) => (
  <IconWrapper className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </IconWrapper>
);

const FileCode = ({ className }) => (
  <IconWrapper className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m10 13-2 2 2 2M14 17l2-2-2-2" />
  </IconWrapper>
);

const CheckCircle2 = ({ className }) => (
  <IconWrapper className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </IconWrapper>
);

const AlertTriangle = ({ className }) => (
  <IconWrapper className={className}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </IconWrapper>
);

const Zap = ({ className }) => (
  <IconWrapper className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </IconWrapper>
);

const Activity = ({ className }) => (
  <IconWrapper className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </IconWrapper>
);

const Sparkles = ({ className }) => (
  <IconWrapper className={className}>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
  </IconWrapper>
);

const Trash2 = ({ className }) => (
  <IconWrapper className={className}>
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </IconWrapper>
);

const StepForward = ({ className }) => (
  <IconWrapper className={className}>
    <line x1="6" y1="4" x2="6" y2="20" />
    <polygon points="10 4 20 12 10 20 10 4" />
  </IconWrapper>
);

const Binary = ({ className }) => (
  <IconWrapper className={className}>
    <rect x="14" y="14" width="4" height="6" rx="2" />
    <rect x="6" y="4" width="4" height="6" rx="2" />
    <path d="M6 20h4M14 10h4M6 14h2v6M14 4h2v6" />
  </IconWrapper>
);

// ============================================================================
// 1. HARDWARE CONNECTOR PINOUTS (MIT ICT 3143 LAB MANUAL APPENDIX C)
// ============================================================================
const CONTROLLER_PORTS = {
  CNA: {
    id: 'CNA',
    name: 'CNA (Port 0 Lower)',
    subtitle: 'P0.4 – P0.11 (Pins 1–8)',
    // Each pin maps to { port: 0..3, bit: 0..31 }
    pinMap: [
      { port: 0, bit: 4, label: 'P0.4' },
      { port: 0, bit: 5, label: 'P0.5' },
      { port: 0, bit: 6, label: 'P0.6' },
      { port: 0, bit: 7, label: 'P0.7' },
      { port: 0, bit: 8, label: 'P0.8' },
      { port: 0, bit: 9, label: 'P0.9' },
      { port: 0, bit: 10, label: 'P0.10' },
      { port: 0, bit: 11, label: 'P0.11' },
      null,
      null
    ],
    color: '#10b981'
  },
  CNB: {
    id: 'CNB',
    name: 'CNB (Port 1 & 2)',
    subtitle: 'P1.23–26 (1–4), P2.10–13 (5–8)',
    pinMap: [
      { port: 1, bit: 23, label: 'P1.23' },
      { port: 1, bit: 24, label: 'P1.24' },
      { port: 1, bit: 25, label: 'P1.25' },
      { port: 1, bit: 26, label: 'P1.26' },
      { port: 2, bit: 10, label: 'P2.10' },
      { port: 2, bit: 11, label: 'P2.11' },
      { port: 2, bit: 12, label: 'P2.12' },
      { port: 2, bit: 13, label: 'P2.13' },
      null,
      null
    ],
    color: '#3b82f6'
  },
  CNC: {
    id: 'CNC',
    name: 'CNC (Port 0 Mid)',
    subtitle: 'P0.15 – P0.22 (Pins 1–8)',
    pinMap: [
      { port: 0, bit: 15, label: 'P0.15' },
      { port: 0, bit: 16, label: 'P0.16' },
      { port: 0, bit: 17, label: 'P0.17' },
      { port: 0, bit: 18, label: 'P0.18' },
      { port: 0, bit: 19, label: 'P0.19' },
      { port: 0, bit: 20, label: 'P0.20' },
      { port: 0, bit: 21, label: 'P0.21' },
      { port: 0, bit: 22, label: 'P0.22' },
      { port: 2, bit: 13, label: 'P2.13' },
      null
    ],
    color: '#f59e0b'
  },
  CND: {
    id: 'CND',
    name: 'CND (Port 0 High)',
    subtitle: 'P0.23–28 (1–6), P2.0–1 (7–8)',
    pinMap: [
      { port: 0, bit: 23, label: 'P0.23' },
      { port: 0, bit: 24, label: 'P0.24' },
      { port: 0, bit: 25, label: 'P0.25' },
      { port: 0, bit: 26, label: 'P0.26' },
      { port: 0, bit: 27, label: 'P0.27' },
      { port: 0, bit: 28, label: 'P0.28' },
      { port: 2, bit: 0, label: 'P2.0' },
      { port: 2, bit: 1, label: 'P2.1' },
      null,
      null
    ],
    color: '#ec4899'
  }
};

const PERIPHERAL_PORTS = {
  CNA1: {
    id: 'CNA1',
    name: 'CNA1 (LED Array)',
    subtitle: '8x Active-High LEDs (LD1–LD8)',
    pins: ['LD1', 'LD2', 'LD3', 'LD4', 'LD5', 'LD6', 'LD7', 'LD8', 'NC', 'GND'],
    color: '#10b981'
  },
  CNA2: {
    id: 'CNA2',
    name: 'CNA2 (7-Seg Data)',
    subtitle: 'U12 74HCT244 (SEG_A–DP)',
    pins: ['SEG_A', 'SEG_B', 'SEG_C', 'SEG_D', 'SEG_E', 'SEG_F', 'SEG_G', 'DP', 'NC', 'GND'],
    color: '#06b6d4'
  },
  CNB2: {
    id: 'CNB2',
    name: 'CNB2 (7-Seg Enable)',
    subtitle: 'U7 74LS145 BCD Decoder (EN1–4)',
    pins: ['EN1', 'EN2', 'EN3', 'EN4', 'NC', 'NC', 'NC', 'NC', 'NC', 'GND'],
    color: '#6366f1'
  },
  CNAD: {
    id: 'CNAD',
    name: 'CNAD (16x2 LCD CN11)',
    subtitle: 'D4–D7 (1–4), RS (5), EN (6)',
    pins: ['LCD_D4', 'LCD_D5', 'LCD_D6', 'LCD_D7', 'LCD_RS', 'LCD_EN', 'NC', 'NC', 'NC', 'GND'],
    color: '#ec4899'
  },
  CNB3: {
    id: 'CNB3',
    name: 'CNB3 (4x4 Matrix Keypad)',
    subtitle: 'COL1–4 (1–4), ROW1–4 (5–8)',
    pins: ['COL1', 'COL2', 'COL3', 'COL4', 'ROW1', 'ROW2', 'ROW3', 'ROW4', 'NC', 'GND'],
    color: '#f97316'
  },
  CNB1: {
    id: 'CNB1',
    name: 'CNB1 (SW2 & PWM LD10)',
    subtitle: 'Pin1: PWM1.4 (LD10) | Pin7: SW2',
    pins: ['PWM_LD10', 'NC', 'NC', 'NC', 'NC', 'NC', 'SW2_KEY', 'NC', 'NC', 'GND'],
    color: '#eab308'
  }
};

const KEYPAD_KEYS = [
  { sw: 'SW3', label: '0', row: 0, col: 0, code: 0x0 },
  { sw: 'SW4', label: '1', row: 0, col: 1, code: 0x1 },
  { sw: 'SW5', label: '2', row: 0, col: 2, code: 0x2 },
  { sw: 'SW6', label: '3', row: 0, col: 3, code: 0x3 },
  { sw: 'SW7', label: '4', row: 1, col: 0, code: 0x4 },
  { sw: 'SW8', label: '5', row: 1, col: 1, code: 0x5 },
  { sw: 'SW9', label: '6', row: 1, col: 2, code: 0x6 },
  { sw: 'SW10', label: '7', row: 1, col: 3, code: 0x7 },
  { sw: 'SW11', label: '8', row: 2, col: 0, code: 0x8 },
  { sw: 'SW12', label: '9', row: 2, col: 1, code: 0x9 },
  { sw: 'SW13', label: 'A (+)', row: 2, col: 2, code: 0xA },
  { sw: 'SW14', label: 'B (-)', row: 2, col: 3, code: 0xB },
  { sw: 'SW15', label: 'C (=)', row: 3, col: 0, code: 0xC },
  { sw: 'SW16', label: 'D (CLR)', row: 3, col: 1, code: 0xD },
  { sw: 'SW17', label: 'E', row: 3, col: 2, code: 0xE },
  { sw: 'SW18', label: 'F', row: 3, col: 3, code: 0xF }
];

// ============================================================================
// Bundled C examples are in templates.js; C builds use the in-browser compiler (src/engine).
// ============================================================================
// ============================================================================
// 4. ENGINE 2: LIVE ARMv7-M ASSEMBLY INTERPRETER & MEMORY EMULATOR
// ============================================================================
function parseAndAssembleARM(asmText) {
  const lines = asmText.split(/\r?\n/);
  const labels = {};
  const equs = {};
  const instructions = [];
  const memoryInit = {}; // byte address -> byte value

  let codeAddr = 0x00000000;
  let dataAddr = 0x10000000;
  let currentSegment = 'CODE';

  // Pass 1: Strip comments, handle EQU, DCD/DCW/DCB, and record label addresses
  const cleanedLines = [];
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const noComment = rawLine.split(';')[0].trimEnd();
    if (!noComment.trim()) return;

    // Check AREA directive
    const areaMatch = noComment.match(/\bAREA\s+[^,]+,\s*(CODE|DATA)\s*(?:,\s*(READONLY|READWRITE))?/i);
    if (areaMatch) {
      const kind = areaMatch[1].toUpperCase();
      const rw = (areaMatch[2] || '').toUpperCase();
      currentSegment = kind === 'DATA' && rw === 'READWRITE' ? 'DATA' : 'CODE';
      return;
    }

    if (/^\s*(ENTRY|EXPORT|IMPORT|ALIGN|END)\b/i.test(noComment)) return;

    // Check EQU directive: `NUM EQU 10`
    const equMatch = noComment.match(/^\s*([A-Za-z_]\w*)\s+EQU\s+(.+)$/i);
    if (equMatch) {
      equs[equMatch[1]] = parseArmNumber(equMatch[2].trim(), {});
      return;
    }

    // Check DCD / DCW / DCB directive with optional label
    const dataMatch = noComment.match(/^\s*([A-Za-z_]\w*)?\s*\b(DCD|DCW|DCB)\s+(.+)$/i);
    if (dataMatch) {
      const lbl = dataMatch[1];
      const dir = dataMatch[2].toUpperCase();
      const vals = dataMatch[3].split(',').map(v => v.trim());

      let targetAddr = currentSegment === 'DATA' ? dataAddr : codeAddr;
      if (lbl) labels[lbl] = targetAddr;

      vals.forEach(v => {
        const num = parseArmNumber(v, equs);
        if (dir === 'DCD') {
          writeMem32(memoryInit, targetAddr, num);
          targetAddr += 4;
        } else if (dir === 'DCW') {
          memoryInit[targetAddr] = num & 0xFF;
          memoryInit[targetAddr + 1] = (num >> 8) & 0xFF;
          targetAddr += 2;
        } else if (dir === 'DCB') {
          memoryInit[targetAddr] = num & 0xFF;
          targetAddr += 1;
        }
      });

      if (currentSegment === 'DATA') dataAddr = targetAddr;
      else codeAddr = targetAddr;
      return;
    }

    // Standard instruction or standalone label
    let rest = noComment.trim();
    // Check if starts at column 0 (label) or has a colon
    const firstTokenMatch = noComment.match(/^([A-Za-z_]\w*:?)(?:\s+(.*))?$/);
    if (firstTokenMatch && !isArmMnemonic(firstTokenMatch[1].replace(':', ''))) {
      const lblName = firstTokenMatch[1].replace(':', '');
      labels[lblName] = codeAddr;
      rest = (firstTokenMatch[2] || '').trim();
    }

    if (rest) {
      cleanedLines.push({ lineNo, addr: codeAddr, text: rest, raw: rawLine });
      codeAddr += 4;
    }
  });

  // Pass 2: Parse instructions
  cleanedLines.forEach(item => {
    const tokens = item.text.trim().split(/\s+/);
    const fullOp = tokens[0].toUpperCase();
    const operandStr = item.text.slice(tokens[0].length).trim();
    instructions.push({
      lineNo: item.lineNo,
      addr: item.addr,
      op: fullOp,
      operands: splitArmOperands(operandStr),
      text: item.text
    });
  });

  return { instructions, labels, equs, memoryInit };
}

const ARM_MNEMONICS = new Set([
  'MOV', 'MOVS', 'MOVW', 'MOVT', 'MVN', 'MVNS',
  'ADD', 'ADDS', 'ADC', 'ADCS', 'SUB', 'SUBS', 'SBC', 'SBCS', 'RSB', 'RSBS',
  'MUL', 'MULS', 'UMULL', 'MLA',
  'AND', 'ANDS', 'ORR', 'ORRS', 'EOR', 'EORS', 'BIC', 'BICS',
  'LSL', 'LSLS', 'LSR', 'LSRS', 'ASR', 'ASRS', 'ROR', 'RORS', 'RBIT', 'REV', 'CLZ',
  'CMP', 'CMN', 'TST', 'TEQ',
  'LDR', 'LDRB', 'LDRH', 'STR', 'STRB', 'STRH',
  'LDM', 'LDMIA', 'LDMDB', 'STM', 'STMIA', 'STMDB', 'PUSH', 'POP',
  'B', 'BL', 'BX', 'NOP'
]);

const COND_SUFFIXES = ['EQ', 'NE', 'CS', 'HS', 'CC', 'LO', 'MI', 'PL', 'VS', 'VC', 'HI', 'LS', 'GE', 'LT', 'GT', 'LE', 'AL'];

function isArmMnemonic(word) {
  const up = word.toUpperCase();
  if (ARM_MNEMONICS.has(up)) return true;
  for (const c of COND_SUFFIXES) {
    if (up.endsWith(c)) {
      const base = up.slice(0, -c.length);
      if (ARM_MNEMONICS.has(base) || ARM_MNEMONICS.has(base.replace(/S$/, ''))) return true;
    }
  }
  return false;
}

function splitArmOperands(str) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseArmNumber(valStr, equs = {}, labels = {}) {
  if (!valStr) return 0;
  let s = valStr.trim().replace(/^#/, '').replace(/^=/, '');
  if (equs[s] !== undefined) return equs[s];
  if (labels[s] !== undefined) return labels[s];
  if (/^0x[0-9a-fA-F]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10) >>> 0;
  return 0;
}

function writeMem32(memObj, addr, val) {
  const u = val >>> 0;
  memObj[addr] = u & 0xFF;
  memObj[addr + 1] = (u >>> 8) & 0xFF;
  memObj[addr + 2] = (u >>> 16) & 0xFF;
  memObj[addr + 3] = (u >>> 24) & 0xFF;
}

function readMem32(memObj, addr) {
  const b0 = memObj[addr] || 0;
  const b1 = memObj[addr + 1] || 0;
  const b2 = memObj[addr + 2] || 0;
  const b3 = memObj[addr + 3] || 0;
  return ((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
}

// ============================================================================
// 5. ENGINE 3: INTEL .HEX PARSER + THUMB-2 MACHINE CODE DISASSEMBLER & EMULATOR
// ============================================================================
function parseIntelHexFile(hexText) {
  const lines = hexText.trim().split(/\r?\n/);
  const records = [];
  const flashBytes = {}; // addr -> byte
  let baseLinearAddr = 0;
  let totalBytes = 0;
  const errors = [];

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    // Legacy source metadata is ignored; only actual bytes execute on the backend.
    if (!line.startsWith(':')) {
      errors.push(`Line ${idx + 1}: Missing ':' start code`);
      return;
    }
    const byteCount = parseInt(line.slice(1, 3), 16);
    const addr16 = parseInt(line.slice(3, 7), 16);
    const recType = parseInt(line.slice(7, 9), 16);
    const dataHex = line.slice(9, 9 + byteCount * 2);
    const checksum = parseInt(line.slice(9 + byteCount * 2, 11 + byteCount * 2), 16);

    if (isNaN(byteCount) || isNaN(addr16) || isNaN(recType)) {
      errors.push(`Line ${idx + 1}: Malformed hex digits`);
      return;
    }

    if (recType === 0x04) {
      baseLinearAddr = parseInt(dataHex, 16) << 16;
    } else if (recType === 0x00) {
      const fullAddr = (baseLinearAddr + addr16) >>> 0;
      for (let i = 0; i < byteCount; i++) {
        flashBytes[fullAddr + i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
      }
      totalBytes += byteCount;
    }

    records.push({
      line: idx + 1,
      byteCount,
      address: `0x${((baseLinearAddr + addr16) >>> 0).toString(16).toUpperCase().padStart(8, '0')}`,
      recordType: recType === 0 ? 'DATA (00)' : recType === 1 ? 'EOF (01)' : recType === 4 ? 'ELA (04)' : `0${recType}`,
      data: dataHex.toUpperCase(),
      checksum: `0x${(checksum || 0).toString(16).toUpperCase().padStart(2, '0')}`
    });
  });

  // Disassemble Thumb/Thumb-2 instructions from flashBytes
  const disassembled = disassembleThumbFlash(flashBytes);

  return {
    records,
    flashBytes,
    disassembled,
    totalBytes,
    errors,
    valid: errors.length === 0 && records.length > 0
  };
}

/**
 * Decodes 16-bit Thumb instructions from raw `.hex` Flash bytes so externally
 * compiled Keil `.hex` binaries can be inspected and executed!
 */
function disassembleThumbFlash(flashBytes) {
  const addrs = Object.keys(flashBytes).map(Number).sort((a, b) => a - b);
  if (addrs.length < 8) return [];
  const maxAddr = Math.min(addrs[addrs.length - 1], 0x00000400);
  const out = [];

  // First two 32-bit words at 0x00000000 and 0x00000004 are Vector Table (SP & Reset_Handler)
  const spVal = readMem32(flashBytes, 0);
  const resetVec = readMem32(flashBytes, 4);
  out.push({ addr: 0x00000000, hex: spVal.toString(16).toUpperCase().padStart(8, '0'), asm: `DCD 0x${spVal.toString(16).toUpperCase()} ; Initial SP` });
  out.push({ addr: 0x00000004, hex: resetVec.toString(16).toUpperCase().padStart(8, '0'), asm: `DCD 0x${resetVec.toString(16).toUpperCase()} ; Reset_Handler` });

  const startPc = (resetVec & ~1) >= 8 && (resetVec & ~1) < maxAddr ? (resetVec & ~1) : 8;

  for (let pc = startPc; pc <= maxAddr - 1; pc += 2) {
    if (flashBytes[pc] === undefined) continue;
    const hw = (flashBytes[pc] | ((flashBytes[pc + 1] || 0) << 8)) & 0xFFFF;
    let decoded = `DCW 0x${hw.toString(16).toUpperCase().padStart(4, '0')}`;

    if ((hw & 0xF800) === 0x2000) {
      const rd = (hw >> 8) & 7;
      const imm8 = hw & 0xFF;
      decoded = `MOVS R${rd}, #0x${imm8.toString(16).toUpperCase()}`;
    } else if ((hw & 0xF800) === 0x2800) {
      const rn = (hw >> 8) & 7;
      const imm8 = hw & 0xFF;
      decoded = `CMP R${rn}, #0x${imm8.toString(16).toUpperCase()}`;
    } else if ((hw & 0xF800) === 0x3000) {
      const rd = (hw >> 8) & 7;
      const imm8 = hw & 0xFF;
      decoded = `ADDS R${rd}, #0x${imm8.toString(16).toUpperCase()}`;
    } else if ((hw & 0xF800) === 0x3800) {
      const rd = (hw >> 8) & 7;
      const imm8 = hw & 0xFF;
      decoded = `SUBS R${rd}, #0x${imm8.toString(16).toUpperCase()}`;
    } else if ((hw & 0xF800) === 0x0000 && hw !== 0) {
      const imm5 = (hw >> 6) & 0x1F;
      const rm = (hw >> 3) & 7;
      const rd = hw & 7;
      decoded = `LSLS R${rd}, R${rm}, #${imm5}`;
    } else if ((hw & 0xF800) === 0x4800) {
      const rt = (hw >> 8) & 7;
      const imm8 = (hw & 0xFF) << 2;
      const litAddr = ((pc + 4) & ~3) + imm8;
      const litVal = readMem32(flashBytes, litAddr);
      decoded = `LDR R${rt}, [PC, #${imm8}] ; =0x${litVal.toString(16).toUpperCase().padStart(8, '0')}`;
    } else if ((hw & 0xF800) === 0x6000) {
      const imm5 = ((hw >> 6) & 0x1F) << 2;
      const rn = (hw >> 3) & 7;
      const rt = hw & 7;
      decoded = `STR R${rt}, [R${rn}, #0x${imm5.toString(16).toUpperCase()}]`;
    } else if ((hw & 0xF800) === 0x6800) {
      const imm5 = ((hw >> 6) & 0x1F) << 2;
      const rn = (hw >> 3) & 7;
      const rt = hw & 7;
      decoded = `LDR R${rt}, [R${rn}, #0x${imm5.toString(16).toUpperCase()}]`;
    } else if ((hw & 0xF800) === 0xE000) {
      let imm11 = hw & 0x7FF;
      if (imm11 & 0x400) imm11 -= 0x800;
      const target = pc + 4 + (imm11 << 1);
      decoded = `B 0x${(target >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;
    } else if (hw === 0xBF00) {
      decoded = 'NOP';
    }

    out.push({
      addr: pc,
      hex: hw.toString(16).toUpperCase().padStart(4, '0'),
      asm: decoded,
      hw
    });
  }
  return out;
}

// ============================================================================
// 6. MAIN REACT SIMULATOR APPLICATION
// ============================================================================
export default function App() {
  // Active Template / Language Mode ('c' | 'asm' | 'hex')
  const [selectedTemplateId, setSelectedTemplateId] = useState('c_lab7_chaser');
  const [codeMode, setCodeMode] = useState('c'); // 'c' | 'asm'
  const [sourceCode, setSourceCode] = useState(LAB_TEMPLATES[0].code);
  const [hexContent, setHexContent] = useState('');
  const [hexLoading, setHexLoading] = useState(false);
  const [sourceName, setSourceName] = useState('main.c');
  const [consoleOutput, setConsoleOutput] = useState('');
  const uploadIdRef = useRef(0);

  // Power, Execution & Speed Controls
  const [isPowered, setIsPowered] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [compileStatus, setCompileStatus] = useState({
    ok: true,
    msg: 'Starting ARM compiler…'
  });

  // 10-Core FRC Ribbon Cable Routing: { CNA: 'CNA1', CNB: 'CNB1', ... }
  const [cables, setCables] = useState({ CNA: 'CNA1', CNB: 'CNB1' });
  const [selectedPort, setSelectedPort] = useState(null);

  // Physical Jumpers & Switches
  const [jumpers, setJumpers] = useState({
    SW21: false,
    JP3: false,
    JP4: true,
    JP5: true,
    JP16: true,
    JP18: true
  });

  // Live Analog Potentiometers & Tactile Switches
  const [pot1Voltage, setPot1Voltage] = useState(1.65); // AD0.5 (P1.31)
  const [pot4Voltage, setPot4Voltage] = useState(0.85); // AD0.4 (P1.30)
  const [pot3Contrast, setPot3Contrast] = useState(90); // LCD Contrast
  const [sw2Pressed, setSw2Pressed] = useState(false);  // SW2 on CNB1 Pin 7
  const [activeKey, setActiveKey] = useState(null);     // 4x4 Matrix Keypad SW3-SW18
  const [povEnabled, setPovEnabled] = useState(true);   // 7-Segment Persistence of Vision

  // UI Navigation Tabs
  const [activeRightTab, setActiveRightTab] = useState('keil'); // 'keil' | 'asmdebug' | 'flashmagic' | 'registers' | 'scope'
  const comPort = 'SIM';
  const [flashStatusMsg, setFlashStatusMsg] = useState('Load compiled Intel HEX firmware into the simulated board.');

  // ==========================================================================
  // LIVE HARDWARE MMIO STATE REF (ACCESSED BY C, ASM, AND HEX ENGINES AT 60FPS)
  // ==========================================================================
  const hwRef = useRef({
    // LPC1768 GPIO 0..3 Registers
    gpio: [
      { FIODIR: 0, FIOPIN: 0, FIOSET: 0, FIOCLR: 0, FIOMASK: 0 },
      { FIODIR: 0, FIOPIN: 0, FIOSET: 0, FIOCLR: 0, FIOMASK: 0 },
      { FIODIR: 0, FIOPIN: 0, FIOSET: 0, FIOCLR: 0, FIOMASK: 0 },
      { FIODIR: 0, FIOPIN: 0, FIOSET: 0, FIOCLR: 0, FIOMASK: 0 }
    ],
    pincon: { PINSEL0: 0, PINSEL1: 0, PINSEL2: 0, PINSEL3: 0, PINSEL4: 0 },
    sc: { PCONP: 0x00008000 },
    adc: { ADCR: 0, ADGDR: 0x80000000 },
    pwm1: {
      IR: 0, TCR: 0, PR: 0, MCR: 0,
      MR0: 30000, MR1: 0, MR2: 0, MR3: 0, MR4: 0, MR5: 0, MR6: 0,
      PCR: 0, LER: 0, irqEnabled: false, irqHandler: null
    },
    // HD44780 16x2 LCD Internal Controller State Machine
    lcd: {
      ddram: new Array(128).fill(32), // ASCII space
      cursorAddr: 0x00,
      fourBitMode: false,
      highNibbleBuffered: false,
      highNibbleVal: 0,
      lastEnBit: 0,
      displayOn: true
    },
    // 7-Segment Persistence-of-Vision Buffer (U11, U10, U9, U8)
    sevenSegPov: [
      { byte: 0, lastSeen: 0 },
      { byte: 0, lastSeen: 0 },
      { byte: 0, lastSeen: 0 },
      { byte: 0, lastSeen: 0 }
    ],
    sevenSegInstant: [0, 0, 0, 0],
    // ARM Cortex-M3 Core Registers & SRAM for Assembly / Hex Debugger
    arm: {
      r: new Uint32Array(16), // R0-R12, R13(SP), R14(LR), R15(PC)
      flags: { N: 0, Z: 0, C: 0, V: 0 },
      memory: {}, // byte-addressable Flash (0x00000000) & SRAM (0x10000000)
      currentLine: 0,
      halted: false,
      program: null
    }
  });

  // React UI snapshot state (synced at 30fps from hwRef)
  const [uiSnapshot, setUiSnapshot] = useState({
    leds: Array(8).fill(false),
    ledByte: 0,
    sevenSegBytes: [0, 0, 0, 0],
    lcdLine1: '                ',
    lcdLine2: '                ',
    lcdActive: true,
    pwmDutyPercent: 0,
    regs: {},
    armRegs: Array(16).fill(0),
    armFlags: { N: 0, Z: 0, C: 0, V: 0 },
    armLine: 0,
    sramWords: []
  });

  // Keep refs of interactive inputs so running coroutines always read fresh hardware inputs
  const inputsRef = useRef({
    cables,
    jumpers,
    pot1Voltage,
    pot4Voltage,
    sw2Pressed,
    activeKey,
    simSpeed,
    isPowered,
    isRunning
  });
  useEffect(() => {
    inputsRef.current = {
      cables,
      jumpers,
      pot1Voltage,
      pot4Voltage,
      sw2Pressed,
      activeKey,
      simSpeed,
      isPowered,
      isRunning
    };
  }, [cables, jumpers, pot1Voltage, pot4Voltage, sw2Pressed, activeKey, simSpeed, isPowered, isRunning]);

  // ==========================================================================
  // HARDWARE SIGNAL ROUTER & PERIPHERAL STATE MACHINE
  // ==========================================================================
  const syncHardwareSignals = useCallback(() => {
    const hw = hwRef.current;
    const inp = inputsRef.current;

    // 1. Update External Input Pins into GPIO FIOPIN (SW2 & 4x4 Matrix Keypad)
    for (let p = 0; p < 4; p++) {
      // Clear input bits (bits where FIODIR == 0) before applying external switch highs
      hw.gpio[p].FIOPIN = (hw.gpio[p].FIOPIN & hw.gpio[p].FIODIR) >>> 0;
    }

    // Check which Controller Port is wired to CNB1 (SW2 on Pin 7 -> index 6)
    const cnb1Ctrl = Object.keys(inp.cables).find(k => inp.cables[k] === 'CNB1');
    if (cnb1Ctrl && inp.sw2Pressed) {
      const pinDef = CONTROLLER_PORTS[cnb1Ctrl]?.pinMap[6]; // Pin 7 (0-indexed 6)
      if (pinDef && !(hw.gpio[pinDef.port].FIODIR & (1 << pinDef.bit))) {
        hw.gpio[pinDef.port].FIOPIN = (hw.gpio[pinDef.port].FIOPIN | (1 << pinDef.bit)) >>> 0;
      }
    }

    // Check which Controller Port is wired to CNB3 (4x4 Keypad Matrix)
    // Pins 5-8 (indices 4..7) = ROW1..ROW4 (driven High by MCU)
    // Pins 1-4 (indices 0..3) = COL1..COL4 (read by MCU when switch is pressed)
    const cnb3Ctrl = Object.keys(inp.cables).find(k => inp.cables[k] === 'CNB3');
    if (cnb3Ctrl && inp.jumpers.JP4 && inp.activeKey) {
      const rowPin = CONTROLLER_PORTS[cnb3Ctrl]?.pinMap[4 + inp.activeKey.row];
      const colPin = CONTROLLER_PORTS[cnb3Ctrl]?.pinMap[inp.activeKey.col];
      if (rowPin && colPin) {
        const isRowDrivenHigh = ((hw.gpio[rowPin.port].FIOPIN >>> rowPin.bit) & 1) === 1;
        if (isRowDrivenHigh && !(hw.gpio[colPin.port].FIODIR & (1 << colPin.bit))) {
          hw.gpio[colPin.port].FIOPIN = (hw.gpio[colPin.port].FIOPIN | (1 << colPin.bit)) >>> 0;
        }
      }
    }

    // 2. Update 12-Bit ADC (AD0.5 = POT1, AD0.4 = POT4)
    const adc5 = Math.min(0xFFF, Math.max(0, Math.round((inp.pot1Voltage / 3.3) * 0xFFF)));
    const adc4 = inp.jumpers.JP18
      ? Math.min(0xFFF, Math.max(0, Math.round((inp.pot4Voltage / 3.3) * 0xFFF)))
      : 0;
    const selectedChannel = Array.from({ length: 8 }, (_, i) => i).find(i => hw.adc.ADCR & (1 << i)) ?? 5;
    const activeAdcVal = selectedChannel === 4 ? adc4 : selectedChannel === 5 ? adc5 : 0;
    const done = Boolean((hw.adc.ADCR & (1 << 21)) && (hw.adc.ADCR & ((7 << 24) | (1 << 16))));
    hw.adc.ADGDR = ((done ? 0x80000000 : 0) | (selectedChannel << 24) | (activeAdcVal << 4)) >>> 0;

    // 3. Check 7-Segment Display (CNA2 Data + CNB2 Multiplex Enable)
    const cna2Ctrl = Object.keys(inp.cables).find(k => inp.cables[k] === 'CNA2');
    const cnb2Ctrl = Object.keys(inp.cables).find(k => inp.cables[k] === 'CNB2');
    let segDataByte = 0;
    if (cna2Ctrl) {
      const pMap = CONTROLLER_PORTS[cna2Ctrl].pinMap;
      for (let i = 0; i < 8; i++) {
        if (pMap[i]) {
          const bitVal = (hw.gpio[pMap[i].port].FIOPIN >>> pMap[i].bit) & 1;
          segDataByte |= bitVal << i;
        }
      }
    }

    hw.sevenSegInstant = [0, 0, 0, 0];
    if (cnb2Ctrl) {
      const pMap = CONTROLLER_PORTS[cnb2Ctrl].pinMap;
      let bcdEn = 0;
      for (let i = 0; i < 4; i++) {
        if (pMap[i]) {
          const bitVal = (hw.gpio[pMap[i].port].FIOPIN >>> pMap[i].bit) & 1;
          bcdEn |= bitVal << i;
        }
      }
      // U7 74LS145 BCD-to-Decimal Decoder: 0->EN1(U8), 1->EN2(U9), 2->EN3(U10), 3->EN4(U11)
      if (bcdEn >= 0 && bcdEn <= 3 && segDataByte !== 0) {
        const unitIdx = 3 - bcdEn; // 0:U11(Thousands), 1:U10(Hundreds), 2:U9(Tens), 3:U8(Units)
        hw.sevenSegInstant[unitIdx] = segDataByte;
        hw.sevenSegPov[unitIdx] = { byte: segDataByte, lastSeen: performance.now() };
      }
    }

    // 4. Check HD44780 16x2 LCD 4-Bit Nibble Falling-Edge Protocol on CNAD
    // Pin 1-4 (0..3) = D4..D7, Pin 5 (4) = RS, Pin 6 (5) = EN
    const cnadCtrl = Object.keys(inp.cables).find(k => inp.cables[k] === 'CNAD');
    if (cnadCtrl && inp.jumpers.JP5) {
      const pMap = CONTROLLER_PORTS[cnadCtrl].pinMap;
      let nibble = 0;
      for (let i = 0; i < 4; i++) {
        if (pMap[i]) {
          const b = (hw.gpio[pMap[i].port].FIOPIN >>> pMap[i].bit) & 1;
          nibble |= b << i;
        }
      }
      const rsBit = pMap[4] ? (hw.gpio[pMap[4].port].FIOPIN >>> pMap[4].bit) & 1 : 0;
      const enBit = pMap[5] ? (hw.gpio[pMap[5].port].FIOPIN >>> pMap[5].bit) & 1 : 0;

      // Detect falling edge on EN (1 -> 0)
      if (hw.lcd.lastEnBit === 1 && enBit === 0) {
        if (!hw.lcd.fourBitMode) {
          if (rsBit === 0 && nibble === 2) hw.lcd.fourBitMode = true;
          // 8-bit/4-bit initialization single nibble commands (0x30, 0x20)
          hw.lcd.highNibbleBuffered = false;
        } else if (!hw.lcd.highNibbleBuffered) {
          hw.lcd.highNibbleVal = nibble;
          hw.lcd.highNibbleBuffered = true;
        } else {
          const fullByte = ((hw.lcd.highNibbleVal << 4) | nibble) & 0xFF;
          hw.lcd.highNibbleBuffered = false;
          processLcdByte(hw.lcd, rsBit, fullByte);
        }
      }
      hw.lcd.lastEnBit = enBit;
    }
  }, []);

  // Process a full 8-bit command or character in the HD44780 LCD state machine
  function processLcdByte(lcdState, rs, byteVal) {
    if (rs === 0) {
      // Command
      if (byteVal === 0x01) {
        lcdState.ddram.fill(32);
        lcdState.cursorAddr = 0x00;
      } else if (byteVal === 0x02) {
        lcdState.cursorAddr = 0x00;
      } else if ((byteVal & 0x80) !== 0) {
        lcdState.cursorAddr = byteVal & 0x7F;
      }
    } else {
      // Data Character Write
      if (byteVal >= 32 && byteVal <= 126) {
        lcdState.ddram[lcdState.cursorAddr & 0x7F] = byteVal;
        lcdState.cursorAddr = (lcdState.cursorAddr + 1) & 0x7F;
      }
    }
  }

  // Create GPIO proxy object so C code `LPC_GPIO0->FIOSET = x` triggers real bit-set logic
  const createGpioProxy = useCallback((portIdx) => {
    const hw = hwRef.current;
    return {
      get FIODIR() {
        return hw.gpio[portIdx].FIODIR >>> 0;
      },
      set FIODIR(v) {
        hw.gpio[portIdx].FIODIR = v >>> 0;
        syncHardwareSignals();
      },
      get FIOMASK() {
        return hw.gpio[portIdx].FIOMASK >>> 0;
      },
      set FIOMASK(v) {
        hw.gpio[portIdx].FIOMASK = v >>> 0;
      },
      get FIOPIN() {
        syncHardwareSignals();
        return hw.gpio[portIdx].FIOPIN >>> 0;
      },
      set FIOPIN(v) {
        const dir = hw.gpio[portIdx].FIODIR;
        const mask = ~hw.gpio[portIdx].FIOMASK;
        hw.gpio[portIdx].FIOPIN = ((hw.gpio[portIdx].FIOPIN & ~(dir & mask)) | ((v >>> 0) & dir & mask)) >>> 0;
        syncHardwareSignals();
      },
      get FIOSET() {
        return hw.gpio[portIdx].FIOSET >>> 0;
      },
      set FIOSET(v) {
        const val = v >>> 0;
        hw.gpio[portIdx].FIOSET = val;
        hw.gpio[portIdx].FIOPIN = (hw.gpio[portIdx].FIOPIN | (val & hw.gpio[portIdx].FIODIR & ~hw.gpio[portIdx].FIOMASK)) >>> 0;
        syncHardwareSignals();
      },
      get FIOCLR() {
        return hw.gpio[portIdx].FIOCLR >>> 0;
      },
      set FIOCLR(v) {
        const val = v >>> 0;
        hw.gpio[portIdx].FIOCLR = val;
        hw.gpio[portIdx].FIOPIN = (hw.gpio[portIdx].FIOPIN & ~(val & hw.gpio[portIdx].FIODIR & ~hw.gpio[portIdx].FIOMASK)) >>> 0;
        syncHardwareSignals();
      }
    };
  }, [syncHardwareSignals]);

  // ==========================================================================
  // COMPILE AND RUN FIRMWARE IN THE LOCAL CORTEX-M3 EMULATOR
  // ==========================================================================
  const runIdRef = useRef(0);

  const resetHardwareRegisters = useCallback(() => {
    const hw = hwRef.current;
    for (let i = 0; i < 4; i++) {
      hw.gpio[i] = { FIODIR: 0, FIOPIN: 0, FIOSET: 0, FIOCLR: 0, FIOMASK: 0 };
    }
    hw.arm.r.fill(0);
    hw.arm.memory = {};
    hw.arm.program = null;
    hw.arm.halted = true;
    hw.arm.currentLine = 0;
    hw.arm.flags = { N: 0, Z: 0, C: 0, V: 0 };
    hw.sc = { PCONP: 0x8000 };
    hw.sevenSegInstant = [0, 0, 0, 0];
    hw.pincon = { PINSEL0: 0, PINSEL1: 0, PINSEL2: 0, PINSEL3: 0, PINSEL4: 0 };
    hw.adc = { ADCR: 0, ADGDR: 0x80000000 };
    hw.pwm1 = {
      IR: 0, TCR: 0, PR: 0, MCR: 0,
      MR0: 30000, MR1: 0, MR2: 0, MR3: 0, MR4: 0, MR5: 0, MR6: 0,
      PCR: 0, LER: 0, irqEnabled: false, irqHandler: null
    };
    hw.lcd = {
      ddram: new Array(128).fill(32),
      cursorAddr: 0x00,
      fourBitMode: false,
      highNibbleBuffered: false,
      highNibbleVal: 0,
      lastEnBit: 0,
      displayOn: true
    };
    hw.sevenSegPov = [
      { byte: 0, lastSeen: 0 },
      { byte: 0, lastSeen: 0 },
      { byte: 0, lastSeen: 0 },
      { byte: 0, lastSeen: 0 }
    ];
  }, []);

  const startLiveExecution = useCallback((modeToRun, codeToRun) => {
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    setHexContent('');
    resetHardwareRegisters();

    if (modeToRun === 'asm') {
      try {
        const assembled = parseAndAssembleARM(codeToRun);
        const arm = hwRef.current.arm;
        arm.r.fill(0);
        arm.r[13] = 0x10001000; // SP
        arm.r[14] = 0xFFFFFFFF; // LR
        arm.r[15] = assembled.instructions[0]?.addr ?? 0; // PC
        arm.flags = { N: 0, Z: 0, C: 0, V: 0 };
        arm.memory = { ...assembled.memoryInit };
        arm.program = assembled;
        arm.currentLine = assembled.instructions[0]?.lineNo ?? 1;
        arm.halted = false;
        setCompileStatus({
          ok: true,
          msg: `Assembled ${assembled.instructions.length} ARM instructions. Use Step (F11) or Run!`
        });
      } catch (err) {
        setCompileStatus({ ok: false, msg: `Assembler Error: ${err.message}` });
      }
      return;
    }

    setCompileStatus({ ok: true, msg: modeToRun === 'hex' ? 'Loading firmware…' : 'Compiling C for Cortex-M3…' });
    setConsoleOutput('');
    const gpioProxies = [0, 1, 2, 3].map(createGpioProxy);
    runFirmware({
      mode: modeToRun,
      source: codeToRun,
      isCurrent: () => runIdRef.current === myRunId,
      getInputs: () => inputsRef.current,
      onBuild: build => {
        setHexContent(build.hex);
        if (modeToRun === 'hex') setFlashStatusMsg('HEX checksums verified. Firmware loaded into the Cortex-M3 emulator.');
        setCompileStatus({ ok: true, msg: `Compiled & running on Cortex-M3.${build.diagnostics ? '\n' + build.diagnostics : ' 0 errors.'}` });
      },
      onFrame: frame => {
        applyFirmwareFrame(frame, hwRef.current, gpioProxies, syncHardwareSignals);
        if (frame.output) setConsoleOutput(previous => (previous + frame.output).slice(-16000));
      },
      onHalt: exitCode => {
        setIsRunning(false);
        setCompileStatus({ ok: exitCode === 0, msg: `Program finished (exit code ${exitCode}).` });
      }
    }).catch(error => {
      if (runIdRef.current !== myRunId) return;
      setIsRunning(false);
      setCompileStatus({ ok: false, msg: error.message });
      if (modeToRun === 'hex') setFlashStatusMsg(error.message);
    });
  }, [createGpioProxy, resetHardwareRegisters, syncHardwareSignals]);

  // Execute one single ARMv7-M Assembly instruction
  const stepArmInstruction = useCallback(() => {
    const hw = hwRef.current;
    const arm = hw.arm;
    if (!arm.program || arm.halted) return;

    const pc = arm.r[15] >>> 0;
    const inst = arm.program.instructions.find(i => i.addr === pc);
    if (!inst) {
      arm.halted = true;
      return;
    }

    arm.currentLine = inst.lineNo;

    // Parse condition code & S flag
    let baseOp = inst.op;
    let cond = 'AL';
    for (const c of COND_SUFFIXES) {
      if (baseOp.endsWith(c) && baseOp !== c && !ARM_MNEMONICS.has(baseOp)) {
        cond = c;
        baseOp = baseOp.slice(0, -c.length);
        break;
      }
    }

    // Check CPSR condition
    const { N, Z, C, V } = arm.flags;
    const condPass =
      cond === 'AL' ? true :
      cond === 'EQ' ? Z === 1 :
      cond === 'NE' ? Z === 0 :
      cond === 'CS' || cond === 'HS' ? C === 1 :
      cond === 'CC' || cond === 'LO' ? C === 0 :
      cond === 'MI' ? N === 1 :
      cond === 'PL' ? N === 0 :
      cond === 'HI' ? C === 1 && Z === 0 :
      cond === 'LS' ? C === 0 || Z === 1 :
      cond === 'GE' ? N === V :
      cond === 'LT' ? N !== V :
      cond === 'GT' ? Z === 0 && N === V :
      cond === 'LE' ? Z === 1 || N !== V : true;

    // Advance PC by default
    arm.r[15] = (pc + 4) >>> 0;
    if (!condPass) return;

    const setUpdateFlags = baseOp.endsWith('S') && !['CMP', 'CMN', 'TST', 'TEQ', 'BL', 'B'].includes(baseOp);
    if (setUpdateFlags && baseOp.length > 3) baseOp = baseOp.slice(0, -1);

    const getRegIdx = (tok) => {
      if (!tok) return 0;
      const u = tok.trim().toUpperCase();
      if (u === 'SP') return 13;
      if (u === 'LR') return 14;
      if (u === 'PC') return 15;
      const m = u.match(/^R(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    };

    const evalOp2 = (tok) => {
      if (!tok) return 0;
      const t = tok.trim();
      if (t.startsWith('#') || t.startsWith('=')) {
        return parseArmNumber(t, arm.program.equs, arm.program.labels);
      }
      if (/^(R\d+|SP|LR|PC)$/i.test(t)) {
        return arm.r[getRegIdx(t)] >>> 0;
      }
      return parseArmNumber(t, arm.program.equs, arm.program.labels);
    };

    const updateNZ = (res32) => {
      const u = res32 >>> 0;
      arm.flags.Z = u === 0 ? 1 : 0;
      arm.flags.N = (u & 0x80000000) !== 0 ? 1 : 0;
    };

    const ops = inst.operands;
    if (baseOp === 'MOV') {
      const rd = getRegIdx(ops[0]);
      let val = evalOp2(ops[1]);
      if (ops[2] && /^LSL/i.test(ops[2])) {
        const sh = parseArmNumber(ops[2].replace(/LSL/i, '').trim(), arm.program.equs);
        val = (val << sh) >>> 0;
      } else if (ops[2] && /^LSR/i.test(ops[2])) {
        const sh = parseArmNumber(ops[2].replace(/LSR/i, '').trim(), arm.program.equs);
        val = (val >>> sh) >>> 0;
      }
      arm.r[rd] = val >>> 0;
      if (setUpdateFlags) updateNZ(arm.r[rd]);
    } else if (baseOp === 'MVN') {
      const rd = getRegIdx(ops[0]);
      arm.r[rd] = (~evalOp2(ops[1])) >>> 0;
      if (setUpdateFlags) updateNZ(arm.r[rd]);
    } else if (baseOp === 'ADD' || baseOp === 'SUB' || baseOp === 'AND' || baseOp === 'ORR' || baseOp === 'EOR' || baseOp === 'BIC' || baseOp === 'MUL' || baseOp === 'LSL' || baseOp === 'LSR') {
      const rd = getRegIdx(ops[0]);
      const rnVal = ops.length === 2 ? arm.r[rd] : evalOp2(ops[1]);
      const op2Val = ops.length === 2 ? evalOp2(ops[1]) : evalOp2(ops[2]);
      let res = 0;
      if (baseOp === 'ADD') {
        const sum = rnVal + op2Val;
        res = sum >>> 0;
        if (setUpdateFlags) arm.flags.C = sum > 0xFFFFFFFF ? 1 : 0;
      } else if (baseOp === 'SUB') {
        res = (rnVal - op2Val) >>> 0;
        if (setUpdateFlags) arm.flags.C = rnVal >= op2Val ? 1 : 0;
      } else if (baseOp === 'AND') res = (rnVal & op2Val) >>> 0;
      else if (baseOp === 'ORR') res = (rnVal | op2Val) >>> 0;
      else if (baseOp === 'EOR') res = (rnVal ^ op2Val) >>> 0;
      else if (baseOp === 'BIC') res = (rnVal & ~op2Val) >>> 0;
      else if (baseOp === 'MUL') res = Math.imul(rnVal, op2Val) >>> 0;
      else if (baseOp === 'LSL') res = (rnVal << (op2Val & 31)) >>> 0;
      else if (baseOp === 'LSR') res = (rnVal >>> (op2Val & 31)) >>> 0;

      arm.r[rd] = res;
      if (setUpdateFlags) updateNZ(res);
    } else if (baseOp === 'CMP') {
      const rnVal = evalOp2(ops[0]);
      const op2Val = evalOp2(ops[1]);
      const diff = (rnVal - op2Val) >>> 0;
      updateNZ(diff);
      arm.flags.C = rnVal >= op2Val ? 1 : 0;
    } else if (baseOp === 'LDR' || baseOp === 'LDRB' || baseOp === 'LDRH' || baseOp === 'STR' || baseOp === 'STRB' || baseOp === 'STRH') {
      const rt = getRegIdx(ops[0]);
      const addrPart = ops.slice(1).join(', ').trim();

      if (addrPart.startsWith('=')) {
        arm.r[rt] = evalOp2(addrPart) >>> 0;
      } else {
        // Parse [Rn], #imm or [Rn, #imm]! or [Rn, Rm]
        const preMatch = addrPart.match(/^\[([^\]]+)\](!)?(?:\s*,\s*(.+))?$/);
        if (preMatch) {
          const inside = preMatch[1].split(',').map(s => s.trim());
          const writeBack = Boolean(preMatch[2]);
          const postOffset = preMatch[3];
          const rn = getRegIdx(inside[0]);
          const offset = inside[1] ? evalOp2(inside[1]) : 0;
          const effAddr = (arm.r[rn] + (offset | 0)) >>> 0;

          if (baseOp.startsWith('LDR')) {
            if (effAddr >= 0x2009C000 && effAddr < 0x2009C080) {
              const pIdx = Math.floor((effAddr - 0x2009C000) / 0x20);
              const regOff = (effAddr - 0x2009C000) % 0x20;
              arm.r[rt] = regOff === 0x14 ? hw.gpio[pIdx].FIOPIN : hw.gpio[pIdx].FIODIR;
            } else if (baseOp === 'LDRB') {
              arm.r[rt] = (arm.memory[effAddr] || 0) & 0xFF;
            } else if (baseOp === 'LDRH') {
              arm.r[rt] = ((arm.memory[effAddr] || 0) | ((arm.memory[effAddr + 1] || 0) << 8)) & 0xFFFF;
            } else {
              arm.r[rt] = readMem32(arm.memory, effAddr);
            }
          } else {
            // STR / STRB / STRH (supports GPIO MMIO at 0x2009C000!)
            const val = arm.r[rt] >>> 0;
            if (effAddr >= 0x2009C000 && effAddr < 0x2009C080) {
              const pIdx = Math.floor((effAddr - 0x2009C000) / 0x20);
              const regOff = (effAddr - 0x2009C000) % 0x20;
              const proxy = createGpioProxy(pIdx);
              if (regOff === 0x00) proxy.FIODIR = val;
              else if (regOff === 0x14) proxy.FIOPIN = val;
              else if (regOff === 0x18) proxy.FIOSET = val;
              else if (regOff === 0x1C) proxy.FIOCLR = val;
            } else if (baseOp === 'STRB') {
              arm.memory[effAddr] = val & 0xFF;
            } else if (baseOp === 'STRH') {
              arm.memory[effAddr] = val & 0xFF;
              arm.memory[effAddr + 1] = (val >> 8) & 0xFF;
            } else {
              writeMem32(arm.memory, effAddr, val);
            }
          }

          if (writeBack) arm.r[rn] = effAddr;
          else if (postOffset) arm.r[rn] = (arm.r[rn] + (evalOp2(postOffset) | 0)) >>> 0;
        }
      }
    } else if (baseOp === 'B' || baseOp === 'BL') {
      const targetLbl = ops[0];
      const targetAddr = arm.program.labels[targetLbl];
      if (baseOp === 'BL') arm.r[14] = arm.r[15];
      if (targetAddr !== undefined) {
        if (targetAddr === pc) {
          // Self-branch `STOP B STOP`
          arm.halted = true;
        }
        arm.r[15] = targetAddr >>> 0;
      }
    }
  }, [createGpioProxy]);

  // Continuous runner for ARM Assembly mode when `isRunning` is true
  useEffect(() => {
    if (codeMode !== 'asm' || !isPowered || !isRunning) return;
    const timer = setInterval(() => {
      if (!hwRef.current.arm.halted) {
        stepArmInstruction();
      }
    }, Math.max(20, Math.round(120 / simSpeed)));
    return () => clearInterval(timer);
  }, [codeMode, isPowered, isRunning, simSpeed, stepArmInstruction]);

  // Launch initial template on mount
  useEffect(() => {
    startLiveExecution(codeMode, sourceCode);
    return () => { runIdRef.current += 1; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================================================
  // 30FPS UI SNAPSHOT REFRESH LOOP (READS HWREF -> RENDERS BOARD & REGISTERS)
  // ==========================================================================
  useEffect(() => {
    const timer = setInterval(() => {
      if (!inputsRef.current.isPowered) {
        setUiSnapshot(prev => ({
          ...prev,
          leds: Array(8).fill(false),
          ledByte: 0,
          sevenSegBytes: [0, 0, 0, 0],
          lcdActive: false,
          pwmDutyPercent: 0
        }));
        return;
      }

      syncHardwareSignals();
      const hw = hwRef.current;
      const inp = inputsRef.current;

      // 1. Compute 8 LEDs on CNA1 based on whatever Controller Port is wired to CNA1
      const cna1Ctrl = Object.keys(inp.cables).find(k => inp.cables[k] === 'CNA1');
      let ledByte = 0;
      if (cna1Ctrl) {
        const pMap = CONTROLLER_PORTS[cna1Ctrl].pinMap;
        for (let i = 0; i < 8; i++) {
          if (pMap[i]) {
            const bitVal = (hw.gpio[pMap[i].port].FIOPIN >>> pMap[i].bit) & 1;
            ledByte |= bitVal << i;
          }
        }
      }
      const leds = Array.from({ length: 8 }, (_, i) => Boolean((ledByte >> i) & 1));

      // 2. Compute 4-Digit 7-Segment Display (POV vs Instant)
      const now = performance.now();
      const sevenSegBytes = [0, 0, 0, 0];
      if (Object.values(inp.cables).includes('CNA2') && Object.values(inp.cables).includes('CNB2')) {
        for (let i = 0; i < 4; i++) {
          if (povEnabled) {
            sevenSegBytes[i] = now - hw.sevenSegPov[i].lastSeen < 800 ? hw.sevenSegPov[i].byte : 0;
          } else {
            sevenSegBytes[i] = hw.sevenSegInstant[i];
          }
        }
      }

      // 3. Compute 16x2 LCD Strings from DDRAM (0x00..0x0F Line 1, 0x40..0x4F Line 2)
      const cnadConnected = Object.values(inp.cables).includes('CNAD') && inp.jumpers.JP5;
      const lcdLine1 = String.fromCharCode(...hw.lcd.ddram.slice(0x00, 0x10));
      const lcdLine2 = String.fromCharCode(...hw.lcd.ddram.slice(0x40, 0x50));

      // 4. Compute PWM1.4 Duty Cycle on LD10 (CNB1 Pin 1 -> P1.23)
      let pwmDutyPercent = 0;
      if (inp.cables.CNB === 'CNB1') {
        if ((hw.pincon.PINSEL3 & 0x00008000) !== 0 && hw.pwm1.MR0 > 0) {
          pwmDutyPercent = Math.min(100, Math.max(0, Math.round((hw.pwm1.MR4 / hw.pwm1.MR0) * 100)));
        } else {
          // If P1.23 is driven as plain GPIO
          pwmDutyPercent = ((hw.gpio[1].FIOPIN >>> 23) & 1) * 100;
        }
      }

      // 5. Read first 8 words of SRAM (0x10000000) for ASM Memory Inspector
      const sramWords = [];
      for (let i = 0; i < 8; i++) {
        const addr = 0x10000000 + i * 4;
        sramWords.push({
          addr: `0x${addr.toString(16).toUpperCase()}`,
          val: `0x${readMem32(hw.arm.memory, addr).toString(16).toUpperCase().padStart(8, '0')}`
        });
      }

      setUiSnapshot({
        leds,
        ledByte,
        sevenSegBytes,
        lcdLine1,
        lcdLine2,
        lcdActive: cnadConnected,
        pwmDutyPercent,
        regs: {
          PINSEL0: hw.pincon.PINSEL0,
          PINSEL3: hw.pincon.PINSEL3,
          FIODIR0: hw.gpio[0].FIODIR,
          FIOPIN0: hw.gpio[0].FIOPIN,
          FIOSET0: hw.gpio[0].FIOSET,
          FIOCLR0: hw.gpio[0].FIOCLR,
          FIODIR1: hw.gpio[1].FIODIR,
          FIOPIN1: hw.gpio[1].FIOPIN,
          FIODIR2: hw.gpio[2].FIODIR,
          FIOPIN2: hw.gpio[2].FIOPIN,
          ADCR: hw.adc.ADCR,
          ADGDR: hw.adc.ADGDR,
          PWM1_MR0: hw.pwm1.MR0,
          PWM1_MR4: hw.pwm1.MR4
        },
        armRegs: Array.from(hw.arm.r),
        armFlags: { ...hw.arm.flags },
        armLine: hw.arm.currentLine,
        sramWords
      });
    }, 35);

    return () => clearInterval(timer);
  }, [povEnabled, syncHardwareSignals]);

  // ==========================================================================
  // USER INTERACTION HANDLERS
  // ==========================================================================
  const handleSelectTemplate = (tplId) => {
    uploadIdRef.current += 1;
    setHexLoading(false);
    const tpl = LAB_TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return;
    setSelectedTemplateId(tpl.id);
    setCodeMode(tpl.mode);
    setSourceCode(tpl.code);
    setCables({ ...tpl.cables });
    setJumpers({ ...tpl.jumpers });
    setHexContent('');
    setSourceName(tpl.mode === 'c' ? 'main.c' : 'main.s');
    setIsRunning(true);
    setIsPowered(true);
    if (tpl.mode === 'asm') setActiveRightTab('asmdebug');
    else setActiveRightTab('keil');
    startLiveExecution(tpl.mode, tpl.code);
  };

  const handleCompileAndRun = () => {
    uploadIdRef.current += 1;
    setHexLoading(false);
    setHexContent('');
    setIsPowered(true);
    setIsRunning(true);
    startLiveExecution(codeMode, sourceCode);
  };

  const handleSourceUpload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const uploadId = ++uploadIdRef.current;
    if (!/\.c$/i.test(file.name) || file.size > 256 * 1024) {
      setCompileStatus({ ok: false, msg: 'Choose a .c source file up to 256 KiB.' });
      return;
    }
    try {
      const code = await file.text();
      if (uploadId !== uploadIdRef.current) return;
      runIdRef.current += 1;
      setIsRunning(false);
      setSourceCode(code);
      setSourceName(file.name);
      setCodeMode('c');
      setSelectedTemplateId('');
      setHexContent('');
      setActiveRightTab('keil');
      setCompileStatus({ ok: true, msg: `Loaded ${file.name}. Click Compile & Run (F7).` });
    } catch (error) { setCompileStatus({ ok: false, msg: `Could not read file: ${error.message}` }); }
  };

  useEffect(() => {
    const keydown = event => {
      if (event.key === 'F7') { event.preventDefault(); handleCompileAndRun(); }
      if (event.key === 'F5') { event.preventDefault(); setIsRunning(value => !value); }
      if (event.key === 'F11' && codeMode === 'asm') { event.preventDefault(); setIsRunning(false); stepArmInstruction(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const downloadHex = () => {
    const url = URL.createObjectURL(new Blob([hexContent], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url; link.download = sourceName.replace(/\.[^.]+$/, '') + '.hex'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Upload or Flash any Intel .HEX file
  const parsedHexInfo = useMemo(() => parseIntelHexFile(hexContent), [hexContent]);

  const handleHexFileUpload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const uploadId = ++uploadIdRef.current;
    runIdRef.current += 1;
    setIsRunning(false);
    setHexContent('');
    setHexLoading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('HEX file exceeds 2 MiB.');
      const content = await file.text();
      if (uploadId !== uploadIdRef.current) return;
      setHexContent(content);
      setActiveRightTab('flashmagic');
      setFlashStatusMsg(`Loaded "${file.name}". Click "Load & Run .HEX".`);
    } catch (error) {
      if (uploadId === uploadIdRef.current) setFlashStatusMsg(error.message);
    } finally {
      if (uploadId === uploadIdRef.current) setHexLoading(false);
    }
  };

  const handleStartFlashMagic = () => {
    setCodeMode('hex');
    setSourceCode(hexContent);
    setSourceName('firmware.hex');
    setIsPowered(true);
    setIsRunning(true);
    setFlashStatusMsg('Loading HEX into the Cortex-M3 emulator. Build output shows validation or CPU errors.');
    startLiveExecution('hex', hexContent);
  };

  const handlePortClick = (portId, isController) => {
    if (!selectedPort) {
      setSelectedPort({ id: portId, isController });
      return;
    }
    if (selectedPort.id === portId) {
      setSelectedPort(null);
      return;
    }
    if (selectedPort.isController !== isController) {
      const ctrlPort = selectedPort.isController ? selectedPort.id : portId;
      const periphPort = selectedPort.isController ? portId : selectedPort.id;
      setCables(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k] === periphPort) delete next[k];
        });
        next[ctrlPort] = periphPort;
        return next;
      });
      setSelectedPort(null);
    } else {
      setSelectedPort({ id: portId, isController });
    }
  };

  // Oscilloscope Canvas for TP5 (PWM1.4) & TP6 (Average DC Voltage)
  const scopeCanvasRef = useRef(null);
  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#061017';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#112a38';
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const duty = uiSnapshot.pwmDutyPercent / 100;
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const periodPx = 80;
    for (let x = 0; x < w; x++) {
      const phase = (x % periodPx) / periodPx;
      const y = phase < duty ? 22 : 76;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const avgY = 76 - duty * 54;
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, avgY);
    ctx.lineTo(w, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [uiSnapshot.pwmDutyPercent, activeRightTab]);

  // Decode 7-segment raw byte (hgfedcba) into character or render authentic 7-segment SVG
  const renderSevenSegSVG = (rawByte) => {
    const segs = {
      a: Boolean(rawByte & 0x01),
      b: Boolean(rawByte & 0x02),
      c: Boolean(rawByte & 0x04),
      d: Boolean(rawByte & 0x08),
      e: Boolean(rawByte & 0x10),
      f: Boolean(rawByte & 0x20),
      g: Boolean(rawByte & 0x40),
      dp: Boolean(rawByte & 0x80)
    };
    const onColor = '#ef4444';
    const offColor = '#2a0a0a';
    return (
      <svg viewBox="0 0 50 80" className="w-11 h-16 overflow-visible">
        {/* A */}
        <polygon points="12,8 38,8 34,13 16,13" fill={segs.a ? onColor : offColor} />
        {/* B */}
        <polygon points="39,9 42,37 37,35 35,14" fill={segs.b ? onColor : offColor} />
        {/* C */}
        <polygon points="37,43 40,70 35,66 33,45" fill={segs.c ? onColor : offColor} />
        {/* D */}
        <polygon points="10,71 34,71 31,66 14,66" fill={segs.d ? onColor : offColor} />
        {/* E */}
        <polygon points="8,43 12,45 10,65 6,69" fill={segs.e ? onColor : offColor} />
        {/* F */}
        <polygon points="10,9 14,14 12,35 7,37" fill={segs.f ? onColor : offColor} />
        {/* G */}
        <polygon points="11,39 15,36 35,36 38,39 34,42 14,42" fill={segs.g ? onColor : offColor} />
        {/* DP */}
        <circle cx="44" cy="70" r="3" fill={segs.dp ? onColor : offColor} />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* =================================================================== */}
      {/* TOP BAR: MANIPAL LAB HEADER & TEMPLATE / ENGINE CONTROLS            */}
      {/* =================================================================== */}
      <header className="bg-slate-900 border-b border-emerald-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base md:text-lg tracking-tight text-white">
                ALS-SDA-ARMCTXM3-01 Live Execution Simulator
              </h1>
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Real C + ARM ASM + .HEX Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Compile custom <code className="text-emerald-300">LPC17xx.h</code> C program, ARMv7-M Assembly, or load an Intel <code className="text-amber-300">.hex</code> binary!
            </p>
          </div>
        </div>

        {/* Template Selector + Execution Controls */}
        <div className="min-w-0 max-w-full flex flex-wrap items-center gap-2">
          <select
            aria-label="Example program"
            value={selectedTemplateId}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="min-w-0 max-w-full bg-slate-800 border border-slate-700 text-xs text-emerald-300 font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="" disabled>Custom uploaded source</option>
            {LAB_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>
                {t.labNo}: {t.title}
              </option>
            ))}
          </select>

          <button
            onClick={handleCompileAndRun}
            className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg shadow transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Compile & Run Code (F7)
          </button>

          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setIsPowered(!isPowered)}
              className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition ${
                isPowered ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              {isPowered ? '+5V' : 'OFF'}
            </button>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition ${
                isRunning ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isRunning ? 'Running' : 'Paused'}
            </button>
            <button
              onClick={() => { setIsRunning(true); setIsPowered(true); startLiveExecution(codeMode, sourceCode); }}
              className="px-2 py-1 rounded text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 transition"
              title="Press SW1 Reset & Restart Firmware"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              SW1 RST
            </button>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* STATUS & SPEED BAR                                                  */}
      {/* =================================================================== */}
      <div className="bg-slate-900/70 border-b border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {compileStatus.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className={compileStatus.ok ? 'text-emerald-300 font-medium' : 'text-rose-400 font-semibold'}>
            {compileStatus.msg.split('\n')[0]}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Sim Speed:</span>
            {[0.5, 1, 2, 5].map(spd => (
              <button
                key={spd}
                onClick={() => setSimSpeed(spd)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
                  simSpeed === spd ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
          {Object.keys(cables).length > 0 && (
            <button
              onClick={() => setCables({})}
              className="text-rose-400 hover:text-rose-300 flex items-center gap-1 text-[11px]"
            >
              <Trash2 className="w-3 h-3" /> Unplug All FRC
            </button>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* MAIN WORKSPACE: LEFT/CENTER PCB BOARD + RIGHT LIVE IDE & DEBUGGER   */}
      {/* =================================================================== */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 p-3 md:p-4 overflow-x-hidden">

        {/* ================================================================= */}
        {/* LEFT 7 COLUMNS: ALS-SDA-ARMCTXM3-01 INTERACTIVE HARDWARE BOARD     */}
        {/* ================================================================= */}
        <div className="xl:col-span-7 flex flex-col gap-3">
          <div className="relative rounded-2xl bg-[#072619] border-2 border-emerald-700/60 shadow-2xl p-4 overflow-hidden">
            {/* Corner Mounting Holes */}
            <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-amber-400/70 absolute top-2.5 left-2.5" />
            <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-amber-400/70 absolute top-2.5 right-2.5" />
            <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-amber-400/70 absolute bottom-2.5 left-2.5" />
            <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-amber-400/70 absolute bottom-2.5 right-2.5" />

            {/* Silk-Screen Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-emerald-500/20 pb-2 mb-3 px-4">
              <div>
                <span className="font-mono text-xs font-bold tracking-widest text-emerald-300 block">
                  ADVANCED ELECTRONIC SYSTEMS • ALS-SDA-ARMCTXM3-01
                </span>
                <span className="font-mono text-[10px] text-emerald-400/70">
                  GPIO / 7-SEG / HD44780 LCD / ADC / PWM SIMULATED BOARD
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-slate-800/90 border border-slate-500 rounded px-2 py-1 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-mono text-[10px] text-slate-200">CN9 ISP ({comPort})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${isPowered ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-red-950'}`} />
                  <span className="font-mono text-[10px] text-emerald-200">+5V PWR</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* COLUMN 1: LPC1768 MCU, CN-HEADERS, POTS & JUMPERS */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-3 bg-[#051c12]/90 border border-emerald-600/30 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="relative w-28 h-28 shrink-0 bg-slate-900 border-2 border-slate-600 rounded-md flex flex-col items-center justify-center p-2 shadow-inner">
                    <span className="font-mono text-[11px] font-bold text-slate-200">NXP</span>
                    <span className="font-mono text-xs font-extrabold text-emerald-400">LPC1768</span>
                    <span className="font-mono text-[9px] text-slate-400">CORTEX-M3</span>
                    <span className="font-mono text-[8px] text-amber-300 mt-1">
                      Mode: {codeMode.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    <div className="bg-slate-900/80 border border-emerald-700/40 rounded p-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[10px] text-emerald-300 block font-bold">SW1 (RESET)</span>
                        <span className="font-mono text-[9px] text-slate-400">Restart Code</span>
                      </div>
                      <button
                        onClick={() => { setIsRunning(true); setIsPowered(true); startLiveExecution(codeMode, sourceCode); }}
                        className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-90 border-2 border-slate-300 shadow-md flex items-center justify-center text-[10px] font-bold text-white"
                      >
                        RST
                      </button>
                    </div>

                    <div className="bg-slate-900/80 border border-emerald-700/40 rounded p-2 flex items-center justify-between text-[10px] font-mono">
                      <div>
                        <span className="text-amber-300 font-bold block">SW21 & JP3</span>
                        <span className="text-[9px] text-slate-400">ISP Mode</span>
                      </div>
                      <button
                        onClick={() => setJumpers(j => ({ ...j, SW21: !j.SW21, JP3: !j.JP3 }))}
                        className={`px-2 py-1 rounded font-bold border ${
                          jumpers.SW21
                            ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                            : 'bg-slate-800 border-slate-600 text-slate-400'
                        }`}
                      >
                        {jumpers.SW21 ? 'ISP ON' : 'RUN'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Controller 10-Pin FRC Connectors (CNA, CNB, CNC, CND) with Live Pin LEDs! */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-emerald-300/80">
                    <span>CONTROLLER 10-PIN HEADERS</span>
                    <span>LIVE PIN LOGIC</span>
                  </div>
                  {Object.values(CONTROLLER_PORTS).map(port => {
                    const connectedTo = cables[port.id];
                    const isSelected = selectedPort?.id === port.id;
                    return (
                      <div
                        key={port.id}
                        onClick={() => handlePortClick(port.id, true)}
                        className={`cursor-pointer rounded-lg p-2 border transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50'
                            : connectedTo
                            ? 'bg-slate-900/95 border-emerald-500/60 hover:border-emerald-400'
                            : 'bg-slate-900/60 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-white">{port.id}</span>
                            <span className="font-mono text-[10px] text-slate-400">{port.subtitle}</span>
                          </div>
                          {connectedTo ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-emerald-300">
                                FRC → <strong>{connectedTo}</strong>
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCables(prev => {
                                    const n = { ...prev };
                                    delete n[port.id];
                                    return n;
                                  });
                                }}
                                className="text-[10px] text-rose-400 hover:underline ml-1"
                              >
                                [Unplug]
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono text-[9px] text-slate-500">Click to attach FRC cable</span>
                          )}
                        </div>

                        {/* Live 10-Pin Logic Analyzer Dots */}
                        <div className="bg-slate-950 border-2 border-slate-600 px-2 py-1 rounded grid grid-cols-5 gap-1">
                          {port.pinMap.map((pDef, idx) => {
                            const isHigh = pDef
                              ? Boolean(((uiSnapshot.regs[`FIOPIN${pDef.port}`] || 0) >>> pDef.bit) & 1)
                              : false;
                            return (
                              <div
                                key={idx}
                                className={`w-2 h-2 rounded-full transition-colors ${
                                  isHigh
                                    ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                                    : 'bg-slate-700'
                                }`}
                                title={pDef ? `Pin ${idx + 1} (${pDef.label}): ${isHigh ? 'HIGH (1)' : 'LOW (0)'}` : `Pin ${idx + 1}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Potentiometers POT1 (AD0.5) & POT4 (AD0.4) & Jumpers */}
                <div className="bg-slate-900/80 border border-emerald-700/40 rounded-lg p-2.5 space-y-2">
                  <div className="text-[10px] font-mono font-bold text-emerald-300 flex justify-between">
                    <span>ADC POTENTIOMETERS & JUMPERS</span>
                    <span className="text-amber-300">LIVE 12-BIT ADC</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-slate-300">POT1 (AD0.5 / P1.31):</span>
                      <span className="text-emerald-400 font-bold">
                        {pot1Voltage.toFixed(2)}V (0x{Math.round((pot1Voltage / 3.3) * 0xFFF).toString(16).toUpperCase().padStart(3, '0')})
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="3.3"
                      step="0.01"
                      value={pot1Voltage}
                      onChange={(e) => setPot1Voltage(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-slate-300">POT4 (AD0.4 / P1.30):</span>
                      <span className="text-cyan-400 font-bold">
                        {jumpers.JP18
                          ? `${pot4Voltage.toFixed(2)}V (0x${Math.round((pot4Voltage / 3.3) * 0xFFF).toString(16).toUpperCase().padStart(3, '0')})`
                          : 'JP18 OPEN'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="3.3"
                      step="0.01"
                      value={pot4Voltage}
                      onChange={(e) => setPot4Voltage(parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {[
                      { id: 'JP4', label: 'JP4 (Keypad)' },
                      { id: 'JP5', label: 'JP5 (LCD +5V)' },
                      { id: 'JP16', label: 'JP16 (BkLight)' },
                      { id: 'JP18', label: 'JP18 (AD0.4)' }
                    ].map(jp => (
                      <button
                        key={jp.id}
                        onClick={() => setJumpers(prev => ({ ...prev, [jp.id]: !prev[jp.id] }))}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition ${
                          jumpers[jp.id]
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold'
                            : 'bg-slate-800 border-slate-700 text-slate-500 line-through'
                        }`}
                      >
                        {jp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* COLUMN 2 & 3: PERIPHERAL HEADERS & LIVE HARDWARE MODULES */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                {/* Peripheral 10-Pin FRC Connectors */}
                <div className="bg-[#051c12]/90 border border-emerald-600/30 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-emerald-300/80 mb-2">
                    <span>PERIPHERAL 10-PIN FRC HEADERS</span>
                    <span>CLICK TO PATCH FRC CABLE</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.values(PERIPHERAL_PORTS).map(pPort => {
                      const connectedCtrl = Object.keys(cables).find(k => cables[k] === pPort.id);
                      const isSelected = selectedPort?.id === pPort.id;
                      return (
                        <div
                          key={pPort.id}
                          onClick={() => handlePortClick(pPort.id, false)}
                          className={`cursor-pointer rounded-lg p-2 border transition flex flex-col justify-between ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50'
                              : connectedCtrl
                              ? 'bg-slate-900/95 border-emerald-500/60 hover:border-emerald-400'
                              : 'bg-slate-900/60 border-slate-700/80 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-white">{pPort.id}</span>
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold"
                              style={{
                                backgroundColor: connectedCtrl ? `${pPort.color}33` : '#1e293b',
                                color: connectedCtrl ? '#6ee7b7' : '#64748b'
                              }}
                            >
                              {connectedCtrl ? `← ${connectedCtrl}` : 'OPEN'}
                            </span>
                          </div>
                          <span className="font-mono text-[9px] text-slate-400 truncate mt-0.5">
                            {pPort.subtitle}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* MODULE A: 8-LED BANK (CNA1: LD1 - LD8) */}
                <div className="bg-[#051c12]/90 border border-emerald-600/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-emerald-300">
                      8-BIT LED BANK (LD1–LD8 • CNA1)
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      Live Bus: <code className="text-emerald-300">0x{uiSnapshot.ledByte.toString(16).toUpperCase().padStart(2, '0')}</code>
                    </span>
                  </div>
                  <div className="grid grid-cols-8 gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                    {uiSnapshot.leds.map((isOn, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <div
                          className={`w-6 h-6 rounded-full border-2 transition-all duration-75 ${
                            isOn
                              ? 'bg-red-500 border-red-300 shadow-[0_0_14px_#ef4444]'
                              : 'bg-red-950/60 border-red-900/50'
                          }`}
                        />
                        <span className="font-mono text-[10px] text-slate-300 font-bold">LD{idx + 1}</span>
                        <span className="font-mono text-[9px] text-slate-500">Pin {idx + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* MODULE B: 4-DIGIT MULTIPLEXED 7-SEGMENT DISPLAY (U11-U8) */}
                <div className="bg-[#051c12]/90 border border-emerald-600/30 rounded-xl p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-emerald-300 block">
                        MULTIPLEXED 7-SEGMENT DISPLAY (U11–U8 • CNA2 + CNB2)
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        Driven by your code's <code className="text-emerald-300">FIOPIN</code> writes to CNA2 (Segments) & CNB2 (U7 Decoder)
                      </span>
                    </div>
                    <button
                      onClick={() => setPovEnabled(!povEnabled)}
                      className={`text-[10px] font-mono px-2 py-1 rounded border transition ${
                        povEnabled
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-amber-500/20 border-amber-400 text-amber-200'
                      }`}
                    >
                      {povEnabled ? 'POV: Smooth' : 'POV: Raw Strobe'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
                    {['U11 (EN4)', 'U10 (EN3)', 'U9 (EN2)', 'U8 (EN1)'].map((unitLabel, idx) => (
                      <div
                        key={unitLabel}
                        className="bg-[#120808] border border-red-950/80 rounded-lg p-2 flex flex-col items-center justify-center relative"
                      >
                        <span className="font-mono text-[9px] text-slate-500 mb-1">{unitLabel}</span>
                        {renderSevenSegSVG(uiSnapshot.sevenSegBytes[idx] || 0)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* MODULE C: 16x2 HD44780 LCD (CNAD) + MODULE D: 4x4 KEYPAD (CNB3) & SW2/LD10 */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6 flex flex-col justify-between gap-2 bg-[#051c12]/90 border border-emerald-600/30 rounded-xl p-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-bold text-emerald-300">
                          16x2 LCD (CN11 • CNAD)
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          HD44780 State Machine
                        </span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border-2 border-slate-700 shadow-inner">
                        <div
                          className={`rounded p-2.5 font-mono text-sm tracking-[0.18em] leading-tight h-16 flex flex-col justify-center border ${
                            !uiSnapshot.lcdActive
                              ? 'bg-[#1f291e] text-transparent border-slate-800'
                              : jumpers.JP16
                              ? 'bg-[#65a30d] text-[#0a1f05] font-bold shadow-[inset_0_0_18px_rgba(132,204,22,0.8)] border-lime-400'
                              : 'bg-[#2c3b29] text-[#091405] font-bold border-slate-700'
                          }`}
                        >
                          <div data-testid="lcd-line1" className="truncate whitespace-pre">{uiSnapshot.lcdLine1}</div>
                          <div data-testid="lcd-line2" className="truncate whitespace-pre mt-1">{uiSnapshot.lcdLine2}</div>
                        </div>
                      </div>
                    </div>

                    {/* SW2 & LD10 PWM (CNB1) */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSw2Pressed(!sw2Pressed)}
                          className={`w-10 h-10 rounded-lg border-2 font-mono text-xs font-bold transition flex flex-col items-center justify-center ${
                            sw2Pressed
                              ? 'bg-emerald-600 border-white text-white shadow-[0_0_12px_#10b981]'
                              : 'bg-slate-800 border-slate-500 text-slate-300 hover:border-emerald-400'
                          }`}
                        >
                          <span>SW2</span>
                          <span className="text-[8px]">{sw2Pressed ? '1' : '0'}</span>
                        </button>
                        <div>
                          <span className="font-mono text-[11px] font-bold text-white block">
                            SW2 (CNB1 Pin 7)
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 block">
                            Drives P2.12 when CNB↔CNB1
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 border-l border-slate-800 pl-2">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-6 h-6 rounded-full border-2 border-amber-300 transition-all"
                            style={{
                              backgroundColor: `rgba(250, 204, 21, ${Math.max(0.12, uiSnapshot.pwmDutyPercent / 100)})`,
                              boxShadow:
                                uiSnapshot.pwmDutyPercent > 5
                                  ? `0 0 ${Math.round(uiSnapshot.pwmDutyPercent / 4)}px #facc15`
                                  : 'none'
                            }}
                          />
                          <span className="font-mono text-[9px] text-amber-300 font-bold mt-0.5">
                            LD10 ({uiSnapshot.pwmDutyPercent}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4x4 Matrix Keypad (CNB3) */}
                  <div className="md:col-span-6 bg-[#051c12]/90 border border-emerald-600/30 rounded-xl p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-bold text-emerald-300">
                        4x4 MATRIX KEYPAD (SW3–SW18 • CNB3)
                      </span>
                      <span className="font-mono text-[9px] text-slate-400">
                        Hold key while scanning
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      {KEYPAD_KEYS.map(k => {
                        const isPressed = activeKey?.sw === k.sw;
                        return (
                          <button
                            key={k.sw}
                            onMouseDown={() => setActiveKey(k)}
                            onMouseUp={() => setActiveKey(null)}
                            onMouseLeave={() => activeKey?.sw === k.sw && setActiveKey(null)}
                            onTouchStart={(e) => { e.preventDefault(); setActiveKey(k); }}
                            onTouchEnd={() => setActiveKey(null)}
                            className={`py-1.5 px-1 rounded border font-mono text-center transition active:scale-95 ${
                              isPressed
                                ? 'bg-amber-500 border-white text-slate-950 font-bold shadow-[0_0_10px_#f59e0b]'
                                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                            }`}
                          >
                            <div className="text-xs font-bold">{k.label}</div>
                            <div className="text-[8px] text-slate-400">{k.sw}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FRC RIBBON CABLE PATCH BAY DROPDOWNS */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Cable className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-white">10-Core FRC Ribbon Cable Patch Bay:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {Object.keys(CONTROLLER_PORTS).map(cPort => (
                <div key={cPort} className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                  <span className="font-mono font-bold text-emerald-400">{cPort}</span>
                  <span className="text-slate-500">→</span>
                  <select
                    value={cables[cPort] || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCables(prev => {
                        const next = { ...prev };
                        if (!val) {
                          delete next[cPort];
                        } else {
                          Object.keys(next).forEach(k => {
                            if (next[k] === val) delete next[k];
                          });
                          next[cPort] = val;
                        }
                        return next;
                      });
                    }}
                    className="bg-transparent font-mono text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-900">Disconnected</option>
                    {Object.keys(PERIPHERAL_PORTS).map(pPort => (
                      <option key={pPort} value={pPort} className="bg-slate-900">
                        {pPort} ({PERIPHERAL_PORTS[pPort].name.split('(')[1].replace(')', '')})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT 5 COLUMNS: LIVE KEIL IDE, ASM DEBUGGER, .HEX & REGISTERS    */}
        {/* ================================================================= */}
        <div className="min-w-0 xl:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex border-b border-slate-800 bg-slate-950/60 overflow-x-auto">
            {[
              { id: 'keil', label: 'C / Assembly Editor', icon: FileCode },
              { id: 'asmdebug', label: 'ASM Debugger & RAM', icon: Binary },
              { id: 'flashmagic', label: 'Firmware (.hex)', icon: Upload },
              { id: 'registers', label: 'MMIO Registers', icon: Cpu },
              { id: 'scope', label: 'TP5/TP6 Scope', icon: Activity }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveRightTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                    activeRightTab === tab.id
                      ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* TAB 1: LIVE KEIL C & ARM ASSEMBLY EDITOR                        */}
          {/* --------------------------------------------------------------- */}
          {activeRightTab === 'keil' && (
            <div className="flex-1 flex flex-col p-3.5 gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Compiler Mode:</span>
                  <button
                    onClick={() => { runIdRef.current += 1; setIsRunning(false); setCodeMode('c'); }}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                      codeMode === 'c'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Embedded C (LPC17xx.h)
                  </button>
                  <button
                    onClick={() => { runIdRef.current += 1; setIsRunning(false); setCodeMode('asm'); }}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                      codeMode === 'asm'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    ARMv7-M Assembly (.s)
                  </button>
                </div>

                <button
                  onClick={handleCompileAndRun}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1.5 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Compile & Run (F7)
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-slate-400">{sourceName}</span>
                <label className="cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-white font-semibold">
                  Upload .c File
                  <input aria-label="Upload C source" type="file" accept=".c" onChange={handleSourceUpload} className="hidden" />
                </label>
                <button disabled={!hexContent} onClick={downloadHex} className="rounded bg-slate-800 px-3 py-1.5 disabled:opacity-40">Download compiled .hex</button>
              </div>
              <p className="text-[11px] text-slate-400">C11 • LPC17xx.h • stdint.h / stdio.h • AN_LCD.h. Wire the patch bay to match your program. Timing is approximate.</p>
              <textarea
                aria-label="Source code"
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                spellCheck={false}
                className="flex-1 min-h-[340px] w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed resize-none"
              />

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] space-y-0.5">
                <div className="text-slate-500 font-bold">Build Output</div>
                <div role="status" data-testid="build-output" className={`whitespace-pre-wrap break-words max-h-48 overflow-auto ${compileStatus.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {compileStatus.msg}
                </div>
                {consoleOutput && <pre aria-label="Program output" className="whitespace-pre-wrap text-slate-200">{consoleOutput}</pre>}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TAB 2: ARMv7-M ASSEMBLY STEP DEBUGGER & SRAM MEMORY INSPECTOR   */}
          {/* --------------------------------------------------------------- */}
          {activeRightTab === 'asmdebug' && (
            <div className="flex-1 flex flex-col p-3.5 gap-3 overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    ARM Cortex-M3 Core Registers & SRAM Inspector
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Active Line: <strong className="text-amber-300">{uiSnapshot.armLine || '—'}</strong> • Flags:
                    <span className="font-mono text-emerald-300 ml-1">
                      N={uiSnapshot.armFlags.N} Z={uiSnapshot.armFlags.Z} C={uiSnapshot.armFlags.C} V={uiSnapshot.armFlags.V}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (codeMode !== 'asm') {
                        handleSelectTemplate('asm_lab1_5');
                      } else {
                        setIsRunning(false);
                        stepArmInstruction();
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <StepForward className="w-3.5 h-3.5" />
                    Step (F11)
                  </button>
                  <button
                    onClick={() => startLiveExecution('asm', sourceCode)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                  >
                    Reset CPU
                  </button>
                </div>
              </div>

              {/* R0 - R15 Core Register File */}
              <div className="grid grid-cols-4 gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px]">
                {uiSnapshot.armRegs.map((val, idx) => {
                  const regName = idx === 13 ? 'SP' : idx === 14 ? 'LR' : idx === 15 ? 'PC' : `R${idx}`;
                  return (
                    <div key={idx} className="bg-slate-900 border border-slate-800 rounded px-2 py-1 flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold">{regName}</span>
                      <span className="text-emerald-300 font-semibold">
                        0x{(val >>> 0).toString(16).toUpperCase().padStart(8, '0')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Data SRAM Memory Window (0x10000000) */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] font-mono font-bold text-amber-300 mb-1.5">
                  SRAM DATA SEGMENT WINDOW (0x10000000 — 32-Bit Words)
                </div>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                  {uiSnapshot.sramWords.map(w => (
                    <div key={w.addr} className="flex justify-between bg-slate-900 px-2 py-1 rounded border border-slate-800/80">
                      <span className="text-slate-400">{w.addr}:</span>
                      <span className="text-cyan-300 font-bold">{w.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TAB 3: FLASH MAGIC 6.01 & THUMB-2 .HEX DISASSEMBLER/EMULATOR    */}
          {/* --------------------------------------------------------------- */}
          {activeRightTab === 'flashmagic' && (
            <div className="flex-1 flex flex-col p-3.5 gap-3 overflow-y-auto">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase">
                    Upload or Edit Intel HEX Firmware
                  </span>
                  <label className="cursor-pointer bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition">
                    <Upload className="w-3.5 h-3.5" />
                    Upload .hex File
                    <input aria-label="Upload HEX firmware" type="file" accept=".hex,.txt" onChange={handleHexFileUpload} className="hidden" />
                  </label>
                </div>

                <textarea
                  value={hexContent}
                  onChange={(e) => setHexContent(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-[11px] text-amber-300 focus:outline-none"
                />

                {/* Thumb-2 Disassembler Preview of the .hex file */}
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded bg-slate-900/70 p-2 font-mono text-[10px]">
                  <div className="text-slate-400 font-bold mb-1">
                    Thumb instruction preview (partial decoder) ({parsedHexInfo.totalBytes} bytes):
                  </div>
                  {parsedHexInfo.disassembled.slice(0, 128).map((d, i) => (
                    <div key={i} className="flex gap-2 py-0.5 border-b border-slate-800/40">
                      <span className="text-emerald-400">0x{d.addr.toString(16).toUpperCase().padStart(4, '0')}</span>
                      <span className="text-amber-300 w-16">{d.hex}</span>
                      <span className="text-slate-200">{d.asm}</span>
                    </div>
                  ))}
                </div>

                <button
                  disabled={hexLoading || !hexContent.trim()}
                  onClick={handleStartFlashMagic}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition"
                >
                  <Zap className="w-4 h-4" />
                  Load & Run .HEX
                </button>
                <div className="font-mono text-[11px] text-emerald-300">{flashStatusMsg}</div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TAB 4: LIVE LPC1768 MMIO PERIPHERAL REGISTERS                   */}
          {/* --------------------------------------------------------------- */}
          {activeRightTab === 'registers' && (
            <div className="flex-1 flex flex-col p-3.5 gap-3 overflow-y-auto">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Live LPC1768 Peripheral MMIO Registers (Updated by Your Code!)
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left font-mono text-xs break-all">
                  <thead className="bg-slate-900 text-slate-400 text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Register</th>
                      <th className="py-2 px-3">32-Bit Hex</th>
                      <th className="py-2 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {[
                      { name: 'LPC_PINCON->PINSEL0', val: uiSnapshot.regs.PINSEL0, desc: 'P0.0–P0.15 Function' },
                      { name: 'LPC_PINCON->PINSEL3', val: uiSnapshot.regs.PINSEL3, desc: 'P1.16–P1.31 (AD0.5/PWM1.4)' },
                      { name: 'LPC_GPIO0->FIODIR', val: uiSnapshot.regs.FIODIR0, desc: 'Port 0 Direction' },
                      { name: 'LPC_GPIO0->FIOPIN', val: uiSnapshot.regs.FIOPIN0, desc: 'Port 0 Live Pin Value' },
                      { name: 'LPC_GPIO0->FIOSET', val: uiSnapshot.regs.FIOSET0, desc: 'Port 0 Last Set Mask' },
                      { name: 'LPC_GPIO0->FIOCLR', val: uiSnapshot.regs.FIOCLR0, desc: 'Port 0 Last Clear Mask' },
                      { name: 'LPC_GPIO1->FIODIR', val: uiSnapshot.regs.FIODIR1, desc: 'Port 1 Direction' },
                      { name: 'LPC_GPIO1->FIOPIN', val: uiSnapshot.regs.FIOPIN1, desc: 'Port 1 Live Pin Value' },
                      { name: 'LPC_GPIO2->FIODIR', val: uiSnapshot.regs.FIODIR2, desc: 'Port 2 Direction' },
                      { name: 'LPC_GPIO2->FIOPIN', val: uiSnapshot.regs.FIOPIN2, desc: 'Port 2 Live Pin Value' },
                      { name: 'LPC_ADC->ADCR', val: uiSnapshot.regs.ADCR, desc: 'ADC Control Register' },
                      { name: 'LPC_ADC->ADGDR', val: uiSnapshot.regs.ADGDR, desc: 'ADC Global Data (DONE+12b)' },
                      { name: 'LPC_PWM1->MR0', val: uiSnapshot.regs.PWM1_MR0, desc: 'PWM1 Period Match 0' },
                      { name: 'LPC_PWM1->MR4', val: uiSnapshot.regs.PWM1_MR4, desc: 'PWM1.4 Pulse Width (P1.23)' }
                    ].map(row => (
                      <tr key={row.name} className="hover:bg-slate-900/50">
                        <td className="py-1.5 px-3 text-emerald-300 font-semibold">{row.name}</td>
                        <td className="py-1.5 px-3 text-amber-300">
                          0x{((row.val || 0) >>> 0).toString(16).toUpperCase().padStart(8, '0')}
                        </td>
                        <td className="py-1.5 px-3 text-slate-400 text-[10px]">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TAB 5: TP5 & TP6 PWM1.4 OSCILLOSCOPE                            */}
          {/* --------------------------------------------------------------- */}
          {activeRightTab === 'scope' && (
            <div className="flex-1 flex flex-col p-3.5 gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-emerald-400 uppercase">
                    TP5 (PWM1.4 Pulse) & TP6 (DC Average) Oscilloscope
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Driven directly by <code className="text-emerald-300">LPC_PWM1-&gt;MR4</code> and <code className="text-emerald-300">MR0</code> in your C code.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded">
                  Duty: {uiSnapshot.pwmDutyPercent}%
                </span>
              </div>
              <canvas
                ref={scopeCanvasRef}
                width={420}
                height={110}
                className="w-full rounded-xl border border-slate-700 bg-[#061017]"
              />
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs space-y-1">
                <div>LPC_PWM1-&gt;MR0 (Period): <strong className="text-emerald-400">{uiSnapshot.regs.PWM1_MR0}</strong></div>
                <div>LPC_PWM1-&gt;MR4 (Pulse Width): <strong className="text-amber-300">{uiSnapshot.regs.PWM1_MR4}</strong></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer data-testid="credits" className="border-t border-slate-800 bg-slate-900 px-4 py-3 text-center text-xs text-slate-400">
        Idea &amp; creation by <strong className="text-slate-200">Pragyan Das</strong> and <strong className="text-slate-200">Zaid Akhtar</strong>
        <span className="mx-2 text-slate-600">·</span>
        <a href="https://github.com/ZaiD-lgtm/LPC1768" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline">Source on GitHub</a>
      </footer>
    </div>
  );
}
