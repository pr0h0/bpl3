#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="sort_input.x"
INPUT="5 3 8 1 2 7"
ARGS=""
ENV_VARS=""
EXPECTED=("1 2 3 7 8")

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
