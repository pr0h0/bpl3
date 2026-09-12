# Standard library JSON and integer fixes — 2026-09-12

This batch expands JSON numeric parsing and fixes parser progress, string escaping,
float formatting, and StringBuilder integer formatting. The earlier Deque and
binary modules remain documented in the [previous stdlib report](2026-09-11-stdlib.md).

## Changes

- `dd059041`: malformed containers, excess fixed-array elements, unsupported
  values, invalid skipped fields, and malformed null literals return parse errors.
  Container loops check separators and parser progress (BUG-277/283).
- `cb89123c`: JSON serialization escapes all representable control bytes below
  0x20, preserves valid UTF-8, and round-trips escaped strings (BUG-278).
- `e5b6eb93`: bounded binary64 formatting preserves finite precision and emits
  `null` for NaN and infinities (BUG-279). Also corrects the documentation claim
  that BPL source literals accept exponent notation (BUG-285).
- `1eefafd0`: `StringBuilder.appendInt` handles -2147483648, which previously
  produced only a minus sign and consequently invalid JSON (BUG-286).
- `b2e1b3d7`: JSON parses checked signed 32-bit and 64-bit integers, plus finite
  binary64 fractions and exponents. Overflow and malformed numbers are rejected
  (BUG-287). Numeric parsing works in fields and supported arrays.

- `e94bf018`: update the JSON error example's exact diagnostic expectations
  for earlier separator-error detection. The corrected example passes.

The [JSON guide](../55-reflection-and-json.md) documents support, ownership,
integer spelling, floating-point rounding, and the C numeric locale requirement.
No new module was introduced in this batch; the expansion is in `std/json.bpl`.

The pending documentation helper packaging repair was committed separately as
`ca517508` before resuming standard library work.

## Validation

Local validation uses Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- TypeScript type checking and generated stdlib reference check passed.
- All 15 focused JSON regressions passed. New cases execute at O0 and O3 and
  compare output with JavaScript JSON parsing or exact BigInt values.
- The StringBuilder boundary regression passed at O0/O3 with LLVM verification.
- Additional ASan/UBSan stress checks passed at O0 and O3: 100 cycles per
  optimization level covering extreme floats, nested dynamic arrays, stringify /
  parse / free, and cleanup after partially allocated parse failures. The shared
  sanitizer harness disables leak detection.

The initial CI-safe run found one stale JSON diagnostic expectation (571
integration/playground tests passed). After the fixture correction, the complete
`bun run test:ci` rerun passed all five stages:

- Runtime support build: passed.
- Integration/playground tests: 572 passed, zero failures.
- VS Code extension tests: 236 passed, zero failures.
- Generated CLI registry check: passed.
- CI-safe unit tests: 3,474 passed, zero failures across 268 files; 16 opt-in
  Docker tests skipped. Docker was not rerun for this batch.

CI-safe validation excludes some dedicated fuzz, sanitizer, and release-smoke
suites; this result does not claim every optional test configuration was run.

## Remaining limitations and follow-up

This is not an exhaustive audit of the standard library or every documentation
sentence. JSON remains experimental: unsupported primitive widths, enum payloads,
cyclic graphs, and fixed-array alias reflection (BUG-284) still limit its use.
Use concrete array generic arguments until the reflection defect is fixed.

Previously logged stdlib priorities remain open: `String.replaceAll` can loop
when replacements reintroduce the search text (BUG-268); `IO.readLine` uses
unbounded input (BUG-270); random fractions and Gaussian generation need fixes
(BUG-267); UUID generation can repeat within a second (BUG-269); recursive
mkdir handling and pre-epoch dates need corrections (BUG-271/272).
