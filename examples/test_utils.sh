#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPILER="$PROJECT_ROOT/cmp.sh"

run_test_case() {
    local test_name="$1"
    local source_file="$2"
    local expected_output="$3"
    local expected_exit_code="${4:-0}"
    local args="${5:-}"
    local input="${6:-}"
    local env_vars="${7:-}"

    echo -n "  Running $test_name... "

    local output_file="output.tmp"
    
    # Construct command
    local cmd="$COMPILER $source_file $args"
    if [ -n "$env_vars" ]; then
        cmd="$env_vars $cmd"
    fi
    
    # Run
    if [ -n "$input" ]; then
        echo "$input" | eval "$cmd" > "$output_file" 2>&1
    else
        eval "$cmd" > "$output_file" 2>&1
    fi
    
    local exit_code=$?
    
    # Check exit code
    if [ $exit_code -ne $expected_exit_code ]; then
        echo -e "${RED}FAILED${NC} (Exit code mismatch)"
        echo "    Expected: $expected_exit_code"
        echo "    Got: $exit_code"
        echo "    Output:"
        cat "$output_file"
        rm "$output_file"
        return 1
    fi
    
    # Check output
    if [ -n "$expected_output" ]; then
        if ! grep -Fq "$expected_output" "$output_file"; then
            echo -e "${RED}FAILED${NC} (Output mismatch)"
            echo "    Expected to contain: $expected_output"
            echo "    Got:"
            cat "$output_file"
            rm "$output_file"
            return 1
        fi
    fi
    
    echo -e "${GREEN}PASSED${NC}"
    rm "$output_file"
    return 0
}
