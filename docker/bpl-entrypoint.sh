#!/bin/sh
set -eu
exec bun /opt/bpl/index.ts "$@"
