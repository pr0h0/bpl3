# Language Showcase Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three curated language showcase examples and focused tests that verify BPL features from `1 + 1` through OOP and FP patterns.

**Architecture:** Use three example directories grouped by learning layer: basics, systems, and abstractions. Each directory contains `main.bpl` plus `test_config.json`; `tests/LanguageShowcase.test.ts` runs them directly through `cmp.sh` and checks stable output lines.

**Tech Stack:** BPL examples, Bun test runner, existing `cmp.sh` integration runner.

---

### Task 1: Targeted Showcase Test

**Files:**
- Create: `tests/LanguageShowcase.test.ts`

- [ ] **Step 1: Write the failing test**

Create a Bun test that runs `examples/language_showcase_basics/main.bpl`, `examples/language_showcase_systems/main.bpl`, and `examples/language_showcase_abstractions/main.bpl` through `cmp.sh`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/LanguageShowcase.test.ts`
Expected: fails because the new example directories do not exist yet.

### Task 2: Basics Showcase

**Files:**
- Create: `examples/language_showcase_basics/main.bpl`
- Create: `examples/language_showcase_basics/test_config.json`

- [ ] **Step 1: Add the basics example**

Cover arithmetic, primitive values, casts, compound operators, strings/interpolation, arrays, tuples, `if`, `loop`, C-style `loop`, `switch`, `match`, and ternary expressions.

- [ ] **Step 2: Run focused test**

Run: `bun test tests/LanguageShowcase.test.ts`
Expected: basics assertions pass; remaining examples still fail until added.

### Task 3: Systems Showcase

**Files:**
- Create: `examples/language_showcase_systems/main.bpl`
- Create: `examples/language_showcase_systems/test_config.json`

- [ ] **Step 1: Add the systems example**

Cover structs, methods, constructors, pointers, heap allocation, `sizeof`, FFI calls, `defer`, and typed exceptions.

- [ ] **Step 2: Run focused test**

Run: `bun test tests/LanguageShowcase.test.ts`
Expected: basics and systems assertions pass; abstractions still fails until added.

### Task 4: Abstractions Showcase

**Files:**
- Create: `examples/language_showcase_abstractions/main.bpl`
- Create: `examples/language_showcase_abstractions/test_config.json`

- [ ] **Step 1: Add the abstractions example**

Cover enums, generic enums, pattern guards, generic functions, generic structs, type aliases, specs, inheritance, operator overloading, function pointers, lambdas, and closure capture.

- [ ] **Step 2: Run focused test**

Run: `bun test tests/LanguageShowcase.test.ts`
Expected: all showcase assertions pass.

### Task 5: Final Verification

**Files:**
- Verify all new files.

- [ ] **Step 1: Run focused tests**

Run: `bun test tests/LanguageShowcase.test.ts`
Expected: all tests pass.

- [ ] **Step 2: Run integration filter**

Run: `bun test tests/Integration.test.ts -t "language_showcase"`
Expected: all three new examples pass through the auto-discovered integration runner.

- [ ] **Step 3: Run compiler check**

Run: `bun run check`
Expected: TypeScript check exits 0.

- [ ] **Step 4: Check whitespace**

Run: `git diff --check`
Expected: no whitespace errors.
