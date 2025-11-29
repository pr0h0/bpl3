#!/bin/bash

SPECIFIC_TEST=""
if [ "$1" != "" ]; then
    SPECIFIC_TEST="/$1/"
fi

# Initialize failure tracking
FAILED_TESTS=()

# Function to run a single test case
run_test() {
    FILE="$1"
    LIBS="$2"

    echo "---------------------------------------------------"
    echo "Testing $FILE..."

    # Compile the file
    # Usage: ./cmp.sh <source.x> [libs...]
    if [ -n "$LIBS" ]; then
        bun index.ts -q "$FILE" $LIBS
    else
        bun index.ts -q "$FILE"
    fi

    COMPILE_RES=$?
    if [ $COMPILE_RES -ne 0 ]; then
        echo "❌ Compilation failed for $FILE"
        FAILED_TESTS+=("$FILE (Compilation)")
        return
    fi

    # Determine executable name
    BASENAME=$(basename "$FILE" .x)
    DIRNAME=$(dirname "$FILE")
    EXE="$DIRNAME/$BASENAME"

    # Determine input for specific tests
    INPUT=""
    case "$BASENAME" in
        "fib")
            INPUT="93"
        ;;
        "collatz")
            INPUT="27"
        ;;
        "sort_input")
            INPUT="5 3 8 1 2 7"
        ;;
    esac

    # Run the executable
    if [ -f "$EXE" ]; then
        if [ -n "$INPUT" ]; then
            echo "$INPUT" | "$EXE"
        else
            "$EXE"
        fi
        RUN_RES=$?
        if [ $RUN_RES -ne 0 ]; then
            echo "❌ Execution failed for $FILE (Exit code: $RUN_RES)"
            FAILED_TESTS+=("$FILE (Execution)")
        else
            echo "✅ Test passed for $FILE"
        fi

        # Cleanup executable
        rm -f "$EXE"
    else
        echo "❌ Executable not found for $FILE"
        FAILED_TESTS+=("$FILE (No Executable)")
    fi
}

echo "Starting tests..."

# 1. Run modular tests
echo "---------------------------------------------------"
echo "Running modular tests..."
TEST_SCRIPTS=$(find "./example$SPECIFIC_TEST" -name "test.sh" -type f | sort)
for TEST_SCRIPT in $TEST_SCRIPTS; do
    DIR_NAME=$(dirname "$TEST_SCRIPT")
    TEST_NAME=$(basename "$DIR_NAME")
    
    echo "---------------------------------------------------"
    echo "Running test for $TEST_NAME..."
    
    pushd "$DIR_NAME" > /dev/null
    ./test.sh
    TEST_RES=$?
    popd > /dev/null
    
    if [ $TEST_RES -ne 0 ]; then
        echo "❌ Test failed for $TEST_NAME"
        FAILED_TESTS+=("$TEST_NAME (Modular Test)")
    else
        echo "✅ Test passed for $TEST_NAME"
    fi
done

# 2. Run all other standalone tests
FILES=$(find ./example -name "*.x" -type f | sort)
for FILE in $FILES; do
    # Skip files we've already handled or that shouldn't be run directly
    if [[ "$FILE" == *"lib.x" ]] || [[ "$FILE" == *"test_lib.x" ]] || [[ "$FILE" == *"lib_example/"* ]]; then
        continue
    fi

    # Check if this file is in a directory that has a test.sh
    DIR_NAME=$(dirname "$FILE")
    if [ -f "$DIR_NAME/test.sh" ]; then
        # Already handled by modular tests
        continue
    fi

    run_test "$FILE" ""
    [ $SKIP_PROMPT -eq 0 ] && read -p "Press Enter to continue to the next test..."
done

# 3. Report results
echo "---------------------------------------------------"
if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "⚠️  Some tests failed:"
    for TEST in "${FAILED_TESTS[@]}"; do
        echo "  - $TEST"
    done
    exit 1
fi
