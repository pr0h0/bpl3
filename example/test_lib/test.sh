#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="test_lib.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("12")

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
# Also cleanup the object file generated for lib.x
rm -f "lib.o" 
# Also cleanup the assembly file generated for lib.x
rm -f "lib.asm"
