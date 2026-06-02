# BPL Compiler Public API Reference

This document describes the public API exported from the `compiler/` module for external use.

## Overview

The BPL compiler is organized as a pipeline with distinct phases:

```
Source Code → Lexer → Parser → TypeChecker → CodeGenerator → LLVM IR
```

Compiler pipeline exports are available from `./compiler/index.ts`. Tooling
that consumes the packed npm package can import the stable CLI JSON diagnostic
code registry from `bpl-v3/cli`. Use it as a narrow data registry subpath; it
does not expose compiler internals, command handlers, or release helper scripts.

```typescript
import {
  CLI_JSON_ERROR_CODE_LISTS,
  CLI_JSON_ERROR_CODES,
  type CliJsonErrorCodeList,
} from "bpl-v3/cli";

const registry: readonly CliJsonErrorCodeList[] = CLI_JSON_ERROR_CODE_LISTS;

for (const { name, codes } of registry) {
  console.log(name, codes.length);
}
```

ESM consumers can import the registry with named imports:

```typescript
import { CLI_JSON_ERROR_CODE_LISTS } from "bpl-v3/cli";
```

CommonJS consumers can require the same subpath:

```javascript
const { CLI_JSON_ERROR_CODE_LISTS, CLI_JSON_ERROR_CODES } = require("bpl-v3/cli");
```

---

## Main Entry Point

### `Compiler` Class

The main compiler class that orchestrates the full compilation pipeline.

```typescript
import { Compiler } from "./compiler";

interface CompilerOptions {
  filePath: string;
  outputPath?: string;
  emitType?: "llvm" | "ast" | "tokens" | "formatted";
  verbose?: boolean;
  resolveImports?: boolean;
  useCache?: boolean;
  objectFiles?: string[];
  libraries?: string[];
  libraryPaths?: string[];
  target?: string;
  sysroot?: string;
  clangFlags?: string[];
  dwarf?: boolean;
  debugIrPath?: string | false;
  collectAllErrors?: boolean;
  optimizationLevel?: number;
  jobs?: number;
  requireEntryPoint?: boolean;
}

interface CompilationResult {
  success: boolean;
  output?: string;
  errors?: CompilerError[];
  ast?: AST.Program;
}

const compiler = new Compiler(options);
const result = compiler.compile(sourceCode);
```

`debugIrPath` writes the generated LLVM IR to a diagnostic `.ll` file through
the compiler pipeline. When it is omitted, `BPL_DEBUG_IR` can still enable the
same output, and `false` explicitly disables the environment fallback.
Validation failures are returned as compiler diagnostics with stable
`BPL_CODEGEN_DEBUG_IR_*` codes, including empty explicit paths.

`optimizationLevel` accepts 0 through 3 and is forwarded to code generation,
cached module compilation, and native linking where applicable. `jobs` controls
parallel module compilation when incremental compilation is enabled with
`useCache`. `target` must be one of the supported code generation target
families; unsupported target triples are rejected before LLVM IR is emitted.

#### Methods

| Method                                           | Description                             |
| ------------------------------------------------ | --------------------------------------- |
| `compile(sourceCode: string): CompilationResult` | Compiles source code and returns result |
| `printAST(ast: AST.Program): string`             | Pretty-prints an AST for debugging      |

---

## Frontend (Lexing & Parsing)

### `lexWithGrammar`

Tokenizes BPL source code using the Peggy grammar.

```typescript
import { lexWithGrammar } from "./compiler";

const tokens = lexWithGrammar(sourceCode, filePath);
// Returns: Token[]
```

### `Parser` Class

Parses tokens into an Abstract Syntax Tree (AST).

```typescript
import { Parser } from "./compiler";

const parser = new Parser(sourceCode, filePath, tokens?);
const ast = parser.parse(includeComments?: boolean, throwOnError?: boolean);
// Returns: AST.Program
```

#### Constructor Parameters

| Parameter    | Type       | Description                                  |
| ------------ | ---------- | -------------------------------------------- |
| `sourceCode` | `string`   | The BPL source code                          |
| `filePath`   | `string`   | Path to the source file (for error messages) |
| `tokens`     | `Token[]?` | Optional pre-lexed tokens                    |

### `Token` Class

Represents a lexical token.

```typescript
import { Token, TokenType } from "./compiler";

interface Token {
  type: TokenType;
  lexeme: string;
  literal: any;
  line: number;
  column: number;
}
```

### `TokenType` Enum

All valid token types in the BPL language.

```typescript
import { TokenType } from "./compiler";

TokenType.Identifier;
TokenType.Number;
TokenType.String;
TokenType.Keyword;
// ... etc
```

---

## Middleend (Type Checking)

### `TypeChecker` Class

Performs semantic analysis and type checking on the AST.

```typescript
import { TypeChecker } from "./compiler";

interface TypeCheckerOptions {
  skipImportResolution?: boolean;
  collectAllErrors?: boolean;
}

const checker = new TypeChecker(options);
checker.checkProgram(ast, modulePath?);

const errors = checker.getErrors();
// Returns: CompilerError[]
```

#### Key Methods

| Method                           | Description                                       |
| -------------------------------- | ------------------------------------------------- |
| `checkProgram(ast, modulePath?)` | Type-checks an entire program                     |
| `getErrors()`                    | Returns all accumulated errors                    |
| `typeToString(type)`             | Converts a type node to string representation     |
| `registerModule(path, ast)`      | Registers a module for cross-module type checking |
| `setCurrentModulePath(path)`     | Sets the current module context                   |

