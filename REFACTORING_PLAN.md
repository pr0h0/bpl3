# BPL Compiler Refactoring Plan

## Overview

This document outlines a comprehensive refactoring plan for the BPL compiler codebase, focusing on:
- Reducing file sizes to ~1000 lines each
- Extracting duplicate code into reusable functions/services
- Improving code organization and maintainability
- Creating dedicated handlers/services for related functionality

---

## Current State Analysis

### File Size Summary (Lines of Code)

| File | Lines | Status |
|------|-------|--------|
| `compiler/backend/codegen/ExpressionGenerator.ts` | 6,951 | 🔴 Critical - needs splitting |
| `compiler/backend/codegen/TypeGenerator.ts` | 2,843 | 🔴 Critical - needs splitting |
| `compiler/backend/codegen/StatementGenerator.ts` | 2,415 | 🔴 Critical - needs splitting |
| `vscode-ext/src/server.ts` | 2,239 | 🔴 Critical - needs splitting |
| `compiler/middleend/TypeChecker.ts` | 1,621 | 🟡 Moderate - consider splitting |
| `compiler/middleend/ExpressionChecker.ts` | 1,531 | 🟡 Moderate - consider splitting |
| `compiler/formatter/Formatter.ts` | 1,410 | 🟡 Moderate - consider splitting |
| `compiler/middleend/CallChecker.ts` | 1,346 | 🟡 Moderate - consider splitting |
| `compiler/middleend/TypeCheckerBase.ts` | 1,273 | 🟡 Moderate - consider splitting |
| `index.ts` (CLI) | 1,060 | 🟡 Moderate - needs restructuring |
| `compiler/index.ts` | 522 | 🟢 Good size |

---

## Priority 1: CLI Entry Point (`index.ts`)

### Current Issues

1. **Embedded Shell Scripts** (~250 lines): `getBashCompletion()` and `getZshCompletion()` functions contain full shell scripts embedded as strings
2. **Mixed Responsibilities**: CLI parsing, compilation orchestration, and binary execution all in one file
3. **Duplicate Compilation Logic**: `processCodeInternal()` has two code paths (with imports vs single-file) that share similar logic
4. **No Clear Separation**: Command handlers are inline within the commander action callbacks

### Recommended Changes

#### 1.1 Extract Completion Scripts
```
completions/
├── bash.ts           # Export function that returns bash script
├── zsh.ts            # Export function that returns zsh script
└── index.ts          # Unified completions loader
```
- Move embedded completion scripts to dedicated files
- Load from file if exists, otherwise use embedded fallback

#### 1.2 Create CLI Command Handlers
```
cli/
├── commands/
│   ├── CompileCommand.ts     # bpl <file> compilation
│   ├── FormatCommand.ts      # bpl format
│   ├── LintCommand.ts        # bpl lint
│   ├── PackageCommands.ts    # init, install, list, uninstall, pack
│   ├── CompletionCommand.ts  # bpl completion
│   └── DocsCommand.ts        # bpl docs
├── CompilationRunner.ts      # Handles compilation pipeline
├── BinaryRunner.ts           # Handles clang invocation and execution
└── index.ts                  # Main CLI setup
```

#### 1.3 Extract Compilation Pipeline
Create `cli/CompilationRunner.ts`:
```typescript
interface CompilationOptions {
  filePath: string;
  output?: string;
  emit: 'llvm' | 'ast' | 'tokens' | 'formatted';
  verbose?: boolean;
  // ... other options
}

class CompilationRunner {
  run(options: CompilationOptions): void;
  private compileWithImports(): void;
  private compileSingleFile(): void;
}
```

#### 1.4 Extract Binary Runner
Create `cli/BinaryRunner.ts`:
```typescript
class BinaryRunner {
  buildClangArgs(options: ClangOptions): string[];
  compile(irPath: string, options: ClangOptions): void;
  run(execPath: string, args: string[]): number;
}
```

**Estimated Result**: `index.ts` reduced from ~1060 to ~200 lines

---

