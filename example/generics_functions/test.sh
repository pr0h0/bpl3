#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="simple.x"
INPUT="" # Input for the program if needed
ARGS="" # Command line arguments
ENV_VARS="" # Environment variables (e.g. "VAR=val")
EXPECTED="42" # Expected output from identity<u64>(42)

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

echo "✓ Generics functions test passed"
