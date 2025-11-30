#!/bin/bash
cd "$(dirname "$0")"
source ../test_utils.sh

# Configuration
SOURCE_FILE="main.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("=== BPL Showcase ===" "--- Math & Structs ---" "v1: (1.000000, 2.000000, 3.000000)" "v2: (4.000000, 5.000000, 6.000000)" "v1 + v2: (5.000000, 7.000000, 9.000000)" "v1 . v2: 32.000000" "Normalized v3: (0.401610, 0.562254, 0.722897)" "--- Strings ---" "StringBuilder result: Hello, World! This is BPL." "--- Data Structures ---" "Popping items:" "  Item 3" "  Item 2" "  Item 1" "--- Virtual Machine ---" "VM Output: 30" "=== Showcase Complete ===")

compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "${EXPECTED[@]}"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm