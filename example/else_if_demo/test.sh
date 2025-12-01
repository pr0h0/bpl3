#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="else_if_demo.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("x is 5" "a < b" "a == b" "a > b")

# Compile
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
rm -f *.ll