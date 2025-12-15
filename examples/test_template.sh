#!/bin/bash
source "$(dirname "$0")/../test_utils.sh"

FAILED=0

# Define tests here
# run_test_case "Test Name" "main.bpl" "Expected Output" ExpectedExitCode "Args" "Input" "EnvVars"

# Example:
# run_test_case "Basic Test" "main.bpl" "Hello" 0 || FAILED=1

exit $FAILED
