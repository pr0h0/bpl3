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
It delegates to the typed runner in `tools/test_ci.ts`, which keeps the suite
order and heavyweight exclusions out of `package.json`. Use
`bun tools/test_ci.ts --list` or `bun tools/test_ci.ts --dry-run` to inspect the
planned commands without executing them; use `bun tools/test_ci.ts --json` when
automation needs the versioned plan. `bun tools/test_ci.ts --help` prints usage
on stdout. Unknown test_ci options exit with status 2 on stderr while stdout
stays empty. The runner builds runtime support first, runs
`tests/Integration.test.ts` and `tests/PlaygroundExamples.test.ts`, runs the VS
Code extension suite, checks the generated `bpl-v3/cli` registry shim with
`bun run release:cli-registry`, then runs discovered top-level CI-safe unit
tests. It intentionally excludes the full correctness corpora, long fuzz
runners, sanitizer runtime suite, golden LLVM shape suite, and full release
smoke suite because those have dedicated scripts and CI jobs.
CI-safe unit discovery includes `tests/CiTriage.test.ts`, so offline jobs-json
diagnostics run in the broad suite. Focus that path directly with:

```bash
bun test tests/CiTriage.test.ts -t "unreadable and malformed jobs-json"
```

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

Integration/example concurrency can be limited with `BPL_INTEGRATION_JOBS`.
`BPL_INTEGRATION_JOBS` must be a positive integer; malformed values are ignored
with a warning and the auto-detected integration job count is used. The focused
contract for that parsing is:

```bash
bun test tests/IntegrationRunner.test.ts
```

ci:triage maps `BPL_INTEGRATION_JOBS` and integration concurrency failures to
that helper test, a bounded `BPL_INTEGRATION_JOBS=4 bun run test:ci` repro, and
the full `bun run test:ci` suite.

Integration examples use `examples/**/test_config.json` to declare expected
runtime behavior. The harness validates these files before running examples.
Unsupported keys fail with the config file path instead of being silently
ignored. Supported execution fields are:

- `expectedOutput`: string or string array. Each listed line must appear in the
  combined stdout/stderr stream.
- `exitCode`: expected process exit status. Omit it for the default `0`.
- `args`: string array appended after the example path.
- `env`: object of string environment overrides.
- `input`: stdin string passed to the example.
- `timeout`: positive integer timeout in milliseconds.
- `skip_compilation`: boolean that skips the example in the integration suite.

Use canonical camelCase keys. Legacy `expected_output` is rejected because older
configs with that key were ignored by the harness and skipped their output
assertions. Focused config validation commands:

```bash
bun test tests/IntegrationConfig.test.ts
bun test tests/Integration.test.ts -t "valid for the integration harness"
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

Accepted run locators are a numeric run ID, a GitHub Actions run URL, or a
GitHub Actions job URL:

```bash
bun run ci:triage -- <run-id>
bun run ci:triage -- https://github.com/pr0h0/bpl3/actions/runs/<run-id>/job/<job-id>
```

Malformed run IDs, malformed URLs, non-GitHub URLs, non-actions URLs, and
invalid job URL IDs report usage errors before any GitHub API request. Common
local validation diagnostics include `Invalid GitHub Actions run id: <value>`,
`Expected a numeric GitHub Actions run id or github.com Actions run URL, got <value>`,
and `Invalid GitHub Actions job id in <url>`. Focus that validation path with:

```bash
bun test tests/CiTriage.test.ts -t "invalid run locators"
```

`--repo` must be `owner/name` when triaging a repository other than the
default. Invalid repository values report
`Expected --repo as owner/name, got <value>`. Repository validation is a usage
error before any GitHub API request, so it is different from authentication,
rate-limit, or missing-run failures from GitHub.

Text output uses stable labels for the run summary, failed jobs, failed steps,
and local repro commands:

```text
GitHub Actions triage: pr0h0/bpl3 run <run-id>

Failed jobs:
- Ubuntu system clang release (job <job-id>)
  failed steps:
  - Run CI-safe test suite
  local repro:
  - bun run test:ci
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

`--jobs-json` diagnostics are usage errors reported before any GitHub API
request. Missing offline jobs files report
`Unable to read --jobs-json file <path>: file does not exist.` Malformed
offline jobs files report `Unable to parse --jobs-json file <path>:` followed
by the parser reason. Wrong-shape offline jobs fixtures report
`Expected --jobs-json file <path> to contain a GitHub jobs API response with a jobs array.`

When text triage output says `No focused local repro command matched this job`:
Inspect the failed step logs first, and add a ci:triage mapping when the failure
pattern is recurring so future runs print a focused local command.

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

Playground browser wasm failures are separate from wasm linker failures. When
the failing step mentions `PlaygroundBrowserWasmRuntime.test`,
`BplWasmHostAdapter.runHostedWasmInBrowser`, or the browser-only compiler hook,
triage should point at the browser-facing contracts first:

```bash
bun test tests/PlaygroundBrowserWasmRuntime.test.ts tests/PlaygroundWasmHostAdapter.test.ts tests/PlaygroundStaticAssets.test.ts tests/WasmHostImportContract.test.ts
bun run test:wasm
bun run check
```

`BplBrowserCompiler.compileToHostedWasm` is a browser compiler-bundle hook, not
a `wasm-ld` prerequisite. Missing it means the playground can still execute
hosted wasm in the browser after the backend `/wasm` endpoint compiles the
module.

The hook contract is intentionally small. The playground calls
`BplBrowserCompiler.compileToHostedWasm({ code, args })`, then sends the
returned `wasmBase64` to
`BplWasmHostAdapter.runHostedWasmInBrowser(wasmBase64, args)`. See
`playground/README.md` for the documented request and response fields.

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
When compiler-rt is unavailable, `CompilerSanitizerRuntime.test` reports Bun
skipped tests instead of counting the sanitizer runtime assertions as successful
execution. That skip is an optional prerequisite skip, not a successful
sanitizer-backed runtime run.

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

Package docs smoke failures map to the focused package/import docs examples and
package documentation checks. Use the JSON smoke when the failure mentions
`CLIJsonParseability.test` or `package/import docs examples`; use the
MarkdownDocs smoke when the failure mentions package docs smoke snippets:

```bash
bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"
bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"
```

Release registry sync failures map to `bun run release:cli-registry`. Use
`bun run release:cli-registry` before broader release smoke when `ci:triage`
reports a stale CLI registry shim, because it checks the generated packed
`bpl-v3/cli` shim and declaration files against the implementation registry.

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

### Fuzz Helper Usage Diagnostics

Fuzz helper usage diagnostics are status 2 failures before artifact discovery,
campaign startup, replay, promotion, or packed source-checkout delegation.
`bun run fuzz:repro` rejects flag values such as `--json=true`, empty artifact
options such as `--input=`, and mixed positional and `--input` artifact paths.
`bun run fuzz` rejects malformed boolean values such as `--minimize maybe` and
empty required values such as `--iterations=`.

Focus those contracts directly with:

```bash
bun test tests/FuzzArtifactRepro.test.ts -t "malformed CLI option values"
bun test tests/CompilerFuzzRunner.test.ts -t "fuzz package wrappers reject malformed option values"
bun test tests/ReleaseHelperSmoke.test.ts -t "exercises packed helper usage paths"
```

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
