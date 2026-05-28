#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
bun ../../index.ts dot.bpl -O 3
clang -O3 dot.c -o dot_c
go build -o dot_go dot.go

./dot
./dot_c
./dot_go
node dot.js
python3 dot.py
