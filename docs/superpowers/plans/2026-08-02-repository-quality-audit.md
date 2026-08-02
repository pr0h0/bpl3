# Repository Quality Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the complete BPL repository through regression-first bug fixes and developer-experience corrections without adding language features.

**Architecture:** Work in vertical subsystem slices. Each slice starts from existing contracts and tests, proves a concrete defect, fixes the root cause, verifies adjacent behavior, and ends in a focused commit before the next slice begins.

**Tech Stack:** Bun, TypeScript, LLVM/Clang, C runtime support, BPL, Peggy, VS Code Language Server Protocol, shell tooling, npm.

---

### Task 1: Establish And Preserve The Baseline

**Files:**
- Review: `package.json`
- Review: `AGENTS.MD`
- Review: `BUGS.md`
- Review: `TODO.md`
- Review: `PLAN.md`
- Review: `LANGUAGE_SPEC.md`

- [x] **Step 1: Record repository status and recent history**

Run: `git status --short && git log -12 --oneline --decorate`

Expected: Existing user changes are identified and preserved before audit edits.

- [x] **Step 2: Verify the existing hard-link regression fix**

Run: `bun test tests/PackageManager.test.ts -t "should reject package archives containing hard links"`

Expected: PASS with one selected test.

- [x] **Step 3: Commit the completed baseline fix**

Run: `git add tests/PackageManager.test.ts && git commit -m "test: make hard-link archive fixture deterministic"`

Expected: One focused commit with no unrelated files.

### Task 2: Audit Compiler And Runtime Correctness

**Files:**
- Review: `compiler/frontend/`
- Review: `compiler/middleend/`
- Review: `compiler/backend/`
- Review: `compiler/common/`
- Review: `lib/runtime*.c`
- Review: `lib/runtime*.ll`
- Test: `tests/Parser*.test.ts`
- Test: `tests/TypeChecker*.test.ts`
- Test: `tests/CodeGen*.test.ts`
- Test: `tests/CompilerCorrectness*.test.ts`
- Test: `tests/CompilerRuntimeFailureSemantics.test.ts`
- Test: `tests/CompilerSanitizerRuntime.test.ts`

- [ ] **Step 1: Run compiler correctness suites**

Run: `bun run test:correctness`

Expected: Existing failures or skips are recorded with exact test names and diagnostics.

- [ ] **Step 2: Inspect unchecked compiler invariants**

Run: `rg -n "throw new Error|console\\.|TODO|FIXME|as unknown as|!\\.|\\w+!([;,.\\)])" compiler lib -g '*.ts' -g '*.c' -g '*.ll'`

Expected: Candidate crash paths are reduced to concrete, reproducible behavior before editing.

- [ ] **Step 3: Add a failing regression for each confirmed defect**

Use the nearest focused test file under `tests/`. The test must call the real parser, checker, code generator, compiler driver, or runtime helper and assert the public diagnostic or execution behavior.

Run: `bun test tests/Parser.test.ts tests/TypeChecker.test.ts tests/CodeGenerator.test.ts tests/CompilerCorrectnessCorpus.test.ts tests/CompilerRuntimeFailureSemantics.test.ts tests/LlvmVerifier.test.ts`

Expected: FAIL for the confirmed defect, not for fixture or environment setup.

- [ ] **Step 4: Implement the minimal root-cause fix**

Modify only the responsible compiler or runtime module and preserve existing valid-program behavior.

- [ ] **Step 5: Verify and commit each compiler chunk**

Run: `bun test tests/Parser.test.ts tests/TypeChecker.test.ts tests/CodeGenerator.test.ts tests/CompilerCorrectnessCorpus.test.ts tests/CompilerRuntimeFailureSemantics.test.ts tests/LlvmVerifier.test.ts && bun run check && git diff --check`

Commit: `git commit -m "fix: harden compiler and runtime correctness"`

### Task 3: Audit CLI, Packages, And Process Tooling

**Files:**
- Review: `index.ts`
- Review: `compiler/common/CompilerDriver.ts`
- Review: `compiler/middleend/PackageManager.ts`
- Review: `compiler/middleend/PackageResolver.ts`
- Review: `tools/`
- Review: `cli/`
- Test: `tests/CLI*.test.ts`
- Test: `tests/Package*.test.ts`
- Test: `tests/Release*.test.ts`
- Test: `tests/PathSafety.test.ts`
- Test: `tests/TimeoutEnv.test.ts`

- [ ] **Step 1: Run focused CLI and package tests**

Run: `bun test tests/CLI.test.ts tests/CLIStartup.test.ts tests/CLIJsonParseability.test.ts tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts tests/PackageResolver.test.ts tests/PathSafety.test.ts tests/TimeoutEnv.test.ts`

Expected: All current behavior is captured before changes.

- [ ] **Step 2: Audit subprocess, timeout, and filesystem boundaries**

Run: `rg -n "spawnSync|Bun.spawn|execSync|readFileSync|writeFileSync|renameSync|realpathSync|lstatSync" index.ts compiler tools cli -g '*.ts'`

Expected: Every candidate is checked for timeout, status, stderr, symlink, and atomic-write handling.

- [ ] **Step 3: Fix confirmed defects with regression-first coverage**

Use the relevant existing test file and keep JSON diagnostics stable for machine-readable commands.

- [ ] **Step 4: Verify and commit each tooling chunk**

Run: `bun run check && bun test tests/CLI*.test.ts tests/Package*.test.ts tests/Release*.test.ts && git diff --check`

