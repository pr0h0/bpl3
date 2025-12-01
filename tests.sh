#!/bin/bash

SPECIFIC_TEST=""
GENERATOR=""

if [ "$1" == "--llvm" ]; then
    GENERATOR="llvm"
    shift
fi

if [ "$1" != "" ]; then
    SPECIFIC_TEST="/$1/"
fi

# Initialize failure tracking
FAILED_TESTS=()



echo "Starting tests..."

# Run modular tests
echo "---------------------------------------------------"
echo "Running modular tests..."
TEST_SCRIPTS=$(find "./example$SPECIFIC_TEST" -name "test.sh" -type f | sort)
for TEST_SCRIPT in $TEST_SCRIPTS; do
    DIR_NAME=$(dirname "$TEST_SCRIPT")
    TEST_NAME=$(basename "$DIR_NAME")

    echo "---------------------------------------------------"
    echo "Running test for $TEST_NAME..."

    GEN_ARG=""
    if [ "$GENERATOR" == "llvm" ]; then
        GEN_ARG="--llvm"
    fi

    pushd "$DIR_NAME" > /dev/null
    OUT=$(./test.sh "$GEN_ARG")
    TEST_RES=$?
    popd > /dev/null

    if [ $TEST_RES -ne 0 ]; then
        echo "❌ Test failed for $TEST_NAME"
        FAILED_TESTS+=("$TEST_NAME (Modular Test)")
        echo "$OUT"
    elif [ ${#FAILED_TESTS[@]} -eq 0 ]; then
        echo "✅ Test passed for $TEST_NAME"
    fi
done



# Report results
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
