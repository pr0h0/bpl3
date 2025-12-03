#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="comprehensive.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("identity<u64>(42) = 42" "identity<u32>(100) = 100" "swap result = 1000" "process<u64> result: 999" "process<u32> result: 42" "add<u64> result: 10")

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
