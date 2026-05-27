# CLI RAII Recursive Enum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate auto-destroy methods, parse `--flag=value`, and pass the recursive enum pointer example.

**Architecture:** Keep each item isolated: semantic validation in the function attribute validator, CLI parsing in `lib/arg_parser.bpl`, and recursive enum coverage through the existing example plus codegen fixes only if the red test shows a compiler bug. Tests are written before implementation for each behavior.

**Tech Stack:** TypeScript compiler frontend/middleend/backend, Bun test runner, BPL stdlib and integration examples.

---

### Task 1: Auto Destroy Validation

**Files:**
- Modify: `compiler/middleend/validators/FunctionAttributeValidator.ts`
- Modify: `compiler/middleend/TypeChecker.ts`
- Test: `tests/FunctionAttributes.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add tests that type-check sources where `@[auto_destroy]` is on a free function, on a non-`destroy` method, on a method whose first parameter is not `this`, on a method whose receiver is not a pointer to the parent type, and on a method returning `int`.

- [ ] **Step 2: Run tests and verify red**

Run: `bun test tests/FunctionAttributes.test.ts`
Expected: the new tests fail because `@[auto_destroy]` is currently accepted anywhere a known function attribute is allowed.

- [ ] **Step 3: Implement validation**

Extend `FunctionAttributeValidationContext` with an optional `parentType`, pass it from `TypeChecker.checkFunctionAttributes`, and validate `auto_destroy` against method name, receiver name, receiver type, and void return.

- [ ] **Step 4: Run tests and verify green**

Run: `bun test tests/FunctionAttributes.test.ts tests/RAIIAutoDestroy.test.ts`
Expected: all tests pass.

### Task 2: ArgParser Equals Values

**Files:**
- Modify: `lib/arg_parser.bpl`
- Test: `tests/ArgParser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add runtime tests that exercise `--output=file.txt`, `-o=alias.txt`, `--output=`, and `--verbose=true` on a boolean flag.

- [ ] **Step 2: Run tests and verify red**

Run: `bun test tests/ArgParser.test.ts`
Expected: the value tests fail because the parser currently stores an empty string for any `=` form.

- [ ] **Step 3: Implement splitting**

In `ArgParser.parse`, create a `String` from the raw argument and use `substring(eqIdx + 1, rawArg.length - eqIdx - 1)` for value flags. Print an error for `=` on boolean flags and store `true` only when no explicit value is provided.

- [ ] **Step 4: Run tests and verify green**

Run: `bun test tests/ArgParser.test.ts`
Expected: all parser tests pass.

### Task 3: Pointer Recursive Enums

**Files:**
- Modify: `examples/enum_recursive/main.bpl`
- Modify: `examples/enum_recursive/test_config.json`
- Modify codegen files only if the red test shows a compiler/runtime defect beyond fixed-size allocation.

- [ ] **Step 1: Run the existing red example**

Run: `bun test tests/Integration.test.ts -t "enum_recursive"`
Expected: currently fails before the fix.

- [ ] **Step 2: Fix the example and any compiler issue exposed**

Allocate enum nodes using `sizeof<List>()`; if codegen still fails, fix enum layout or payload extraction at the root cause.

- [ ] **Step 3: Run recursive enum verification**

Run: `bun test tests/Integration.test.ts -t "enum_recursive"`
Expected: the example passes and output contains `List sum: 6`.

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run: `bun test tests/FunctionAttributes.test.ts tests/RAIIAutoDestroy.test.ts tests/ArgParser.test.ts`
Expected: all focused tests pass.

- [ ] **Step 2: Run integration checks**

Run: `bun test tests/Integration.test.ts -t "enum_recursive"`
Expected: recursive enum example passes.

- [ ] **Step 3: Run compiler check**

Run: `bun run check`
Expected: TypeScript check exits 0.

- [ ] **Step 4: Check whitespace**

Run: `git diff --check`
Expected: no whitespace errors.