## Priority 2: VS Code Extension Server (`vscode-ext/src/server.ts`)

### Current Issues

1. **Monolithic File**: 2,239 lines handling all LSP features
2. **Duplicate Code**: `findSymbolDefinition()` has duplicate logic for current file vs imported file
3. **No Service Separation**: Completion, hover, definition, references all in one file
4. **Repeated Patterns**: Similar regex patterns used in multiple places
5. **Cache Logic Inline**: Import caching logic mixed with feature handlers

### Recommended Changes

#### 2.1 Create Service Architecture
```
vscode-ext/src/
├── server.ts                    # Main server setup (~150 lines)
├── services/
│   ├── DocumentService.ts       # Document management, validation
│   ├── CompletionService.ts     # Completion provider
│   ├── HoverService.ts          # Hover provider
│   ├── DefinitionService.ts     # Go-to-definition
│   ├── ReferencesService.ts     # Find references, rename
│   ├── FormattingService.ts     # Document formatting
│   ├── CodeActionService.ts     # Quick fixes
│   ├── CodeLensService.ts       # Run button for main()
│   └── DiagnosticsService.ts    # Error reporting
├── utils/
│   ├── ImportResolver.ts        # Import path resolution
│   ├── ImportCache.ts           # Module caching
│   ├── SymbolFinder.ts          # Symbol definition lookup
│   ├── TypeFormatter.ts         # Type-to-string helpers
│   └── ASTTraversal.ts          # AST navigation utilities
└── extension.ts                 # Extension activation
```

#### 2.2 Extract Symbol Finder
The `findSymbolDefinition()` function (~200 lines) should be extracted:
```typescript
// utils/SymbolFinder.ts
export class SymbolFinder {
  findDefinition(document: TextDocument, word: string): SymbolLocation | null;
  findInCurrentFile(text: string, word: string): SymbolLocation | null;
  findInImports(document: TextDocument, word: string): SymbolLocation | null;
  private extractDefinitionContent(text: string, matchType: string, startLine: number): string;
}
```

#### 2.3 Extract Import Cache
```typescript
// utils/ImportCache.ts
export class ImportCache {
  private cache: Map<string, CacheEntry>;
  get(filePath: string): CacheEntry | null;
  set(filePath: string, program: AST.Program): void;
  invalidate(filePath: string): void;
  watchFile(filePath: string): void;
}
```

#### 2.4 Extract Completion Service
```typescript
// services/CompletionService.ts
export class CompletionService {
  getCompletions(params: TextDocumentPositionParams): CompletionItem[];
  getMemberCompletions(document: TextDocument, position: Position): CompletionItem[];
  getKeywordCompletions(): CompletionItem[];
  getTypeCompletions(): CompletionItem[];
  getLocalVariableCompletions(analysis: AnalysisResult, position: Position): CompletionItem[];
}
```

#### 2.5 Consolidate Duplicate Regex Patterns
Create shared regex patterns:
```typescript
// utils/patterns.ts
export const PATTERNS = {
  DEFINITION: /\b(frame|struct|enum|local|global|type|extern|spec)\s+(\w+)\b/g,
  IMPORT: /import\s+(.+?)\s+from\s+["'](.+?)["']/g,
  STRUCT_FIELD: /(\w+)\s*:\s*([a-zA-Z0-9_*]+)/,
  // ...
};
```

**Estimated Result**: `server.ts` reduced from ~2239 to ~200 lines

---

## Priority 3: Code Generator (`compiler/backend/codegen/`)

### Current Issues

1. **ExpressionGenerator.ts**: 6,951 lines - far too large
2. **TypeGenerator.ts**: 2,843 lines - needs splitting
3. **StatementGenerator.ts**: 2,415 lines - needs splitting
4. **Deep Inheritance**: StatementGenerator extends TypeGenerator extends ExpressionGenerator extends BaseCodeGenerator

### Recommended Changes

