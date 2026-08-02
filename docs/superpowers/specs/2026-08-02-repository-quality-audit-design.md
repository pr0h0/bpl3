# Repository Quality Audit Design

## Goal

Audit every maintained BPL surface and improve correctness, reliability, diagnostics, documentation consistency, examples, package quality, and developer experience without adding language syntax, semantics, builtins, or other language features.

## Scope

The audit covers:

- Compiler frontend, type checking, lowering, code generation, linking, runtime integration, formatter, linter, documentation generator, and package manager.
- CLI commands, helper tools, release tooling, playground backend/frontend integration, and generated parser contracts.
- VS Code language server, extension commands, diagnostics, navigation, completion, rename, formatting, and extension packaging.
- Standard library modules, first-party packages, examples, benchmarks, fuzz corpora, documentation, language specification, and repository automation.
- Test quality, determinism, platform sensitivity, timeout handling, subprocess cleanup, filesystem safety, and diagnostic stability.

## Constraints

- Do not introduce new syntax, operators, types, builtins, runtime capabilities, or semantic behavior.
- Preserve documented valid programs unless they rely on a confirmed bug or undefined behavior.
- Prefer rejecting invalid programs earlier with stable diagnostics over allowing invalid IR or runtime crashes.
- Use existing dependencies and repository patterns unless a small dependency clearly removes custom fragile logic.
- Add regression coverage before each behavioral fix and verify that the regression fails for the intended reason.
- Keep commits focused by subsystem and include the tests and documentation needed for that subsystem.

## Audit Method

Each subsystem follows the same loop:

1. Map entry points, invariants, existing tests, and relevant specification sections.
2. Run focused static searches and the subsystem's existing test commands.
3. Reproduce one concrete defect or inconsistency.
4. Add a minimal failing regression test.
5. Implement the smallest root-cause fix.
6. Run focused tests, type checking, lint where relevant, and cross-subsystem regression tests.
7. Update documentation only when it is inaccurate or incomplete for existing behavior.
8. Commit the completed chunk before starting the next subsystem.

## Audit Order

1. Compiler and runtime correctness.
2. CLI, package manager, release helpers, and process execution.
3. Formatter, linter, documentation generator, and diagnostics.
4. VS Code extension and language server.
5. Standard library, first-party packages, examples, and benchmarks.
6. Language specification, documentation, CI, fuzzing, and test infrastructure.

This order prioritizes behavior that can generate invalid code or crash, then user-facing tooling, then consistency and maintainability surfaces.

## Commit Strategy

- Commit the audit design and plan independently.
- Commit each verified defect fix with its regression tests.
- Keep mechanical documentation corrections separate from behavioral fixes.
- Do not combine unrelated subsystems in one commit.
- Run `git diff --check` before every commit.

## Completion Criteria

- `bun run check`, `bun run lint`, `bun run build`, and `bun test` pass.
- Sanitizer-backed tests run instead of skipping when the local toolchain supports them.
- `npm test --prefix vscode-ext` passes.
- Focused package, correctness, wasm, release, and fuzz contract suites pass where applicable.
- Every behavior change has a regression test.
- Repository documentation and `LANGUAGE_SPEC.md` describe existing behavior consistently.
- The working tree is clean after the final audit commit.
