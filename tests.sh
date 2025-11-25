#!/bin/bash

SKIP_PROMPT=1
if [ "$1" == "--slow" ]; then
    SKIP_PROMPT=0
    shift
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
        ./cmp.sh -q "$FILE" $LIBS
    else
        ./cmp.sh -q "$FILE"
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

# 1. Special handling for library tests
echo "---------------------------------------------------"
echo "Building library lib.x..."
# Use -l to keep object file and remove executable (since it's a lib)
./cmp.sh -q -l example/lib.x
if [ $? -ne 0 ]; then
    echo "❌ Failed to build lib.x"
    FAILED_TESTS+=("example/lib.x (Build)")
else
    echo "✅ Built lib.x"
    
    # Run test_lib.x which depends on lib.x
    # We pass example/lib.o as a library dependency
    run_test "example/test_lib.x" "example/lib.o"
    
    # Cleanup lib.o
    rm -f example/lib.o
fi

# 2. Run all other standalone tests
FILES=$(find ./example -name "*.x" | sort)
for FILE in $FILES; do
    # Skip files we've already handled or that shouldn't be run directly
    if [[ "$FILE" == *"lib.x" ]] || [[ "$FILE" == *"test_lib.x" ]]; then
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
