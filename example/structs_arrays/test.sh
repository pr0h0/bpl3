#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="structs_arrays.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("Point[4]:" "After shuffling:")

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