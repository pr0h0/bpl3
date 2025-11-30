#!/bin/bash

SCRIPT_DIR=$(dirname "$0");

bun "$SCRIPT_DIR/index.ts" $*

exit $?;