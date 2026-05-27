# Runtime Generic Constraint Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime vtable validation for constrained generic function parameters without changing BPL syntax.

**Architecture:** Keep existing generic constraint parsing and compile-time checks. During code generation for monomorphized generic functions, inspect constrained generic parameters and emit a function-entry vtable check when the parameter type is `T` or `*T` and `T` maps to a struct type with vtable metadata.

**Tech Stack:** TypeScript compiler code, Bun test runner, LLVM IR codegen, existing BPL runtime linking.

---

### Task 1: Regression Tests

**Files:**
- Create: `tests/RuntimeGenericConstraints.test.ts`

- [ ] **Step 1: Write a failing runtime test**

Create a test that passes a `Cat` object through an unsafe cast to `*Dog`, then calls `handle<Dog>(...)` where `Dog` satisfies `T: Animal`. The expected result is a non-zero exit and a message containing `generic constraint`.

- [ ] **Step 2: Write a preserving-polymorphism test**

Create a test for `handle<Animal>(animalPtr)` where `animalPtr` points to a `Dog`; it must keep succeeding so the guard does not reject valid base-pointer polymorphism.

- [ ] **Step 3: Verify RED**

Run:

```bash
bun test tests/RuntimeGenericConstraints.test.ts
```

Expected before implementation: the unsafe-cast test exits `0` or lacks the runtime error message.

### Task 2: Codegen Runtime Guard

**Files:**
- Modify: `compiler/backend/codegen/StatementGenerator.ts`

- [ ] **Step 1: Find constrained generic parameters**

In `generateFunction()`, after parameter stack slots are initialized, iterate `decl.params` and `decl.genericParams`. Select parameters whose effective type is `T` or `*T` for a constrained generic `T`.

- [ ] **Step 2: Resolve concrete and allowed runtime types**

Use `currentTypeMap` to resolve `T` to its concrete type argument. If the concrete type is a struct with a vtable, collect its vtable and vtables for known descendants.

- [ ] **Step 3: Emit a vtable check**

For pointer parameters, skip null, load the first field as `i8*`, compare against allowed vtable globals, and branch to success or failure. For by-value struct parameters, load the vtable from the local stack slot.

- [ ] **Step 4: Emit failure path**

On mismatch, print a short diagnostic with `fprintf(stderr, ...)`, call `exit(1)`, and mark the path `unreachable`.

### Task 3: Verification

**Files:**
- Test: `tests/RuntimeGenericConstraints.test.ts`
- Test: `tests/TypeCheckerConstraints.test.ts`
- Test: `tests/GenericsConstraints.test.ts`
- Test: `tests/TypeNarrowing.test.ts`

- [ ] **Step 1: Run the new focused test**

```bash
bun test tests/RuntimeGenericConstraints.test.ts
```

- [ ] **Step 2: Run related regression tests**

```bash
bun test tests/RuntimeGenericConstraints.test.ts tests/TypeCheckerConstraints.test.ts tests/GenericsConstraints.test.ts tests/TypeNarrowing.test.ts
```

- [ ] **Step 3: Run compiler TypeScript check**

```bash
bunx tsc --noEmit --lib ESNext --target ESNext --module ESNext --moduleResolution bundler --allowImportingTsExtensions --verbatimModuleSyntax --strict --skipLibCheck --noFallthroughCasesInSwitch --noUncheckedIndexedAccess $(find compiler -type f -name '*.ts' -print) index.ts
```
