---
applyTo: "**/*.bpl, **/*.x, **/*.sh, **/*.ts, **/*.md"
---

# BPL (Basic Programming Language) Coding Assistant Instructions

You are working with BPL, a statically-typed, compiled programming language that transpiles to LLVM IR. Follow these instructions strictly when writing code, creating examples, running tests, or modifying the compiler.

## 1. Language Reference

### Keywords

- **Declarations**: `frame` (function), `struct`, `spec` (interface/trait), `enum`, `type` (alias), `local`, `global`, `const`.
- **Control Flow**: `if`, `else`, `loop`, `break`, `continue`, `switch`, `case`, `default`, `return`, `defer`.
- **Pattern Matching**: `match`.
- **Error Handling**: `try`, `catch`, `throw`.
- **Modules**: `import`, `export`, `from`, `as`.
- **Types & Values**: `true`, `false`, `nullptr`, `void`, `int`, `float`, `bool`, `char`, `string`, `ushort`, `uint`, `ulong`.
- **Operators**: `cast`, `sizeof`, `is`, `as`.
- **FFI & Low Level**: `extern`, `asm`.

### Data Types

#### Primitive Types

- `int` (i32), `uint` (u32)
- `u8`, `u16`, `u32`, `u64` (unsigned integers)
- `i8`, `i16`, `i32`, `i64` (signed integers)
- `float` (f64), `f32`, `f64`
- `bool` (`true`, `false`)
- `char` (u8)
- `void` (empty type)
- `nullptr` (null pointer)

#### Composite Types

- **Pointers**: `*T` (e.g., `*int`, `**char`)
- **Arrays**: `T[]` (dynamic/slice) or `T[N]` (fixed size, e.g., `int[5]`)
- **Tuples**: `(T1, T2)` (e.g., `(int, bool)`)
- **Function Types**: `Func<Ret>(Arg1, Arg2)`
- **Lambda Types**: Lambda<Ret>(Arg1, Arg2)
- **Generics**: `Struct<T>`, `Func<T>`
- **String**: `string` (immutable string slice)

### Variables

- **Local**: `local name: Type = value;`
- **Global**: `global NAME: Type = value;`
- **Constants**: `local const name: Type = value;`
- **Destructuring**: `local (x, y) = tuple;`

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

### Structs

```bpl
struct Point {
    x: int,
    y: int,

    # Method
    frame distance(this: *Point) ret float {
        return sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}

# Inheritance
struct Dog : Animal { ... }
```

### Enums (ADTs)

```bpl
enum Option<T> {
    Some(T),
    None,
}

# Pattern Matching
match (opt) {
    Option.Some(val) => printf("%d", val),
    Option.None => printf("None"),
}
```

### Control Flow

- **If/Else**: `if (cond) { ... } else { ... }`
- **Loop**:
  - `loop (cond) { ... }` (while loop)
  - `loop { ... }` (infinite)
  - `loop (init; cond; step) { ... }` (C-style for loop)
- **Switch**: `switch (val) { case 1: ... default: ... }`
- **Match**: `match (val) { Pattern => ... }`
- **Defer**: `defer { ... }` (executes on scope exit or throw)

### Error Handling

```bpl
try {
    throw 1;
} catch (e: int) {
    printf("Error: %d", e);
} catchOther {
    printf("Unknown error");
}
```

### Modules

```bpl
import printf from "libc";
import [Point] from "./geometry.bpl";
export frame myFunc() { ... }
```

### Inline Assembly

```bpl
# Intel Syntax
asm("intel") {
    mov eax, (a)              # Input (default "r")
    add eax, (b: "r")         # Input with explicit constraint
    mov (=result), eax        # Output (default "=r")
    mov (=out: "=a"), ebx     # Output with explicit constraint
    [ "ebx" ]                 # Clobbers
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
- **LLVM**: `llc` and `clang` must be available for compilation.

### Scripts (`package.json`)

- **Build Compiler**: `bun run build` -> Creates `bpl` binary.
- **Run Compiler**: `bun index.ts <args>`
- **Type Check**: `bun run check` -> Runs `tsc` to verify TypeScript code. **MUST RUN before finishing a task.**
- **Run Tests**: `bun test` -> Runs all tests.
- **Format Code**: `bun run format` -> Formats TS files.
- **Format Examples**: `bun run format-examples` -> Formats BPL files in `examples/`.

### Development Cycle

1.  **Implement Feature**: Modify `compiler/` source code.
2.  **Type Check**: Run `bun run check` to ensure no TypeScript errors.
3.  **Unit Test**: Create/Update `tests/*.test.ts` and run `bun test tests/MyTest.test.ts`.
4.  **Integration Test**: Create an example in `examples/` and run `bun test tests/Integration.test.ts`.
5.  **Verify All**: Run `bun test` to ensure no regressions.
6.  **Documentation**: Update `docs/` and `AGENTS.MD` if the feature changes syntax or behavior.

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
      const tokens = lexWithGrammar("123");
      expect(tokens[0].type).toBe("Number");
    });
  });
  ```

### Integration Tests (`tests/Integration.test.ts`)

- Runs full compilation and execution of BPL programs.
- Uses `examples/` directory.
- **Configuration**: Each example folder needs `test_config.json`.
  ```json
  {
    "expectedOutput": ["Hello World"],
    "args": [],
    "env": {},
    "input": ""
  }
  ```

### Fuzzing (`tests/fuzz.test.ts`)

- Generates random token streams to test compiler stability.
- Run with `bun test tests/fuzz.test.ts`.

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
7.  [ ] **AGENTS.MD Updated**: If syntax/rules changed, update this file.
8.  [ ] **Bugs Logged**: If a bug is found, it MUST be logged in `BUGS.md`. Do not hide or ignore it. Create a workaround if necessary, but document the issue.

## 6. Common Pitfalls & Debugging

- **Parser Issues**: If `grammar/bpl.peggy` is modified, the parser is auto-generated at runtime (or cached). Ensure grammar logic is correct.
- **LLVM IR**: Use `--emit llvm` to inspect generated IR.
  ```bash
  bun index.ts examples/my_test/main.bpl --emit llvm
  cat examples/my_test/main.ll
  ```
- **Segfaults**: Check `malloc`/`free` usage in BPL code. Use `valgrind` on the generated binary if needed.
- **Operator Precedence**: Check `Formatter.ts` and `Parser.ts` (or grammar) to ensure consistency.

## 7. Bug Reporting

If you discover a bug during development:

1.  **Do not ignore it.**
2.  **Log it in `BUGS.md`** immediately.
3.  If you cannot fix it right away, create a workaround if necessary, but **you must document the bug**.
4.  Never hide a bug or leave it undocumented.

## 8. Directory Structure

- `compiler/`: Source code for the compiler.
  - `frontend/`: Lexer, Parser (Peggy).
  - `middleend/`: TypeChecker, PackageManager.
  - `backend/`: CodeGenerator (LLVM), Formatter.
  - `common/`: AST, Errors, Utils.
- `grammar/`: Peggy grammar file (`bpl.peggy`).
- `examples/`: Integration test cases.
- `tests/`: Unit and integration test runners.
- `docs/`: Documentation files.
- `lib/`: Standard library (`std`).

---

**Remember**: You are an expert. Write clean, maintainable, and well-tested code.
