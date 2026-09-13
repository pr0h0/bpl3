# Mixed-width integer lowering — 2026-09-13

Commit `2f5b37ec` fixes BUG-299, found while implementing the standard library's
calendar conversion. The original expression `5 * dayOfYear`, with a long right
operand, passed checking but produced an i32 LLVM instruction with an i64
operand. New regressions reproduced the mismatch before the fix.

## Implementation and semantics

The checker already selects the left operand's type for integer operations.
Code generation now materializes the compatible right-operand conversion before
arithmetic, bitwise operations, comparisons, shift masking, and division guards.
Widening follows the source signedness; narrowing retains the low bits.
Comparisons return bool, while arithmetic retains the left type. Mixed
integer/floating-point operations still require explicit casts.

The operation width remains controlled by the left operand. For example, with a long variable
holding 4294967297, `1 + wide` uses int arithmetic and yields 2;
`cast<long>(1) + wide` yields 4294967298. Assigning the first expression to a long
variable occurs after its int arithmetic. The language spec, operator guide, and
contributor instructions now explain this rule.

Division and remainder guard optimizations also account for conversions:

- Constant facts normalize through the source width and operation width, so a
  literal that narrows to zero or minus one cannot bypass the needed guard.
- Cached nonzero facts include the operation width. A nonzero wide divisor may
  become zero when narrowed.
- Assignment still invalidates every cached width for that expression. The
  existing invalidation regression caught an intermediate implementation error;
  the final implementation passes it.

Pointer operations and overloaded operators retain their separate lowering.
Operands remain evaluated once, from left to right.

## Validation

Local checks use Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- The new O0/O3 LLVM-verified matrix checks 896 arithmetic, bitwise, and comparison
  results against BigInt calculations across all signed/unsigned 8-/16-/32-/64-bit
  width pairs.
- Additional O0/O3 cases cover literal-left and nested expressions, aliases,
  evaluation order, explicit widening, and mixed-width shift counts.
- Five runtime-failure cases check narrowed zero divisors, narrowed signed
  overflow, and reuse of nonzero facts across widths at O0/O3.
- All 29 focused regressions passed, including existing division guards,
  assignment invalidation, signed overflow, shifts, floating-point semantics,
  compound assignments, and zero-cost LLVM checks.
- TypeScript checking passed.

The cross-platform code-generation command passed all 414 tests across ten
files, including GoldenLLVMShapes. Its legacy source-text assertion for shift
lowering was replaced with emitted-LLVM checks in commit `19b3d736`.

The complete `bun run test:ci` command passed all five stages:

- Runtime support build: passed.
- Integration/playground suite: 572 passed, zero failures.
- VS Code extension suite: 236 passed, zero failures.
- Generated CLI registry check: passed.
- CI-safe unit suite: 3,500 passed, zero failures across 285 files; 16 opt-in
  Docker tests skipped. The new regressions and updated shift test passed here.

The local compiled CLI was rebuilt and smoke-tested with literal-left long
arithmetic, mixed-width shifts, narrowing, and explicit widening. Dedicated fuzz
and other opt-in suites excluded by the CI-safe plan were not separately rerun.
Docker and native macOS execution remain for their platform checks.

## Scope

This fixes compiler lowering used by stdlib code and user programs. No stdlib API
was added in this batch. Earlier unrelated audit issues remain tracked in
BUGS.md; full-width arithmetic should continue to use explicit left-operand casts
where needed.
