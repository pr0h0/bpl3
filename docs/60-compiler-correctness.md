# Compiler Correctness and Fuzz Triage

BPL treats compiler correctness as a release gate. The dedicated correctness
suite compares runtime behavior at `-O0` and `-O3`, validates emitted LLVM IR
with the strongest available verifier, runs promoted fuzz regressions, and
exercises representative programs with sanitizer-backed native binaries when the
host toolchain supports them. Checked runtime failures such as null access,
division by zero, signed integer division overflow, bounds errors, and stack
overflow are part of the correctness surface; optimized builds must preserve the
same BPL-level failure category as debug builds.

## Cross-Platform CI

The `Compiler Correctness` GitHub Actions workflow runs a toolchain matrix:

- Ubuntu 24.04 with the system `clang` and a release runtime build.
- Ubuntu 24.04 with `clang-18` selected as `clang` and a debug runtime build.
- macOS 15 with Apple `clang` and a release runtime build.
- macOS 15 with Homebrew LLVM first on `PATH` and a debug runtime build.

The same workflow also has a Windows runner lane that runs
`bun run test:codegen-cross-platform`. That lane is intentionally limited to
parser, typechecker, codegen, and golden LLVM shape coverage. It validates
documented target triples, including `x86_64-pc-windows-gnu`, without requiring
Windows runtime linking or native execution support. The codegen lane also
guards optimizer-sensitive IR contracts such as preserving signed arithmetic
wrap semantics and avoiding `inbounds` assumptions for unchecked raw pointer
arithmetic.

The broad `bun run test:ci` suite runs only on the primary Ubuntu release leg.
Every matrix leg still runs `bun run check`, `bun run test:correctness`,
`bun run fuzz:validate-artifacts`, and `bun run test:sanitizers`.
`test:correctness` includes standalone wasm runtime execution and the wasm
compatibility sweep, so examples that are declared wasm-compatible must build,
instantiate, and execute under `wasm32-unknown-unknown` when `wasm-ld` is
available. CI sets `BPL_REQUIRE_WASM_LD=1` and configures `WASM_LD`, so wasm
coverage is a required gate instead of an optional skip. The compatibility
matrix in `tests/helpers/wasmCompatibilityMatrix.ts` records whether each
tracked example is `wasm-freestanding`, `wasm-hosted`, `blocked-by-host-api`,
or `native-only`.

To reproduce a matrix runtime build locally:

```bash
CC=clang BPL_RUNTIME_BUILD=release bun run build:runtime
CC=clang-18 BPL_RUNTIME_BUILD=debug bun run build:runtime
```

To reproduce the Windows-safe lane locally:

```bash
bun run test:codegen-cross-platform
```

To reproduce just the wasm toolchain, runtime, playground linker, and
compatibility coverage:

```bash
bun run test:wasm
# Match CI: require a usable wasm linker instead of skipping linker-backed tests.
BPL_REQUIRE_WASM_LD=1 bun run test:wasm
```

When a GitHub Actions run fails, ask the CI triage helper to summarize failed
steps and print focused local commands:

```bash
bun run ci:triage -- https://github.com/pr0h0/bpl3/actions/runs/<run-id>
```

Use `--json` for automation. The JSON report is versioned with
`schemaVersion: 1`, `check: "ci-triage"`, `success`, `locator`, `run`,
`checkout`, and `summary`. Use `run.headSha` to identify the exact commit that
failed and `checkout.status` to tell whether the local checkout is `current`,
`stale`, or `unknown` relative to that run. If `checkout.status` is `stale`,
reproduce on the run SHA or confirm current HEAD already fixes it before
patching. For offline triage or tests, pass a saved GitHub jobs API response
instead of calling the network:

```bash
bun run ci:triage -- --json --jobs-json jobs.json <run-id>
```

When a wasm/toolchain step fails, the triage helper prints the optional wasm
suite, the CI-required linker mode, and the local doctor report command. When
no linker is installed, optional local runs report an optional prerequisite
skip, not a successful wasm execution. Direct `WasmRuntime.test` failures also
include the focused runtime test file:

```bash
bun test tests/WasmRuntime.test.ts
bun run test:wasm
BPL_REQUIRE_WASM_LD=1 bun run test:wasm
bun index.ts doctor --json
```

Use this order for wasm CI failures: run `bun run ci:triage`, inspect
`bpl doctor --json`, then reproduce with
`BPL_REQUIRE_WASM_LD=1 bun run test:wasm`. `BPL_WASM_LINKER_UNAVAILABLE` in the
doctor report means the local optional linker probe failed; CI makes that
condition required through `BPL_REQUIRE_WASM_LD=1`.

