# Review of the intervening compiler and runtime commits

Date: 2026-09-16. Reviewed baseline: `21fea06e`.

The intervening work fixes real defects and adds useful regression coverage.
It is worth retaining, but passing those tests did not establish that exception
handling was correct at all optimization levels. This review reproduced and
fixed four additional defects. Three previously documented issues remain open.

## Scope and findings

| Changes | Review and validation |
| --- | --- |
| `2516dc37`, `84911a48`: extern ABI handling | Reviewed rejection rules, aggregate wrappers, argument/return lowering, and Clang signature comparisons. Existing ABI tests pass, including separately compiled C fixtures on the local host. Foreign-target signature tests do not prove native execution on those platforms. |
| `e51864f3`, `41fd2ef4`, `e75b7d49`, `63c5e8b6`: parser, checker, and specification | The changes repair decimal separators, chained assignment, invalid updates, and several specification discrepancies. Specification tests provide executable examples and diagnostics; rule annotations are coverage pointers, not proof of every possible program. |
| `1174d663`: module symbol isolation | Reviewed declaration/reference renaming and module identity handling. Module-isolation and import tests pass. |
| `62d36757`: reachability | Reviewed reachable declaration emission and its interaction with runtime helpers and methods. Focused tree-shaking tests pass. |
| `f4f2789e`, `21fea06e`: runtime rewrite and linking | Defining runtime errors and check helpers together in BPL removes duplicated layouts and enables ordinary defer unwinding. Focused runtime tests pass. Additional optimization and repeated-unwinding tests exposed the defects below. |

The aggregate FFI work expands supported behavior. This review retains the
committed implementation and tests it; the follow-up changes below are bug
fixes, not additional language features.

## Fixes from this review

1. **BUG-337 — unchecked explicit pointer indirection** (`888665bb`).
   Loads, stores, compound assignments, and updates now share the existing
   null-check path. Regressions verify single evaluation, typed catches, and
   deferred cleanup at O0/O3. This does not establish lifetime or bounds safety
   for non-null raw pointers.
2. **BUG-343 — optimized catches lose local state** (`7948887a`).
   LLVM could reuse a local's pre-`setjmp` value after deferred code updated it.
   Functions containing handlers now preserve memory accesses conservatively.
   Tests cover parameters, scalar and aggregate aliases, deferred writes,
   nested rethrows, loop handlers, and generated deferred functions. The
   conservative volatile policy limits memory optimization in handler functions.
3. **BUG-344 — unwound calls leak the depth counter** (`b336736b`).
   Repeated caught throws eventually reported stack overflow despite constant
   call depth. Catch entry now restores the depth saved by its handler.
4. **BUG-345 — loop-local allocations accumulate stack storage** (`800a9adb`).
   Fixed-size handler frames, locals, pattern bindings, and expression
   temporaries now allocate once at function entry. Initializers still run at
   their original sites. Tests cover repeated catches, 1 KiB local arrays,
   and enum construction/matching with 1 KiB payloads.

Each fix has a separate commit and an executable integration example. Follow-up
`711da154` detects handlers during emission rather than scanning every function's
AST, and brings the new examples and specification annotation into the existing
repository conventions. Runtime
comments and documentation were also corrected where they still referred to
the deleted `runtime.ll` or claimed the native object was always linked.

## Validation

Environment: Linux x86-64, Bun 1.4.2, Ubuntu Clang 21.1.8.

- Before the follow-up changes: type check, lint, and 47 focused tests across
  ABI, module isolation, reachability, allocators, specification control flow,
  and runtime failures passed.
- New regression suites execute at O0 and O3 and verify LLVM IR. The counter
  restoration also passed an explicit O2 reproduction.
- Focused regression suites and golden LLVM shape checks: 15 passed.
- Compiler correctness and seeded differential corpus: 4 passed, including
  O0/O3 comparisons and LLVM validation.
- Follow-up regression and repository-contract checks: 99 passed.
- Final type checking and lint: passed.
- Full `bun run test:ci` at `711da154`: all five stages passed. Counts were
  576 integration/playground tests, 236 extension tests, and 3,625 unit tests.
  The unit stage skipped 16 opt-in tests and reported zero failures.

## Remaining known issues

- **BUG-333:** undefined exports are accepted until imported. Fixing this also
  requires replacing placeholder package fixtures with valid declarations.
- **BUG-338:** implicit integer-to-bool conversion keeps the low bit, so `2`
  becomes `false`. A language-policy choice is pending: reject the implicit
  conversion, or define zero/nonzero conversion. Rejecting implicit conversion
  is the recommendation already presented to the user.
- **BUG-339:** slices whose element type is a fixed-array alias can pass type
  checking and fail code generation. Alias dimensions need consistent handling
  across the checker and slice lowering.

This is a targeted source review and regression run, not a guarantee that the
whole compiler or standard library is free of defects. Native execution results
in this review apply to Linux x86-64; cross-target IR checks have a narrower
claim.
