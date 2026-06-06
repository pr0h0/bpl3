# Frontend Build Cold-Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avoid loading the full compilation runner for common frontend-only build emits.

**Architecture:** Add a focused frontend build action and select it from build command registration only for option-simple `tokens`, `ast`, and `formatted` requests. Preserve `CompilationRunner` as the fallback for every backend or advanced-option path.

**Tech Stack:** TypeScript, Bun, Commander, BPL lexer/parser/formatter

---

### Task 1: Guard The Deferred Route

**Files:**
- Modify: `tests/CLIStartup.test.ts`

- [ ] Add a test requiring `cli/commands/build.ts` to dynamically import the
  focused frontend action and keep the full runner as fallback.
- [ ] Run `bun test tests/CLIStartup.test.ts` and confirm the new assertion
  fails because the focused action is not referenced.

### Task 2: Add The Focused Frontend Action

**Files:**
- Create: `cli/commands/frontendBuildAction.ts`
- Modify: `cli/commands/build.ts`
- Test: `tests/CLIStartup.test.ts`
- Test: `tests/CLI.test.ts`

- [ ] Implement an explicit route predicate for common frontend-only requests.
- [ ] Copy the existing single-file token, AST, and formatted-output behavior
  using focused compiler imports, path safety, diagnostics, and atomic writes.
- [ ] Select the focused action before dynamically importing
  `CompilationRunner.ts`.
- [ ] Run `bun test tests/CLIStartup.test.ts tests/CLI.test.ts` and confirm all
  frontend output and fallback behavior passes.

### Task 3: Measure And Verify

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Compare all frontend output status/stdout/stderr hashes against a detached
  baseline.
- [ ] Run opposite-order 31-round cold benchmarks for tokens, AST, and formatted
  output; revert unless the improvement is stable.
- [ ] Document retained measurements in `CHANGELOG.md`.
- [ ] Run `bun run check`, `bun run lint`, focused CLI tests, `git diff --check`,
  and the full `bun test` suite.
- [ ] Commit the verified implementation locally.
