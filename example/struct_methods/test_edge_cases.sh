#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="edge_cases.x"
INPUT=""

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test - check for key outputs from each test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "" "" \
    "Test 1: Counter" \
    "After 2 increments: 12" \
    "After 1 decrement: 11" \
    "After reset: 0" \
    "Test 2: Rectangle" \
    "Area: 200" \
    "Perimeter: 60" \
    "After resize - Area: 75" \
    "Test 3: StringHolder" \
    "Text: Hello, Length: 5" \
    "Text: World, Length: 5" \
    "Test 4: Point" \
    "Distance from origin: 7" \
    "After moveTo(10,20): x=10, y=20" \
    "After moveBy(5,-10): x=15, y=10" \
    "Test 5: Node" \
    "Node value: 100" \
    "Test 6: Account" \
    "After deposit 500: 1500" \
    "Withdraw 300 success: 1, Balance: 1200" \
    "Withdraw 2000 success: 0, Balance: 1200" \
    "Test 7: Calculator" \
    "After addTwice(5): 20" \
    "After subtract(3): 17" \
    "After clear: 0" \
    "Test 8: IntArray" \
    "arr[2] = 30" \
    "Sum of array: 150" \
    "All tests completed"

if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll
