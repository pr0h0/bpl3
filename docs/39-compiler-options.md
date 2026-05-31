# Compiler Options

The BPL compiler (`bpl`) provides a comprehensive command-line interface with various commands and flags.

## Commands

### `bpl run <file> [args...]`

Compile and execute a BPL program.

**Examples:**

```bash
# Run a program
bpl run hello.bpl

# Pass arguments to the program
bpl run hello.bpl arg1 arg2

# Run with optimization
bpl run hello.bpl -O 2
```

### `bpl dev <file> [args...]`

Development mode with watch and auto-run.

**Options:**

- `--clear`: Clear screen on each recompile
- `--no-run`: Only compile, don't execute

**Examples:**

```bash
# Watch and run
bpl dev main.bpl

# Watch with screen clearing
bpl dev main.bpl --clear

# Watch but only compile
bpl dev main.bpl --no-run
```

### `bpl build <file>`

Explicitly compile a program.

**Examples:**

```bash
# Basic compilation
bpl build hello.bpl

# Specify output file
bpl build hello.bpl -o myprogram

# Build with incremental module cache stats
bpl build main.bpl --cache --jobs 4 --cache-stats

# Build with a machine-readable result report
bpl build main.bpl --json
```

`--cache-stats` prints the module cache summary for cached builds:

```text
Executable created: ./main
Cache stats: modules=11 hits=8 misses=3 compiled=3 reused=8 jobs=4 sizeKb=304.64
```

Use this when tuning compile times or checking whether a dependency change
invalidates more modules than expected.

### `bpl check <files...>`

Type check files without generating code (fast).

**Examples:**

```bash
# Check single file
bpl check main.bpl

# Check multiple files
bpl check src/*.bpl

# JSON output
bpl check main.bpl --json
```

`--json` reports rich diagnostics with `code`, `severity`, source ranges, and a
source-line preview. Use it in editor integrations and CI tools that need
machine-readable error locations instead of terminal-formatted snippets.

### `bpl new <name>`

Create a new BPL project.

Project names must be valid package names: lowercase letters, numbers, and
hyphens only. Pass a name, not a path; create the parent directory first if you
want the project somewhere else.

**Examples:**

```bash
bpl new my-project
bpl new my-library --template library
```

Templates:

- `app` (default): executable project with `main.bpl` and `lib/`
- `library`: package-oriented project with `src/index.bpl`, an exported public
  API, and `examples/usage.bpl`

Use `--no-git` to skip git initialization.

### `bpl install`

Install project dependencies from `bpl.json` or restore the exact packages
recorded in `bpl.lock`.

```bash
bpl install
bpl install --locked
bpl install --update
bpl install --repair-lock
```

`--locked` verifies the lockfile without mutating `bpl_modules/`. `--update`
re-resolves manifest dependency selectors such as `^1.2.0` against the package
cache and rewrites `bpl.lock`. `--repair-lock` rewrites lockfile versions and
hashes from currently installed packages and removes stale entries.

### `bpl doctor`

Check the local BPL installation, runtime artifacts, and host toolchain.

```bash
bpl doctor
bpl doctor --json
bpl doctor packages
bpl doctor packages --json
```

The JSON form is intended for bug reports and CI diagnostics. It reports
`schemaVersion: 1`, `check: "toolchain"`, `success`, `BPL_HOME`, platform
details, runtime file presence, whether the configured native compiler
(`BPL_CC`, `CC`, or `clang`) is available, the configured wasm compiler
(`BPL_WASM_CC`, `WASM_CC`, or `clang`), the object symbol tool (`BPL_NM`, `NM`,
or `nm`), the package archive tool (`BPL_TAR`, `TAR`, or `tar`), and wasm linker
readiness. Missing core runtime files are failures; missing optional
wasm/linker/object-symbol/archive/verifier tools are reported as warnings unless
the current workflow explicitly requires them.

`bpl doctor packages` checks the current package project: manifest validity,
lockfile verification, missing transitive dependencies, unreachable lockfile
sources, duplicate installed package names, package cache provenance warnings,
and the dependency tree. Use `bpl package-cache repair` to regenerate missing
or malformed provenance sidecars for otherwise valid cached archives.

### `bpl clean`

Remove build artifacts. In git repositories, tracked files are skipped so
checked-in runtime IR, examples, or release artifacts are not removed by
accident. If `build/`, `dist/`, or `.bpl-cache/` contains tracked files,
`bpl clean` preserves the directory and tracked contents while still removing
untracked build artifacts inside it.
The git tracked-file probe is bounded by `BPL_CLEAN_GIT_TIMEOUT_MS`, defaulting
to 5000 milliseconds; if the probe fails or times out inside a git repository,
`bpl clean` refuses to remove files.

**Options:**

- `--dry-run`: Show what would be deleted
- `-v, --verbose`: Verbose output
- `--json`: Output a machine-readable cleanup report. Entries report their
  path and kind as `file`, `directory`, or `symlink`.

**Examples:**

```bash
bpl clean
bpl clean --dry-run
bpl clean --dry-run --json
```

### `bpl format [files...]`

Format BPL source files.

**Options:**

- `-w, --write`: Write formatted output back to files
- `--check`: Verify formatting without rewriting files

**Examples:**

```bash
bpl format main.bpl
bpl format -w main.bpl
bpl format --check src/*.bpl
```

Use `--check` in CI. It exits non-zero when any input would be changed.

### `bpl lint [files...]`

Lint BPL source files for style and package-quality issues.

**Options:**

- `--json`: Output lint diagnostics in JSON format
- `-v, --verbose`: Verbose output

**Examples:**

```bash
bpl lint src/*.bpl
bpl lint --json src/*.bpl
```

## Common Flags

Flag availability depends on the command; run `bpl <command> --help` for the exact set.

- `-o <file>`: Output file name on the default compile command and `bpl build`
- `-v, --verbose`: Verbose compiler output
- `-q, --quiet`: Suppress non-error output
- `-O <level>`: Optimization level (0, 1, 2, or 3)
- `-d, --dwarf`: Generate DWARF debug information on the default compile command
- `--debug`: Generate DWARF debug information on `run`, `dev`, and `build`
- `--time`: Show compilation time statistics
- `--cache`: Enable incremental compilation
- `--cache-stats`: Show incremental cache hit/miss statistics
- `--json`: Output in JSON format where supported, especially `bpl check`, `bpl lint`, and `bpl doctor`
- `--color`: Force colored output
- `--no-color`: Disable colored output

### Machine-readable JSON contracts

JSON-capable commands write machine-readable data to stdout. Human-readable
logger text belongs on stderr for non-JSON failures; JSON-mode failures that are
part of a command's validation path use stdout with `success: false` or
`ok: false` so CI and editor integrations can parse the result consistently.

| Command | Stable stdout shape |
| --- | --- |
| `bpl build --json` | Build result report with `schemaVersion`, `check: "build"`, `success`, `file`, `emit`, `target`, `cache`, and output artifact paths; JSON-mode build failures return `success: false` with `error` on stdout and include `diagnostics` when the failure comes from compiler diagnostics. Build validation failures such as invalid `-O`, `--emit`, `--wasm-runtime`, `--jobs`, input path, and output path errors are stdout-only JSON reports and do not leave failed LLVM or executable artifacts behind. |
| `bpl check --json` | Type-check report with `schemaVersion`, `check: "check"`, `success`, `totalFiles`, `errorCount`, `timeMs`, and per-file diagnostics or validation errors. |
| `bpl lint --json` | Lint report with `schemaVersion`, `check: "lint"`, `success`, `totalFiles`, `errorCount`, and per-file diagnostics or validation errors. |
| `bpl doctor --json` / `bpl doctor <unknown> --json` | Toolchain report with `schemaVersion`, `check: "toolchain"`, `success`, `version`, `platform`, `bplHome`, and `checks`. Unknown doctor scopes in JSON mode return `schemaVersion`, `check: "doctor"`, `success: false`, and `error`. |
| `bpl doctor packages --json` | Package project report with `schemaVersion`, `check: "packages"`, `success`, legacy `ok`, lockfile data, installed packages, dependency tree, cache verification, and structured issues. |
| `bpl package-cache list [package] --json` | Cache entry report with `schemaVersion`, `check: "package-cache-list"`, `success`, and the existing cache entry payload under `entries`. |
| `bpl package-cache verify [package] --json` | Cache verification report with `schemaVersion`, `check: "package-cache-verify"`, `success`, legacy `ok`, `entriesChecked`, and provenance `issues`. |
| `bpl package-cache clean [package] --json` / `bpl package-cache repair [package] --json` | Cache maintenance reports with `schemaVersion`, `check: "package-cache-clean"` or `check: "package-cache-repair"`, `success`, `dryRun`, and the existing removed/repaired/unchanged/issues payloads. |
| `bpl run-script --list --json` / `bpl run-script <name> --json` failures | Script list with `schemaVersion`, `check: "run-script-list"`, `success: true`, and `scripts`; manifest or list validation failures return the same `schemaVersion`/`check` with `success: false` and `error` on stdout. Named-script validation failures use `check: "run-script"`. |
| `bpl clean --dry-run --json` | Cleanup preview with `schemaVersion`, `check: "clean"`, `success`, `dryRun`, `count`, and `entries`; use `bpl clean --json` to remove and report the same entry shape. |
| `bpl list --json` / `bpl list --tree --json` | Package inspection reports with `schemaVersion`, `check: "package-list"` or `check: "package-list-tree"`, `success`, `scope`, and the existing installed package summaries or dependency tree data. |

