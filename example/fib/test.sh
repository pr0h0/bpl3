#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="fib.x"
INPUT="93"
EXPECTED="12200160415121876738"

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