#### 3.1 Split ExpressionGenerator by Expression Type
```
compiler/backend/codegen/
├── BaseCodeGenerator.ts          # Core IR generation utilities
├── TypeGenerator.ts              # Type-to-LLVM-type conversion
├── generators/
│   ├── LiteralGenerator.ts       # Number, String, Boolean, Null literals
│   ├── BinaryOperatorGenerator.ts # +, -, *, /, comparisons
│   ├── UnaryOperatorGenerator.ts  # !, -, *, &
│   ├── CallGenerator.ts          # Function calls, method calls
│   ├── MemberAccessGenerator.ts  # Struct field access, array index
│   ├── ControlFlowGenerator.ts   # If, Loop, Match, Switch
│   ├── MemoryGenerator.ts        # Malloc, free, sizeof
│   ├── CastGenerator.ts          # Type casts
│   ├── ArrayGenerator.ts         # Array literals, slices
│   ├── StructGenerator.ts        # Struct literals, constructors
│   ├── EnumGenerator.ts          # Enum variants, pattern matching
│   ├── LambdaGenerator.ts        # Lambda expressions
│   └── AsmGenerator.ts           # Inline assembly
├── ExpressionGenerator.ts        # Orchestrates expression generators (~500 lines)
├── StatementGenerator.ts         # Orchestrates statement generation (~500 lines)
└── CodeGenerator.ts              # Main entry point (~300 lines)
```

#### 3.2 Create Generator Registry
```typescript
// generators/GeneratorRegistry.ts
export class GeneratorRegistry {
  private generators: Map<string, Generator>;
  
  register(kind: string, generator: Generator): void;
  generate(expr: AST.Expression): IRValue;
}
```

#### 3.3 Extract Common IR Patterns
```typescript
// utils/IRBuilder.ts
export class IRBuilder {
  allocStack(type: string, name: string): string;
  load(type: string, ptr: string): string;
  store(type: string, value: string, ptr: string): void;
  call(returnType: string, name: string, args: string[]): string;
  gep(baseType: string, ptr: string, indices: string[]): string;
  // ...common patterns
}
```

**Estimated Result**: 
- `ExpressionGenerator.ts`: 6951 → ~500 lines (orchestration only)
- Individual generators: ~300-500 lines each

---

## Priority 4: Type Checker (`compiler/middleend/`)

### Current Issues

1. **TypeChecker.ts** + **TypeCheckerBase.ts**: Combined ~2,900 lines
2. **ExpressionChecker.ts**: 1,531 lines
3. **CallChecker.ts**: 1,346 lines
4. **Duplicate Type Comparison Logic**: Similar patterns in multiple checkers

### Recommended Changes

#### 4.1 Extract Type Comparison Service
```typescript
// middleend/TypeComparison.ts
export class TypeComparison {
  areTypesCompatible(a: TypeNode, b: TypeNode): boolean;
  canImplicitlyConvert(from: TypeNode, to: TypeNode): boolean;
  findCommonType(types: TypeNode[]): TypeNode | null;
  isSubtypeOf(sub: TypeNode, super: TypeNode): boolean;
}
```

#### 4.2 Split ExpressionChecker
```
middleend/checkers/
├── LiteralChecker.ts
├── BinaryChecker.ts
├── UnaryChecker.ts
├── CallChecker.ts (existing, but smaller)
├── MemberChecker.ts
├── CastChecker.ts
├── MatchChecker.ts
├── ArrayChecker.ts
└── LambdaChecker.ts
```

#### 4.3 Extract Generic Resolution
```typescript
// middleend/GenericResolver.ts
export class GenericResolver {
  instantiate(decl: GenericDecl, typeArgs: TypeNode[]): Declaration;
  inferTypeArgs(params: TypeNode[], args: TypeNode[]): Map<string, TypeNode>;
  substituteTypeParams(type: TypeNode, substitution: Map<string, TypeNode>): TypeNode;
}
```

---

## Priority 5: Formatter (`compiler/formatter/Formatter.ts`)

### Current Issues

1. **Single Large File**: 1,410 lines
2. **All Format Methods in One Class**: formatVariableDecl, formatFunctionDecl, formatStructDecl, etc.

