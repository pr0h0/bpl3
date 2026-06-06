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

CC="${CC:-clang}"
BPL_RUNTIME_BUILD="${BPL_RUNTIME_BUILD:-release}"

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
echo "Compiler: $CC"
echo "Runtime build: $BPL_RUNTIME_BUILD"

TMP_BUILD_DIR="$(mktemp -d "${SCRIPT_DIR}/.runtime-build.XXXXXX")"
TMP_OBJECT="$TMP_BUILD_DIR/runtime_support.o"
TMP_X86_OBJECT="$TMP_BUILD_DIR/runtime_support.x86_64.o"
TMP_ARM_OBJECT="$TMP_BUILD_DIR/runtime_support.arm64.o"
TMP_STATIC="$TMP_BUILD_DIR/libbpl_runtime_support.a"

cleanup() {
    rm -rf "$TMP_BUILD_DIR"
}
trap cleanup EXIT

# Check for clang-compatible C compiler
if ! command -v "$CC" &> /dev/null; then
    echo "Error: compiler '$CC' not found. Please install LLVM/Clang or set CC."
    exit 1
fi

case "$BPL_RUNTIME_BUILD" in
    debug)
        OPT_FLAGS=(-O0 -g3 -DBPL_RUNTIME_DEBUG=1)
    ;;
    release)
        OPT_FLAGS=(-O2 -g)
    ;;
    *)
        echo "Unsupported BPL_RUNTIME_BUILD: $BPL_RUNTIME_BUILD (expected debug or release)"
        exit 1
    ;;
esac

SECTION_FLAGS=(-ffunction-sections -fdata-sections)

# Compile runtime_support.c to object file
echo "Compiling runtime_support.c -> runtime_support.o"
if [ "$PLATFORM" = "macos" ]; then
    "$CC" -c -arch x86_64 -fPIC "${OPT_FLAGS[@]}" "${SECTION_FLAGS[@]}" \
    -Wall -Wextra \
    -Wno-unused-parameter \
    runtime_support.c -o "$TMP_X86_OBJECT"
    "$CC" -c -arch arm64 -fPIC "${OPT_FLAGS[@]}" "${SECTION_FLAGS[@]}" \
    -Wall -Wextra \
    -Wno-unused-parameter \
    runtime_support.c -o "$TMP_ARM_OBJECT"
    lipo -create "$TMP_X86_OBJECT" "$TMP_ARM_OBJECT" -output "$TMP_OBJECT"
else
    "$CC" -c -fPIC "${OPT_FLAGS[@]}" "${SECTION_FLAGS[@]}" \
    -Wall -Wextra \
    -Wno-unused-parameter \
    runtime_support.c -o "$TMP_OBJECT"
fi

# Create a static library
if command -v ar &> /dev/null; then
    echo "Creating static library libbpl_runtime_support.a"
    ar rcs "$TMP_STATIC" "$TMP_OBJECT"
fi

mv -f "$TMP_OBJECT" runtime_support.o
if [ -f "$TMP_STATIC" ]; then
    mv -f "$TMP_STATIC" libbpl_runtime_support.a
fi

echo ""
echo "Build complete!"
echo "  Object file:    runtime_support.o"
echo "  Static lib:     libbpl_runtime_support.a"
echo ""
echo "The compiler links:"
echo "  - runtime.ll for core exception handling (LLVM IR)"
echo "  - runtime_support.o for signal handlers and stack traces (C)"
