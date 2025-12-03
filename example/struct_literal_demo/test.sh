#!/bin/bash

FAILED_TEST_COUNT=0

bash test_mixed.sh
if [ $? -ne 0 ]; then
    FAILED_TEST_COUNT=$((FAILED_TEST_COUNT + 1))
fi

source ../test_utils.sh

# Configuration
SOURCE_FILE="struct_literal.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=(
    "p1: (10, 20)"
    "p2: (30, 40)"
    "Rect: [(0, 0), (100, 100)]"
)

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

if [ $FAILED_TEST_COUNT -ne 0 ]; then
    exit 1
fi