### Recommended Changes

#### 5.1 Split by Statement Type
```
compiler/formatter/
├── Formatter.ts                  # Main orchestrator (~200 lines)
├── formatters/
│   ├── ExpressionFormatter.ts    # Expression formatting
│   ├── StatementFormatter.ts     # Statement formatting
│   ├── DeclarationFormatter.ts   # Function, struct, enum formatting
│   ├── TypeFormatter.ts          # Type annotation formatting
│   └── CommentFormatter.ts       # Comment handling
└── FormatterConfig.ts            # Formatting options
```

---

## Priority 6: Common Code Extraction

### 6.1 Shared Utilities

#### Path Resolution
Currently duplicated between:
- `compiler/common/PathResolver.ts`
- `compiler/middleend/ModuleResolver.ts`
- `vscode-ext/src/server.ts` (`resolveImportToFile`, `findWorkspaceLibDir`)

**Solution**: Create unified path resolution:
```typescript
// common/PathResolver.ts (enhanced)
export class PathResolver {
  static resolveImport(importPath: string, currentDir: string): string | null;
  static findLibDir(startDir: string): string | null;
  static resolveBplPath(...segments: string[]): string;
}
```

#### Error Handling
Currently using both:
- `CompilerError` class
- Ad-hoc error creation in various files

**Solution**: Standardize error creation:
```typescript
// common/errors/
├── CompilerError.ts           # Base error class
├── ParseError.ts              # Syntax errors
├── TypeError.ts               # Type checking errors
├── LinkError.ts               # Linker errors
└── ErrorFactory.ts            # Common error messages
```

### 6.2 AST Traversal

Duplicate AST traversal patterns in:
- `vscode-ext/src/server.ts` (`findNodeAtPosition`, `traverseLocals`)
- `compiler/middleend/CaptureAnalyzer.ts`
- `compiler/formatter/Formatter.ts`

**Solution**: Create shared AST utilities:
```typescript
// common/ASTUtils.ts
export class ASTTraversal {
  static findNodeAtPosition(node: ASTNode, line: number, col: number): ASTNode[];
  static traverse(node: ASTNode, visitor: ASTVisitor): void;
  static findParent(node: ASTNode, predicate: (n: ASTNode) => boolean): ASTNode | null;
  static collectDeclarations(node: ASTNode): Declaration[];
}
```

---

## Proposed Directory Structure (After Refactoring)

```
transpiler/
├── index.ts                          # Minimal entry point (~50 lines)
├── cli/
│   ├── index.ts                      # CLI setup
│   ├── commands/                     # Command handlers
│   ├── CompilationRunner.ts
│   ├── BinaryRunner.ts
│   └── completions/
├── compiler/
│   ├── index.ts                      # Compiler API exports
│   ├── common/
│   │   ├── AST.ts
│   │   ├── ASTUtils.ts               # NEW: Shared traversal
│   │   ├── PathResolver.ts           # ENHANCED
│   │   ├── errors/                   # NEW: Error hierarchy
│   │   └── ...
│   ├── frontend/
│   │   └── ...                       # (no major changes needed)
│   ├── middleend/
│   │   ├── TypeChecker.ts            # Smaller orchestrator
│   │   ├── checkers/                 # NEW: Split checkers
│   │   ├── TypeComparison.ts         # NEW: Type comparison service
│   │   ├── GenericResolver.ts        # NEW: Generic handling
│   │   └── ...
│   ├── backend/
│   │   ├── CodeGenerator.ts          # Smaller orchestrator
│   │   ├── codegen/
│   │   │   ├── generators/           # NEW: Split generators
│   │   │   ├── IRBuilder.ts          # NEW: IR helpers
│   │   │   └── ...
│   │   └── ...
│   └── formatter/
│       ├── Formatter.ts              # Smaller orchestrator
│       └── formatters/               # NEW: Split formatters
└── vscode-ext/
    └── src/
        ├── extension.ts
        ├── server.ts                 # Minimal server setup
        ├── services/                 # NEW: Feature services
        └── utils/                    # NEW: Shared utilities
```