Timeout failures in CI triage map to the same focused repro commands and
timeout knobs shown by `bpl doctor --json`. Use the focused command first, then
increase only the relevant timeout when the local host is known to be slower:

```bash
BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci
BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts
BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts
BPL_WASM_LINKER_PROBE_TIMEOUT_MS=5000 bun run test:wasm
BPL_RUN_TIMEOUT_MS=30000 bun test tests/BinaryRunner.test.ts
SANITIZER_RUNTIME_TEST_TIMEOUT_MS=30000 bun test tests/CompilerSanitizerRuntime.test.ts
```

Sanitizer-backed runtime failures are separate from BPL runtime execution
timeouts. `bun run test:sanitizers` compiles representative safe programs and
checked failure paths with `-fsanitize=address,undefined`; the focused file is
also available when a CI log points at the sanitizer suite directly:

```bash
bpl doctor sanitizer --json
bun run test:sanitizers
bun test tests/CompilerSanitizerRuntime.test.ts
```

Use this order for sanitizer CI failures: run `bun run ci:triage`, inspect
`bpl doctor sanitizer --json`, then reproduce with `bun run test:sanitizers`.
`BPL_SANITIZER_RUNTIME_UNAVAILABLE` in the doctor report means the local
compiler could not link ASan/UBSan with compiler-rt/libclang_rt. A BPL runtime
error under sanitizers is different from missing compiler-rt support: runtime
errors mean the sanitizer-backed binary ran and exposed a compiler/runtime
behavior issue, while missing compiler-rt means the local toolchain cannot build
the sanitizer binary yet.

A Bun test timeout in `CompilerSanitizerRuntime.test` means the sanitizer
harness exceeded its test budget; it is not fixed by `BPL_RUN_TIMEOUT_MS`.
`SANITIZER_RUNTIME_TEST_TIMEOUT_MS` must be a positive integer; invalid values
are ignored with a warning and the 30000ms default is used. Use
`BPL_RUN_TIMEOUT_MS` only for BPL executable runtime timeouts reported by
`BinaryRunner` or `runExecutable`.

When package JSON contract, install JSON, or `BPL_LOCKFILE_*` diagnostics fail,
the triage helper points at the focused package automation checks:

```bash
bun test tests/CLIJsonParseability.test.ts -t "package install JSON"
bun test tests/PackageJsonFailureContracts.test.ts
bun test tests/PackageManagerCLI.test.ts -t "install command|doctor packages command"
```

The triage mapping is also guarded against the exported JSON error-code
inventory. New `BPL_*` codes in the CLI registry must map to at least one local
repro command, including package install option conflicts, direct archive path
validation, package resolver diagnostics, and wasm linker diagnostics.
Each registry group also has an explicit triage coverage decision, so a new
group must either be mapped to focused repro commands or be deliberately
excluded with a reason in the triage helper tests.

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

When the scheduled `Compiler Fuzz` workflow fails, download the
`compiler-fuzz-crashes` artifact, unpack it so the metadata and source siblings
are in one directory, then ask the helper for deterministic local commands:

```bash
bun run fuzz:repro -- fuzz/crashes
```

The helper accepts an artifact directory, a single `.json` metadata file, or a
`.bpl` source with sibling metadata. It prints commands to replay the exact
artifact, run all explicit replay modes, minimize to the local `.min.bpl` path,
rerun the deterministic seed through the original pass, and promote the fixed
repro into the regression corpus. Paths are rewritten relative to the current
repository, so stale absolute paths from CI metadata do not leak into local
triage commands.

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
- `differential` verifies emitted LLVM IR, then compares `-O0` and `-O3`
  runtime behavior. For checked BPL runtime failures it compares the failure
  category instead of raw stack-trace text, because native addresses vary
  between runs.
- `sanitizer` compiles and runs with `-fsanitize=address,undefined`.

LLVM verification prefers `opt -passes=verify`, then `llvm-as`, then `llc`, and
falls back to clang object compilation when dedicated LLVM tools are not
available. This catches malformed generated IR before native linking hides the
problem behind a broader compile failure.

The default replay behavior still validates that an artifact reproduces its
recorded failure signature:

```bash
bun run fuzz:replay -- --metadata fuzz/crashes/crash_seed-...json
```

## Triage Loop

1. Run fuzzing with `FUZZ_MINIMIZE=1`, or download the scheduled workflow's
   `compiler-fuzz-crashes` artifact.
2. Run `bun run fuzz:repro -- fuzz/crashes` to print deterministic local
   commands for every saved artifact.
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
