#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="nested_generics.x"
INPUT=""

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "" "" \
    "Test 1: Inner<i32>" \
    "Inner value: 42" \
    "After setValue(100): 100" \
    "Test 2: Inner<i64>" \
    "Inner value (i64): 9999" \
    "After setMultiplier(10): 10" \
    "Test 3: Outer<i32>" \
    "Inner multiplier via outer method: 2" \
    "After setInnerMultiplier(7): 7" \
    "Count after increment: 1" \
    "Test 4: Outer<i64>" \
    "Inner value (i64): 8888" \
    "Outer count: 10" \
    "Test 5: Container<i32, i64>" \
    "First: 10, Second: 20" \
    "After set - First: 99, Second: 88" \
    "Before swap - First mult: 3, Second mult: 7" \
    "After swap - First mult: 7, Second mult: 3" \
    "Test 6: Wrapper<i32>" \
    "Wrapper ID: 123" \
    "Outer count: 5" \
    "Inner value from wrapper: 777" \
    "After set via wrapper: 555" \
    "After 2 increments: 7" \
    "Inner multiplier via wrapper: 4" \
    "All nested generic tests completed"

if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll
