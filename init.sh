#!/usr/bin/env bash
# Build BPL from this checkout and link the `bpl` command into a user bin directory.
#
# Usage: ./init.sh [--no-build]
#   BPL_BIN_DIR  directory for the `bpl` link (default: ~/.local/bin)
#
# The link points at bpl-wrapper.sh, which sets BPL_HOME to this checkout when it
# is unset, so no shell configuration is edited. Nothing is installed with sudo;
# choose a system directory through BPL_BIN_DIR and run with the needed rights.

set -euo pipefail

BPL_HOME_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${BPL_BIN_DIR:-$HOME/.local/bin}"
BUILD=1

for arg in "$@"; do
    case "$arg" in
        --no-build) BUILD=0 ;;
        -h|--help)
            sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "init.sh: unknown argument '$arg'" >&2
            exit 2
            ;;
    esac
done

if ! command -v bun >/dev/null 2>&1; then
    echo "init.sh: bun is required; see https://bun.sh" >&2
    exit 1
fi

cd "$BPL_HOME_PATH"

if [ "$BUILD" -eq 1 ]; then
    echo "Installing dependencies..."
    bun install --frozen-lockfile
    echo "Building compiler and runtime..."
    bun run build
fi

if [ ! -x "$BPL_HOME_PATH/bpl" ]; then
    echo "init.sh: $BPL_HOME_PATH/bpl is missing; run without --no-build" >&2
    exit 1
fi

mkdir -p "$BIN_DIR"
ln -sfn "$BPL_HOME_PATH/bpl-wrapper.sh" "$BIN_DIR/bpl"
echo "Linked $BIN_DIR/bpl -> $BPL_HOME_PATH/bpl-wrapper.sh"

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
        echo
        echo "$BIN_DIR is not on PATH. Add this to your shell configuration:"
        echo "    export PATH=\"$BIN_DIR:\$PATH\""
        ;;
esac

echo
echo "Done. Verify with: bpl --version && bpl doctor"
