#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="args_demo.x"
INPUT=""
ARGS="arg1 arg2 arg3"
ENV_VARS=""
EXPECTED=("(argc): 4" "Arg 1: arg1" "Arg 2: arg2" "Arg 3: arg3")

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
