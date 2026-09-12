# Standard library integer, UUID, and filesystem improvements — 2026-09-12

This batch continues the [previous stdlib follow-up](2026-09-12-stdlib-followup.md)
with checked UUID parsing, reliable recursive directory creation, and JSON integer
support across signed and unsigned widths. Each item has its own commit.

## Changes

- `99c0d914`: `FS.mkdirp` preserves absolute roots and relative path semantics,
  handles repeated/trailing separators and existing directories, rejects file
  collisions, propagates native failures, and frees temporary storage (BUG-271).
  It follows symlinks and `..`; it is not a path-confinement API. Components
  created before a failure remain. Its implementation uses native Linux/macOS
  runtime support and normal [mkdir semantics](https://man7.org/linux/man-pages/man2/mkdir.2.html).
- `31adb096`: `UUID.tryFromString(text, output)` checks the entire dashed or
  compact format and leaves output unchanged on failure. `fromString` now returns
  nil for malformed input instead of returning partial data or ignoring a suffix
  (BUG-294). Checked parsing distinguishes valid nil UUIDs from invalid input.
- `4e953972`: reflected scalar sizes use the shared primitive type contract,
  fixing aliases such as `uchar`, `short`, `ushort`, and binary32 (BUG-295).
- `fdcb00eb`: JSON parses and serializes signed 8-/16-bit integers and unsigned
  8-/16-/32-/64-bit integers, including their native aliases. Range checks reject
  overflow before arithmetic; unsigned output retains all 64 bits without a
  floating conversion. Existing signed 32-/64-bit and binary64 support remains.

`char` and `uchar` are numeric JSON byte values. Unsigned destinations reject
minus signs, including `-0`; all integer destinations reject fractional and
exponent spellings. The [JSON guide](../55-reflection-and-json.md) explains these
contracts and numeric interoperability limits.

## Validation

Local checks use Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- TypeScript type checking and the generated stdlib reference check passed.
- All 19 JSON regressions passed, including O0/O3 boundary and mixed-width
  field/array tests. Full unsigned 64-bit decimal output is compared exactly.
- All three UUID parsing/entropy tests passed. Checked parsing runs at O0/O3
  with LLVM verification and covers incomplete/extra input, bad separators,
  invalid digits, mixed case, unchanged-output failures, and valid nil values.
- Primitive reflection sizes match sizeof for canonical types and aliases at
  O0/O3 with LLVM verification.
- Filesystem tests passed at O0/O3 using isolated temporary directories, absolute
  and relative paths, directory symlinks, repeated calls, and file collisions.
- The native mkdirp helper was separately compiled with ASan/UBSan at O0/O3 and
  exercised through 1,000 success/failure cycles per optimization level. Both
  runs passed, including temporary-allocation cleanup.

The complete `bun run test:ci` command passed all five stages:

- Runtime support build: passed.
- Integration/playground suite: 572 passed, zero failures.
- VS Code extension suite: 236 passed, zero failures.
- Generated CLI registry check: passed.
- CI-safe unit suite: 3,493 passed, zero failures across 279 files, with 16
  opt-in Docker tests skipped.

The local compiled CLI was rebuilt and smoke-tested using checked UUID parsing,
recursive directory creation, ushort arrays, and exact unsigned 64-bit JSON
round-tripping. The smoke test passed in an isolated temporary directory.
Dedicated fuzz and other opt-in suites excluded by the CI-safe plan were not
separately rerun; Docker was not exercised.

## Scope and remaining work

The runtime was rebuilt locally. Other native checkouts must rebuild runtime
support; Docker users must rebuild their worker image to include the new helper.
Native macOS execution remains for platform CI.

JSON binary32 conversion, generic array-alias pointer substitution (BUG-290),
pre-epoch Date conversion (BUG-272), and the remaining approximate compiler size
calculations are still open work. FS read/write helpers retain their previously
documented error-checking limitations. No new standalone module was added in this
batch; the additions extend existing stdlib APIs.
