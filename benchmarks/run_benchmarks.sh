#!/bin/bash

TRANSPILER_DIR=".."
BENCHMARKS=("fib_bench" "prime_bench" "collatz_bench" "loop_bench")
OPT_LEVELS=("0" "1" "2" "3")

echo "========================================"
echo "   BPL Performance Benchmark Suite"
echo "========================================"

for bench in "${BENCHMARKS[@]}"; do
    echo ""
    echo "Running Benchmark: $bench"
    echo "----------------------------------------"
    
    for opt in "${OPT_LEVELS[@]}"; do
        echo "Optimization Level: -O$opt"
        
        # Compile
        # We use -d (dynamic linking) by default
        bun run $TRANSPILER_DIR/index.ts -O$opt "$bench.x" > /dev/null 2>&1
        
        if [ $? -ne 0 ]; then
            echo "  Compilation failed!"
            continue
        fi
        
        # Run and measure time
        # Using /usr/bin/time for consistent formatting if available, else shell builtin
        if [ -f "/usr/bin/time" ]; then
            /usr/bin/time -f "  Time: %E real, %U user, %S sys" ./$bench > /dev/null
        else
            # Fallback to bash time
            TIMEFORMAT="  Time: %R real, %U user, %S sys"
            time ./$bench > /dev/null
        fi
        
        # Cleanup
        rm -f "$bench" "$bench.o" "$bench.asm"
    done
done

echo ""
echo "========================================"
echo "   Benchmark Run Complete"
echo "========================================"
