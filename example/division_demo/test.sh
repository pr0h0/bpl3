#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="division_demo.x"
INPUT="" # Input for the program if needed
ARGS="" # Command line arguments
ENV_VARS="" # Environment variables (e.g. "VAR=val")
EXPECTED=(
    "--- Division Demo ---"
    "10 / 3 = 3.333333"
    "10 // 3 = 3"
    "10.5 / 3.2 = 3.281250"
    "10.5 // 3.2 = 3.000000"
    "10 / 3.2 = 3.125000"
    "10 // 3.2 = 3.000000"
    "10.0 (f32) / 4.0 (f32) = 2.500000"
    "10.0 (f32) // 4.0 (f32) = 2.000000"
)

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "$EXPECTED"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll
