---
applyTo: "**/*.bpl, **/*.x, **/*.sh, **/*.ts, **/*.md"
---

# BPL (Best Programming Language) Coding Assistant Instructions

You are working with BPL, a statically-typed, compiled programming language that transpiles to LLVM IR. Follow these instructions strictly when writing code, creating examples, running tests, or modifying the compiler.

## 1. Language Reference

### Keywords

The reserved list is rule R-LEX-3 in [docs/LANGUAGE_SPEC.md](docs/LANGUAGE_SPEC.md).

- **Declarations**: `frame` (function), `ret`, `static`, `struct`, `spec` (interface/trait), `enum`, `type` (alias), `local`, `global`, `const`, `Self`.
- **Control Flow**: `if`, `else`, `loop`, `break`, `continue`, `switch`, `case`, `default`, `fallthrough`, `return`. `defer` is a contextual statement keyword, not reserved.
- **Pattern Matching**: `match`.
- **Error Handling**: `try`, `catch`, `throw`.
- **Modules**: `import`, `export`, `from`, `as`.
- **Values**: `true`, `false`, `null`, `nullptr`. Type names such as `int` and `string` are not keywords.
- **Function types**: `Func`, `Lambda`.
- **Operators**: `cast`, `sizeof`, `is`, `as`, `offsetof`, `typeof`.
  - `sizeof<T>()` or `sizeof(T)` or `sizeof(expr)`
  - `offsetof(Type, member)`
  - `typeof<T>()` or `typeof(expr)`
- **FFI & Low Level**: `extern`, `asm`.

### Data Types

#### Primitive Types

- `int` (i32), `uint` (u32), `short` (i16), `ushort` (u16), `long` (i64), `ulong` (u64)
- `u8`, `u16`, `u32`, `u64` (unsigned integers)
- `i8`, `i16`, `i32`, `i64` (signed integers)
- `float` and `double` (f64), `f32`, `f64`
- `bool` (`true`, `false`)
- `char` (i8), `uchar` (u8)
- `void` (empty type)
- `nullptr` (null pointer)

Integer binary operations use the left operand's type, converting the right
operand to it. Cast the left operand explicitly for wider arithmetic; assigning
the result to a wider variable happens after the operation.
Integer-to-`bool` conversion must be explicit; use `value != 0` for zero/nonzero
semantics. Explicit integer-to-`bool` casts retain the low bit.

#### Composite Types

- **Pointers**: `*T` (e.g., `*int`, `**char`)
- **Arrays**: `T[]` (dynamic/slice) or `T[N]` (fixed size, e.g., `int[5]`)
- **Tuples**: `(T1, T2)` (e.g., `(int, bool)`)
- **Function Types**: `Func<Ret>(Arg1, Arg2)`
- **Lambda Types**: Lambda<Ret>(Arg1, Arg2)
- **Generics**: `Struct<T>`, `Func<T>`. The opening `<` must touch the preceding name/base; whitespace or comments before it use comparison syntax in expressions.
- **String**: `string` (C-compatible null-terminated pointer)

### Variables

- **Local**: `local name: Type = value;`
- **Global**: `global NAME: Type = value;`
- **Constants**: `local const name: Type = value;`
- **Destructuring**: `local (x: int, y: int) = tuple;`
- Local declarations require explicit types. Use explicit generic type arguments in examples.
- Unused locals and parameters are compile errors unless the name starts with `_`.

### Functions (`frame`)

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}

# Generic function
frame identity<T>(val: T) ret T {
    return val;
}

```

**Note**: Functions (`Func<T>`) are raw function pointers (compatible with C ABI). Lambdas (`Lambda<T>`) are fat pointers (struct `{ func*, ctx* }`). You can cast a `Func` to a `Lambda` (wrapping it), but casting a `Lambda` to a `Func` is forbidden.

### Structs

```bpl
import [Math] from "std/math.bpl";

struct Point {
    x: int,
    y: int,

