# Compiler Semantics Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a current semantic/ABI contract, reusable golden LLVM shape tests, and a small incremental lowering layer for implicit conversions.

**Architecture:** Keep this as an incremental hardening pass, not a full AST/HIR/MIR rewrite. Add explicit conversion classification in the middle end, use it from existing type-check/codegen paths, and document the current compiler contract so future refactors have an executable target.

**Tech Stack:** Bun test runner, TypeScript compiler codebase, BPL parser/typechecker/codegen, LLVM IR string shape assertions.

---

### Task 1: Semantic Spec Coverage

**Files:**
- Create: `tests/LanguageSpecDocs.test.ts`
- Modify: `LANGUAGE_SPEC.md`

- [ ] **Step 1: Write the failing documentation guard**

Create `tests/LanguageSpecDocs.test.ts` with checks that `LANGUAGE_SPEC.md` includes sections for semantic core, conversion semantics, ABI lowering, and compiler pipeline boundaries.

- [ ] **Step 2: Run the documentation guard**

Run: `bun test tests/LanguageSpecDocs.test.ts`

Expected before the doc update: FAIL because the sections do not exist yet.

- [ ] **Step 3: Document current semantics**

Update `LANGUAGE_SPEC.md` with current commitments for primitive widths, arrays/slices/pointers, function and lambda ABI, implicit conversions, null handling, and compiler pipeline expectations.

- [ ] **Step 4: Re-run the documentation guard**

Run: `bun test tests/LanguageSpecDocs.test.ts`

Expected after the doc update: PASS.

### Task 2: Golden LLVM Shape Tests

**Files:**
- Create: `tests/helpers/compileToLLVM.ts`
- Modify: `tests/helpers/index.ts`
- Create: `tests/GoldenLLVMShapes.test.ts`

- [ ] **Step 1: Write golden tests against a missing helper**

Create `tests/GoldenLLVMShapes.test.ts` that imports `compileToLLVM` from `./helpers` and checks LLVM shape for slice construction, direct slice parameter passing, thin function pointers, fat lambdas, and pointer indexing.

- [ ] **Step 2: Run the golden test**

Run: `bun test tests/GoldenLLVMShapes.test.ts`

Expected before adding the helper: FAIL because `compileToLLVM` is not exported.

- [ ] **Step 3: Add the helper**

Create `tests/helpers/compileToLLVM.ts` using the existing parser/typechecker/codegen pipeline and export it from `tests/helpers/index.ts`.

- [ ] **Step 4: Re-run the golden test**

Run: `bun test tests/GoldenLLVMShapes.test.ts`

Expected after the helper exists: PASS.

### Task 3: Incremental Implicit Conversion Lowering

**Files:**
- Create: `compiler/middleend/lowering/ImplicitConversions.ts`
- Create: `tests/Lowering.test.ts`
- Modify: `compiler/middleend/TypeCheckerBase.ts`
- Modify: `compiler/middleend/TypeUtils.ts`
- Modify: `compiler/backend/codegen/TypeGenerator.ts`
- Modify: `compiler/backend/codegen/StatementGenerator.ts`
- Modify: `compiler/backend/codegen/CallExpressionGenerator.ts`
- Modify: `compiler/backend/codegen/UnaryExpressionGenerator.ts`

- [ ] **Step 1: Write lowering API tests**

Create `tests/Lowering.test.ts` that verifies conversion classification for identity, fixed-array to slice, fixed-array to pointer decay, incompatible slice-to-pointer, and incompatible slice-to-fixed-array.

- [ ] **Step 2: Run the lowering test**

Run: `bun test tests/Lowering.test.ts`

Expected before implementation: FAIL because `compiler/middleend/lowering/ImplicitConversions.ts` does not exist.

- [ ] **Step 3: Implement conversion classification**

Add `lowerImplicitConversion()`, `areArrayDimensionsAssignable()`, `isSliceTypeNode()`, and `isFixedArrayTypeNode()` in the new middle-end lowering module.

- [ ] **Step 4: Wire existing checks through the lowering module**

Use `lowerImplicitConversion()` in type compatibility and slice conversion codegen paths, keeping emitted LLVM behavior unchanged.

- [ ] **Step 5: Re-run lowering and BUG-069 tests**

Run:
- `bun test tests/Lowering.test.ts`
- `bun test tests/BugFixes_Batch6.test.ts`

Expected: PASS.

### Task 4: Verification

**Files:**
- All files modified above.

- [ ] **Step 1: Run targeted tests**

Run:
- `bun test tests/LanguageSpecDocs.test.ts tests/GoldenLLVMShapes.test.ts tests/Lowering.test.ts`
- `bun test tests/BugFixes_Batch6.test.ts tests/ZeroCostLLVM.test.ts tests/TypeCheckerExtended.test.ts tests/CodeGeneratorExtended.test.ts`

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 3: Run final full test suite if targeted verification is clean**

Run: `bun test tests/`

Expected: PASS except any existing skipped tests.
