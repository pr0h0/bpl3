#!/bin/bash
# Build the BPL runtime support library
# This script compiles runtime_support.c which provides:
# - Signal handlers for crash detection
# - Stack trace generation
# - Formatted error output

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building BPL Runtime Support Library..."

# Detect platform
UNAME=$(uname -s)
case "$UNAME" in
    Linux*)
        PLATFORM="linux"
        SHARED_EXT="so"
        EXTRA_FLAGS="-ldl"
    ;;
    Darwin*)
        PLATFORM="macos"
        SHARED_EXT="dylib"
        EXTRA_FLAGS=""
    ;;
    *)
        echo "Unsupported platform: $UNAME"
        exit 1
    ;;
esac

echo "Platform: $PLATFORM"

# Check for clang
if ! command -v clang &> /dev/null; then
    echo "Error: clang not found. Please install LLVM/Clang."
    exit 1
fi

# Compile runtime_support.c to object file
echo "Compiling runtime_support.c -> runtime_support.o"
clang -c -fPIC -O2 -g \
-Wall -Wextra \
-Wno-unused-parameter \
runtime_support.c -o runtime_support.o

# Create a static library
if command -v ar &> /dev/null; then
    echo "Creating static library libbpl_runtime_support.a"
    ar rcs libbpl_runtime_support.a runtime_support.o
fi

echo ""
echo "Build complete!"
echo "  Object file:    runtime_support.o"
echo "  Static lib:     libbpl_runtime_support.a"
echo ""
echo "The compiler links:"
echo "  - runtime.ll for core exception handling (LLVM IR)"
echo "  - runtime_support.o for signal handlers and stack traces (C)"
