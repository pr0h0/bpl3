# Direct Type Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user-defined guard return syntax with direct scoped narrowing for `is` and `match<T>` conditions.

**Architecture:** Keep narrowing in the statement checker, where branch scopes are already created. Remove parser support for `ret value is Type`, keep boolean helper functions ordinary, and reuse the existing scoped symbol override mechanism for direct `is` and `match<T>` conditions.

**Tech Stack:** BPL Peggy grammar, TypeScript type checker, Bun tests.

---

### Task 1: Tests

**Files:**
- Modify: `tests/UserTypeGuards.test.ts`

- [ ] **Step 1: Replace guard-return tests with direct narrowing tests**

Add tests that reject `ret value is *Dog`, accept `ret bool` helper bodies using `is`/`match<T>`, and require `if (animal is Dog)` plus `if (match<Dog>(animal))` to narrow only inside the then branch.

- [ ] **Step 2: Verify RED**

Run: `bun test tests/UserTypeGuards.test.ts`

Expected: failures showing old guard syntax still parses and direct `is`/`match<T>` branch narrowing is missing.

### Task 2: Parser Cleanup

**Files:**
- Modify: `grammar/bpl.peggy`

- [ ] **Step 1: Remove guard-return parsing**

Change `ReturnType` so it only parses `K_ret _ type:Type`, and remove `TypeGuardReturn`.

- [ ] **Step 2: Verify syntax rejection**

Run: `bun test tests/UserTypeGuards.test.ts`

Expected: the guard-return rejection test passes; direct narrowing tests still fail.

### Task 3: Scoped Narrowing

**Files:**
- Modify: `compiler/middleend/StatementChecker.ts`
- Modify: `compiler/middleend/TypeChecker.ts`
- Modify: `compiler/formatter/Formatter.ts`

- [ ] **Step 1: Add direct condition narrowing**

Teach `getTypeGuardNarrowing` to recognize direct `Is` and `TypeMatch` conditions with identifier operands. Normalize pointer targets so `animal: *Animal` narrowed by `animal is Dog` becomes `*Dog`.

- [ ] **Step 2: Remove old guard metadata use**

Remove the function-declaration guard check path and formatter output for `decl.typeGuard`.

- [ ] **Step 3: Verify GREEN**

Run: `bun test tests/UserTypeGuards.test.ts`

Expected: all focused tests pass.

### Task 4: Docs and Verification

**Files:**
- Modify: `docs/56-type-matching.md`
- Modify: `TODO.md`

- [ ] **Step 1: Document scoped narrowing**

Update type-matching docs to show direct branch narrowing and ordinary `ret bool` helpers.

- [ ] **Step 2: Update TODO**

Remove the stale high-priority user-defined type guard item and record direct `is`/`match<T>` branch narrowing as complete.

- [ ] **Step 3: Final verification**

Run:

```bash
bun test tests/UserTypeGuards.test.ts tests/TypeNarrowing.test.ts tests/ComplexTypeNarrowing.test.ts
bun run check
git diff --check
```

Expected: all commands exit 0.
