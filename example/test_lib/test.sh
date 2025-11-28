#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="test_lib.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("12")

# Special compilation for library test
# Note: test_lib.x imports lib.x, so the transpiler should handle it.
# We don't need to explicitly compile lib.x here.

compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "${EXPECTED[@]}"
RES=$?

# Cleanup
rm -f "$EXE"
# Also cleanup the object file generated for lib.x
rm -f "lib.o" 

if [ $RES -ne 0 ]; then
    exit 1
fi