---

## Implementation Order

### Phase 1: Quick Wins (Low Risk)
1. ✅ Extract completion scripts from `index.ts` to files
2. ✅ Create `cli/` directory structure
3. ✅ Extract `BinaryRunner` from `index.ts`
4. ✅ Move command handlers to separate files

### Phase 2: VS Code Extension Refactoring
1. Create service architecture
2. Extract `SymbolFinder` utility
3. Extract `ImportCache` 
4. Split handlers into services
5. Test each feature after extraction

### Phase 3: Code Generator Refactoring
1. Create generator registry pattern
2. Extract one generator at a time (start with simpler ones)
3. Create `IRBuilder` utility class
4. Maintain backwards compatibility via facade

### Phase 4: Type Checker Refactoring
1. Extract `TypeComparison` service
2. Split expression checkers
3. Extract `GenericResolver`

### Phase 5: Formatter Refactoring
1. Create formatter architecture
2. Split formatters by node type

### Phase 6: Final Cleanup
1. Consolidate shared utilities
2. Update imports across codebase
3. Update tests
4. Documentation updates

---

## Testing Strategy

For each refactoring step:
1. Run `bun run check` - TypeScript type checking
2. Run `bun test` - Full test suite
3. Test specific functionality manually
4. Run integration tests: `bun test tests/Integration.test.ts`

---

## Risk Mitigation

1. **One File at a Time**: Refactor one major file, verify tests pass, then proceed
2. **Feature Flags**: Keep old code paths available during transition
3. **Incremental PRs**: Small, reviewable changes
4. **Comprehensive Testing**: Ensure test coverage before refactoring

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Largest file | 6,951 lines | < 1,000 lines |
| Files > 1000 lines | 11 | 0 |
| Duplicate code patterns | Many | Minimal |
| Time to find code | Slow | Fast (clear organization) |

---

## Notes

- **Peggy Grammar**: The `grammar/bpl.peggy` file is excluded from refactoring as it contains raw syntax/parsing logic and is not pure TypeScript
- **Test Files**: The `tests/` directory is preserved as-is to track refactoring progress and ensure nothing breaks during the process
- **Documentation**: Update `docs/` after refactoring is complete to reflect the new project structure

---

## Additional Improvements

Beyond file splitting and code organization, consider these additional upgrades:

### 7.1 TypeScript Strictness

**Current Issues**:
- Frequent use of `any` type throughout the codebase
- Missing interface definitions for common patterns
- Loose typing in some areas

**Recommendations**:
```typescript
// Before
function processOptions(options: any): void { ... }

// After
interface CompilationOptions {
  filePath: string;
  emit: EmitType;
  verbose?: boolean;
  // ...
}
function processOptions(options: CompilationOptions): void { ... }
```

- Enable stricter TypeScript options in `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noImplicitAny": true,
      "strictNullChecks": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true
    }
  }
  ```

### 7.2 Dependency Injection

**Current Issue**: Hard-coded dependencies make testing difficult

**Recommendation**: Use constructor injection for major services:
```typescript
// Instead of creating dependencies internally
class TypeChecker {
  private importHandler = new ImportHandler(this);
  
// Use injection
class TypeChecker {
  constructor(
    private importHandler: ImportHandler,
    private overloadResolver: OverloadResolver
  ) {}
}
```

### 7.3 Centralized Configuration

**Current Issue**: Configuration scattered across files

**Recommendation**: Create unified config:
```typescript
// config/CompilerConfig.ts
export interface CompilerConfig {
  paths: {
    bplHome: string;
    libDir: string;
    cacheDir: string;
  };
  defaults: {
    target: string;
    optimization: OptLevel;
  };
  features: {
    enableCache: boolean;
    enableDwarf: boolean;
  };
}

export const getConfig = (): CompilerConfig => { ... };
```

### 7.4 Structured Logging

**Current Issue**: Mix of `console.log` and `console.error` with inconsistent formatting

