# Filesystem, time, and compiler fixes — 2026-09-14

This batch completes the four requested work areas: filesystem reliability, time
utilities, the remaining listed compiler blockers, and the manual layout audit.
It also fixes additional bugs exposed by regression tests and full CI.

## Commits and behavior

- `903c2948`: checked streaming whole-file reads, write/close status, binary
  `FS.readBytes`/`writeBytes`, handle `writeBytes`, and portable directory-entry
  names. Reads no longer depend on seek/ftell or unchecked allocation. File
  `write` and `close` now return bool (BUG-301/302).
- `945758fc`: checked Duration scaling/addition/subtraction; long sleep arguments
  with EINTR retry; `Time.nowSeconds`, monotonic clocks, monotonic Stopwatch and
  measure; stopped timers retain elapsed time. The legacy int `now` throws
  instead of wrapping beyond its range (BUG-303).
- `2f0e461d`: intrinsic calls follow resolved extern declarations; user functions
  and local callables retain their own behavior. Func-to-Lambda adapters handle
  locals, zero arguments, void and aggregate returns. Repeated ignored lambda
  parameters get distinct LLVM names (BUG-273/275/276/304).
- `e6f5f033`: primitive member lookup uses the shared wrapper mapping and checked
  stdlib declarations. Computed float interpolation and implicit Long.toString
  now agree with code generation (BUG-274/281). `a9fca481` updates an existing
  source-structure assertion for the shared mapping.
- `62941a6c`: a shared layout calculator uses emitted LLVM types and the selected
  target layout for enum storage and DWARF. Enum reflection uses LLVM size
  expressions. Aliases, generics, natural alignment, tail padding, hidden vtable
  fields, and target pointer widths are included. A codegen import cycle exposed
  by direct layout-helper imports is also fixed (BUG-291/305/308).
- `3e573e52`: array-alias payload fields compare recursively by lowered element
  types, preserving floating-point equality for signed zero and NaN (BUG-306).
- `a25ee286`: reachable value-producing match-arm fallthrough receives a clear
  codegen diagnostic; unused continuations after fully terminating if/else
  branches become unreachable. This prevents incomplete phi nodes (BUG-307).
- `342d9882`: the database example uses pattern matching instead of hard-coded
  enum offsets and discarded nested match results (BUG-309). Its library-system
  regression and the updated filesystem-error example pass.
- `7a1714bf`: native filesystem fault-injection coverage for allocation failure,
  read/close errors, short writes, and cleanup.

## Validation

Validation used Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

The final `bun run test:ci` passed all five stages:

- Native runtime support build passed.
- Integration/playground: 572 passed, zero failures.
- VS Code extension: 236 passed, zero failures.
- Generated CLI registry check passed.
- CI-safe unit suite: 3,517 passed, zero failures across 296 files; 16 opt-in
  Docker tests skipped.

Additional checks passed:

- `bun run check` (TypeScript).
- `bun run lint`: zero errors after fixing the six violations reported by the
  separate GitHub lint gate (BUG-310). The initial test:ci run did not include
  this check. After cleanup, all 414 compiler tests and five targeted layout/match
  regressions were rerun and passed.
- `bun run test:codegen-cross-platform`: 414 tests, including GoldenLLVMShapes.
- Markdown and audit documentation suites: 97 tests; generated stdlib reference
  checked against source declarations.
- Clang C ABI size/alignment/offset oracle checks for all eight supported target
  families. These compile for the targets; they do not execute on every platform.
- O0/O3 execution and LLVM verification for filesystem, Duration, Stopwatch,
  callable adapters, primitive conversions, enum storage/equality, and match arms.
- Native clock tests simulate timestamps beyond 2038, clock failure, long sleep
  conversion, and EINTR remaining-interval retry.
- Native filesystem fault tests at O0/O3 with AddressSanitizer and
  UndefinedBehaviorSanitizer enabled (`BPL_TEST_NATIVE_SANITIZERS=1`).
- Rebuilt CLI smoke test combining binary file I/O, stopped Stopwatch state,
  local Func-to-Lambda conversion, generic array-alias enum payloads, and implicit
  Long.toString. Output: `filesystem, time, lambda, and enum smoke passed: 7`.

The first full CI attempt exposed the two example regressions described above;
those were fixed before the successful complete rerun.

## Compatibility and limits

Enum layout changes require rebuilding dependent object files and native code
that exchanges enum values together. See [Compiler Data Layout](../compiler-data-layout.md).

Whole-file reads are limited to 2,147,483,646 bytes and can fail earlier if memory
is unavailable. Binary buffers are owned by the caller. Text reads preserve
first-NUL termination. Successful writes and close checks do not promise disk
durability. Time and filesystem helpers require the native Linux/macOS runtime;
this batch does not provide new hosted-Wasm implementations of those helpers.

Full CI and the targeted checks above do not prove the absence of all bugs.
Dedicated fuzz and other opt-in suites excluded by the CI-safe plan were not
separately rerun. Real Docker and native macOS execution were not performed here.
