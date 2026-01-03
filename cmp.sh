#!/bin/bash

# Script to compile and run BPL programs using the new 'run' command
# Usage: ./cmp.sh <file.bpl> [args...]

SCRIPT_DIR=$(dirname "$0");

bun "$SCRIPT_DIR/index.ts" run "$@"
exit $?
