# Value ownership and captured writes — 2026-09-17

This continues [the takeover review](2026-09-16-takeover-review.md) under the
same instruction: no new features until the compiler is free of known defects,
and breaking changes are acceptable where they make the language more reliable.
Nine defects were reproduced and fixed. Each has its own commit, a BUGS.md
entry, documentation, and executable regression coverage.

Two themes account for all of them. Cleanup followed a value's declared type
but not what the value owned, and two constructs accepted writes whose effect
was silently discarded.

## Automatic destruction

`@[auto_destroy]` ran only for a local whose own type declared the marked
method. Everything else a value owned was skipped, with no diagnostic, so a
resource leaked while the program looked correct.

| Bug | Position that leaked | Resolution |
| --- | --- | --- |
| BUG-354 | Array elements and struct fields | Walk the type: unroll fixed dimensions, reach fields by `getelementptr`, recurse cycle-guarded |
| BUG-354 | — | Own destructor now runs before the fields it owns; fields destroyed in reverse declaration order |
| BUG-354 | — | A moved value suppresses its whole subtree, so returning a struct no longer destroys its fields twice |
| BUG-354 | — | A local whose cleanup will read it is zeroed at its declaration, so a destructor never reads stale stack |
| BUG-355 | — | (see captures below) |
| BUG-358 | Tuple elements and destructured locals | Tuples are aggregates, so elements are reached like fields; destructuring targets register like locals |
| BUG-359 | Enum payloads | Rejected with `BPL_AUTO_DESTROY_ENUM_PAYLOAD`; tag-directed cleanup is not implemented |
| BUG-360 | By-value parameters | Registered with the body scope, since parameter storage predates it |
| BUG-361 | `catch` bindings | Registered with the handler scope, through a new `ownedStorage` argument to block generation |

Generic type arguments were a second blind spot inside the same walk: a field
declared as a struct's type parameter, and a local declared as a generic
function's type parameter, were both invisible until field types were
substituted from the instantiation and every visited type resolved through the
instantiation's type map. The cycle guard keys on the instantiation, so
`Box<Box<Resource>>` is walked to full depth.

Ownership now covers: the value's own destructor, struct fields including
inherited ones, fixed array elements at any dimension, tuple elements,
destructured locals, by-value parameters, and `catch` bindings, each through
generic arguments, and on the `return` path, the scope-exit path, and the
`throw` path.

Three positions remain uncovered and are documented in
[the destructor guide](../21-constructors-destructors.md):

- A value returned into a discarded expression statement, `makeResource();`,
  has no owner and no temporary lifetime to attach cleanup to.
- A global is never destroyed, because program exit runs no cleanup.
- A frame between a throwing frame and the handler that has no `try` of its own
  is skipped by the unwinder, so its locals are not destroyed. This predates
  this review and is unchanged.

Enum payloads are rejected rather than silently leaked. Lifting that
restriction means emitting a switch on the variant tag at every cleanup site,
including the throw path, which is a new mechanism rather than a fix.

## Writes that were discarded

A lambda captures by value and reads its captures from a copy, so a write to a
captured variable changed only that copy: the outer variable kept its value and
the write was not even visible to the next call of the same lambda (BUG-355).
`defer` blocks copy their captures the same way, with the same result
(BUG-356). Both compiled and ran, producing values the source does not
describe, and `examples/func_lambda_closure_mut` asserted the discarded result
as its expected output.

Both are now rejected with `BPL_CAPTURED_VALUE_ASSIGNED`. Capture analysis
already walked the lambda body, so it also records writes whose target resolves
to a captured declaration, including the `++` and `--` forms, which are unary
nodes rather than assignments. `defer` reuses that walk over its statement
rather than duplicating it. The walk stops at a pointer, so writing through a
captured pointer, to a global, or to the construct's own locals stays valid;
that is the documented way to mutate the original.

Making the write persist in the copy was considered and rejected: a capture
that diverges from the variable it is named after is the same silent-value
problem in a quieter form. LANGUAGE_SPEC.md states the rules as R-LAMBDA-4 and
R-DEFER-5, and R-LAMBDA-2 no longer claims the write happens. The R-DEFER-3
demonstration previously relied on a discarded write and now writes through a
pointer, which proves the ordering rule more directly.

## Spec dispatch

Converting a struct to a spec pointer built the method table from the methods
that struct declared itself, so a child that overrode part of a spec and
inherited the rest was rejected during code generation (BUG-357), although
R-SPEC-3 states that a child implements its parent's specs and direct calls to
the inherited method worked. Each required method is now resolved through the
inheritance chain, and the thunk calls the implementation belonging to the
nearest ancestor that declares it, mangled with that ancestor's name.

A related asymmetry is left as it is, because it is specified rather than
broken: a struct that lists a spec must declare every required method itself
(R-SPEC-2), even when it inherits a working implementation, while a struct that
inherits from an implementing parent gets them for free. That is a language
design question, not a defect, and it fails loudly either way.

## Optimization sweep

Integration tests run the examples at the default optimization level, so a
defect that only appears optimized would not be seen. All 479 examples were
run at `-O 0` and `-O 3` and their output and exit status compared. One real
difference turned up: `examples/asm_x86_test` stored an `i64` asm result into
an `int`, overrunning the four-byte slot, and printed `42` unoptimized and `0`
at `-O 3` (BUG-362). An interpolated `(variable)` is that variable's own
storage, and LLVM pointers carry no element type, so nothing rejects a store
wider than the target. The example now uses `i32`, and
[the assembly guide](../35-inline-assembly.md) states the hazard. The compiler
is unchanged: a raw assembly block is an escape hatch whose contents it does
not type-check.

Three further examples differed only in printed stack or heap addresses, which
vary between runs; they are identical once addresses are normalized.

## Validation

Environment: Linux x86-64, Bun 1.4.2, Clang 21.1.8.

- Full suite after each change, run in chunks: 4302 passing, 0 failing at the
  final commit, growing from 4294 as regressions were added.
- New regression coverage executes at O0 and O3 with LLVM validation.
  Destructor ordering was additionally verified byte-identical at O0, O1, O2,
  and O3, including a program combining arrays, nested fields, generics,
  moves, loops, and nested handlers.
- Two differential fuzz campaigns over six seeds, 300 iterations each: 0
  crashes, 0 mismatches.
- Type checking and lint clean at every commit.

Nothing in the standard library, the examples, or the packages uses
`@[auto_destroy]`, so the ownership changes altered no existing program.
The two rejections did: one example asserted a discarded lambda write, and one
specification test demonstrated a discarded `defer` write. Both were rewritten
to the pointer form, which is what the documentation already recommended.

This is a targeted review of value ownership and capture semantics, not a
guarantee that the compiler is free of defects. Results apply to Linux x86-64.
