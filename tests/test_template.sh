#!/bin/bash
# Navigate to project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

# --- Configuration ---
# Define expected output, arguments, environment variables, and input here.
# Leave empty if not applicable.

EXPECTED_OUTPUT=""
ARGS=""
ENV_VARS=""
INPUT=""

# ---------------------

# Run compiler
# You might need to adjust how args/env/input are passed depending on your compiler/runner
# For now, assuming ./cmp.sh compiles and runs the program

TEST_DIR=$(dirname "$0")
TEST_NAME=$(basename "$TEST_DIR")
OUTPUT_FILE="$TEST_DIR/output.txt"
ERROR_FILE="$TEST_DIR/error.txt"
MAIN_FILE="$TEST_DIR/main.bpl"

# Construct command
CMD="./cmp.sh $MAIN_FILE $ARGS"

# Run with environment variables and input
if [ -n "$ENV_VARS" ]; then
  export $ENV_VARS
fi

if [ -n "$INPUT" ]; then
  echo "$INPUT" | $CMD > "$OUTPUT_FILE" 2> "$ERROR_FILE"
else
  $CMD > "$OUTPUT_FILE" 2> "$ERROR_FILE"
fi

EXIT_CODE=$?

# Check exit code (assuming 0 is success for the program execution)
# Note: cmp.sh might return non-zero if compilation fails.
# If you want to test compilation failure, adjust this check.

if [ $EXIT_CODE -ne 0 ]; then
  echo "Test Failed: Program exited with code $EXIT_CODE"
  cat "$ERROR_FILE"
  rm "$OUTPUT_FILE" "$ERROR_FILE"
  # rm "$TEST_DIR/main.ll"
  exit 1
fi

# Check output
if [ -n "$EXPECTED_OUTPUT" ]; then
    if grep -q "$EXPECTED_OUTPUT" "$OUTPUT_FILE"; then
      # echo "Test Passed"
      rm "$OUTPUT_FILE" "$ERROR_FILE"
      rm "$TEST_DIR/main.ll"
      exit 0
    else
      echo "Test Failed: Output mismatch"
      echo "Expected: $EXPECTED_OUTPUT"
      echo "Got:"
      cat "$OUTPUT_FILE"
      rm "$OUTPUT_FILE" "$ERROR_FILE"
      # rm "$TEST_DIR/main.ll"
      exit 1
    fi
else
    # If no expected output, just check exit code (already done)
    rm "$OUTPUT_FILE" "$ERROR_FILE"
    rm "$TEST_DIR/main.ll"
    exit 0
fi
