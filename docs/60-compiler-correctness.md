# Compiler Correctness and Fuzz Triage

BPL treats compiler correctness as a release gate. The dedicated correctness
suite compares runtime behavior at `-O0` and `-O3`, validates emitted LLVM IR,
runs promoted fuzz regressions, and exercises representative programs with
sanitizer-backed native binaries when the host toolchain supports them.

## Cross-Platform CI

The `Compiler Correctness` GitHub Actions workflow runs a toolchain matrix:

- Ubuntu 24.04 with the system `clang` and a release runtime build.
- Ubuntu 24.04 with `clang-18` selected as `clang` and a debug runtime build.
- macOS 15 with Apple `clang` and a release runtime build.
- macOS 15 with Homebrew LLVM first on `PATH` and a debug runtime build.

The broad `bun run test:ci` suite runs only on the primary Ubuntu release leg.
Every matrix leg still runs `bun run check`, `bun run test:correctness`,
`bun run fuzz:validate-artifacts`, and `bun run test:sanitizers`.

To reproduce a matrix runtime build locally:

```bash
CC=clang BPL_RUNTIME_BUILD=release bun run build:runtime
CC=clang-18 BPL_RUNTIME_BUILD=debug bun run build:runtime
```

`BPL_RUNTIME_BUILD=debug` compiles `runtime_support.c` with `-O0 -g3`.
`BPL_RUNTIME_BUILD=release` compiles it with `-O2 -g`.

## Fuzz Failure Artifacts

Fuzz campaigns can save both the original failing source and a minimized repro:

```bash
FUZZ_MINIMIZE=1 FUZZ_MINIMIZE_PASSES=8 bun run fuzz:differential
```

For each crash or O0/O3 mismatch, the fuzzer writes:

- `<kind>_seed-..._iter-..._<lane>.bpl` - original repro source.
- `<kind>_seed-..._iter-..._<lane>.min.bpl` - token-minimized repro when minimization is enabled.
- `<kind>_seed-..._iter-..._<lane>.json` - metadata with seed, pass, stage, failure kind, replay command, minimization stats, and O0/O3 expected/actual output for mismatches.

The `pass` field is the fuzz iteration within the seed. For differential
artifacts, `expected` is the `-O0` result and `actual` is the `-O3` result.

## Replay Modes

Use one artifact to rerun every compiler stage that matters during triage:

```bash
bun run fuzz:replay -- --metadata fuzz/crashes/mismatch_seed-...json --mode parser,typecheck,codegen,runtime,differential,sanitizer
```

Modes:

- `parser` lexes and parses the saved source.
- `typecheck` stops after semantic checks.
- `codegen` runs LLVM generation without executing the program.
- `runtime` compiles and runs at `-O0`.
- `differential` compares `-O0` and `-O3` runtime behavior.
- `sanitizer` compiles and runs with `-fsanitize=address,undefined`.

The default replay behavior still validates that an artifact reproduces its
recorded failure signature:

```bash
bun run fuzz:replay -- --metadata fuzz/crashes/crash_seed-...json
```

## Triage Loop

1. Run fuzzing with `FUZZ_MINIMIZE=1`.
2. Upload or inspect `fuzz/crashes`.
3. Replay the `.json` artifact with explicit modes to locate the failing phase.
4. Fix the compiler or runtime bug.
5. Promote the minimized repro:

```bash
bun run fuzz:promote -- --metadata fuzz/crashes/crash_seed-...json --name "bug-name"
bun run fuzz:promote -- --metadata fuzz/crashes/mismatch_seed-...json --differential --name "wrong-code-name"
```

6. Run the validation gate:

```bash
bun run fuzz:validate-artifacts
bun run test:correctness
```

If a saved failure remains active instead of being promoted, place its `.bpl`
and `.json` files under `tests/fuzz-failure-artifacts/`. The validator requires
each saved failure to still reproduce, unless its metadata has `promotedTo`
pointing at a regression corpus file.
