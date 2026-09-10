#!/usr/bin/env bash
set -euo pipefail
PLAYGROUND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PLAYGROUND_DIR/.."

if ! command -v bun >/dev/null 2>&1; then
    echo "Bun is required to run the playground web server." >&2
    exit 1
fi

case "${BPL_PLAYGROUND_RUNNER:-docker}" in
    docker)
        echo "Starting playground with disposable Docker workers."
        echo "Build or refresh the worker image with: bun run playground:build"
        ;;
    host)
        echo "Starting trusted local host mode on 127.0.0.1."
        if ! command -v clang >/dev/null 2>&1; then
            echo "Clang is required for native host execution." >&2
            exit 1
        fi
        ;;
    *)
        echo "BPL_PLAYGROUND_RUNNER must be docker or host." >&2
        exit 1
        ;;
esac

exec bun playground/backend/server.ts
