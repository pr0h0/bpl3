#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="cast_demo.x"
EXPECTED=("u64 1000 cast to u8: 232" "f64 3.14" "Pointer")

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "" "" "" "${EXPECTED[@]}"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll

