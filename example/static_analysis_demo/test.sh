#!/bin/bash
source ../test_utils.sh

# Helper to check warnings
check_warnings() {
    local SOURCE_FILE="$1"
    local EXPECTED_WARNING="$2"
    local UNEXPECTED_WARNING="$3"

    echo "Testing $SOURCE_FILE..."
    
    # We need to run the transpiler from the root directory
    pushd "$TRANSPIER_ROOT" > /dev/null
    
    # Construct path relative to root
    local REL_PATH="example/static_analysis_demo/$SOURCE_FILE"
    
    # Run transpiler and capture output (stderr included)
    # Use -q to suppress debug logs, but warnings are still printed
    OUTPUT=$(bun index.ts "$REL_PATH" 2>&1)
    RES=$?
    popd > /dev/null

    # Check for expected warning (grep message only to avoid color code issues)
    # The warning format is: [Color]Warning:[Reset] Message @ line X
    # So we search for the message part.
    local MSG_PART="${EXPECTED_WARNING#Warning: }"
    
    if echo "$OUTPUT" | grep -Fq "$MSG_PART"; then
        # Check for unexpected warning if provided
        if [ -n "$UNEXPECTED_WARNING" ]; then
            local UNEXPECTED_MSG="${UNEXPECTED_WARNING#Warning: }"
            if echo "$OUTPUT" | grep -Fq "$UNEXPECTED_MSG"; then
                echo "FAIL: Unexpected warning detected: '$UNEXPECTED_WARNING'"
                return 1
            fi
        fi
        echo "PASS: Warning detected"
        return 0
    else
        echo "FAIL: Expected warning not found: '$EXPECTED_WARNING'"
        echo "Output:"
        echo "$OUTPUT"
        return 1
    fi
}

# Test 1: Unused Variables
check_warnings "unused.x" "Warning: Variable 'a' is declared but never used"
if [ $? -ne 0 ]; then exit 1; fi

# Test 2: Unreachable Code
check_warnings "unreachable.x" "Warning: Unreachable code detected"
if [ $? -ne 0 ]; then exit 1; fi

# Test 3: Loop False Positives
# We expect warning for 'unused' but NOT for 'i' (loop variable)
check_warnings "loop_false_positive.x" "Warning: Variable 'unused' is declared but never used" "Variable 'i' is declared but never used"
if [ $? -ne 0 ]; then exit 1; fi

# Cleanup
rm -f unused unreachable loop_false_positive
rm -f *.o *.asm *.ll
