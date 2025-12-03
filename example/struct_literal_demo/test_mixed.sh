#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="test_mixed.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=(
    "c1: rgb(255, 128, 64)"
    "c2: rgb(50, 200, 100)"
    "Point: (10, 20, 30)"
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
