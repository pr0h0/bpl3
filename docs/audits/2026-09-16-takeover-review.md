# Review of the intervening compiler and runtime commits

Date: 2026-09-16. Reviewed baseline: `21fea06e`.

The intervening work fixes real defects and adds useful regression coverage.
It is worth retaining, but passing those tests did not establish that exception
handling was correct at all optimization levels. This review reproduced and
fixed nine defects, including three previously documented issues. A subsequent
user decision approved rejecting implicit integer-to-bool conversions.

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
5. **BUG-346 — re-exported globals use the wrong storage name** (`2cc02afc`,
   `9bae74c8`). Global reads, writes, and address-taking use the resolved
   declaration. Tests cover direct aliases, re-exports, namespace access, and
   updates through multiple imports at O0/O3.
6. **BUG-333 — undefined exports are accepted** (`5508a682`). Entry and imported
   modules validate exports after all declarations have been checked. Forward
   exports remain valid, and failed imports restore checker context and clear
   their partial cache entry. Package and release fixtures now declare the
   symbols they export; the example database no longer exports a nonexistent type.
7. **BUG-347 — integer widening bypasses array compatibility** (`5aba1e2b`).
   Scalar widening no longer accepts arrays or slices. Checking rejects mismatched
   lengths, row widths, element widths, and scalar/array arguments. Valid array
   overloads and scalar widening are covered by O0/O3 execution and LLVM verification.
8. **BUG-339 — fixed-array aliases fail slice conversion** (`cf293460`).
   Use-site dimensions wrap the alias's dimensions consistently through checking,
   substitution, and LLVM lowering. Explicit generic arguments are resolved before
   substitution. Tests cover rectangular arrays, generic aliases, alias chains,
   shared storage, reassignment, and both levels of bounds checking.
9. **BUG-348 — imports drop constant protection** (`b8c3a81d`).
   Import bindings and namespace expressions preserve the defining global's
   constant metadata. Mutation checking also consults its declaration. Tests
   reject assignment, updates, aggregate writes, pointer rebinding, and address-taking
   through direct imports, aliases, re-exports, and namespaces. Constant reads
   and updates through a local constant pointer execute at O0/O3.

Each fix has a separate commit and an executable integration example. Follow-up
`711da154` detects handlers during emission rather than scanning every function's
AST, and brings the new examples and specification annotation into the existing
repository conventions. Runtime
comments and documentation were also corrected where they still referred to
the deleted `runtime.ll` or claimed the native object was always linked.
Follow-up `0162b8a1` maps the new undefined-export diagnostic to its reproduction
commands; the full suite exposed the missing CI-triage mapping. All 197 triage
and export tests passed after that correction.

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
- Type checking and lint after the array, alias, and constant-import fixes: passed.
- Continuation: 96 CLI JSON tests and 3 release smoke tests passed. The release
  checks exercise standalone and packed command-line entry points. Package,
  import, global-alias, and export validation regressions also passed.
- Array, generic, pointer-alias, type utility, and golden LLVM regression suites:
  33 passed after `cf293460`.
- Full `bun run test:ci` at `711da154`: all five stages passed. Counts were
  576 integration/playground tests, 236 extension tests, and 3,625 unit tests.
  The unit stage skipped 16 opt-in tests and reported zero failures.
- Final clean `bun run test:ci` at `0162b8a1`: all five stages passed. Counts
  were 581 integration/playground tests, 236 extension tests, and 3,639 unit
  tests: 4,456 passes in total, with 16 opt-in unit tests skipped and zero failures.
  This run includes the corrected CI-triage mapping and all continuation fixes.

## Follow-up after the language-policy decision

BUG-338 is now fixed: implicit integer-to-bool conversion is rejected, including
literals `0` and `1`. Use `value != 0` for zero/nonzero semantics; explicit casts
keep their existing low-bit semantics. The new regression suite covers scalar
and aggregate conversion sites and O0/O3 execution.

A runtime-size probe also found BUG-349: renamed `main` parameters produced
undefined LLVM registers. Main locals now bind the ABI arguments by position,
with O0/O3 execution and LLVM verification for renamed, ignored, and swapped names.

Runtime footprint measurements and remaining overhead are documented in
[the runtime report](2026-09-16-runtime-footprint.md).

This is a targeted source review and regression run, not a guarantee that the
whole compiler or standard library is free of defects. Native execution results
in this review apply to Linux x86-64; cross-target IR checks have a narrower
claim.
