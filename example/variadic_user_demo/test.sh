#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="variadic_user_demo.x"
INPUT=""
EXPECTED=("Sum result: 150" "Final string: Hello, variadic world!")

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "" "" "$EXPECTED"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll