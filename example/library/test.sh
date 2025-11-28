#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="library.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("Book successfully checked out." "User Name: John Smith" "Book Title: The Low-Level Primer")

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
