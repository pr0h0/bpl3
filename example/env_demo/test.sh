#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="env_demo.x"
INPUT=""
ARGS=""
ENV_VARS="USER=testuser"
EXPECTED=("USER: testuser" "--- Environment Variables (from main arg) ---")

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
