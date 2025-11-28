#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="malloc.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("arr[4] = 45" "Allocated array address:")

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
