#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="exec_demo.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("HELLO PIPE" "Running 'whoami'..." "Running 'ls -la' on current directory...")

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "${EXPECTED[@]}"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"
