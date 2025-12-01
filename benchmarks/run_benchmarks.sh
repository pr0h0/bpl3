#!/bin/bash

TRANSPILER_DIR=".."
BENCHMARKS=($(ls -1 *.x 2>/dev/null | sed 's/\.x$//'))
OPT_LEVELS=("0" "1" "2" "3")

if [ "$1" != "" ]; then
    BENCHMARKS=($(echo "$1" | sed 's/\.x$//'))
fi


# Check if any .x files exist
if [ ${#BENCHMARKS[@]} -eq 0 ]; then
    echo "No .x benchmark files found in current directory!"
    exit 1
fi

echo "========================================"
echo "   BPL Performance Benchmark Suite"
echo "========================================"
echo ""

# Declare associative arrays to store results
declare -A results_no_llvm
declare -A results_llvm

# Run all benchmarks and collect results
for bench in "${BENCHMARKS[@]}"; do
    echo "Running: $bench.x..."
    
    for opt in "${OPT_LEVELS[@]}"; do
        # Test without --llvm flag
        bun run $TRANSPILER_DIR/index.ts -O$opt "$bench.x" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            # Measure time using time command, capture only real time
            if [ -f "/usr/bin/time" ]; then
                time_output=$(/usr/bin/time -f "%e" ./$bench 2>&1 > /dev/null)
                results_no_llvm["${bench}_O${opt}"]="${time_output}s"
            else
                # Fallback to bash time
                time_output=$( { time ./$bench > /dev/null 2>&1; } 2>&1 | grep real | awk '{print $2}')
                results_no_llvm["${bench}_O${opt}"]="$time_output"
            fi
        else
            results_no_llvm["${bench}_O${opt}"]="FAIL"
        fi
        rm -f "$bench" "$bench.o" "$bench.asm"
        
        # Test with --llvm flag
        bun run $TRANSPILER_DIR/index.ts --llvm -O$opt "$bench.x" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            # Measure time using time command, capture only real time
            if [ -f "/usr/bin/time" ]; then
                time_output=$(/usr/bin/time -f "%e" ./$bench 2>&1 > /dev/null)
                results_llvm["${bench}_O${opt}"]="${time_output}s"
            else
                # Fallback to bash time
                time_output=$( { time ./$bench > /dev/null 2>&1; } 2>&1 | grep real | awk '{print $2}')
                results_llvm["${bench}_O${opt}"]="$time_output"
            fi
        else
            results_llvm["${bench}_O${opt}"]="FAIL"
        fi
        rm -f "$bench" "$bench.o" "$bench.asm" "$bench.ll"
    done
done

echo ""
echo "========================================"
echo "   Benchmark Results"
echo "========================================"
echo ""

# Display results in grid format for each benchmark
for bench in "${BENCHMARKS[@]}"; do
    echo "=======${bench}.x======="
    echo "opt | no llvm   | llvm"
    echo "----|-----------|----------"
    for opt in "${OPT_LEVELS[@]}"; do
        no_llvm_time="${results_no_llvm[${bench}_O${opt}]}"
        llvm_time="${results_llvm[${bench}_O${opt}]}"
        printf "O%-2s | %-9s | %s\n" "$opt" "$no_llvm_time" "$llvm_time"
    done
    echo ""
done

echo "========================================"
echo "   Benchmark Run Complete"
echo "========================================"

