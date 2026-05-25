# v0.1 Stability Bug Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand compiler stability coverage, manually probe edge cases, and record newly confirmed defects in BUGS.md before fixes.

**Architecture:** Keep this pass non-invasive: add active tests for behavior that currently works, add skipped repro tests for confirmed open bugs, and avoid production compiler fixes. Use existing Bun test helpers and CLI entry points so coverage matches real user workflows.

**Tech Stack:** Bun test runner, BPL CLI (`bun index.ts`), existing TypeScript compiler frontend/middleend/backend, LLVM/Clang 18 toolchain.

---

### Task 1: Add Runtime Stability Coverage

**Files:**
- Create: `tests/V01StabilityEdgeCases.test.ts`

- [ ] **Step 1: Write passing runtime tests**

Use `compileAndRun` from `tests/helpers` to add small programs for short-circuiting, ternary branch laziness, casts, arrays, structs, pointers, function pointers, lambdas, match expressions, loops, and error boundaries.

- [ ] **Step 2: Run the new runtime tests**

Run: `bun test tests/V01StabilityEdgeCases.test.ts`
Expected: every active test passes.

### Task 2: Add Zero-Cost LLVM Coverage

**Files:**
- Create: `tests/ZeroCostLLVM.test.ts`

- [ ] **Step 1: Write IR shape tests**

Compile snippets through the parser, type checker, and code generator. Verify type aliases do not emit runtime artifacts, newtype-free generic functions monomorphize to direct functions, tuple field access lowers to aggregate extraction, and simple wrappers are visible to LLVM as direct calls or foldable arithmetic.

- [ ] **Step 2: Run the LLVM shape tests**

Run: `bun test tests/ZeroCostLLVM.test.ts`
Expected: every active test passes.

### Task 3: Run Manual and Programmatic Bug Probes

**Files:**
- Modify: `BUGS.md`
- Create: `tests/V01BugRepros.test.ts`

- [ ] **Step 1: Probe risky compiler surfaces**

Use `bun index.ts --emit llvm`, `bun index.ts run`, and focused one-off temp files for inline asm pointers, closure capture mutation, nested generics, overload ambiguity, invalid shifts, array literals, and formatter/linter behavior.

- [ ] **Step 2: Record confirmed defects before fixes**

For each confirmed defect, append a BUGS.md row with the next BUG id, category, concise symptom, `Open` status, and exact evidence.

- [ ] **Step 3: Preserve repros without breaking the suite**

Add skipped tests to `tests/V01BugRepros.test.ts` that encode the current repro source and expected future behavior.

### Task 4: Verify Targeted Coverage

**Files:**
- Test only

- [ ] **Step 1: Run targeted tests**

Run: `bun test tests/V01StabilityEdgeCases.test.ts tests/ZeroCostLLVM.test.ts tests/V01BugRepros.test.ts`
Expected: active tests pass and known-bug repros are skipped.

- [ ] **Step 2: Run type/lint checks**

Run: `bun run check` and `bun run lint`
Expected: both exit 0.

- [ ] **Step 3: Summarize evidence**

Report commands, pass/fail counts, BUGS.md ids added, and any unverified suspicions that were not recorded as bugs.