### `SymbolTable` Class

Manages variable and type scoping.

```typescript
import { SymbolTable } from "./compiler";

const scope = new SymbolTable(parentScope?);
scope.define({ name, kind, type, declaration });
const symbol = scope.resolve(name);
```

---

## Backend (Code Generation)

### `CodeGenerator` Class

Generates LLVM IR from a type-checked AST.

```typescript
import { CodeGenerator } from "./compiler";

interface CodeGeneratorOptions {
  stdLibPath?: string;
  useLinkOnceOdrForStdLib?: boolean;
  target?: string;
  dwarf?: boolean;
  optimizationLevel?: number;
  debugIrPath?: string | false;
}

const generator = new CodeGenerator(options);
const llvmIR = generator.generate(ast, filePath);
// Returns: string (LLVM IR)
```

`optimizationLevel` accepts 0 through 3 and controls IR attributes that depend
on optimization level; values outside that range are rejected before IR is
generated. `debugIrPath` writes the generated LLVM IR to a diagnostic `.ll`
file; when it is omitted, `BPL_DEBUG_IR` can still enable the same output, and
`false` explicitly disables it. Debug IR write failures are surfaced to
callers. The compiler refuses debug IR destinations that are a symbolic link,
have a symbolic link in their parent path, are not regular files, or use a
missing parent directory. Empty explicit debug IR paths are rejected; use
`false` or `BPL_DEBUG_IR=0`/`BPL_DEBUG_IR=false` to disable diagnostic output.

`target` selects the LLVM target metadata and data layout. Supported target
families: x86_64 Linux, x86_64 macOS, AArch64 Linux, AArch64 macOS, i686 Linux,
x86_64 Windows, wasm32, wasm64. CodeGenerator rejects unsupported target triples
instead of silently using an x86_64 Linux data layout. Target matching uses
triple components, so substring-only matches such as `notlinux` and `notwasm32`
are rejected. Malformed target strings with empty components, such as
`x86_64--linux`, are also rejected before IR is generated.

---

## Formatting

### `Formatter` Class

Formats BPL source code for consistent style.

```typescript
import { Formatter } from "./compiler";

const formatter = new Formatter();
const formattedCode = formatter.format(ast);
// Returns: string
```

---

## Common Types

### `AST` Namespace

All AST node types are exported under the `AST` namespace.

```typescript
import * as AST from "./compiler";

// Key types:
AST.Program; // Root node
AST.FunctionDecl; // Function declaration
AST.StructDecl; // Struct declaration
AST.EnumDecl; // Enum declaration
AST.VariableDecl; // Variable declaration
AST.TypeNode; // Type annotation
AST.Expression; // Base expression type
AST.Statement; // Base statement type
// ... many more
```

### `CompilerError` Class

Standardized error class with source location information.

```typescript
import { CompilerError } from "./compiler";

interface SourceLocation {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

class CompilerError extends Error {
  constructor(
    message: string,
    hint?: string,
    location?: SourceLocation,
    code?: string,
    severity?: "error" | "warning" | "info",
  );

  readonly message: string;
  readonly hint: string;
  readonly location: SourceLocation;
  readonly code: string;
  readonly severity: string;
}
```

### `ASTPrinter` Class

Pretty-prints AST for debugging purposes.

```typescript
import { ASTPrinter } from "./compiler";

const printer = new ASTPrinter();
const output = printer.print(ast);
```

---

## Usage Examples

### Basic Compilation

```typescript
import { Compiler } from "./compiler";

const compiler = new Compiler({
  filePath: "main.bpl",
  emitType: "llvm",
  verbose: true,
});

const result = compiler.compile(`
  frame main() ret int {
    return 42;
  }
`);

if (result.success) {
  console.log(result.output); // LLVM IR
} else {
  console.error(result.errors);
}
```

### Manual Pipeline

```typescript
import {
  lexWithGrammar,
  Parser,
  TypeChecker,
  CodeGenerator,
  Formatter,
} from "./compiler";

// 1. Lex
const tokens = lexWithGrammar(source, "main.bpl");

// 2. Parse
const parser = new Parser(source, "main.bpl", tokens);
const ast = parser.parse(true);

// 3. Format (optional)
const formatter = new Formatter();
const formatted = formatter.format(ast);

// 4. Type Check
const checker = new TypeChecker();
checker.checkProgram(ast);
const errors = checker.getErrors();
if (errors.length > 0) throw errors[0];

// 5. Generate Code
const generator = new CodeGenerator({ target: "x86_64-pc-linux-gnu" });
const llvmIR = generator.generate(ast, "main.bpl");
```

### Error Handling

```typescript
import { Compiler, CompilerError } from "./compiler";

try {
  const result = compiler.compile(source);
  if (!result.success) {
    for (const error of result.errors) {
      console.error(
        `${error.location.file}:${error.location.startLine}: ${error.message}`,
      );
      if (error.hint) {
        console.error(`  Hint: ${error.hint}`);
      }
    }
  }
} catch (e) {
  if (e instanceof CompilerError) {
    console.error(`Fatal: ${e.message}`);
  }
  throw e;
}
```

---

## Compatibility Notes

- The public API is stable for the exported classes and functions listed above
- Internal modules under `compiler/` subdirectories may change without notice
- The `AST` namespace types may be extended with new node types

---

_Last Updated: June 1, 2026_
