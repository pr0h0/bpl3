# Standard library calendar fixes — 2026-09-12

This batch follows the [integer and filesystem work](2026-09-12-stdlib-integers.md).
The implementation, regression tests, and API documentation are committed in
three independent checkpoints.

## Changes

- `b7fb07d4`: Date and DateTime convert UTC Unix seconds in both directions,
  including pre-1970 dates, year zero, and negative years. Conversion uses
  constant-time 400-year Gregorian cycles, based on
  [Howard Hinnant's civil calendar algorithms](https://howardhinnant.github.io/date_algorithms.html).
  Invalid fields and timestamps whose year does not fit int throw strings.
- `d05c1a71`: formatting uses bounded snprintf calls with enough storage for
  every signed int field, checks allocation failure, and eliminates the leaked
  separator allocation. Time.formatTimestamp delegates to DateTime and therefore
  shares the corrected conversion and range checks (BUG-272 and BUG-296).
- `2ccd514d`: weekdays normalize signed remainders; ISO week numbering handles
  week 53 and dates in adjacent ISO years, including at negative and extreme
  calendar years (BUG-298). Invalid date queries throw strings.

Constructors still store fields without validation. Formatting prints those
fields, so malformed dates can still be displayed for diagnostics. Formatting
returns caller-owned memory. Expanded years are printed as ordinary signed
integers with minimum width four; formatISO adds T but does not provide a fully
normalized expanded-year interchange format or a timezone suffix. No timezone,
DST, or leap-second model was added. The
[API guide](../48-stdlib-api.md#datetime) and [time guide](../33-stdlib-time.md)
describe the resulting contracts.

## Validation

Local validation uses Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- Timestamp regression: every day of a 400-year cycle crossing year zero, at
  midnight and 23:59:59; independent JavaScript UTC cases around the epoch and
  leap-century boundaries; both int year limits and rejected out-of-range long
  timestamps. Runs at O0/O3 with LLVM verification.
- Formatting regression: extreme valid years, minimum int values in every stored
  field, zero/custom separators, repeated allocation/free cycles, and negative
  Time.formatTimestamp input. Runs at O0/O3 with LLVM verification.
- The formatting fixture also passes ASan/UBSan-linked O0/O3 runs with leak
  detection enabled. Generated BPL LLVM is not comprehensively instrumented by
  these link flags; this check covers sanitizer-intercepted native formatting
  and allocation behavior, rather than proving every BPL memory access safe.
- Week regression: 358 boundary cases compared with an independent JavaScript
  Thursday-based ISO-week oracle, including Gregorian-cycle equivalents of both
  int year limits. Runs at O0/O3 with LLVM verification.
- TypeScript checking and the generated stdlib reference check passed.

The complete `bun run test:ci` command passed all five stages:

- Runtime support build: passed.
- Integration/playground suite: 572 passed, zero failures.
- VS Code extension suite: 236 passed, zero failures.
- Generated CLI registry check: passed.
- CI-safe unit suite: 3,496 passed, zero failures across 282 files; 16 opt-in
  Docker tests skipped. All three new Date tests also passed in this run.

Dedicated fuzz and other opt-in suites excluded by the CI-safe plan were not
separately rerun. Docker and native macOS execution remain for their platform
checks.

## Remaining work

Date arithmetic still has unchecked narrowing/overflow and negative-month
problems (BUG-297). Literal-left arithmetic with a long operand can generate
mismatched LLVM operand widths (BUG-299); this batch explicitly widens literals
in affected expressions. These issues are logged and remain open. Earlier
unrelated stdlib and compiler audit items are also still tracked in BUGS.md.
