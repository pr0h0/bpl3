#!/bin/bash
source ../test_utils.sh

FAILED_TEST_COUNT=0

bash ./test_edge_cases.sh
if [ $? -ne 0 ]; then
    FAILED_TEST_COUNT=$((FAILED_TEST_COUNT + 1))
fi

bash ./test_generics.sh
if [ $? -ne 0 ]; then
    FAILED_TEST_COUNT=$((FAILED_TEST_COUNT + 1))
fi

bash ./test_nested.sh
if [ $? -ne 0 ]; then
    FAILED_TEST_COUNT=$((FAILED_TEST_COUNT + 1))
fi

# Configuration
SOURCE_FILE="user.x"
INPUT=""
EXPECTED1="Hello, my name is Alice and I am 25 years old"
EXPECTED2="After setAge: Hello, my name is Alice and I am 30 years old"
EXPECTED3="User is an adult"

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "" "" "$EXPECTED1" "$EXPECTED2" "$EXPECTED3"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll


if [ $FAILED_TEST_COUNT -ne 0 ]; then
    exit 1
fi