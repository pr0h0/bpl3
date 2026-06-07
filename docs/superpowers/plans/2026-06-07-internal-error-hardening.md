# Internal Error Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and eliminate user-reachable compiler internal-error paths without weakening invariant checks.

**Architecture:** Inventory backend failure families, use deterministic source-level probes and the existing fuzz runner to prove reachability, then add failing-first regressions and reject invalid state at the earliest semantic boundary. Retain backend invariant checks for states that remain impossible after semantic validation.

**Tech Stack:** TypeScript, Bun test, BPL lexer/parser/type checker/code generator, deterministic compiler fuzz runner

---

### Task 1: Build The Reachability Inventory

**Files:**
- Create: `docs/internal-error-inventory.md`
- Inspect: `compiler/backend/codegen/**/*.ts`
- Inspect: `compiler/middleend/**/*.ts`
- Test: `tests/InternalErrorBoundary.test.ts`

- [ ] List each backend raw exception or `CompilerError` hint containing
  "internal compiler error", grouped by missing type, missing layout, call
  state, enum state, and invariant-only orchestration.
- [ ] Trace each candidate backward to the type-checker or call-checker
  prerequisite that should establish the missing state.
- [ ] Record a source-level reproduction, an unconfirmed probe, or a reason the
  path is invariant-only.
- [ ] Post the prioritized inventory and reproduction commands to Agent Board.

### Task 2: Add Targeted Fuzz Coverage

**Files:**
- Modify: `fuzz/compilerFuzz.ts`
- Test: `tests/CompilerFuzzRunner.test.ts`

- [ ] Add a failing test requiring deterministic structured inputs to include
  member/call/layout stress cases relevant to the prioritized inventory.
- [ ] Run `bun test tests/CompilerFuzzRunner.test.ts -t "internal error"` and
  confirm the new assertion fails because the lane is absent.
- [ ] Add the smallest deterministic structured generator lane needed to cover
  the selected source patterns.
- [ ] Run the focused test and confirm it passes.
- [ ] Run a bounded campaign and save any source-reachable crash artifacts.

### Task 3: Fix Confirmed Missing-Type Or Call-State Crash

**Files:**
- Modify: `tests/InternalErrorBoundary.test.ts`
- Modify one earliest-boundary checker selected by the inventory:
  `compiler/middleend/CallChecker.ts`, `compiler/middleend/ExpressionChecker.ts`,
  or `compiler/middleend/TypeChecker.ts`

- [ ] Add one minimal failing test using `compileInvalid(...)` that currently
  throws or exposes an internal-error message.
- [ ] Run the exact test and confirm the expected red failure.
- [ ] Add the smallest semantic validation that returns a source-facing
  `CompilerError` before code generation.
- [ ] Run the exact test and adjacent valid-call/member tests.
- [ ] Commit the isolated regression and fix.

### Task 4: Fix Confirmed Missing-Layout Or Enum-State Crash

**Files:**
- Modify: `tests/InternalErrorBoundary.test.ts`
- Modify one earliest-boundary checker selected by the inventory:
  `compiler/middleend/CallChecker.ts`, `compiler/middleend/ExpressionChecker.ts`,
  or `compiler/middleend/TypeChecker.ts`

- [ ] Add one minimal failing test for the confirmed missing-layout or
  enum-state source reproduction.
- [ ] Run the exact test and confirm the expected red failure.
- [ ] Add the smallest semantic validation that prevents invalid metadata state
  from reaching code generation.
- [ ] Run the exact test and adjacent valid struct/enum tests.
- [ ] Commit the isolated regression and fix.

### Task 5: Promote Regressions And Verify

**Files:**
- Modify when a minimized fuzz artifact exists:
  `tests/fuzz-regressions/*.bpl`
- Modify: `docs/internal-error-inventory.md`
- Modify: `CHANGELOG.md`

- [ ] Promote each minimized crash source into the existing fuzz regression
  corpus or keep its focused internal-boundary regression when that is clearer.
- [ ] Run `bun test tests/InternalErrorBoundary.test.ts tests/CompilerFuzzRunner.test.ts tests/FuzzRegressionCorpus.test.ts tests/CompilerCorrectnessCorpus.test.ts tests/CompilerCorrectnessSeededFuzz.test.ts`.
- [ ] Run bounded deterministic and differential fuzz campaigns and confirm
  zero crashes or mismatches.
- [ ] Run `bun run check`, `bun run lint`, `git diff --check`, and `bun test`.
- [ ] Commit verified retained work and record exact evidence on Agent Board.
