#!/usr/bin/env bash
# Custom test runner for test_ffi examples

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BPL_CMD="bun index.ts"
EXAMPLE_DIR="examples/test_ffi"

compile_llvm() {
    local file="$1"
    echo "[llvm] $file"
    $BPL_CMD "$file" --emit llvm >/dev/null
}

parse_only() {
    local file="$1"
    echo "[ast]  $file"
    $BPL_CMD "$file" --emit ast >/dev/null
}

# Files that fully link against libc
compile_llvm "$EXAMPLE_DIR/extern_strlen.bpl"
compile_llvm "$EXAMPLE_DIR/variadic_extern.bpl"
compile_llvm "$EXAMPLE_DIR/multiple_externs.bpl"
compile_llvm "$EXAMPLE_DIR/extern_with_type.bpl"
compile_llvm "$EXAMPLE_DIR/mixed_functions.bpl"
compile_llvm "$EXAMPLE_DIR/multifile/main.bpl"

# File that declares an extern without providing an implementation: parse-only
parse_only "$EXAMPLE_DIR/extern_struct_param.bpl"

echo "test_ffi suite completed successfully"
