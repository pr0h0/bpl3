# Extending the Compiler

This guide explains how to extend the BPL compiler, specifically focusing on adding new primitive types and their object-oriented wrappers.

## Adding New Primitive Types

BPL supports primitive types like `i32`, `i64`, `double`, etc. To provide object-oriented capabilities (like methods) on these primitives, we use "wrapper structs". For example, `Int` wraps `i32`.

When you write `42.toString()`, the compiler:

1.  Identifies `42` as an `i32`.
2.  Looks up the wrapper struct for `i32` (which is `Int`).
3.  Resolves the `toString` method on the `Int` struct.

### Steps to Add a New Primitive Wrapper

#### 1. Define the Wrapper Struct

Add the struct definition in `lib/primitives.bpl`. This file contains the standard library definitions for primitive wrappers.

Example for `Long` (wrapping `i64`):

```bpl
struct Long {
    value: i64,

    # Constructor (optional, but good practice)
    frame new(v: i64) ret Long {
        local l: Long;
        l.value = v;
        return l;
    }

    # Method example
    frame toString(this: *Long) ret String {
        local buf: *char = malloc(32);
        sprintf(buf, "%lld", this.value); # Use %lld for long long (i64)
        local s: String = String.new(buf);
        free(buf);
        return s;
    }
}

export [Long];
```

#### 2. Register the Primitive Mapping

Update `compiler/middleend/BuiltinTypes.ts` to map the primitive type name to the struct name.

```typescript
export const PRIMITIVE_STRUCT_MAP: Record<string, string> = {
  i32: "Int",
  i1: "Bool",
  double: "Double",
  i64: "Long", // Add this line
};
```

#### 3. Recompile the Standard Library

If the standard library is pre-compiled, you may need to rebuild it. In the current setup, `lib/primitives.bpl` is usually included or parsed when compiling user programs, so changes should take effect immediately.

## Adding New Compiler Features

### Project Structure

- **`compiler/frontend`**: Lexer and Parser. Handles converting source code into an Abstract Syntax Tree (AST).
- **`compiler/middleend`**: Type Checker, Call Checker, and Semantic Analysis. Validates the AST.
- **`compiler/backend`**: Code Generator. Converts AST into LLVM IR.

### Common Tasks

- **Adding a Keyword**:
  1.  Update `compiler/frontend/Lexer.ts` to recognize the token.
  2.  Update `compiler/frontend/Parser.ts` to parse the new syntax.
- **Adding a Built-in Function**:
  1.  Define it in `compiler/middleend/BuiltinFunctions.ts` (if applicable) or in the standard library (`lib/`).
- **Modifying Code Generation**:
  1.  Look at `compiler/backend/codegen/StatementGenerator.ts` or `ExpressionGenerator.ts`.

## Testing Your Changes

Always run the relevant test suite after making changes:

```bash
# Fast local loop for focused changes
bun test tests/SpecificFeature.test.ts

# Broad CI-safe suite, including integration, playground, and VS Code extension tests
bun run test:ci

# VS Code extension tests only
bun run test:vscode-ext

# Windows-safe parser, typechecker, codegen, and target triple smoke tests
bun run test:codegen-cross-platform

# Compiler correctness and deterministic fuzz regression suite
bun run test:correctness

# Sanitizer-backed runtime checks for representative safe programs and checked failures
bun run test:sanitizers

# Deterministic O0/O3 runtime differential fuzzing, including checked failures
bun run fuzz:differential

# Validate saved active fuzz failures
bun run fuzz:validate-artifacts
```

For new language features, add a focused test in `tests/`, an integration example under `examples/` when runtime behavior matters, and a playground example when the feature is useful for users to learn interactively.

When fuzzing finds a compiler crash or an O0/O3 runtime mismatch, replay and
minimize the artifact before promoting it:

```bash
FUZZ_MINIMIZE=1 FUZZ_MINIMIZE_PASSES=8 bun run fuzz:differential
bun run fuzz:replay -- --metadata fuzz/crashes/mismatch_seed-...json --mode parser,typecheck,codegen,runtime,differential,sanitizer
bun run fuzz:replay -- --metadata fuzz/crashes/mismatch_seed-...json --minimize
bun run fuzz:promote -- --metadata fuzz/crashes/mismatch_seed-...json --differential --name "bug-name"
```

See [Compiler Correctness and Fuzz Triage](60-compiler-correctness.md) for the
cross-platform CI matrix, replay modes, artifact metadata, and saved-artifact
validation rules.
