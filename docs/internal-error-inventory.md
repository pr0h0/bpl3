# Compiler Internal-Error Boundary Inventory

This inventory covers failures reachable from user-provided BPL source through
the normal compiler pipeline. It uses a proof-per-path rule: retain backend
invariant checks unless a source-level reproducer reaches them, and fix
confirmed failures at the earliest semantic boundary.

## Campaign Evidence

| Campaign | Valid | Expected errors | Crashes | Mismatches | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Original structured/mutated/token corpus, 3 seeds x 20,000 | 20,046 | 39,954 | 0 | 0 | No raw backend exception reproduced |
| Expanded corpus before semantic fix, same seeds | 20,067 | 39,933 | 0 | 0 | Reproduced an accepted invalid top-level `Loop` at seed `0x0bad5eed`, iteration `7532` |
| Expanded corpus after semantic fix, same seeds | 20,066 | 39,934 | 0 | 0 | The reproduced program moved from accepted codegen to an expected type-check error |

The expanded corpus adds valid source shapes for call-result member access,
struct equality, and enum struct-variant construction. Mutating valid examples
is important because random token inputs usually fail in the parser before
reaching backend metadata invariants.

## Confirmed User-Reachable Failure

| Boundary | Reproducer | Previous behavior | Resolution |
| --- | --- | --- | --- |
| Unsupported top-level executable statements | `loop frame main() ret int { return 0; }`, `return 1;`, and `if (true) {}` | Type checking succeeded; `CodeGenerator.generateTopLevel` warned and silently omitted the statement | `TypeChecker.checkProgram` now reports a source diagnostic and excludes invalid top-level statements from hoisting and body checking |

## Targeted Backend Probes

| Backend invariant | Probe | Result | Decision |
| --- | --- | --- | --- |
| Call-result member access requires a resolved struct type and layout | Valid `makeBox(...).value` source plus mutations | Valid source reaches codegen; no raw exception reproduced | Retain invariant checks and expanded fuzz coverage |
| Struct equality requires a resolved struct declaration | Valid `left == right` on a struct plus mutations | Valid source reaches codegen; no missing-declaration exception reproduced | Retain invariant checks and expanded fuzz coverage |
| Enum struct-variant construction requires `enumVariantInfo` | Valid `Event.Point { x: ..., y: ... }` source plus mutations | Valid source reaches codegen; no missing-info exception reproduced | Retain invariant checks and expanded fuzz coverage |

## Guarded Or Invariant-Only Paths

These paths were inspected and did not produce a source-level failure in the
targeted campaign:

- Unsupported binary, unary, compound-assignment, literal, expression, tuple,
  and switch forms are rejected by parsing or semantic checks before codegen.
- Missing call types are guarded by call checking, which assigns the effective
  callable type before a successful check.
- Missing struct layouts and enum variant metadata depend on declarations and
  metadata established during successful semantic checking.
- Missing spec/struct declarations during vtable generation and missing spec
  methods are guarded by spec implementation checks.
- Invalid enum payload indexes, unsupported type-node kinds, loop/switch stack
  mismatches, and missing parent-destroy `this` values require malformed
  compiler-owned state rather than accepted source.
- Unsupported target triples are option validation failures, not source-level
  failures.
- `VirtualCallEmitter` deliberately throws and catches
  `receiver is not addressable` to select its spill path; it is not exposed as
  a compiler crash.
- Linker, module resolver, package manager, and filesystem/toolchain failures
  are operational diagnostics outside this source-level backend boundary
  review.

## Decision

Only the reproduced top-level statement failure changes compiler behavior.
Unreproduced backend invariants remain intact, while the expanded deterministic
corpus keeps exercising their surrounding valid paths in future fuzz runs.
