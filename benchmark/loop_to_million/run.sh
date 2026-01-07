#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Compiling Benchmarks ===${NC}"

# Compile BPL
echo "Compiling BPL..."
# Ensure we use the local compiler
COMPILER="../../index.ts"
if [ -f "$COMPILER" ]; then
    OUTPUT=$(bun "$COMPILER" loop.bpl "-O3")
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
gcc -O3 loop.c -o loop_c

# Compile Go
echo "Compiling Go..."
if command -v go &> /dev/null; then
    go build -o loop_go loop.go
else
    echo "Go not installed, skipping..."
fi

echo -e "\n${BLUE}=== Running Benchmarks (100,000,000 iterations) ===${NC}"

function run_benchmark {
    NAME=$1
    CMD="$2"
    
    # Check if command exists (for compiled binaries)
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
# The compiler output name defaults to the input filename without extension
run_benchmark "BPL" "./loop"

# Run C
run_benchmark "C (O3)" "./loop_c"

# Run Go
if [ -f "./loop_go" ]; then
    run_benchmark "Go" "./loop_go"
fi

# Run Python
if command -v python3 &> /dev/null; then
    run_benchmark "Python" "python3 loop.py"
else
    echo "Python3 not installed, skipping..."
fi

# Run Node.js
if command -v node &> /dev/null; then
    run_benchmark "Node.js" "node loop.js"
else
    echo "Node.js not installed, skipping..."
fi

# Clean up
rm -f loop loop_c loop_go loop.ll loop.o
