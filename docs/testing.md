# Testing Guide

BPL has a comprehensive testing suite comprising unit tests and integration tests.

## Running Tests

You can run all tests using the `tests.sh` script in the root directory:

```bash
./tests.sh
```

This script will:
1.  Run modular tests defined in `example/**/test.sh`.
2.  Compile and run standalone `.x` files in `example/`.
3.  Report pass/fail status.

## Unit Tests

Unit tests are written using `bun:test` and are located in the `tests/` directory. They test individual components of the compiler (Lexer, Parser, Generator).

To run unit tests:

```bash
bun test
```

## Integration Tests

Integration tests are actual BPL programs located in the `example/` directory.

### Structure of an Integration Test

For a complex example (like `fib` or `hotel`), create a directory in `example/` containing:
-   `source.x`: The BPL source code.
-   `test.sh`: A shell script that compiles and runs the program, verifying the output.

### Example `test.sh`

```bash
#!/bin/bash

# Compile
bun ../../index.ts source.x

# Run and check output
OUTPUT=$(./source)
EXPECTED="Hello"

if [ "$OUTPUT" == "$EXPECTED" ]; then
    exit 0 # Pass
else
    exit 1 # Fail
fi
```

## Adding a New Test Case

1.  Create a new `.x` file in `example/` (e.g., `example/my_feature.x`).
2.  Write code that uses the feature and prints output to stdout.
3.  If it requires specific input or complex validation, create a folder `example/my_feature/` with `my_feature.x` and a `test.sh` script.
4.  Run `./tests.sh` to verify.

## Debugging Tests

If a test fails:

1.  **Compile with debug info**: Use the `-p` flag to see the generated assembly.
    ```bash
    bun index.ts -p example/failed_test.x
    ```
2.  **Run with GDB**: Use the `-g` flag to step through the assembly.
    ```bash
    bun index.ts -g example/failed_test.x
    ```
