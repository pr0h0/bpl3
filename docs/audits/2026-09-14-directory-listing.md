# Checked directory listings and try/catch returns — 2026-09-14

## Changes

- `ac3a09bb`: added `FS.listDirChecked(path) ret Array<String>`. Native open,
  read, close, size, and allocation failures throw `IOError` with a nonzero code.
  Temporary names and storage are released on failure. The legacy `listDir`
  catches these errors and returns an empty array, preserving its open-failure
  convention while eliminating partial results after read errors (BUG-312).
- `9dc0a841`: fixed return analysis for functions ending in a try block whose
  body and every catch return or throw. Codegen marks a continuation unreachable
  when all branches terminate, including try/catch inside value-producing match
  arms. Reachable fallthrough still produces a diagnostic (BUG-313).

Directory names use the native platform's `dirent` layout and become independent
owned Strings. The native helper does not assume the BPL String layout; BPL
initializes its own entries in checked storage. Hidden names are retained except
for `.` and `..`. Destroy each String, then the Array. Ordering is unspecified,
and concurrent changes do not produce an atomic snapshot.

## Focused validation

Validation used Bun 1.4.2 and Clang on Linux x86-64:

- Separate `bun run lint` and `bun run check` passed after both changes.
- Directory regressions passed at O0/O3 with LLVM verification: growth beyond
  initial native capacity, owned names, hidden files, spaces, Unicode, long
  names, empty directories, null/empty/missing paths, and regular-file paths.
- Native directory and filesystem regressions passed at O0/O3 with ASan/UBSan.
  Directory fault injection exercised every allocation point, read failures,
  close failures, preservation of the earlier error, storage-size overflow,
  and zero outstanding tracked allocations/handles after failures.
- The combined exception, match, cleanup, and directory run passed 37 tests.
  New cases cover typed/catch-all handlers, normal returns, nested propagation,
  rethrowing, deferred cleanup, match yields, and rejected fallthrough.
- Cross-platform compiler tests: 414 passed. These are compiler checks, not
  native execution on every target.
- Documentation/reference checks passed; both new guide examples also executed
  successfully through the source CLI.

## Full validation

`bun run test:ci` passed all five stages: native runtime build, 572
integration/playground tests, 236 extension tests, generated CLI registry check,
and 3,526 unit tests across 300 files. The unit stage reported zero failures and
16 skipped opt-in Docker tests. Both new guide examples compiled in that run.
The CLI was rebuilt, and both examples also ran successfully with that binary.

Native macOS execution and opt-in real Docker tests were not run locally.
