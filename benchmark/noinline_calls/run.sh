#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bun "$SCRIPT_DIR/../run_benchmark.ts" noinline_calls "$@"