Commit: `git commit -m "fix: harden cli and package workflows"`

### Task 4: Audit Formatter, Linter, Docs, And Diagnostics

**Files:**
- Review: `compiler/formatter/Formatter.ts`
- Review: `compiler/linter/Linter.ts`
- Review: `compiler/docs/DocumentationGenerator.ts`
- Review: `compiler/common/DiagnosticFormatter.ts`
- Review: `compiler/common/JsonContracts.ts`
- Test: `tests/Formatter*.test.ts`
- Test: `tests/LinterTypeSafety.test.ts`
- Test: `tests/DocumentationGenerator.test.ts`
- Test: `tests/ErrorMessaging.test.ts`
- Test: `tests/JsonContracts.test.ts`

- [ ] **Step 1: Run focused presentation and diagnostic tests**

Run: `bun test tests/Formatter*.test.ts tests/LinterTypeSafety.test.ts tests/DocumentationGenerator.test.ts tests/ErrorMessaging.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts`

Expected: Existing formatting and diagnostic contracts pass before edits.

- [ ] **Step 2: Compare formatter output with parser acceptance**

Run: `bun test tests/FormatterPrecedence.test.ts tests/FormatterNewSyntax.test.ts tests/ParserRecovery.test.ts`

Expected: Any non-idempotent or unparsable formatting case becomes a focused regression.

- [ ] **Step 3: Fix confirmed inconsistencies and commit**

Run: `bun run check && bun test tests/Formatter*.test.ts tests/LinterTypeSafety.test.ts tests/DocumentationGenerator.test.ts tests/ErrorMessaging.test.ts tests/Json*.test.ts && git diff --check`

Commit: `git commit -m "fix: improve formatter and diagnostic reliability"`

### Task 5: Audit VS Code Extension And Language Server

**Files:**
- Review: `vscode-ext/src/`
- Review: `vscode-ext/package.json`
- Test: `vscode-ext/src/test/`
- Test: `tests/CompletionTargets.test.ts`
- Test: `tests/DefinitionAndReferences.test.ts`
- Test: `tests/RenameHandler.test.ts`
- Test: `tests/CodeActions.test.ts`

- [ ] **Step 1: Compile and run extension tests**

Run: `npm test --prefix vscode-ext`

Expected: TypeScript compilation and all extension tests pass.

- [ ] **Step 2: Audit server request boundaries**

Run: `rg -n "onCompletion|onDefinition|onReferences|onRenameRequest|onCodeAction|onDocumentFormatting|catch \\(" vscode-ext/src -g '*.ts'`

Expected: Unhandled invalid documents, stale state, path normalization, and cancellation cases are converted into concrete regressions.

- [ ] **Step 3: Fix confirmed extension defects and commit**

Run: `npm test --prefix vscode-ext && bun run check && git diff --check`

Commit: `git commit -m "fix: improve language server reliability"`

### Task 6: Audit Libraries, Packages, Examples, And Specifications

**Files:**
- Review: `lib/`
- Review: `packages/`
- Review: `examples/`
- Review: `benchmark/`
- Review: `LANGUAGE_SPEC.md`
- Review: `README.md`
- Review: `docs/`
- Test: `tests/Stdlib.test.ts`
- Test: `tests/Examples.test.ts`
- Test: `tests/TutorialExamples.test.ts`
- Test: `tests/LanguageSpecDocs.test.ts`
- Test: `tests/MarkdownDocs.test.ts`

- [ ] **Step 1: Run library, example, and documentation tests**

Run: `bun test tests/Stdlib.test.ts tests/Examples.test.ts tests/TutorialExamples.test.ts tests/LanguageSpecDocs.test.ts tests/MarkdownDocs.test.ts tests/PackageScriptTestReferences.test.ts`

Expected: Current examples and documentation references are executable and internally consistent.

- [ ] **Step 2: Audit existing APIs for correctness and DX**

Check exported library/package functions for implementation bugs, ownership mistakes, incorrect examples, stale commands, and missing package metadata without adding new language behavior.

- [ ] **Step 3: Add regression tests and commit each correction**

Run: `bun test tests/Stdlib.test.ts tests/Examples.test.ts tests/TutorialExamples.test.ts tests/LanguageSpecDocs.test.ts tests/MarkdownDocs.test.ts && git diff --check`

Commit: `git commit -m "fix: correct libraries examples and documentation"`

### Task 7: Complete Repository Verification

**Files:**
- Verify: Entire repository

- [ ] **Step 1: Run static verification**

Run: `bun run check && bun run lint && git diff --check`

Expected: Zero type, lint, or whitespace errors.

- [ ] **Step 2: Build compiler and runtime**

Run: `bun run build`

Expected: Runtime objects and the standalone `bpl` executable build successfully.

- [ ] **Step 3: Run complete tests**

Run: `bun test && npm test --prefix vscode-ext`

Expected: Zero failures and zero sanitizer skips with the configured local LLVM toolchain.

- [ ] **Step 4: Run focused release and platform suites**

Run: `bun run test:correctness && bun run test:wasm && bun run release:check`

Expected: Correctness, wasm, packaging, release helpers, and extension release checks pass.

- [ ] **Step 5: Run the installed compiler smoke**

Run: `bpl --version && bpl doctor --json`

Expected: The installed command resolves and reports the configured Bun and LLVM toolchain.

- [ ] **Step 6: Commit final documentation and audit state**

Run: `git status --short && git diff --check`

Commit: `git commit -m "docs: complete repository quality audit"`
