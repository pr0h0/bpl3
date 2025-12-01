#!/bin/bash
source ../test_utils.sh

FILES=("mov_const.x" "mov_const_sizes.x" "mov_const_safety.x")
EXPECTED_OUTER=(
    "a=10, b=20, c=30"
    "a=10, b=20, c=30, d=40"
    "a=10, b=20"
)
# Loop through each test file
index=0
for FILE in "${FILES[@]}"; do
    echo "Running test for $FILE"

    # Configuration
    SOURCE_FILE="$FILE"
    INPUT="" # Input for the program if needed
    ARGS="" # Command line arguments
    ENV_VARS="" # Environment variables (e.g. "VAR=val")
    EXPECTED=("${EXPECTED_OUTER[$index]}")

    # Compile
    compile "$SOURCE_FILE"
    if [ $? -ne 0 ]; then
        exit 1
    fi

    # Run Test
    EXE="${SOURCE_FILE%.x}"
    assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "$EXPECTED"
    if [ $? -ne 0 ]; then
        exit 1
    fi

    # Cleanup
    rm -f "$EXE"
    rm -f *.o
    rm -f *.asm
    rm -f *.ll

    echo "Test for $FILE completed."
    index=$((index + 1))
done