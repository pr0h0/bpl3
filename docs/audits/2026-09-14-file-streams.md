# Checked file streams — 2026-09-14

This follow-up fixes invalid filesystem arguments and adds binary reads from open
file handles without loading the entire file into memory.

## Changes

- `af33b9f8`: `File.open` rejects null paths and modes before calling libc. The
  previous `File.open("/dev/null", nullptr)` reproduction crashed in
  `_IO_file_fopen`. `FS.exists` and `mkdir` return false for null paths; `listDir`
  returns an empty owned array. Whole-file reads retain their IOError convention
  (BUG-311).
- `6144d67f`: `file.readBytes(data: *u8, length: int) ret int` reads into a
  caller-provided buffer and returns the actual count. For a positive request,
  zero means EOF. Invalid arguments, closed handles, and native read failures
  throw IOError with a nonzero error code. The native helper allocates no buffer
  and does not seek. Documentation and the generated reference cover the API.
- `ead24b10`: native regression coverage exercises reads from a real POSIX pipe,
  in addition to regular-file short reads and EOF.

Each request must fit the supplied writable buffer. Negative lengths fail; null
buffers are accepted only for zero-length reads on an open handle. A native read
failure can consume input and modify a prefix of the buffer before throwing.
File values still shallow-copy handles, and callers must close each handle once.
These helpers use the native Linux/macOS runtime.

## Validation

Checks used Bun 1.4.2 and Clang on Linux x86-64:

- `bun run lint` and `bun run check` passed.
- O0/O3 execution and LLVM verification passed for null arguments, binary chunk
  contents, short final reads, EOF, invalid lengths/buffers, closed handles, and
  attempted reads from write-only handles.
- Native filesystem tests passed at O0/O3 with AddressSanitizer and
  UndefinedBehaviorSanitizer, including allocation/read/close failures, short
  writes, untouched buffer tails, and non-seekable pipe input.
- Markdown/audit documentation and stdlib reference checks: 99 passed. The new
  chunked-read guide example also compiled in the full documentation suite.
- The CLI was rebuilt. The former null-mode crash now exits successfully, and a
  streaming smoke test prints `Read 5 binary bytes safely` for data containing
  both NUL and 0xff bytes.

The complete `bun run test:ci` passed all five stages: runtime support build,
572 integration/playground tests, 236 extension tests, generated CLI registry
validation, and 3,520 unit tests across 297 files. The 16 opt-in Docker tests were
skipped. Native macOS execution and dedicated opt-in fuzz suites were not run.
