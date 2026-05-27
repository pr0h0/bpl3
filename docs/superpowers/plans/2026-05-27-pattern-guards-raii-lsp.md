# Pattern Guards, RAII, and LSP Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement nested enum patterns, user-defined type guards, opt-in automatic destructor calls, and switch-case-aware VS Code rename.

**Architecture:** Reuse the existing AST and codegen patterns wherever possible. Extend parser/type metadata only where needed for guard return types, and reuse the existing defer/scope unwinding machinery for RAII cleanup.

**Tech Stack:** TypeScript compiler, Peggy grammar, LLVM IR codegen, Bun tests, VS Code language-server tests.

---

### Task 1: Nested Enum Patterns

**Files:**
- Modify: `grammar/bpl.peggy`
- Modify: `compiler/backend/codegen/MatchExpressionGenerator.ts`
- Modify: `compiler/middleend/TypeChecker.ts`
- Test: `tests/NestedEnumPatternMatching.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/NestedEnumPatternMatching.test.ts` with runtime tests for `Option<Result<int, int>>`-style nesting, literal payload matching, wildcard payload matching, and fallback behavior.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test tests/NestedEnumPatternMatching.test.ts
```

Expected before implementation: parse or codegen fails for nested enum payload patterns.

- [ ] **Step 3: Extend pattern parsing**

Change `PatternBinding` so enum tuple payloads accept the full `Pattern` rule. Keep enum struct field syntax unchanged for this pass.

- [ ] **Step 4: Harden recursive type checking**

Ensure `checkPattern()` resolves enum declarations for nested payload types and defines identifier bindings only through recursive extraction.

- [ ] **Step 5: Generate recursive enum payload checks**

Replace the identifier-only tuple payload binding path with helpers that extract payload values, recursively check nested patterns, and bind identifiers before guard/body generation.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
bun test tests/NestedEnumPatternMatching.test.ts tests/NestedTupleMatch.test.ts tests/EnumMatch.test.ts tests/MatchComplex.test.ts
```

Expected after implementation: all tests pass.

### Task 2: User-Defined Type Guards

**Files:**
- Modify: `compiler/common/AST.ts`
- Modify: `grammar/bpl.peggy`
- Modify: `compiler/formatter/Formatter.ts`
- Modify: `compiler/middleend/TypeChecker.ts`
- Modify: `compiler/middleend/ExpressionChecker.ts`
- Modify: `compiler/middleend/StatementChecker.ts`
- Modify: `compiler/backend/codegen/StatementGenerator.ts`
- Test: `tests/UserTypeGuards.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/UserTypeGuards.test.ts` with parser/typechecker/codegen tests for `ret value is *Dog` and a runtime test that accesses `Dog` fields inside `if (isDog(animal))`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test tests/UserTypeGuards.test.ts
```

Expected before implementation: parser rejects `ret value is *Dog`.

- [ ] **Step 3: Add guard return AST metadata**

Represent guard return types as function return metadata containing the parameter name and target type, while keeping the executable function return type equivalent to `bool`.

- [ ] **Step 4: Validate guard declarations**

Validate the referenced parameter, target type, and bool-compatible body returns. Store guard metadata on the function declaration and function type.

- [ ] **Step 5: Implement branch narrowing**

When checking an `if` condition that calls a guard function with a simple identifier argument, enter the then-branch scope with that identifier narrowed to the guard target type.

- [ ] **Step 6: Emit narrowed code safely**

When codegen enters a narrowed branch, override the identifier type for address/member generation and insert the needed pointer/value cast when loading the narrowed identifier.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
bun test tests/UserTypeGuards.test.ts tests/TypeNarrowing.test.ts tests/ComplexTypeNarrowing.test.ts tests/FunctionAttributes.test.ts
```

Expected after implementation: all tests pass.

### Task 3: Opt-In RAII Cleanup

**Files:**
- Modify: `compiler/backend/codegen/StatementGenerator.ts`
- Modify: `compiler/backend/codegen/TypeGenerator.ts`
- Test: `tests/RAIIAutoDestroy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/RAIIAutoDestroy.test.ts` with runtime tests for scope fallthrough cleanup, early-return cleanup, and direct returned-local move suppression.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test tests/RAIIAutoDestroy.test.ts
```

Expected before implementation: destroy counters do not change automatically.

- [ ] **Step 3: Detect destructible locals**

Add a helper that checks whether a resolved local type is a struct value with an instance `destroy` method. Do not register primitives, raw pointers, globals, or parameters.

- [ ] **Step 4: Register automatic cleanup**

After local initialization, push a synthetic cleanup statement into the current scope's deferred list. The cleanup calls `destroy` on the local address through normal direct method dispatch.

- [ ] **Step 5: Suppress cleanup for direct returned locals**

When generating `return localName;`, mark that local as moved before running scope cleanups so its automatic destroy is skipped.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
bun test tests/RAIIAutoDestroy.test.ts tests/V01StabilityEdgeCases.test.ts tests/RuntimeGenericConstraints.test.ts
```

Expected after implementation: all tests pass.

### Task 4: Switch-Case Rename Scoping

**Files:**
- Modify: `vscode-ext/src/services/ASTRenameHandler.ts`
- Modify: `vscode-ext/src/test/rename.test.ts`

- [ ] **Step 1: Unskip and update failing test**

Enable the switch-case rename test and update its BPL source so local declarations include explicit type annotations.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test vscode-ext/src/test/rename.test.ts
```

Expected before implementation: the switch-case test fails or is the only failing assertion.

- [ ] **Step 3: Treat switch bodies as scopes**

Update the rename handler's local-scope search so `Switch`, each `Case.body`, and the default block participate in declaration containment.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test vscode-ext/src/test/rename.test.ts
```

Expected after implementation: no skipped switch-case test and all rename tests pass.

### Task 5: Final Verification and Merge

**Files:**
- Check all files changed by previous tasks.

- [ ] **Step 1: Run focused tests**

```bash
bun test tests/NestedEnumPatternMatching.test.ts tests/UserTypeGuards.test.ts tests/RAIIAutoDestroy.test.ts vscode-ext/src/test/rename.test.ts
```

- [ ] **Step 2: Run related compiler regression set**

```bash
bun test tests/NestedTupleMatch.test.ts tests/EnumMatch.test.ts tests/MatchComplex.test.ts tests/TypeNarrowing.test.ts tests/ComplexTypeNarrowing.test.ts tests/FunctionAttributes.test.ts tests/V01StabilityEdgeCases.test.ts tests/RuntimeGenericConstraints.test.ts
```

- [ ] **Step 3: Run strict TypeScript check**

```bash
bunx tsc --noEmit --lib ESNext --target ESNext --module ESNext --moduleResolution bundler --allowImportingTsExtensions --verbatimModuleSyntax --strict --skipLibCheck --noFallthroughCasesInSwitch --noUncheckedIndexedAccess $(find compiler -type f -name '*.ts' -print) index.ts
```

- [ ] **Step 4: Run extension TypeScript check**

```bash
cd vscode-ext && npx tsc --noEmit
```

- [ ] **Step 5: Run diff hygiene**

```bash
git diff --check
```

- [ ] **Step 6: Run full suite**

```bash
bun test tests/
```

- [ ] **Step 7: Commit and merge locally**

Commit the implementation on `feature/pattern-guards-raii-lsp`, fast-forward merge into `master`, verify a focused post-merge test set, and remove the temporary worktree.