Import-resolution failures use the same diagnostic objects as type errors.
`bpl check --json` reports missing modules, unsafe `std/` paths, and package
metadata failures under each file's `diagnostics` array while preserving
`totalFiles` and `errorCount`. `bpl build --json` reports the first compiler
diagnostic failure with `success: false`, the formatted `error` string for
backward compatibility, and a `diagnostics` array with source file locations.

### CLI JSON compatibility policy

Machine-readable CLI JSON is a tooling contract. Consumers should check both
`schemaVersion` and `check`, handle `success: false` reports on stdout where a
command documents JSON-mode validation failures, and ignore unknown fields.

Backward-compatible additions may add optional fields, new array/object members,
or new command-specific reports under the same `schemaVersion` when existing
field names, types, meanings, and stdout/stderr routing stay intact.

Breaking JSON shape changes must bump `schemaVersion` and update tests and
documentation. Breaking changes include removing or renaming documented fields,
changing field types or meanings, changing stable `check` values, moving
documented JSON-mode failures away from stdout, or replacing an array/object
payload with an incompatible shape.

## Direct Code Compilation

For quick testing without files:

- `-e, --eval <code>`: Compile code passed directly on the command line
- `--stdin`: Compile code read from standard input

**Examples:**

```bash
# Evaluate code directly
bpl -e 'frame main() ret int { return 0; }'

# Read from stdin
cat hello.bpl | bpl --stdin

# Emit AST from eval
bpl -e 'frame main() { }' --emit ast
```

## Development Mode

The `bpl dev` command provides watch mode for rapid development. It monitors your BPL source files for changes and automatically recompiles and optionally runs them.

### Features

- **Automatic Recompilation**: Detects changes to `.bpl` files and recompiles automatically
- **Auto-Run**: Executes your program after successful compilation (use `--no-run` to disable)
- **Error Recovery**: Continues watching even if compilation fails
- **Debouncing**: Prevents excessive recompilation from rapid file changes (100ms delay)
- **Recursive Watching**: Watches all `.bpl` files in the directory tree
- **Smart Filtering**: Ignores `node_modules`, `.git`, `bpl_modules`, and hidden directories
- **Screen Clearing**: Optional screen clear on recompile with `--clear`

### Usage

```bash
# Basic watch and run
bpl dev main.bpl

# Watch and run with screen clearing
bpl dev main.bpl --clear

# Watch but only compile (don't run)
bpl dev main.bpl --no-run

# Watch with verbose output
bpl dev main.bpl -v
```

### Example Session

```bash
$ bpl dev main.bpl
[Watch] Starting watch mode...
[Watch] Watching directory: /path/to/project
[Watch] Entry point: main.bpl
[Watch] Press Ctrl+C to stop

[12:00:00] Compiling /path/to/project/main.bpl...
Hello, World!
[12:00:00] ✓ Compilation successful

[Watch] Found 3 BPL files to watch

[Watch] Watching for changes...

# (File is edited and saved)
[Watch] File changed: /path/to/project/main.bpl
[12:00:15] Compiling /path/to/project/main.bpl...
Hello, BPL!
[12:00:15] ✓ Compilation successful
```

