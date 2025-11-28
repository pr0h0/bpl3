#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="main.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("5, 4" "Number: 41" "Number: 200" "NICE")

# Compile
# The original test script ran: bun index.ts -q example/lib_example/main.x
# It didn't seem to compile other files explicitly, so presumably main.x imports them
# and the transpiler handles it.

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
# Cleanup any object files that might have been created
rm -f *.o

if [ $RES -ne 0 ]; then
    exit 1
fi
