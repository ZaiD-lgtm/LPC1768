#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
if ! command -v arm-none-eabi-gcc >/dev/null && [ ! -x .toolchain/usr/bin/arm-none-eabi-gcc ] && [ -z "${ARM_TOOLCHAIN_BIN:-}" ]; then
  if ! command -v apt-get >/dev/null; then
    echo 'Install Arm GNU Toolchain and put arm-none-eabi-gcc on PATH (or set ARM_TOOLCHAIN_BIN).'
    exit 1
  fi
  mkdir -p .toolchain/packages
  (cd .toolchain/packages && apt-get download gcc-arm-none-eabi binutils-arm-none-eabi libnewlib-dev libnewlib-arm-none-eabi)
  for package in .toolchain/packages/*.deb; do dpkg-deb -x "$package" .toolchain; done
fi
npm ci