### Error Handling

If your code has errors, watch mode will display them and continue watching:

```bash
[12:01:00] Compiling /path/to/project/main.bpl...
error[main.bpl:5:5]: Undefined symbol 'foo'
     3 | frame main() ret int {
     4 |     local x: int = 10;
>    5 |     foo();
       |      ^^^
     6 |     return 0;
     7 | }

help: Check if the symbol is declared.

1 error
[12:01:00] ✗ Compilation failed

# Still watching - fix the error and it will recompile
```

### Limitations

- Development mode only supports a single entry file (not multiple files at once)
- Use Ctrl+C to stop watching

## Emit Types

Control what the compiler outputs:

- `llvm` (default): Generate LLVM IR
- `ast`: Output Abstract Syntax Tree as JSON
- `tokens`: Output lexical tokens
- `formatted`: Format the source code (same as `bpl format`)

**Examples:**

```bash
# Generate LLVM IR
bpl build main.bpl --emit llvm

# Output AST for tooling
bpl build main.bpl --emit ast > ast.json

# View tokens
bpl build main.bpl --emit tokens
```

## Optimization Levels

Control code optimization with `-O`:

- `-O 0`: No optimization (default, fastest compilation)
- `-O 1`: Basic optimization
- `-O 2`: Moderate optimization (recommended for production)
- `-O 3`: Aggressive optimization (may increase compilation time)

**Examples:**

```bash
# Development build (fast compilation)
bpl run main.bpl -O 0

# Production build (optimized)
bpl build main.bpl -O 2 -o myapp
```

Set `BPL_RUN_TIMEOUT_MS` to a positive millisecond value when CI or scripts
need compiled program execution to fail instead of hanging indefinitely. When
unset, `bpl run` preserves normal unbounded program execution.

## Debug Information

Generate DWARF debug information for debugging with gdb/lldb:

```bash
# Enable debug info
bpl build main.bpl --debug
```

## Cross-Compilation

Compile for different target platforms:

**Flags:**

- `--target <triple>`: Target platform triple
- `--march <arch>`: Target architecture
- `--cpu <cpu>`: Specific CPU model
- `--sysroot <path>`: Sysroot for cross-compilation
- `--clang-flag <flag>`: Pass additional flags to clang

Native binary builds, object-file linking, and cached module compilation use
`BPL_CC`, then `CC`, then `clang` to select the C/LLVM driver. WebAssembly
builds use `BPL_WASM_CC`, then `WASM_CC`, then `clang`. Cached object keys
include the selected driver, target, sysroot, optimization level, target
CPU/architecture flags, and forwarded compiler flags so incompatible toolchain
invocations do not reuse stale objects.
Direct binary compiler-driver invocations are bounded by
`BPL_COMPILE_DRIVER_TIMEOUT_MS`, defaulting to 600000 milliseconds.
Package archive operations use `BPL_TAR`, then `TAR`, then `tar`, and are
bounded by `BPL_PACKAGE_TOOL_TIMEOUT_MS`, defaulting to 300000 milliseconds.
When inspecting precompiled object-file symbols, BPL uses `BPL_NM`, then `NM`,
then `nm`. Object symbol parsing is bounded by
`BPL_OBJECT_SYMBOL_TIMEOUT_MS`, defaulting to 30000 milliseconds.
LLVM IR verification uses `BPL_OPT`/`OPT`, `BPL_LLVM_AS`/`LLVM_AS`,
`BPL_LLC`/`LLC`, then the selected native compiler driver.
Package IR verification during `bpl pack` uses the selected native compiler
driver and is bounded by `BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS`, defaulting to
30000 milliseconds.

**Supported Targets:**

These triples are covered by code generation smoke tests. They confirm that the
compiler emits target metadata and LLVM IR for each target. Native binary
linking and execution still require an appropriate host toolchain, sysroot, C
runtime, and runtime support for that platform.

- `x86_64-pc-linux-gnu` (Linux x64)
- `aarch64-unknown-linux-gnu` (Linux ARM64)
- `arm64-apple-darwin` (macOS ARM64)
- `x86_64-apple-darwin` (macOS x64)
- `x86_64-pc-windows-gnu` (Windows x64)
- `wasm32-unknown-unknown` (WebAssembly 32-bit)

**Examples:**