**Recommendation**: Create logging service:
```typescript
// common/Logger.ts
export enum LogLevel { DEBUG, INFO, WARN, ERROR }

export class Logger {
  constructor(private context: string) {}
  
  debug(message: string, data?: object): void;
  info(message: string, data?: object): void;
  warn(message: string, data?: object): void;
  error(message: string, error?: Error): void;
  
  time(label: string): void;
  timeEnd(label: string): void;
}

// Usage
const log = new Logger('TypeChecker');
log.info('Checking program', { file: filePath });
```

### 7.5 Result/Either Pattern for Error Handling

**Current Issue**: Mix of throwing errors and returning error arrays

**Recommendation**: Standardize with Result type:
```typescript
// common/Result.ts
type Result<T, E = CompilerError> = 
  | { success: true; value: T }
  | { success: false; error: E };

// Usage
function parseFile(path: string): Result<AST.Program> {
  try {
    const ast = parser.parse();
    return { success: true, value: ast };
  } catch (e) {
    return { success: false, error: e as CompilerError };
  }
}
```

### 7.6 Dead Code & Unused Imports

**Action Items**:
- Run `bun run check` with `noUnusedLocals` enabled
- Use ESLint with `no-unused-vars` rule
- Remove commented-out code blocks
- Clean up deprecated functions

### 7.7 Consistent Naming Conventions

**Establish Standards**:
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `TypeChecker`, `CodeGenerator` |
| Interfaces | PascalCase (no I prefix) | `CompilerOptions`, `TypeNode` |
| Functions | camelCase | `checkExpression`, `generateIR` |
| Constants | SCREAMING_SNAKE | `MAX_CALL_DEPTH`, `DEFAULT_TARGET` |
| Private fields | camelCase with underscore or # | `_cache` or `#cache` |
| Files | PascalCase for classes, camelCase for utils | `TypeChecker.ts`, `pathUtils.ts` |

### 7.8 JSDoc Documentation

**Add documentation to public APIs**:
```typescript
/**
 * Compiles BPL source code to LLVM IR.
 * 
 * @param sourceCode - The BPL source code to compile
 * @returns Compilation result with LLVM IR or errors
 * 
 * @example
 * ```typescript
 * const compiler = new Compiler({ filePath: 'main.bpl' });
 * const result = compiler.compile(code);
 * if (result.success) {
 *   fs.writeFileSync('output.ll', result.output);
 * }
 * ```
 */
compile(sourceCode: string): CompilationResult { ... }
```

### 7.9 Plugin Architecture (Future) - Ignore for now

**Consider for future extensibility**:
```typescript
// plugins/PluginManager.ts
interface CompilerPlugin {
  name: string;
  version: string;
  
  // Hooks
  beforeParse?(source: string): string;
  afterParse?(ast: AST.Program): AST.Program;
  beforeTypeCheck?(ast: AST.Program): void;
  afterTypeCheck?(ast: AST.Program, checker: TypeChecker): void;
  beforeCodeGen?(ast: AST.Program): void;
  afterCodeGen?(ir: string): string;
}
```

### 7.10 Performance Optimizations

**Consider**:
- Lazy loading of stdlib modules
- AST node pooling to reduce GC pressure
- Incremental parsing for LSP (only re-parse changed sections)
- Worker threads for parallel type checking of independent modules

### 7.11 Build Optimization

**For compiled binary (`bpl`)**:
- Tree-shaking unused code
- Bundle size analysis
- Faster startup time optimization

---

## Final Checklist Before Completion

- [ ] All files under 1000 lines
- [ ] No duplicate code patterns
- [ ] TypeScript strict mode passes
- [ ] All tests passing (`bun test`)
- [ ] No TypeScript errors (`bun run check`)
- [ ] Code formatted (`bun run format`)
- [ ] JSDoc on public APIs
- [ ] Update `docs/` with new structure
- [ ] Update `README.md` if needed
- [ ] Update `AGENTS.MD` with new file locations

---

*Last Updated: January 1, 2026*
