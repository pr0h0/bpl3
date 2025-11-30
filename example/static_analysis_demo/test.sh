#!/bin/bash

# Check if running from root or subdirectory
if [ -f "index.ts" ]; then
    # Running from root
    TRANS_CMD="bun index.ts"
    DIR="example/static_analysis_demo"
elif [ -f "../../index.ts" ]; then
    # Running from subdirectory
    TRANS_CMD="bun ../../index.ts"
    DIR="."
else
    echo "Error: Cannot find index.ts"
    exit 1
fi

echo "Testing Unused Variables..."
OUTPUT=$($TRANS_CMD $DIR/unused.x 2>&1)
echo "$OUTPUT"
if echo "$OUTPUT" | grep -q "Warning"; then
    echo "PASS: Warnings detected for unused variables"
else
    echo "FAIL: No warnings for unused variables"
fi

echo "Testing Unreachable Code..."
OUTPUT=$($TRANS_CMD $DIR/unreachable.x 2>&1)
echo "$OUTPUT"
if echo "$OUTPUT" | grep -q "Unreachable code detected"; then
    echo "PASS: Warning detected for unreachable code"
else
    echo "FAIL: No warning for unreachable code"
fi

echo "Testing Loop False Positives..."
OUTPUT=$($TRANS_CMD $DIR/loop_false_positive.x 2>&1)
echo "$OUTPUT"
# We expect warning for 'unused_var' but NOT for 'i' or 'sum'
if echo "$OUTPUT" | grep -q "Variable 'unused' is declared but never used"; then
    if echo "$OUTPUT" | grep -q "Variable 'i' is declared but never used"; then
        echo "FAIL: False positive detected for variable 'i'"
    elif echo "$OUTPUT" | grep -q "Variable 'sum' is declared but never used"; then
        echo "FAIL: False positive detected for variable 'sum'"
    else
        echo "PASS: Correctly handled variables in loop"
    fi
else
    echo "FAIL: Expected warning for 'unused_var' not found"
fi
