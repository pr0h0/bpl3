# Filesystem metadata — 2026-09-15

## Changes

- `e80ae526`: fixed `FS.exists` opening files to test existence (BUG-314).
  The previous implementation blocked indefinitely on a named pipe with no
  writer; a compiled reproduction was terminated after two seconds. Existence
  now uses native `stat` without opening the file. It follows symlinks and
  returns false on metadata errors, while recognizing unreadable files,
  directories, FIFOs, and filesystem sockets.
- `2b02aed4`: added checked `FS.stat` and `FS.lstat`, returning a resource-free
  `FileInfo` value with `size: long`, `isFile`, `isDir`, and `isSymlink` fields.
  Native errors and unsupported sizes throw `IOError`. The native helper keeps
  platform-specific stat layout and mode constants out of BPL code.

The size field supports nonnegative signed 64-bit sizes. It reports native
metadata, not necessarily the amount readable from special or virtual files.
`stat` follows links; `lstat` can inspect dangling links and symlink loops without
resolving the final link's target. Parent components and trailing slashes follow
native path resolution. Metadata does not guarantee a later operation's success.

## Focused validation

Checks used Bun 1.4.2 and Clang on Linux x86-64:

- Separate lint and TypeScript checks passed after the changes.
- O0/O3 execution with LLVM verification covered the FIFO regression, mode-000
  files, directories, valid/dangling/looping symlinks, invalid paths, regular-file
  sizes, and a sparse file of 4,294,967,313 bytes. The sparse-file test checks
  metadata without reading or allocating the file's logical contents.
- Direct fields on `FS.stat(...)` temporaries passed at both optimization levels.
- Three native filesystem test files passed at O0/O3 with ASan/UBSan. New native
  cases covered FIFO/socket inspection, permission-error propagation, invalid
  arguments, negative sizes, and the signed 64-bit size boundary.
- Documentation and generated stdlib reference checks passed: 99 tests.

## Full validation

`bun run test:ci` passed all five stages: native runtime build, 572
integration/playground tests, 236 extension tests, generated CLI registry check,
and 3,530 unit tests across 303 files. The unit stage reported zero failures and
16 skipped opt-in Docker tests. All filesystem guide examples compiled, including
the new metadata example, which also executed successfully through the source CLI.
The CLI was rebuilt; the metadata example passed with that binary, and the
original FIFO existence reproduction now exits successfully within its timeout.

Native macOS execution and opt-in real Docker tests were not run locally.