    # Method
    frame distance(this: *Point) ret float {
        return Math.sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}
```

**Layout Note**: A struct gets a hidden vtable pointer as its first field when it declares methods, lists a parent struct or spec, or is the parent of another struct (rule R-STRUCT-5). Other structs are plain data and match C layout.

Inheritance uses `struct Dog : Animal { ... }`. A struct has at most one parent struct and may also list any number of specs.

### Bound Methods

Methods can be used as values, creating a `Lambda` that captures the object instance (`this`).

Pointer receivers cannot implicitly take the address of a const value. Implicit
operator address arguments require exact pointee types; numeric conversions do
not reinterpret addressed storage. Value receivers receive a copy on every call,
including bound and virtual calls.
Bound methods borrow receiver storage and do not extend its lifetime; a value
receiver observes that storage's current contents on each invocation. Variadic
value-receiver methods cannot currently be bound.

```bpl
struct Counter {
    count: int,
    frame increment(this: *Counter) { this.count = this.count + 1; }
}

frame main() {
    local c: Counter = Counter { count: 0 };
    # 'inc' is a Lambda<void> that captures 'c'
    local inc: Lambda<void>() = c.increment;
    inc();
}
```

### Enums (ADTs)

```bpl
enum Option<T> {
    Some(T),
    None,
}

local some: Option<int> = Option<int>.Some(1);
local none: Option<int> = Option<int>.None;

# Pattern Matching
match (opt) {
    Option.Some(val) => printf("%d", val),
    Option.None => printf("None"),
}
```

### Pattern Matching

BPL supports comprehensive pattern matching with the `match` expression:

```bpl
# Primitive patterns (int, float, bool, string, char)
match (x) {
    0 => printf("Zero\n"),
    42 => printf("The answer!\n"),
    n if n < 0 => printf("Negative: %d\n", n),
    _ => printf("Other\n"),
}

# Tuple patterns
match (point) {
    (0, 0) => printf("Origin\n"),
    (0, y) => printf("Y-axis at %d\n", y),
    (x, 0) => printf("X-axis at %d\n", x),
    (x, y) if x == y => printf("Diagonal\n"),
    (x, y) => printf("Point (%d, %d)\n", x, y),
}

# Enum patterns with destructuring
enum Result<T, E> { Ok(T), Err(E) }
match (result) {
    Result.Ok(val) => printf("Success: %d\n", val),
    Result.Err(err) => printf("Error: %d\n", err),
}
```

A variant that carries data must be constructed with it: `Option.Some` alone
is an error except as a `switch` case label.

**Pattern Types:**

- **Literals**: `0`, `3.14`, `true`, `"hello"`, `'A'`
- **Identifiers**: `x`, `n` (binds matched value)
- **Tuples**: `(a, b)`, `(0, y)`, `(x, y, z)`
- **Enum variants**: `E.V`, `E.V(a, b)`, `E.V { field: x }`
- **Wildcards**: `_` (matches anything)
- **Guards**: `pattern if condition`

**Exhaustiveness:** an enum match must cover every variant (nested patterns
count) or end with `_`; an identifier cannot be the catch-all arm of an enum
match. Other matches need an unguarded `_` or identifier arm. Guarded arms
never count toward coverage, and an arm that can never run is an error.

### Control Flow

- **If/Else**: `if (cond) { ... } else { ... }`
- **Loop**:
  - `loop (cond) { ... }` (while loop)
  - `loop { ... }` (infinite)
  - `loop (init; cond; step) { ... }` (C-style for loop)
- **Switch**: `switch (val) { case 1: ... break; default: ... break; }` on integer, string or enum values. Case labels must be literals (optionally negated) or enum variants. Every `case`/`default` body must end with `break`, `continue`, `return`, `throw` or `fallthrough`.
- **Match**: `match (val) { Pattern => ... }`
- **Defer**: `defer { ... }` (executes on scope exit or throw)

### Error Handling

```bpl
try {
    throw 1;
} catch (e: int) {
    printf("Error: %d", e);
} catch {
    printf("Unknown error");
}
```

### Modules

```bpl
import printf from "std/c.bpl";
import [Point] from "./geometry.bpl";
import exec from "std/process.bpl";
frame myFunc() { }
export myFunc;
```

### Inline Assembly

```bpl
# Intel Syntax
asm("intel") {
    mov eax, (a)              # Input (default "r")
    add eax, (b: "r")         # Input with explicit constraint
    mov (=result), eax        # Output (default "=r")
    [ "eax" ]                 # Clobbers
}

# AT&T Syntax
asm("att") {
    movl (a), %eax
    movl %eax, (=result)
}

# Raw LLVM IR
asm("llvm") {
    "%ptr = getelementptr i32, i32* (a), i32 0"
}
```

## 2. Project Workflow & Development

### Prerequisites

- **Bun**: The project uses `bun` for runtime, testing, and building.
- **LLVM**: `clang` (or `BPL_CC`) is required; WebAssembly builds also need `wasm-ld`. `opt` or `llvm-as` are optional and only used to verify IR.

### Scripts (`package.json`)

- **Build Compiler**: `bun run build` -> Creates `bpl` binary.
- **Run Compiler**: `bun index.ts <args>`
- **Type Check**: `bun run check` -> Runs `tsc` to verify TypeScript code. **MUST RUN before finishing a task.**
- **Run Tests**: `bun test` -> Runs all tests.
- **Format Code**: `bun run format` -> Uses pinned Prettier for supported repository files; dependencies/generated output are excluded by `.prettierignore`.
- **Check Formatting**: `bun run format:check` -> Read-only style check. Existing repository-wide formatting debt is tracked in `docs/project/BUGS.md`.
- **Baseline Tests**: `bun run test:baseline [test arguments]` -> Saves combined output to `test-baseline.txt` while preserving failures; without arguments it runs the test files in batches of `BPL_BASELINE_BATCH_SIZE` (default 40), one process each.
- **Format Examples**: `bun run format:examples` -> Recursively formats `.bpl`/`.x` files in `examples/`, respecting `.bplignore` and discovery exclusions.

### Development Cycle

1.  **Implement Feature**: Modify `compiler/` source code.
2.  **Type Check**: Run `bun run check` to ensure no TypeScript errors.
3.  **Unit Test**: Create/Update `tests/*.test.ts` and run `bun test tests/MyTest.test.ts`.
4.  **Integration Test**: Create an example in `examples/` and run `bun test tests/Integration.test.ts`.
5.  **Verify All**: Run `bun test` to ensure no regressions.
6.  **Documentation**: Update `docs/` and `AGENTS.md` if the feature changes syntax or behavior.

### Release policy

- Work on feature branches and target implementation pull requests at `staging`. Route all merges through pull requests; do not push implementation changes directly to `staging` or `master`, or merge into them locally.
- Merge a PR only when repository CI passes on its head commit and every review thread is resolved; answer each actionable review comment with the fixing commit. CodeRabbit no longer reviews this repository (its app was removed); `.coderabbit.yaml` stays for a future reinstall.
- Merge `staging` into `master` through a release PR only when the maintainer explicitly decides to release. A staging merge does not authorize a release.

- Keep compiler and bundled BPL package versions in the `0.1.x` series until the maintainer explicitly changes this policy. Only patch increments are allowed; never increment minor or major versions.
- The maintainer controls version bumps and publication. Do not create release tags, GitHub releases, publish packages, or push container images without an explicit request. Permission for an initial release does not authorize subsequent releases.
- Implementing, testing and committing code does not itself authorize a release.
- The configured container workflow publishes tested images when the maintainer pushes a matching `v0.1.x` tag, or explicitly runs it with `publish=true`. Do not push tags or dispatch publication without an explicit request.

## 3. Testing Strategy

### Unit Tests (`tests/*.test.ts`)

- Located in `tests/`.
- Use `bun:test`.
- Test individual compiler components (Lexer, Parser, TypeChecker, CodeGen).
- **Example**:

  ```typescript
  import { describe, expect, it } from "bun:test";
  import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

  describe("Lexer", () => {
    it("should lex integers", () => {
      const tokens = lexWithGrammar("123", "test.bpl");
      expect(tokens[0].type).toBe("NumberLiteral");
    });
  });
  ```

### Integration Tests (`tests/Integration.test.ts`)

- Runs full compilation and execution of BPL programs.
- Uses `examples/` directory.
- **Configuration**: An example folder with `main.bpl` and `test_config.json`
  is run by the integration suite. Optional fields are `args`, `env`, `input`,
  `exitCode`, `timeout`, `skip` and `skipCompilation`.
  ```json
  {
    "expectedOutput": ["Hello World"],
    "args": [],
    "env": {},
    "input": ""
  }
  ```

### Fuzzing (`fuzz/`)

- `bun run fuzz` generates well-typed programs with an exact output oracle and
  mutated sources; `bun run fuzz:differential` compares optimization levels.
- Promote failures with `bun run fuzz:promote`; replay with `bun run fuzz:replay`.
  See [docs/60-compiler-correctness.md](docs/60-compiler-correctness.md).

## 4. Coding Conventions

### TypeScript (Compiler)

- **Strict Typing**: No `any` unless absolutely necessary.
- **Immutability**: Prefer `readonly` arrays and properties.
- **Error Handling**: Use `CompilerError` class with source location.
- **Formatting**: Prettier default settings.

### BPL (Language)

- **Structs**: PascalCase (`MyStruct`).
- **Functions/Variables**: camelCase (`myFunction`, `myVar`).
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_VALUE`).
- **Files**: snake_case (`my_module.bpl`).

## 5. Contribution Checklist

Before marking a task as complete:

1.  [ ] **Code Implemented**: Feature works as requested.
2.  [ ] **Type Check Passed**: `bun run check` returns no errors.
3.  [ ] **Tests Added**: Unit tests for edge cases, Integration test for end-to-end.
4.  [ ] **Formatting**: Code is formatted (`bun run format`).
5.  [ ] **Tests Passed**: `bun test` passes (green).
6.  [ ] **Docs Updated**: `docs/` reflects changes.
7.  [ ] **AGENTS.md Updated**: If syntax/rules changed, update this file.
8.  [ ] **Bugs Logged**: If a bug is found, it MUST be logged in `docs/project/BUGS.md`. Do not hide or ignore it. Create a workaround if necessary, but document the issue.

## 6. Common Pitfalls & Debugging

- **Parser Issues**: The parser is generated ahead of time. After editing `grammar/bpl.peggy`, run `bun run generate:parser` and commit `compiler/frontend/generated/`; a test fails when they differ.
- **Standard library files**: `cli/EmbeddedResources.generated.ts` bundles `lib/` into the compiled `bpl`. After adding, removing or renaming a library file, run `bun run generate:embedded`; a test fails when it is stale.
- **Source Depth**: Raw syntax paths deeper than 512 AST nodes are rejected with
  `BPL_SOURCE_COMPLEXITY_LIMIT` before recursive passes. Parser stack exhaustion
  uses the same code at file position 1:1 when no AST location is available.
- **LLVM IR**: Use `--emit llvm` to inspect generated IR.
  ```bash
  bun index.ts examples/my_test/main.bpl --emit llvm
  cat examples/my_test/main.ll
  ```
- **Segfaults**: Check `malloc`/`free` usage in BPL code. Use `valgrind` on the generated binary if needed.
- **Operator Precedence**: Check `Formatter.ts` and `Parser.ts` (or grammar) to ensure consistency.

## Documentation checks

Complete `frame main` examples in README and the numbered guides are compiled by
`bun run docs:examples`. Mark companion modules, intentional errors, and editor
fragments explicitly using the conventions in `docs/documentation-validation.md`.
The generated declaration reference is checked by `tests/StdlibReference.test.ts`;
regenerate it with `bun run docs:stdlib` after public library changes.

## Source coordinates

Source locations use 1-based lines and UTF-16 columns. LF, CRLF and standalone
CR each count as one newline. Keep lexer, parser AST/error positions, diagnostic
snippets and formatter source offsets consistent; do not normalize literal bytes.
EOF points after all source text, including trailing whitespace and comments.
Editor ranges use zero-based LSP coordinates with the same newline/UTF-16
convention. Use TextDocument offsets for raw source slices so literal bytes
are preserved, rather than rejoining split lines.

## Formatter correctness

Formatting must preserve program meaning and comment text/order, keep comments
attached to their surrounding source tokens, and be idempotent. Run the
formatter tests, including the repository corpus and native before/after checks,
when changing formatting. A copied or serialized AST with comments needs the
original source as the second Formatter.format argument.
Default formatting follows the language style (four spaces, LF). Project
`.bplfmt.json` preferences and CLI overrides must share strict validation;
line-ending preferences must not change literal payloads. Keep CLI and editor
formatting consistent when a project configuration exists.

## 7. Bug Reporting

If you discover a bug during development:

1.  **Do not ignore it.**
2.  **Log it in `docs/project/BUGS.md`** immediately.
3.  If you cannot fix it right away, create a workaround if necessary, but **you must document the bug**.
4.  Never hide a bug or leave it undocumented.

## 8. Directory Structure

- `index.ts`: CLI entry point; `cli/` holds the commands.
- `compiler/`: Source code for the compiler.
  - `frontend/`: Lexer, Peggy parser (`generated/`).
  - `middleend/`: TypeChecker, module resolution, PackageManager.
  - `backend/`: CodeGenerator (LLVM).
  - `formatter/`, `linter/`, `docs/`: Formatter, linter, documentation generator.
  - `common/`: AST, Errors, Utils.
- `grammar/`: Peggy grammar (`bpl.peggy`) and the token grammar (`grammar.bpl`, bundled into the CLI).
- `lib/`: Standard library and runtime sources; `packages/`: bundled packages.
- `schemas/`: JSON schemas for `bpl.json` and `.bplfmt.json`.
- `examples/`: Integration test cases.
- `tests/`: Unit and integration test runners; `fuzz/`: compiler fuzzer.
- `tools/`, `scripts/`: Release, CI and generation helpers.
- `docs/`: Documentation; `docs/LANGUAGE_SPEC.md` is the specification and
  `docs/project/` holds BUGS.md, TODO.md and PLAN.md.
- `playground/`, `vscode-ext/`, `docker/`: Web playground, editor extension, images.

Use `docs/project/TODO.md` as the canonical implementation-status inventory and
backlog; `docs/project/PLAN.md` prioritizes work without duplicating that
inventory. Describe supported behavior and remaining limits rather than treating
a working MVP as exhaustive support. Watch mode monitors the entry tree and
resolved transitive imports, including new `.bpl`/`.x` modules and atomic saves;
unrelated dependency and hidden directories are excluded from recursive
entry-tree discovery.

---

**Remember**: You are an expert. Write clean, maintainable, and well-tested code.
