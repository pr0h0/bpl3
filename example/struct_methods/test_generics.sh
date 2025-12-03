#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="generics_methods.x"
INPUT=""

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "" "" \
    "Test 1: Box<i32>" \
    "Box<i32> value: 42" \
    "After setValue(100): 100" \
    "Test 2: Box<i64>" \
    "Box<i64> value: 9999" \
    "Test 3: Pair<i32, i64>" \
    "Pair: first=10, second=20" \
    "After set: first=99, second=88" \
    "Test 4: Container<i32>" \
    "Initial count: 0" \
    "After 2 increments: 2" \
    "All generic method tests completed"

if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll

