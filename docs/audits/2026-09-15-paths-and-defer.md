# Path helpers and deferred cleanup — 2026-09-15

## Changes

- `56808b2f`: fixed empty-base joining, trailing separators in basename/dirname,
  and dotfile extensions (BUG-315). The helpers now check null inputs and
  allocation/length failures and construct owned Strings without an extra copy.
- `f1f85128`, `61ffd1e4`: replaced allocation-heavy normalization with one output
  buffer and made resolution release its joined temporary through explicit error
  handling (BUG-316). This avoids allocating a deferred closure for internal
  path cleanup.
- `b4ff3a7b`: replaced literal prefix stripping in `relative` with normalized
  component comparison and parent traversal construction (BUG-317). Mixed roots
  and unresolved source parents requiring unknown ancestor names fail explicitly.
- `2cc55622`: added allocation guards for lambda captures and defer nodes
  (BUG-318). Failed registration frees any capture context before throwing.
  Exception unwinding now unlinks and frees each defer node before invoking its
  callback. Generated callbacks copy captures into locals and release the capture
  storage before executing user code, including callbacks that throw (BUG-319).
- `3544b30b`: expanded the existing path integration example to exercise empty
  bases, trailing separators, and sibling-relative paths.

The new [path guide](../62-stdlib-path.md) defines the lexical contracts and
ownership rules. Path helpers do not inspect filesystem state, resolve symlinks,
interpret Windows path syntax, or consult the working directory.

## Focused validation

Validation used Bun 1.4.2 and Clang on Linux x86-64:

- O0/O3 execution and LLVM verification covered component/join edge cases,
  Unicode bytes, null arguments, 171 normalization cases, a 100-pair absolute
  relative-path oracle, and explicit relative-parent cases.
- Allocation tracking reproduced the original normalization leak and captured
  defer allocation crash. The repaired cases have zero remaining tracked
  allocations after success and injected failure, including all three relative
  path allocations, failed closure/defer registration, exception unwinding, and
  throwing callbacks.
- The tracker redirects allocator calls in emitted BPL LLVM to a C shim, then
  compiles and executes at O0/O3. It measures BPL allocations in the test window;
  it is not a claim that every native or runtime allocation path is guarded.
- Separate lint and TypeScript checks passed. Cross-platform compiler checks
  passed 414 tests. Documentation/reference checks passed 99 tests.
- The expanded path example passed the integration runner.
- A separate WebAssembly runtime and compatibility run passed all 50 tests.

## Final validation

The full `bun run test:ci` run passed all five stages, including 572 integration
and playground tests, 236 extension tests, and 3,536 unit tests. The unit stage
reported zero failures and 16 skips for opt-in real Docker tests. Separate
`bun run lint` and `bun run check` runs also passed.

The final documentation run passed 292 tests across five files, including
compilation of the complete guide programs, Markdown links, language-spec
contracts, and the generated standard-library reference.

`bun run build` rebuilt the local CLI successfully. That binary ran the path
guide's complete example, the expanded path integration example, and the original
component/relative-path reproduction with the corrected output.

Native macOS execution and opt-in real Docker tests were not run locally.
