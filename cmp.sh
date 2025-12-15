#!/bin/bash

SCRIPT_DIR=$(dirname "$0");

FILENAME=$(echo "$1" | sed 's/\.x$/.ll/' | sed 's/\.bpl$/.ll/');
EXEC_NAME=$(echo "$FILENAME" | sed 's/\.ll$//');

bun "$SCRIPT_DIR/index.ts" $1
if [ $? -ne 0 ]; then
    exit 1;
fi

# Compile LLVM IR to executable using clang
clang -Wno-override-module "$SCRIPT_DIR/$FILENAME" -o "$SCRIPT_DIR/$EXEC_NAME" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Failed to compile LLVM IR with clang";
    exit 1;
fi

# Run the executable
"$SCRIPT_DIR/$EXEC_NAME" ${@:2}
EXIT_CODE=$?;

# Clean up executable
rm -f "$SCRIPT_DIR/$EXEC_NAME"

echo "Program exited with code $EXIT_CODE";
exit $EXIT_CODE;
