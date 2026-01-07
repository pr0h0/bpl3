#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Compiling Benchmarks (Fibonacci Recursive) ===${NC}"

# Compile BPL
echo "Compiling BPL..."
COMPILER="../../index.ts"
if [ -f "$COMPILER" ]; then
    OUTPUT=$(bun "$COMPILER" fib.bpl "-O3")
    if [ $? -ne 0 ]; then
        echo "BPL Compilation failed:"
        echo "$OUTPUT"
        exit 1
    fi
else
    echo "Error: Compiler not found at $COMPILER"
    exit 1
fi

# Compile C
echo "Compiling C..."
gcc -O3 fib.c -o fib_c

# Compile Go
echo "Compiling Go..."
if command -v go &> /dev/null; then
    go build -o fib_go fib.go
else
    echo "Go not installed, skipping..."
fi

echo -e "\n${BLUE}=== Running Benchmarks (fib(40)) ===${NC}"

function run_benchmark {
    NAME=$1
    CMD=$2

    if [[ "$CMD" != *"python"* ]] && [[ "$CMD" != *"node"* ]] && [ ! -f "$CMD" ]; then
        echo -e "${NAME}: Executable not found"
        return
    fi

    start=$(date +%s%3N)
    $CMD > /dev/null
    end=$(date +%s%3N)
    duration=$((end-start))

    echo -e "${GREEN}$NAME: ${duration} ms${NC}"
}

# Run BPL
run_benchmark "BPL" "./fib"

# Run C
run_benchmark "C (O3)" "./fib_c"

# Run Go
if [ -f "./fib_go" ]; then
    run_benchmark "Go" "./fib_go"
fi

# Run Python
if command -v python3 &> /dev/null; then
    run_benchmark "Python" "python3 fib.py"
else
    echo "Python3 not installed, skipping..."
fi

# Run Node.js
if command -v node &> /dev/null; then
    run_benchmark "Node.js" "node fib.js"
else
    echo "Node.js not installed, skipping..."
fi

rm -f ./fib ./fib_c ./fib_go ./fib.ll