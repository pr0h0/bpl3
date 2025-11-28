#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="operators.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("(a < 5) || (b < 5) : 1" "a + b = 13" "a << 1 = 20")

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
