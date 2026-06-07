# Internal Error Hardening Design

## Goal

Reduce user-reachable compiler crashes by proving which backend internal-error
and raw exception paths can be triggered by source programs, then moving those
failures to stable structured diagnostics at the earliest valid semantic
boundary.

## Scope

The first campaign covers source-driven compilation through lexer, parser,
type checking, and code generation. It prioritizes backend failures related to
missing resolved types, missing struct or enum layout metadata, and invalid
call/member receiver state.

Invariant-only failures in linker orchestration, package management, tooling,
and deliberately invalid direct internal API use remain unchanged unless a
source-level reproduction proves they are user reachable.

## Approaches

1. Convert every backend `throw` into a `CompilerError`. This is rejected
   because it would hide compiler invariants and mislabel internal corruption
   as user mistakes.
2. Add a broad catch at the compiler boundary. This is rejected because it
   changes presentation without preventing invalid state from reaching the
   backend.
3. Prove reachability per failure family, add a failing regression, and reject
   invalid state in the type checker or call checker. This is selected because
   it fixes root causes while retaining invariant checks for impossible states.

## Architecture

Create a small inventory of backend failure families with their source path,
expected prerequisite, and reproduction status. Use the existing fuzz pipeline
and deterministic source generators to exercise valid and near-valid programs
that stress member access, calls, generics, enums, and type queries.

For each confirmed crash:

1. Minimize it to a stable source program.
2. Add it to `tests/InternalErrorBoundary.test.ts` or the fuzz regression
   corpus.
3. Add the smallest semantic validation that prevents invalid AST state from
   reaching code generation.
4. Keep the backend invariant check unless the state becomes structurally
   impossible and removing it is independently justified.

No production change is retained for a path that cannot be reproduced from
source input.

## Diagnostics

Confirmed user mistakes must return `CompilerError` diagnostics with a stable
message, actionable hint, and source location. Diagnostic wording must describe
the source error, not backend implementation details. Messages and hints must
not contain "internal compiler error".

## Testing

Every retained fix follows red-green TDD:

- The minimal source reproduction must fail by throwing or surfacing an
  internal-error message before the fix.
- The same test must return a normal unsuccessful compile result after the fix.
- Existing valid forms adjacent to the failure must continue compiling.
- Focused fuzz campaigns must report zero crashes.
- O0/O3 correctness and the full Linux suite must remain green.

## Completion

The campaign is complete when all confirmed source-reachable paths discovered
in the scoped inventory have regressions and structured diagnostics, all
unconfirmed paths are documented as invariant-only or requiring future
investigation, and verification evidence is recorded on Agent Board.
