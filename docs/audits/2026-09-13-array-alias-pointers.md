# Array-alias pointer fixes — 2026-09-13

This batch resolves the generic array-alias substitution issue found during
stdlib JSON work and the additional pointer-level issue exposed by its tests.
Implementation changes are committed in separate checkpoints.

## Changes

- `3c759aae`: preserve an instantiated alias target alongside its declaration,
  carry that target through generic substitution, and use it for pointer element
  checking and LLVM layout. Address-of modifier calculation now instantiates
  generic aliases instead of duplicating their array dimensions (BUG-290).
- `d5ceb910`: indexing additional pointer levels removes one pointer level at a
  time. Address generation uses the actual LLVM shape to distinguish pointer
  values from arrays of pointers. Null checks remain on pointer traversal and
  bounds checks remain on the inner fixed array (BUG-300).
- `755469d3`: exclude the instantiated target from source AST traversal,
  position lookup, and derived cache signatures, matching other semantic
  metadata. The alias declaration itself is shared and remains unchanged.

For `type Pair<T> = T[2]`, a `*Pair<int>` supports element indexing. For a
`**Pair<int>`, the first index selects a `*Pair<int>` and the next selects an
array element. The [JSON guide](../55-reflection-and-json.md) now documents
instantiated aliases as JSON generic arguments and explains pointer levels.

## Validation

Local checks use Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- Before the fix, pointer indexing was checked as unresolved T and JSON generic
  alias parsing failed to compile. During development, address-of tests also
  exposed duplicated dimensions, and double-pointer tests exposed invalid LLVM
  indexing. Regression tests now cover those paths.
- O0/O3 LLVM-verified tests cover alias chains, generic function forwarding,
  pointer-valued elements, rectangular fixed arrays, and multiple independent
  instantiations.
- JSON tests cover generic aliases at roots and inside a generic record,
  pointer-valued fields, exact serialization, recursive freeing, short input
  zero-initialization, and excess-element rejection.
- O0/O3 tests cover double/triple pointers, non-generic aliases, reads/writes,
  generic forwarding, null outer/inner pointers, and inner-array bounds failures.
- The first focused group passed all 20 tests; the pointer-level regression group
  passed all 10 tests. A further generic-record JSON check passed both alias
  tests. Traversal and module cache-key checks passed all nine tests.
- The cross-platform code-generation command passed all 414 tests across ten
  files, including GoldenLLVMShapes.

TypeScript checking passed. The complete `bun run test:ci` command passed all
five stages:

- Runtime support build: passed.
- Integration/playground suite: 572 passed, zero failures.
- VS Code extension suite: 236 passed, zero failures.
- Generated CLI registry check: passed.
- CI-safe unit suite: 3,505 passed, zero failures across 287 files; 16 opt-in
  Docker tests skipped. All new alias regressions passed in this run.

The local compiled CLI was rebuilt and smoke-tested with generic alias JSON
parsing, generic forwarding, double-pointer writes, serialization, and freeing.
The smoke test produced the expected `[1, 9]` output. Dedicated fuzz and other
opt-in suites excluded by the CI-safe plan were not separately rerun. Docker and
native macOS execution remain for their platform checks.

## Scope

These are compiler fixes supporting existing stdlib APIs; no new stdlib module or
public method was added. The coverage above describes the exercised shapes and
does not claim to exhaust every combination of aliases, arrays, and pointers.
Earlier unrelated audit issues remain tracked in BUGS.md.
