#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
bun ../../index.ts bit_twiddle.bpl -O 3
clang -O3 bit_twiddle.c -o bit_twiddle_c
go build -o bit_twiddle_go bit_twiddle.go

./bit_twiddle
./bit_twiddle_c
./bit_twiddle_go
node bit_twiddle.js
python3 bit_twiddle.py
