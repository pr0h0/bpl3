#!/bin/bash
# Test script for Inheritance features
source ../test_utils.sh

# Function to run a test
run_test() {
    local SOURCE_FILE="$1"
    echo "----------------------------------------"
    echo "Running $SOURCE_FILE"
    
    compile "$SOURCE_FILE"
    if [ $? -ne 0 ]; then
        echo "❌ Compilation failed for $SOURCE_FILE"
        exit 1
    fi

    EXE="${SOURCE_FILE%.x}"
    ./"$EXE"
    if [ $? -ne 0 ]; then
        echo "❌ Execution failed for $SOURCE_FILE"
        exit 1
    fi
    
    # Cleanup
    rm -f "$EXE"
    rm -f *.o *.asm *.ll
}

run_test "basic_inheritance.x"
run_test "method_override.x"
run_test "generic_inheritance.x"
run_test "multi_level.x"

echo "----------------------------------------"
echo "All inheritance tests passed!"
