# Checked calendar arithmetic — 2026-09-13

This batch follows the [calendar conversion and formatting fixes](2026-09-12-stdlib-dates.md)
and resolves BUG-297. Each implementation item has a separate commit.

## Changes

- `46577890`: Date arithmetic widens before calculation, normalizes negative
  month offsets, validates inputs, and checks resulting years before narrowing.
  subDays handles the minimum int offset correctly. diffDays rejects results
  outside int; the new diffDaysLong returns exact signed differences across the
  entire supported year range.
- `fb2412a6`: DateTime checks inclusive offset limits before multiplying by the
  seconds per unit or adding to the timestamp. Huge offsets cannot wrap into
  valid dates. New addMonths and addYears methods reuse Date's checked calendar
  rules while preserving the clock fields.

All arithmetic methods return new values. Invalid stored date/time fields and
out-of-range results throw strings. Calendar month/year additions clamp the day
when the target month is shorter; this means opposite offsets are not always
inverses. For example, January 31 plus one month can become February 28, whose
result after subtracting one month is January 28. Duration-based days remain
86400 UTC seconds, with no timezone or DST model.

The [API guide](../48-stdlib-api.md#datetime) and generated declaration reference
include the new methods and error behavior.

## Validation

Local checks use Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- Date regression tests run at O0/O3 with LLVM verification. JavaScript UTC
  calculations independently check month normalization and clamping across
  negative years, year zero, and leap centuries. Additional cases cover int
  offsets and years, invalid inputs, checked narrowing, unchanged inputs, and
  the exact full-range day difference from independent Gregorian leap counts.
- DateTime regression tests run at O0/O3 with LLVM verification. A BigInt oracle
  checks 84 valid boundary offsets and 140 rejected offsets across four time
  units. Other cases exercise calendar additions, invalid clocks, preserved
  input values, leap-day clamping, and exact full-range second differences.
- TypeScript checking and the generated stdlib reference check passed.
- A smoke test through the local compiled CLI passed for all three new APIs,
  negative-month normalization, and a day difference larger than int.

The complete `bun run test:ci` command passed all five stages:

- Runtime support build: passed.
- Integration/playground suite: 572 passed, zero failures.
- VS Code extension suite: 236 passed, zero failures.
- Generated CLI registry check: passed.
- CI-safe unit suite: 3,498 passed, zero failures across 284 files; 16 opt-in
  Docker tests skipped. Both new arithmetic regressions also passed in this run.

Dedicated fuzz and other opt-in suites excluded by the CI-safe plan were not
separately rerun. Docker and native macOS execution remain for their platform
checks.

## Remaining work

The compiler's literal-left mixed-width arithmetic issue (BUG-299) remains open;
these implementations use explicit widening where needed. Earlier unrelated
compiler and stdlib audit issues remain tracked in BUGS.md. No standalone module
was added in this batch; three APIs extend the existing date module.
