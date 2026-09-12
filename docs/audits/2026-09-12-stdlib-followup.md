# Standard library follow-up — 2026-09-12

This batch implements the five planned follow-up items after the
[JSON numeric expansion](2026-09-12-stdlib-json.md), with separate commits for
additional compiler defects found by the regressions.

## Implemented changes

- `e78d7e2a`: `String.replaceAll` counts and copies non-overlapping matches from
  the original input. Replacements are not rescanned; expanding replacements
  terminate. Null/empty search, deletion, ownership, and size limits are covered.
- `e17d1e0e`: replace the unsafe `IO.readLine(buffer)` API with
  `IO.readLine(buffer, capacity) ret LineReadResult`. Callers distinguish complete
  input, truncation, EOF, invalid buffers, and native stream errors. Oversized
  lines are drained; valid buffers stay NUL-terminated. The demo and guide use
  the new API. **This is a source-breaking API change.** Rebuild native runtime
  support with `bun run build:runtime`; Docker users must rebuild the worker image.
- `0ec3935c`: UUID v4 uses native OS entropy. `tryV4` preserves the destination
  on failure; `v4` throws instead of using predictable fallback data. Tests inject
  an entropy failure and check repeated generation, version/variant bits, and
  round-trips. Generation requires native `getentropy` support.
- `be44ee5e`: random fractions use unsigned normalization, integer ranges use
  wide arithmetic and rejection sampling, floating ranges avoid overflowing the
  bound difference, and Gaussian samples use Box–Muller with native math.
- `cdb53ae4`: reflection resolves non-generic fixed-array aliases and alias
  chains, including fields and pointers. Struct and array sizes come from LLVM's
  actual layout, preventing undersized JSON allocations for array-alias fields.

## Compiler fixes found during validation

- `a2284fc0`: LLVM string escaping encodes complete UTF-8 sequences, fixing
  astral Unicode literals such as emoji (BUG-288).
- `d42761c7`: string exceptions no longer require the program to import printf;
  the uncaught fallback uses the runtime stderr writer (BUG-289).
- `dc20a3d5`: command discovery uses a separate option parser, preventing duplicate
  `--object` and `--clang-flag` values during final parsing (BUG-292).

- `523db6fa`: provide the runtime stderr writer in freestanding and hosted Wasm.
  This fixes a regression from the exception fallback change (BUG-293); all 47
  Wasm runtime/import-contract tests pass, including uncaught string exceptions.

## Validation

Local validation uses Bun 1.4.2 and Clang 21.1.8 on Linux x86-64.

- TypeScript type checking and generated stdlib reference check passed.
- New runtime regressions execute at O0/O3. String replacement, astral strings,
  and array-alias JSON tests also verify LLVM IR.
- Random-number tests compare deterministic fractions and ranges with an
  independent JavaScript/BigInt model, verify Box–Muller output, and check moments
  over 20,000 samples. This does not certify the statistical quality of the LCG.
- Native line-reading C code was separately compiled with ASan/UBSan at O0/O3.
  A 100,000-byte line was truncated safely, the next line read correctly, and
  EOF and buffer guards passed. These checks instrument the runtime helper itself.

CI-safe validation results:

- Runtime support build: passed.
- Integration/playground suite: 572 passed, zero failures.
- VS Code extension suite: 236 passed, zero failures.
- Generated CLI registry check: passed.
- The first CI-safe unit run passed 3,483 tests and exposed three hosted Wasm
  failures. After fixing the missing runtime writer, all 47 Wasm runtime/import
  contract tests passed, including the new exception regression.
- The **complete CI-safe unit stage was rerun** against the final code: 3,487
  passed, zero failures, 16 opt-in Docker skips across 275 files. The earlier
  native integration/extension stages were not rerun for the Wasm-only follow-up.
- TypeScript type checking passed again after the Wasm test change.

Dedicated fuzz and release-smoke suites excluded by the CI-safe plan were not
separately rerun. Docker was not exercised for this batch.

## Remaining limitations

- Generic array aliases still lose type substitution through pointers; generic
  JSON root parsing can produce incompatible casts (BUG-290). Use concrete array
  types for these cases. Non-generic aliases are supported.
- Other compiler consumers of manual size estimates have not been comprehensively
  audited (BUG-291). The reflection fix uses LLVM sizes directly.
- Rand remains a deterministic LCG with correlations and limited state. Its
  low-bit bool/byte helpers have short repeating patterns, and weighted-choice
  totals are not checked. These limits are documented in the API guide.
- New native line input and entropy-backed UUID generation are not browser/Wasm
  APIs. Native macOS behavior is left to platform CI; local runtime tests ran on
  Linux.
- JSON unsigned integers and additional numeric widths remain future expansion.
