---
applyTo: "**/*.bpl, **/*.x, **/*.sh"
---

# BPL (Basic Programming Language) Coding Assistant Instructions

You are working with BPL, a custom programming language. Follow these instructions strictly when writing code, creating examples, or running tests.

## 1. Syntax & Language Rules

### Functions

- Declare functions using the `frame` keyword with `ret <type>`.
- Use `return` to exit.
- Invoke functions directly by name.

```bpl
frame my_function(a: int, b: int) ret int {
    local result: int = a + b;
    return result;
}

frame main() ret int {
    local x: int = my_function(10, 20);
    return 0;
}
```

### Variables

- Declare global variables with `global`.
- Declare local variables with `local`.

```bpl
local x: u64 = 42;
```

### Control Flow

- **Loops**: Use `loop` for infinite loops. Use `break` to exit.
- **Conditionals**: Use `if`, `else`.

```bpl
local i: u64 = 0;
loop {
    if (i > 10) {
        break;
    }
    i = i + 1;
}
```

### Imports & Externs

- Use `import` and `export` for modules.
- Use `extern` for C/FFI functions.
- Default extension is `.bpl` (legacy `.x` still resolves).
- To import specific types: `import [Type] from "./module.bpl";`
- Standard library modules live under `lib/` (e.g., `std/string.bpl`).

```bpl
import printf from "libc";
import [Array] from "std/array.bpl";

frame print_hello() ret void {
    printf("Hello %s\n", "World");
}
```

### Comments

- Use `#` for single-line comments.

## 2. Project Structure & Examples

- **Location**: All new examples MUST be placed in `examples/<example_name>/`.
- **File Naming**: The main file should be `main.bpl` inside that directory (additional supporting `.bpl` files allowed).

## 3. Testing & Verification (MANDATORY)

**You must verify your code.**

### Creating Tests

- Primary path: Integration tests are driven by `tests/Integration.test.ts`, which by default runs `examples/<name>/main.bpl` via `cmp.sh` and reads `test_config.json` in that directory for `expectedOutput`, `args`, `env`, `input`, and `skip_compilation`.
- If an example cannot be validated by a single `main.bpl` plus `test_config.json` (e.g., complex multi-file orchestration), add a `test.sh` in the example directory to run all its cases; ensure it exits non-zero on failure. Wire `tests.sh` or the CI runner to call that script.

### Running Tests

- **Unit Tests**: Run `bun test` to exercise compiler and integration suites (including `Integration.test.ts`).
- **Integration (examples)**: `bun test tests/Integration.test.ts` uses `cmp.sh` plus `test_config.json` to run `main.bpl` in each example.
- **Custom example runners**: If an example has `test.sh`, invoke it from `./tests.sh` or directly: `examples/<name>/test.sh`.
- **Run a source directly**: `bun index.ts examples/path/to/file.bpl -r` (or `--emit llvm` for IR).

### Workflow

1. Write BPL code in `examples/<name>/main.bpl` (additional helper `.bpl` files as needed).
2. Add `test_config.json` with expected output/args/env/input; prefer this path first.
3. If the example needs bespoke orchestration, create `examples/<name>/test.sh` (chmod +x) that runs all its cases and fails on errors.
4. Run `bun test` (includes Integration) to ensure stability; optionally run `examples/<name>/test.sh` for complex cases.