```bash
# Cross-compile for ARM64 Linux
bpl build main.bpl --target aarch64-unknown-linux-gnu

# Emit and link for Windows from Linux when a Windows-capable clang/sysroot is installed
bpl build main.bpl --target x86_64-pc-windows-gnu

# Build a WebAssembly artifact
bpl build main.bpl --target wasm32-unknown-unknown -o main.wasm

# Build a WebAssembly artifact that imports host I/O, argv, exit, and error hooks
bpl build main.bpl --target wasm32-unknown-unknown --wasm-runtime host -o main.wasm

# Emit WebAssembly-targeted LLVM IR next to the artifact
bpl build main.bpl --target wasm32-unknown-unknown --emit llvm -o main.wasm

# Specify architecture details
bpl build main.bpl --target aarch64-unknown-linux-gnu --march=armv8-a

# Use custom sysroot
bpl build main.bpl \\
  --target aarch64-unknown-linux-gnu \\
  --sysroot /opt/cross/aarch64-linux-gnu
```

## Linking Options

Control library linking:

- `-l, --lib <lib>`: Link with a library
- `-L, --lib-path <path>`: Add library search path
- `--object <file>`: Link with object file

**Examples:**

```bash
# Link with math library
bpl build main.bpl -l m

# Add library search path
bpl build main.bpl -L /usr/local/lib -l mylib

# Link with object files
bpl build main.bpl --object utils.o --object helpers.o
```

## Output Control

- `-q, --quiet`: Suppress non-error messages
- `-v, --verbose`: Show detailed compilation steps
- `--json`: Output results in JSON format (useful for tooling)
- `--time`: Show compilation time statistics
- `--color`: Force colored output
- `--no-color`: Disable colored output

**Examples:**

```bash
# Quiet compilation
bpl build main.bpl -q

# Verbose output for debugging
bpl build main.bpl -v

# Time the compilation
bpl build main.bpl --time

# JSON output for CI/CD
bpl check main.bpl --json
```

## Caching

Enable incremental compilation with module caching:

```bash
# Enable caching for faster rebuilds
bpl build main.bpl --cache
```

Cached modules are stored in `.bpl-cache/`. Cache entries include the compiler
module-cache format version, target, optimization level, compiler driver,
sysroot, and extra clang flags, so stale manifests from older cache formats are
ignored automatically. Symlinked, broken-symlink, or symlink-parent
`.bpl-cache` paths are rejected before cached object writes, manifest writes,
and cache cleaning. Cached-object lookups and cache stats ignore object files
that are only reachable through symlinked parents instead of reusing external
cache files. Use `bpl clean` to clear cache manually.
The module cache backend can compile independent LLVM module inputs with a
bounded parallel job pool; the current CLI cache path still emits one combined
program object until true per-module IR generation is wired into the front end.

## WebAssembly Output

When targeting `wasm32-unknown-unknown`, `bpl build` uses the WebAssembly
linker path instead of native Linux/macOS linker flags. If `wasm-ld`/`ld.lld`
is available, BPL links a standalone no-entry module and includes the
freestanding `runtime_wasm.ll` shim. If the linker is unavailable, BPL still
emits a relocatable wasm object so CI and cross-toolchains can consume the
artifact without requiring a host-native wasm linker.
Set `BPL_REQUIRE_WASM_LD=1` to make a missing wasm linker a hard error; CI uses
this mode so wasm runtime execution cannot silently downgrade to object-only
coverage.
Set `WASM_LD` to force an explicit wasm linker path; when it is set, BPL does
not fall back to other linker names on `PATH`. Wasm linker discovery probes are
bounded by `BPL_WASM_LINKER_PROBE_TIMEOUT_MS`, defaulting to 5000 milliseconds.

Set `BPL_WASM_CC` or `WASM_CC` when the default `clang` on PATH cannot compile
WebAssembly targets. This is useful on macOS when native builds should continue
using Apple `clang`, but wasm builds need Homebrew LLVM:

```bash
BPL_WASM_CC="$(brew --prefix llvm)/bin/clang" \
WASM_LD="$(brew --prefix lld)/bin/wasm-ld" \
bpl build main.bpl --target wasm32-unknown-unknown -o main.wasm
```

