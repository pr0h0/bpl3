#!/bin/bash

SPECIFIC_TEST=""

if [ "$1" != "" ]; then
    SPECIFIC_TEST="/$1/"
fi

# Create a temporary directory for test results
RESULTS_DIR=$(mktemp -d)
trap "rm -rf $RESULTS_DIR" EXIT

# Function to run a single test
run_test_script() {
    local TEST_SCRIPT="$1"
    local RESULTS_DIR="$2"
    local DIR_NAME=$(dirname "$TEST_SCRIPT")
    local TEST_NAME=$(basename "$DIR_NAME")
    local OUTPUT_FILE="$RESULTS_DIR/${TEST_NAME}.log"
    local STATUS_FILE="$RESULTS_DIR/${TEST_NAME}.status"
    
    # Run the test
    if (cd "$DIR_NAME" && ./test.sh > "$OUTPUT_FILE" 2>&1); then
        echo "0" > "$STATUS_FILE"
        echo "✅ $TEST_NAME passed"
    else
        echo "1" > "$STATUS_FILE"
        echo "❌ $TEST_NAME failed"
    fi
}

export -f run_test_script

echo "Starting tests in parallel..."
echo "---------------------------------------------------"

# Find tests
TEST_SCRIPTS=$(find "./example$SPECIFIC_TEST" -name "test.sh" -type f | sort)

if [ -z "$TEST_SCRIPTS" ]; then
    echo "No tests found."
    exit 0
fi

# Determine number of processors
if command -v nproc > /dev/null; then
    JOBS=$(nproc)
elif command -v sysctl > /dev/null; then
    JOBS=$(sysctl -n hw.ncpu)
else
    JOBS=4
fi

echo "Running with $JOBS parallel jobs..."

# Run tests using xargs
echo "$TEST_SCRIPTS" | xargs -I {} -P "$JOBS" bash -c 'run_test_script "$1" "$2"' _ {} "$RESULTS_DIR"

# Check results
FAILED_TESTS=()
# We need to check if any status files exist, otherwise the loop might fail or run once with empty string
if [ -n "$(ls -A $RESULTS_DIR/*.status 2>/dev/null)" ]; then
    for STATUS_FILE in "$RESULTS_DIR"/*.status; do
        TEST_NAME=$(basename "$STATUS_FILE" .status)
        STATUS=$(cat "$STATUS_FILE")
        
        if [ "$STATUS" -ne 0 ]; then
            FAILED_TESTS+=("$TEST_NAME")
            echo "---------------------------------------------------"
            echo "Output for failed test $TEST_NAME:"
            cat "$RESULTS_DIR/${TEST_NAME}.log"
        fi
    done
fi

echo "---------------------------------------------------"
if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "⚠️  ${#FAILED_TESTS[@]} tests failed:"
    for TEST in "${FAILED_TESTS[@]}"; do
        echo "  - $TEST"
    done
    exit 1
fi
