# Stdlib Extern Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move common example and playground `extern` declarations into standard-library modules so examples import shared declarations instead of repeating low-level C/runtime declarations.

**Architecture:** Add a thin `std/c.bpl` module that owns C/runtime extern declarations and exports them directly. Migrate playground examples and broad example files to import those symbols where doing so preserves direct-call codegen and native/wasm behavior. Keep intentional FFI teaching examples explicit.

**Tech Stack:** BPL standard library modules, Bun tests, compiler import/export resolution, playground JSON fixtures, wasm hosted runtime tests.

---

### Task 1: Thin C Runtime Declaration Module

**Files:**
- Create: `lib/c.bpl`
- Modify: `lib/std.bpl`
- Test: `tests/StdlibCExterns.test.ts`

- [ ] Write tests that import `printf`, `malloc`, `free`, `strlen`, `memcpy`, and `memset` from `std/c.bpl` and assert direct runtime behavior.
- [ ] Run `bun test tests/StdlibCExterns.test.ts` and verify it fails because `std/c.bpl` does not exist.
- [ ] Add `lib/c.bpl` with exported extern declarations.
- [ ] Re-export common symbols from `lib/std.bpl`.
- [ ] Run `bun test tests/StdlibCExterns.test.ts` and verify it passes.

### Task 2: Playground Extern Migration

**Files:**
- Modify: `playground/examples/*.json`
- Test: `tests/PlaygroundExterns.test.ts`

- [ ] Write a test that fails while playground examples directly declare `extern printf`, `extern malloc`, `extern free`, or `extern strlen`.
- [ ] Replace those declarations with imports from `std/c.bpl` where the example is not specifically teaching FFI.
- [ ] Run `bun test tests/PlaygroundExterns.test.ts tests/PlaygroundExamples.test.ts tests/PlaygroundWasmExamples.test.ts`.

### Task 3: Example Extern Migration

**Files:**
- Modify: `examples/**/main.bpl`
- Test: `tests/ExampleExterns.test.ts`

- [ ] Write an inventory test that classifies allowed explicit externs in FFI-focused examples and rejects repeated common externs elsewhere.
- [ ] Migrate non-FFI examples to import common declarations from `std/c.bpl`.
- [ ] Run `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts`.

### Task 4: Performance and Codegen Parity

**Files:**
- Test: `tests/StdlibCExterns.test.ts`
- Test: `tests/GoldenLLVMShapes.test.ts`

- [ ] Add tests proving imported `printf` calls lower to direct `@printf` calls, not wrapper calls.
- [ ] Add a microbenchmark fixture comparing direct extern declarations and std-imported declarations.
- [ ] Run the focused benchmark or shape tests and record that imported declarations are no slower in generated call shape.

### Task 5: Follow-on Stability Work

**Files:**
- Modify as needed after Tasks 1-4.

- [ ] Extend hosted wasm printf support for width and hex formats used by examples.
- [ ] Add native-vs-hosted-wasm stdout comparison tests for wasm-safe playground examples.
- [ ] Run package/import smoke tests and fix any drift.
- [ ] Improve CI triage mappings for failures discovered during the above work.