The default wasm runtime is freestanding. It supports pure BPL control flow,
enums, generics, lambdas, simple memory allocation, memory intrinsics
(`memcpy`, `memmove`, `memset`), and small helpers such as `strlen`, `strcmp`,
`strncmp`, `strcpy`, `strcat`, and `atoi`. Formatting and debug-only C symbols
that can be pulled in by stdlib modules are present as no-op stubs so unused
methods do not prevent standalone wasm linking.

Use `--wasm-runtime host` when the module should communicate with a browser,
WASI-style adapter, or test harness. Hosted wasm imports `env.__bpl_host_write`,
`env.__bpl_host_exit`, `env.__bpl_host_argc`, `env.__bpl_host_argv_len`,
`env.__bpl_host_argv_copy`, and `env.__bpl_host_error`. The host adapter routes
basic `printf`/`dprintf`/`write`/`puts`/`putchar`, argv access, `exit`, and
checked BPL runtime errors through those imports. That import list is a tested
contract across `lib/runtime_wasm_host.ll`, the browser playground adapter, and
the wasm runtime test harness, so adding or removing hosted wasm imports should
update all three surfaces together. Hosted `printf`, `fprintf`, and `dprintf`
implement a small browser-safe formatting subset: `%s` for null-terminated
strings, `%d` for signed 32-bit integers, `%c` for one byte, and `%%` for a
literal percent sign. Unsupported format specifiers are emitted literally with
their leading `%` so output remains predictable. Edge cases are also stable:
null `%s` arguments print `(null)`; a dangling `%` prints as `%`;
unsupported specifiers do not consume varargs. Use native targets or a richer
host/runtime adapter for full libc formatting such as widths, floating point,
or long integer modifiers. `wasm32-wasi` and
Emscripten-flavored target triples select hosted mode by default;
`wasm32-unknown-unknown` stays freestanding unless `--wasm-runtime host` is
provided.

Programs that depend on full operating-system APIs such as files, sockets,
process calls, or platform-specific inline assembly still need a richer
WASI/browser host implementation before they can run as standalone wasm.

The `examples/wasm_control_flow`, `examples/wasm_lambdas_generics`,
`examples/wasm_memory_strings`, `examples/wasm_memory_intrinsics`,
`examples/wasm_stdlib_array`, and `examples/wasm_stdlib_bitset` examples are
intentionally portable: they run as native x86_64 programs and as standalone
`wasm32-unknown-unknown` modules. `examples/wasm_hosted_io` covers basic hosted
mode I/O. `examples/wasm_hosted_printf` covers dynamic `%s`/`%d`/`%c` hosted
formatting while remaining native-compatible. `examples/wasm_hosted_transform`
is the richer hosted regression: it remains native-compatible while wasm tests
execute it with host-provided argv, stdout, stderr, stdlib `String`, enum
matching, generics, and lambda capture.

The compatibility matrix in `tests/helpers/wasmCompatibilityMatrix.ts` is the
source of truth for CI. Each tracked example is marked as `wasm-freestanding`,
`wasm-hosted`, `blocked-by-host-api`, or `native-only`. Run it locally with
`bun run test:wasm`; this keeps wasm runtime checks skippable when no wasm
linker is installed. Run `BPL_REQUIRE_WASM_LD=1 bun run test:wasm` to match CI
and fail immediately when `wasm-ld` or `WASM_LD` cannot be used.

## Complete Examples

### Development Workflow

```bash
# Start development with watch mode
bpl dev main.bpl --clear

# In another terminal, format on save
bpl format -w main.bpl

# Check types without full compilation
bpl check main.bpl
```

### Production Build

```bash
# Build optimized release binary
bpl build main.bpl -O 2 -o myapp

# Build with debug symbols for debugging
bpl build main.bpl -O 0 --debug -o myapp-debug

# Cross-compile for multiple platforms
bpl build main.bpl -O 2 --target x86_64-pc-linux-gnu -o myapp-linux
bpl build main.bpl -O 2 --target x86_64-pc-windows-gnu -o myapp.exe
bpl build main.bpl -O 2 --target arm64-apple-darwin -o myapp-macos
```

### CI/CD Integration

```bash
# Type check all files
bpl check src/*.bpl --json --quiet

# Build with timing
bpl build main.bpl -O 2 --time --json

# Clean before build
bpl clean && bpl build main.bpl -O 2
```
