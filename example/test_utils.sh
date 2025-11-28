#!/bin/bash

# Common testing utilities

# Determine the directory of this script (example/)
UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Determine the root of the transpiler (one level up from example/)
TRANSPIER_ROOT="$(dirname "$UTILS_DIR")"

compile() {
    local SOURCE_FILE="$1"
    local LIBS="$2"

    echo "Compiling $SOURCE_FILE..."

    # Get the directory where the test is running (e.g., example/fib)
    local TEST_DIR=$(pwd)

    # We need to run the transpiler from the root directory
    pushd "$TRANSPIER_ROOT" > /dev/null

    # Calculate relative path from root to the test directory
    local REL_PATH="${TEST_DIR#$TRANSPIER_ROOT/}"

    # Construct the full path to the source file relative to root
    local FULL_SOURCE_PATH="$REL_PATH/$SOURCE_FILE"

    if [ -n "$LIBS" ]; then
        bun index.ts -q "$FULL_SOURCE_PATH" $LIBS
    else
        bun index.ts -q "$FULL_SOURCE_PATH"
    fi
    COMPILE_RES=$?
    popd > /dev/null

    if [ $COMPILE_RES -ne 0 ]; then
        echo "❌ Compilation failed for $SOURCE_FILE"
        return 1
    fi
    return 0
}

assert_output() {
    local EXE="$1"
    local INPUT="$2"
    local ARGS="$3"
    local ENV_VARS="$4"
    shift 4
    local EXPECTED_OUTPUTS=("$@")
    
    if [ ! -f "$EXE" ]; then
        echo "❌ Executable not found: $EXE"
        return 1
    fi

    # Construct command
    local CMD="./$EXE"
    if [ -n "$ARGS" ]; then
        CMD="$CMD $ARGS"
    fi
    
    if [ -n "$ENV_VARS" ]; then
        CMD="env $ENV_VARS $CMD"
    fi

    # Use stdbuf -o0 to avoid buffering issues when redirecting to file
    if [ -n "$INPUT" ]; then
        echo "$INPUT" | stdbuf -o0 $CMD > output.tmp
    else
        stdbuf -o0 $CMD > output.tmp
    fi
    
    local RUN_RES=$?
    local ACTUAL_OUTPUT=$(cat output.tmp)
    rm -f output.tmp
    
    if [ $RUN_RES -ne 0 ]; then
        echo "❌ Execution failed (Exit code: $RUN_RES)"
        return 1
    fi

    local ALL_PASSED=1
    for EXPECTED in "${EXPECTED_OUTPUTS[@]}"; do
        if ! echo "$ACTUAL_OUTPUT" | grep -Fq -e "$EXPECTED"; then
            echo "❌ Missing expected output: '$EXPECTED'"
            ALL_PASSED=0
        fi
    done

    if [ $ALL_PASSED -eq 1 ]; then
        echo "✅ Test passed"
        return 0
    else
        echo "❌ Test failed"
        echo "Actual output:"
        echo "$ACTUAL_OUTPUT"
        return 1
    fi
}
