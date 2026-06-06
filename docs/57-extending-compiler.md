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

### Adding a CLI Command

CLI commands are registered lazily so `bpl --version`, no-input diagnostics,
and default source compilation do not evaluate every command module.

When adding a command:

1. Export its registrar from `cli/commands/index.ts`.
2. Add the command or alias to `GROUP_BY_COMMAND` in
   `cli/CommandRegistration.ts`.
3. Add a dynamic registrar loader for its group. Commands that share
   implementation, such as package operations, should share one group.
4. Add its group to the ordered root-help group list so `bpl --help` keeps
   advertising the full command inventory without loading the public command
   barrel or unrelated action dependencies.
5. Keep action-only compiler, watcher, package-manager, documentation-parser,
   and filesystem-heavy dependencies behind dynamic imports inside the action
   callback. When shared action formatting needs a dependency during
   registration, import its focused contracts module directly instead of its
   implementation module or a broad compiler barrel. Registration modules must
   stay cheap enough to load for command-specific help.
6. Add selector and CLI behavior coverage. Keep `index.ts` free of eager
   imports from `cli/commands` and `cli/CompilationRunner`.

Run the focused startup and command contracts with:

```bash
bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/CompletionTargets.test.ts
```

## Testing Your Changes

Always run the relevant test suite after making changes:

```bash
# Fast local loop for focused changes
bun test tests/SpecificFeature.test.ts

# Broad CI-safe suite, including integration, playground, and VS Code extension tests
bun run test:ci

# Inspect the typed CI-safe runner plan without executing the suite
bun tools/test_ci.ts --list

# VS Code extension tests only
bun run test:vscode-ext

# Windows-safe parser, typechecker, codegen, and target triple smoke tests
bun run test:codegen-cross-platform

# Compiler correctness, LLVM verifier, and deterministic fuzz regression suite
bun run test:correctness

# Sanitizer-backed runtime checks for representative safe programs and checked failures
bun run test:sanitizers

# Deterministic O0/O3 runtime differential fuzzing, including checked failures
# and generated-LLVM verifier checks
bun run fuzz:differential

# Validate saved active fuzz failures
bun run fuzz:validate-artifacts
```

`bun run fuzz:differential` reports progress every 12 iterations per seed by
default, which keeps the default 48-iteration campaign visible in local and CI
logs. Override that interval with `FUZZ_DIFFERENTIAL_PROGRESS=<n>` when you
need quieter or more detailed progress output. The long scheduled fuzz script
keeps the shared `FUZZ_PROGRESS` default for larger campaigns.

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
