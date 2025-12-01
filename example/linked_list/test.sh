#!/bin/bash
source ../test_utils.sh



# Configuration
SOURCE_FILE="linked_list.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("10 -> 20 -> 30 -> 40 -> 50 -> NULL" "1 -> 4 -> 5 -> NULL")

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
