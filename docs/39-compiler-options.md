# Compiler Options

The BPL compiler (`bpl`) provides a comprehensive command-line interface with various commands and flags.

## Commands

### `bpl --version`

Print the compiler version.

```bash
bpl --version
bpl --version --json
bpl --json --version
```

Version JSON reports are available with `bpl --version --json` or
`bpl --json --version`. Successful reports emit `schemaVersion: 1`,
`check: "version"`, `success: true`, and the package `version` on stdout.
Plain `bpl --version` keeps the existing human-readable version output.
Reproduce the focused JSON contract with
`bun test tests/CLIJsonParseability.test.ts -t "version JSON"`.

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

# Write a diagnostic copy of generated LLVM IR
bpl build main.bpl --debug-ir-path debug/main.ll
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

### `bpl docs <file>`

Generate Markdown documentation for a BPL file and its imports.

**Examples:**

```bash
bpl docs main.bpl
bpl docs main.bpl -o API.md
bpl docs main.bpl --json
```

Documentation JSON reports are available with `bpl docs <file> --json`.
Successful reports emit `schemaVersion: 1`, `check: "docs"`, `success: true`,
`file`, `outputPath`, and `generatedBytes`. `bpl docs` always writes Markdown to
the selected output file, defaulting to `docs.md`; JSON mode reports that path
instead of printing the generated Markdown to stdout.

JSON-mode validation failures stay on stdout with `success: false`, `file`,
`outputPath`, `error`, and stable `BPL_DOCS_*` `errorCode` values:

- `BPL_DOCS_INPUT_NOT_FOUND`
- `BPL_DOCS_INPUT_SYMLINK`
- `BPL_DOCS_INPUT_NOT_FILE`
- `BPL_DOCS_INPUT_PARENT_SYMLINK`
- `BPL_DOCS_OUTPUT_SYMLINK`
- `BPL_DOCS_OUTPUT_DIRECTORY`
- `BPL_DOCS_OUTPUT_NOT_FILE`
- `BPL_DOCS_OUTPUT_PARENT_NOT_FOUND`
- `BPL_DOCS_OUTPUT_PARENT_SYMLINK`
- `BPL_DOCS_OUTPUT_PARENT_NOT_DIRECTORY`
- `BPL_DOCS_FAILED`

Reproduce the focused JSON contract with
`bun test tests/CLI.test.ts -t "documentation generation success and validation failures as JSON"`.

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
Project creation JSON reports are available with `bpl new <name> --json`.
Successful scaffolds emit `schemaVersion: 1`, `check: "project-new"`,
`success: true`, `name`, `template`, `projectPath`, `manifestPath`,
`entrypoint`, and whether git was initialized. JSON-mode validation failures
stay on stdout with `success: false`, `name`, `template`, `projectPath`,
`error`, and stable `errorCode` values:

- `BPL_NEW_NAME_PATH`
- `BPL_NEW_NAME_INVALID`
- `BPL_NEW_TEMPLATE_INVALID`
- `BPL_NEW_PATH_EXISTS_DIRECTORY`
- `BPL_NEW_PATH_EXISTS_SYMLINK`
- `BPL_NEW_PATH_EXISTS_NOT_DIRECTORY`

Reproduce the focused JSON contract with
`bun test tests/CLI.test.ts -t "new project success and failures as JSON"`.

### `bpl install`

Install project dependencies from `bpl.json` or restore the exact packages
recorded in `bpl.lock`.

```bash
bpl install
bpl install --locked
bpl install --update
bpl install --repair-lock
bpl install --json
bpl lock
bpl lock --json
```

`--locked` verifies the lockfile without mutating `bpl_modules/`. `--update`
re-resolves manifest dependency selectors such as `^1.2.0` against the package
cache and rewrites `bpl.lock`. `--repair-lock` rewrites lockfile versions and
hashes from currently installed packages and removes stale entries. It refuses
duplicate installed package names with the `duplicate-installed-package` issue
kind instead of writing an ambiguous lockfile. `--json` prints a
machine-readable `package-install` report for install automation.
`bpl lock` is a project-only alias for `bpl install --update`; with `--json` it
uses the same `package-install` report and sets `update: true`.

### `bpl doctor`

Check the local BPL installation, runtime artifacts, and host toolchain.

```bash
bpl doctor
bpl doctor --json
bpl doctor sanitizer
bpl doctor sanitizer --json
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
the current workflow explicitly requires them. When no standalone wasm linker is
usable, the `wasm linker` check includes `code: "BPL_WASM_LINKER_UNAVAILABLE"`,
the checked `candidates`, relevant `environment` values, and
`recommendedCommands` for strict local repro. The doctor hint makes clear that
missing wasm linker support is an optional prerequisite skip, not a successful
wasm execution, until `BPL_REQUIRE_WASM_LD=1` makes the linker mandatory.
Use `bpl doctor sanitizer --json` when a sanitizer CI failure needs only the
ASan/UBSan compiler-rt probe. Its single `sanitizer runtime support` check uses
stable `id: "sanitizer-runtime-support"` and reports
`BPL_SANITIZER_RUNTIME_UNAVAILABLE` when the configured compiler cannot link the
`libclang_rt` sanitizer runtime for the host target.

`bpl doctor` also validates path safety for `BPL_HOME` and bundled runtime
resources. The BPL home path and runtime files such as `lib/runtime.ll`,
`lib/runtime_support.o`, `lib/runtime_wasm.ll`, and
`lib/runtime_wasm_host.ll` must not be reached through symlinked parent path
components. Final broken symlinks, directories, and missing files keep their
specific diagnostics, while parent symlink failures point to the offending path
component.

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
`BPL_CLEAN_GIT_TIMEOUT_MS` invalid values fall back to 5000 milliseconds.
If the current working directory path contains a symbolic-link component,
`bpl clean` also refuses before the git probe, artifact scan, or any deletion.
Run clean from the real project path when using launchers that preserve a
symlink-spelled working directory.

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
- `--json`: Output a machine-readable format-check report with `--check`

**Examples:**

```bash
bpl format main.bpl
bpl format -w main.bpl
bpl format --check src/*.bpl
bpl format --check --json src/*.bpl
```

Use `--check` in CI. It exits non-zero when any input would be changed.
Format JSON reports are available with `bpl format --check --json`. Successful
checks emit `schemaVersion: 1`, `check: "format"`, `success: true`,
`mode: "check"`, aggregate `totalFiles`, `formattedFiles`,
`unformattedFiles`, and `errorCount` fields, plus per-file `formatted` and
`changed` results. JSON-mode validation failures stay on stdout with
`success: false` and stable `BPL_FORMAT_*` codes. Reproduce the focused JSON
contract with `bun test tests/CLI.test.ts -t "format check results and
validation failures as JSON"`.

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

### `bpl bindgen <header>`

Generate conservative BPL extern declarations from a C header.

**Options:**

- `-o, --output <file>`: Write generated bindings to a file
- `--json`: Output a machine-readable bindgen report

**Examples:**

```bash
bpl bindgen include/library.h
bpl bindgen include/library.h -o src/library_bindings.bpl
bpl bindgen include/library.h --json
```

Bindgen JSON reports are available with `bpl bindgen <header> --json`.
Successful stdout-mode reports emit `schemaVersion: 1`, `check: "bindgen"`,
`success: true`, `header`, `outputPath: null`, `generatedBytes`, and the
generated `bindings` string. With `-o`, bindgen writes the file and reports the
same success metadata with `outputPath` set to the destination. JSON-mode
validation failures stay on stdout with `success: false`, `header`,
`outputPath`, `error`, and stable `BPL_BINDGEN_*` codes. Reproduce the focused
JSON contract with `bun test tests/CLI.test.ts -t "bindgen success and
validation failures as JSON"`.

### `bpl completion [shell]`

Generate Bash or Zsh shell completion scripts.

**Options:**

- `--json`: Output a machine-readable completion report

**Examples:**

```bash
bpl completion bash
bpl completion zsh
bpl completion bash --json
```

Completion JSON reports are available with `bpl completion [shell] --json`.
Successful reports emit `schemaVersion: 1`, `check: "completion"`,
`success: true`, the selected `shell`, and the generated `script` text. JSON
mode keeps unsupported-shell failures parseable on stdout with
`success: false`, `shell`, `error`, and
`BPL_COMPLETION_SHELL_UNSUPPORTED`. Reproduce the focused JSON contract with
`bun test tests/CLIJsonParseability.test.ts -t "completion JSON"`.

## Common Flags

Flag availability depends on the command; run `bpl <command> --help` for the exact set.

- `-o <file>`: Output file name on the default compile command and `bpl build`
- `-v, --verbose`: Verbose compiler output
- `-q, --quiet`: Suppress non-error output
- `-O <level>`: Optimization level (0, 1, 2, or 3)
- `-d, --dwarf`: Generate DWARF debug information on the default compile command
- `--debug`: Generate DWARF debug information on `run`, `dev`, and `build`
- `--debug-ir-path <file>`: Write a diagnostic copy of generated LLVM IR
- `--time`: Show compilation time statistics
- `--cache`: Enable incremental compilation
- `--cache-stats`: Show incremental cache hit/miss statistics
- `--json`: Output in JSON format where supported, including `bpl --version`,
  `bpl check`, `bpl completion`, `bpl docs`, `bpl format --check`,
  `bpl lint`, and `bpl doctor`
- `--color`: Force colored output
- `--no-color`: Disable colored output

Commands that write files through shared CLI output handling, including compile
outputs, `bpl format --write`, `bpl docs -o`, and `bpl bindgen -o`, reject
symbolic links at the destination path, the immediate parent, or any parent path
component before creating atomic temporary files.
Native linker executable outputs apply the same parent-component rule before
temporary executable creation and final rename.
On macOS, the trusted system temp roots `/var -> /private/var` and
`/tmp -> /private/tmp` are allowed so `os.tmpdir()`-based builds and wasm tests
work normally; user-controlled nested symlink ancestors are still rejected.

### Machine-readable JSON contracts

JSON-capable commands write machine-readable data to stdout. Human-readable
logger text belongs on stderr for non-JSON failures; JSON-mode failures that are
part of a command's validation path use stdout with `success: false` or
`ok: false` so CI and editor integrations can parse the result consistently.

| Command | Stable stdout shape |
| --- | --- |
| `bpl --version --json` | Version report with `schemaVersion`, `check: "version"`, `success: true`, and `version`. |
| `bpl bindgen <header> --json` | Bindgen report with `schemaVersion`, `check: "bindgen"`, `success`, `header`, `outputPath`, and `generatedBytes`; stdout-mode success includes `bindings`, and output-file success writes the file while reporting its path. Validation failures return `success: false`, `error`, and stable `BPL_BINDGEN_*` `errorCode` values for header and output path failures. |
| `bpl build --json` | Build result report with `schemaVersion`, `check: "build"`, `success`, `file`, `emit`, `target`, `cache`, and output artifact paths; JSON-mode build failures return `success: false` with `error` on stdout and include `diagnostics` when the failure comes from compiler diagnostics. Build validation failures such as no input files, invalid `-O`, `--emit`, `--wasm-runtime`, `--jobs`, unsupported `--target`, input path, and output path errors are stdout-only JSON reports and do not leave failed LLVM or executable artifacts behind. Codegen diagnostics such as `--debug-ir-path` path-safety failures are promoted to top-level `errorCode` values while preserving the diagnostic object. No-input builds report `errorCode: "BPL_BUILD_NO_INPUTS"`. Unsupported targets report `errorCode: "BPL_BUILD_UNSUPPORTED_TARGET"`. |
| `bpl check --json` | Type-check report with `schemaVersion`, `check: "check"`, `success`, `totalFiles`, `errorCount`, `timeMs`, and per-file diagnostics or validation errors. Input validation failures keep per-file JSON failure entries with `error` and a stable `errorCode`. |
| `bpl completion [shell] --json` | Completion report with `schemaVersion`, `check: "completion"`, `success`, `shell`, and `script`; unsupported shells return `success: false`, `shell`, `error`, and `errorCode: "BPL_COMPLETION_SHELL_UNSUPPORTED"` on stdout. |
| `bpl docs <file> --json` | Documentation-generation report with `schemaVersion`, `check: "docs"`, `success`, `file`, `outputPath`, and `generatedBytes`; validation failures return `success: false`, `error`, and stable `BPL_DOCS_*` `errorCode` values for input and output path failures. The command always writes Markdown to `outputPath`, defaulting to `docs.md`. |
| `bpl format --check --json` | Format-check report with `schemaVersion`, `check: "format"`, `success`, `mode: "check"`, `totalFiles`, `formattedFiles`, `unformattedFiles`, `errorCount`, and per-file results. Files that need formatting use `BPL_FORMAT_NOT_FORMATTED`; missing and non-file inputs use stable `BPL_FORMAT_INPUT_*` codes. |
| `bpl lint --json` | Lint report with `schemaVersion`, `check: "lint"`, `success`, `totalFiles`, `errorCount`, and per-file diagnostics or validation errors. Input validation failures keep per-file JSON failure entries with `error` and a stable `errorCode`. |
| `bpl doctor --json` / `bpl doctor sanitizer --json` / `bpl doctor <unknown> --json` | Toolchain report with `schemaVersion`, `check: "toolchain"`, `success`, `version`, `platform`, `bplHome`, and `checks`. The `wasm linker` check reports `BPL_WASM_LINKER_UNAVAILABLE`, checked candidates, environment values, and recommended commands when linker probing fails. The focused sanitizer scope reports only `sanitizer runtime support`, including `BPL_SANITIZER_RUNTIME_UNAVAILABLE`, environment values, and recommended commands when compiler-rt/libclang_rt probing fails. Unknown doctor scopes in JSON mode return `schemaVersion`, `check: "doctor"`, `success: false`, `error`, and `errorCode: "BPL_DOCTOR_SCOPE_UNKNOWN"`. |
| `bpl doctor packages --json` | Package project report with `schemaVersion`, `check: "packages"`, `success`, legacy `ok`, lockfile data, installed packages, dependency tree, cache verification, and structured issues. Current-project export and bin-file failures use `kind: "invalid-project-package"` with package identity, manifest `path`, and a fix-exported-files or Fix package bin files hint; installed package export and bin-file failures use `kind: "invalid-installed-package"` with installed package `path` and reinstall hint. Invalid lockfile issues use `kind: "invalid-lockfile"` plus stable `BPL_LOCKFILE_*` codes for malformed JSON, unsupported versions, bad package maps or entries, non-file paths, and symlinked lockfiles. Duplicate installed package issues preserve the compact joined `path` string and include a `paths` array with every conflicting installed directory, including duplicate lock-verification issues marked with `lockVerificationKind: "duplicate-installed-package"`; when lock verification and installed-package scanning find the same duplicate path set, doctor emits only the lock-verification issue. Package-cache warning issues preserve `packageName`, `version`, the cache archive `path`, and `provenancePath` when a malformed, missing, or unsafe sidecar is involved. |
| `bpl new <name> --json` | Project creation report with `schemaVersion`, `check: "project-new"`, `success`, `name`, `template`, `projectPath`, `manifestPath`, `entrypoint`, and `gitInitialized`; validation failures return `success: false`, `name`, `template`, `projectPath`, `error`, and stable `errorCode` values such as `BPL_NEW_NAME_PATH`, `BPL_NEW_NAME_INVALID`, `BPL_NEW_TEMPLATE_INVALID`, `BPL_NEW_PATH_EXISTS_DIRECTORY`, `BPL_NEW_PATH_EXISTS_SYMLINK`, and `BPL_NEW_PATH_EXISTS_NOT_DIRECTORY`. |
| `bpl init [name] --json` | Init report with `schemaVersion`, `check: "package-init"`, `success`, `package`, `version`, and `manifestPath`; validation failures return `success: false`, `package`, `manifestPath`, `error`, and stable `errorCode` values such as `BPL_PACKAGE_INIT_NAME_INVALID` and `BPL_PACKAGE_INIT_MANIFEST_EXISTS`. |
| `bpl install [package] --json`, `bpl lock --json` | Install report with `schemaVersion`, `check: "package-install"`, `success`, `mode`, `target`, `global`, `locked`, `update`, and `repairLock`; `bpl lock --json` is equivalent to `bpl install --update --json` and reports `update: true`. Successful project installs include action details: `action: "noop"`, `"installed"`, or `"restored"` with `packages`; `action: "verified"` with `packagesChecked`; or `action: "repaired"` with `packages`, `updated`, and `removed`. The locked checked count includes locked entries plus untracked `bpl_modules/` roots inspected for drift. Validation failures such as missing manifests, incompatible lock flags, locked verification failures, malformed dependency sources, direct archive path failures, and package arguments with project-only modes return `success: false` and `error` on stdout without logger text on stderr. Lock verification and repair duplicate-installed-package issues include a `paths` array with every conflicting installed directory, and invalid installed package bin or export issues use `invalid-manifest` with package path and version metadata. When a package failure has a stable compiler code, the report also includes `errorCode` such as `BPL_LOCKFILE_UNSUPPORTED_VERSION`, `BPL_PACKAGE_NOT_FOUND`, `BPL_PACKAGE_INSTALL_*_CONFLICT`, `BPL_PACKAGE_ARCHIVE_*`, or the PackageManager manifest-loading failures documented in package management. |
| `bpl pack [dir] --json` | Pack report with `schemaVersion`, `check: "package-pack"`, `success`, `package`, `version`, `packageDir`, `outputDir`, and `archivePath`; validation failures return `success: false`, `packageDir`, `outputDir`, `error`, and stable PackageManager `errorCode` values when available. |
| `bpl uninstall <package> --json` | Uninstall report with `schemaVersion`, `check: "package-uninstall"`, `success`, `package`, `version`, and `global`; validation failures return `success: false`, `package`, `global`, `error`, and stable `errorCode` values such as `BPL_PACKAGE_UNINSTALL_NAME_INVALID` and `BPL_PACKAGE_UNINSTALL_NOT_INSTALLED` without logger text on stderr. |
| `bpl package-cache list [package] --json` | Cache entry report with `schemaVersion`, `check: "package-cache-list"`, `success`, and the existing cache entry payload under `entries`; unsafe cache-root validation failures return `success: false`, `entries: []`, and `error`. Invalid package filters also include `errorCode: "BPL_PACKAGE_CACHE_NAME_INVALID"`. |
| `bpl package-cache verify [package] --json` | Cache verification report with `schemaVersion`, `check: "package-cache-verify"`, `success`, legacy `ok`, `entriesChecked`, and provenance `issues`; malformed sidecars and symlinked provenance paths use `invalid-provenance` with `provenancePath`, invalid extracted `exports` entries and invalid cached `bin` target files use `invalid-archive`, directory `bin` targets are reported by package-cache `bin` validation, symlinked binary archive members are rejected by archive safety during verification, and validation failures return `success: false`, `ok: false`, `entriesChecked: 0`, `issues: []`, and `error`. Invalid package filters include `errorCode: "BPL_PACKAGE_CACHE_NAME_INVALID"`. |
| `bpl package-cache clean [package] --json` / `bpl package-cache repair [package] --json` | Cache maintenance reports with `schemaVersion`, `check: "package-cache-clean"` or `check: "package-cache-repair"`, `success`, `dryRun`, and the existing removed/repaired/unchanged/issues payloads; `package-cache repair refuses to regenerate provenance` for archives with invalid extracted `exports` or `bin` targets, including directory `bin` targets and symlinked binary archive members, clean and repair validation failures return `success: false`, the requested `dryRun`, empty collection fields such as `removed: []` or `repaired: []`, and `error`. Invalid package filters include `errorCode: "BPL_PACKAGE_CACHE_NAME_INVALID"`, and invalid `--package-version` values, including zero-padded semantic version segments such as `01.0.0`, include `errorCode: "BPL_PACKAGE_CACHE_VERSION_INVALID"`. |
| `bpl run-script --list --json` / `bpl run-script <name> --json` failures | Script list with `schemaVersion`, `check: "run-script-list"`, `success: true`, and `scripts`; manifest or list validation failures, including final `bpl.json` symlinks and symlinked manifest parents, return the same `schemaVersion`/`check` with `success: false`, `error`, and a stable `errorCode` on stdout. Named-script validation failures use `check: "run-script"`. |
| `bpl clean --dry-run --json` | Cleanup preview with `schemaVersion`, `check: "clean"`, `success`, `dryRun`, `count`, and `entries`; use `bpl clean --json` to remove and report the same entry shape. Clean validation failures, including symlinked working-directory paths, return `success: false`, `dryRun`, `count: 0`, `entries: []`, and `error` on stdout. |
| `bpl list --json` / `bpl list --tree --json` | Package inspection reports with `schemaVersion`, `check: "package-list"` or `check: "package-list-tree"`, `success`, `scope`, and the existing installed package summaries or dependency tree data; package summaries and tree nodes include `problems` arrays for invalid installed exports and bin targets such as missing, directory, or symlinked public subpaths or package binaries. These show up as `invalid exports` or `invalid bin` entries. For unsafe package-root validation failures, reports return `success: false`, `packages: []` or `tree: []`, and `error`. Package list JSON failure codes are exported through `PACKAGE_LIST_JSON_ERROR_CODES` and the public `CLI_JSON_ERROR_CODE_LISTS` `package-list` entry, covering `BPL_PACKAGE_SEARCH_DIR_SYMLINK`, `BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY`, `BPL_PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY`, `BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK`, and `BPL_PACKAGE_DUPLICATE_INSTALLED`. List and tree duplicate installed package names return `errorCode: "BPL_PACKAGE_DUPLICATE_INSTALLED"`. List and tree duplicate failures also include `issuesFound`, `issueKinds`, and compact `issues` entries with `kind: "duplicate-installed-package"`, the compatibility `path` string, and a `paths` array with every conflicting installed directory. |

Build validation `errorCode` values are stable when `bpl build --json` can
classify the validation failure. Option parsing uses
`BPL_BUILD_NO_INPUTS`, `BPL_BUILD_INVALID_OPTIMIZATION`,
`BPL_BUILD_INVALID_EMIT`, `BPL_BUILD_INVALID_WASM_RUNTIME`, and
`BPL_BUILD_INVALID_JOBS`. Target validation uses
`BPL_BUILD_UNSUPPORTED_TARGET`. Input file validation uses
`BPL_BUILD_INPUT_NOT_FOUND`, `BPL_BUILD_INPUT_SYMLINK`, and
`BPL_BUILD_INPUT_NOT_FILE`. Output artifact validation uses
`BPL_BUILD_OUTPUT_SYMLINK`, `BPL_BUILD_OUTPUT_DIRECTORY`,
`BPL_BUILD_OUTPUT_NOT_FILE`, `BPL_BUILD_OUTPUT_PARENT_NOT_FOUND`,
`BPL_BUILD_OUTPUT_PARENT_SYMLINK`, and
`BPL_BUILD_OUTPUT_PARENT_NOT_DIRECTORY`. These codes are additive fields on the
stdout JSON failure report, preserving the human-readable `error` text for
older consumers and logs.

Clean validation `errorCode` values are stable when `bpl clean --json` can
classify the validation failure. Symlink-spelled working-directory paths use
`BPL_CLEAN_WORKDIR_SYMLINK`, and git tracked-file probe failures or timeouts in
git repositories use `BPL_CLEAN_GIT_TRACKED_UNAVAILABLE`. These codes are
additive fields on the stdout JSON failure report, preserving the
human-readable `error` text while keeping `count: 0` and `entries: []` so
automation can confirm no cleanup happened.

Format JSON reports are stable for `bpl format --check --json`. `--json`
without `--check` uses `BPL_FORMAT_JSON_REQUIRES_CHECK`, missing file lists use
`BPL_FORMAT_NO_INPUTS`, and conflicting `--write --check` flags use
`BPL_FORMAT_WRITE_CHECK_CONFLICT`. Per-file input validation uses
`BPL_FORMAT_INPUT_NOT_FOUND` and `BPL_FORMAT_INPUT_NOT_FILE`. Files that parse
successfully but would be rewritten use `BPL_FORMAT_NOT_FORMATTED`, and parser
or formatter failures use `BPL_FORMAT_PROCESSING_ERROR`. These codes are
additive fields on top-level or per-file JSON failure entries; JSON mode
suppresses human logger text so stdout remains parseable.

Bindgen JSON reports are stable for `bpl bindgen <header> --json`. Header
validation uses `BPL_BINDGEN_HEADER_NOT_FOUND`,
`BPL_BINDGEN_HEADER_SYMLINK`, `BPL_BINDGEN_HEADER_NOT_FILE`, and
`BPL_BINDGEN_HEADER_PARENT_SYMLINK`. Output artifact validation uses
`BPL_BINDGEN_OUTPUT_SYMLINK`, `BPL_BINDGEN_OUTPUT_DIRECTORY`,
`BPL_BINDGEN_OUTPUT_NOT_FILE`, `BPL_BINDGEN_OUTPUT_PARENT_NOT_FOUND`,
`BPL_BINDGEN_OUTPUT_PARENT_SYMLINK`, and
`BPL_BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY`. Unexpected generation failures use
`BPL_BINDGEN_FAILED`. These codes are additive fields on stdout JSON failure
reports, preserving the human-readable `error` text while suppressing logger
text in JSON mode.

Run-script validation `errorCode` values are stable when `bpl run-script
--json` or `bpl run-script --list --json` can classify the validation failure.
Manifest validation uses `BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND`,
`BPL_RUN_SCRIPT_MANIFEST_SYMLINK`, `BPL_RUN_SCRIPT_MANIFEST_NOT_FILE`,
`BPL_RUN_SCRIPT_MANIFEST_PARENT_SYMLINK`,
`BPL_RUN_SCRIPT_MANIFEST_INVALID_JSON`, and
`BPL_RUN_SCRIPT_MANIFEST_NOT_OBJECT`. Script-table validation uses
`BPL_RUN_SCRIPT_SCRIPTS_NOT_OBJECT`, `BPL_RUN_SCRIPT_NAME_EMPTY`,
`BPL_RUN_SCRIPT_COMMAND_NOT_STRING`, and `BPL_RUN_SCRIPT_COMMAND_EMPTY`.
Named-script lookup failures use `BPL_RUN_SCRIPT_NOT_FOUND`. These codes are
additive fields on the stdout JSON failure report, preserving the
human-readable `error` text for older consumers and logs.

Check and lint input validation `errorCode` values are stable when `bpl check
--json` or `bpl lint --json` can classify source input before parsing. Missing
file lists use top-level JSON failures with `BPL_CHECK_NO_INPUTS` or
`BPL_LINT_NO_INPUTS`, `totalFiles: 0`, `errorCount: 1`, and `files: []`.
Per-file check validation uses `BPL_CHECK_INPUT_NOT_FOUND`,
`BPL_CHECK_INPUT_SYMLINK`, and `BPL_CHECK_INPUT_NOT_FILE`. Per-file lint
validation uses `BPL_LINT_INPUT_NOT_FOUND`, `BPL_LINT_INPUT_SYMLINK`, and
`BPL_LINT_INPUT_NOT_FILE`. These codes are additive fields on top-level or
per-file JSON failure entries, preserving the human-readable `error` text while
keeping `totalFiles` and `errorCount` accurate.

Import-resolution failures use the same diagnostic objects as type errors.
`bpl check --json` reports missing modules, unsafe `std/` paths, and package
metadata failures under each file's `diagnostics` array while preserving
`totalFiles` and `errorCount`. `bpl build --json` reports the first compiler
diagnostic failure with `success: false`, the formatted `error` string for
backward compatibility, and a `diagnostics` array with source file locations.
`bpl check --json` keeps package search-directory safety failures in the
per-file `diagnostics` array with source locations and `success: false`. Local
`bpl_modules/` and workspace `packages/` symlink failures report `package search
directory is a symbolic link`; global package cache symlinks report `Global
package directory path is a symbolic link`. Local `bpl_modules/` and workspace
`packages/` file or other non-directory failures report `package search
directory is not a directory`; global package cache non-directory failures
report `Global package directory path is not a directory`.
Package source-safety diagnostics stay in the same `bpl check --json` shape
after package root resolution: unsafe `main` values report `unsafe entrypoint`,
and legacy `entry` values follow the same safety rule before either package
entrypoint or subpath imports are resolved, even when `main` is present;
`main` and legacy `entry` validation errors are reported before later manifest
field failures such as `exports`, `keywords`, `repository`, dependency maps,
scripts, or `bin`;
symlinked entrypoint files report `entrypoint resolves to a symbolic link
candidate`, and symlinked subpath parents report `subpath 'features/add'
resolves to a symbolic link candidate`.
Package search directories, package roots, manifests, entrypoints, and subpaths
also reject case-only filesystem
mismatches with diagnostics that include the requested path, the actual path,
and the instruction to use exact filesystem casing. When the resolver can
classify a package import failure, the diagnostic includes one of these stable
`code` values:

- `BPL_PACKAGE_IMPORT_INVALID`
- `BPL_PACKAGE_NOT_FOUND`
- `BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH`
- `BPL_PACKAGE_ENTRYPOINT_SYMLINK`
- `BPL_PACKAGE_ENTRYPOINT_NOT_FOUND`
- `BPL_PACKAGE_SUBPATH_CASE_MISMATCH`
- `BPL_PACKAGE_SUBPATH_SYMLINK`
- `BPL_PACKAGE_SUBPATH_NOT_EXPORTED`
- `BPL_PACKAGE_SUBPATH_NOT_FOUND`
- `BPL_PACKAGE_SEARCH_DIR_CASE_MISMATCH`
- `BPL_PACKAGE_ROOT_CASE_MISMATCH`
- `BPL_PACKAGE_SEARCH_DIR_SYMLINK`
- `BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY`
- `BPL_PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY`
- `BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK`
- `BPL_PACKAGE_ROOT_SYMLINK`
- `BPL_PACKAGE_ROOT_NOT_DIRECTORY`
- `BPL_PACKAGE_MANIFEST_MISSING`
- `BPL_PACKAGE_MANIFEST_SYMLINK`
- `BPL_PACKAGE_MANIFEST_CASE_MISMATCH`
- `BPL_PACKAGE_MANIFEST_NOT_FILE`
- `BPL_PACKAGE_MANIFEST_PARSE_ERROR`
- `BPL_PACKAGE_MANIFEST_NOT_OBJECT`
- `BPL_PACKAGE_ENTRYPOINT_UNSAFE`
- `BPL_PACKAGE_MANIFEST_INVALID`
Non-package module and standard-library import failures also expose stable
codes in the same diagnostic objects: `BPL_MODULE_NOT_FOUND`,
`BPL_MODULE_FILE_NOT_FOUND`, `BPL_MODULE_PATH_NOT_FILE`,
`BPL_MODULE_PATH_SYMLINK`, `BPL_MODULE_PATH_CASE_MISMATCH`, and
`BPL_IMPORT_STD_PATH_UNSAFE`. The documentation inventory is guarded against
the ModuleResolver constants so new resolver codes do not silently miss docs.
Resolved imports that ask for a symbol the module does not export use
`BPL_IMPORT_EXPORT_NOT_FOUND`; for example, a same-name package hidden by the
built-in `math` module can report `Module 'math' does not export 'packageMath'`
with that code in both `bpl check --json` and `bpl build --json`. When the
imported module has exported names, the hint includes `Available exports:` with
those names sorted for deterministic JSON output. Reproduce those contracts
with:

```bash
bun test tests/ImportHandler.test.ts -t "stable code"
bun test tests/CLIJsonParseability.test.ts -t "available exports"
bun test tests/CLIJsonParseability.test.ts -t "stdlib package-name collisions"
```

Duplicate top-level symbols use `BPL_SYMBOL_ALREADY_DEFINED` when a declaration
would reuse a non-function symbol already present in the same module scope.
For example, `type Thing = int;` followed by `struct Thing { ... }` reports
`Symbol 'Thing' is already defined in this scope` with the hint
`Rename this struct or remove the earlier type alias declaration.`. This keeps
same-scope non-function declarations from silently overwriting earlier symbols
while preserving valid function overloads. Reproduce the type-checker and JSON
contracts with:

```bash
bun test tests/TypeCheckerDuplicateSymbols.test.ts
bun test tests/CLIJsonParseability.test.ts -t "duplicate top-level symbols"
```

Same-signature function overloads also use `BPL_SYMBOL_ALREADY_DEFINED`.
For example, two `frame pick(value: int) ret int` declarations report
`Function 'pick' with this signature is already defined.` with the hint
`Overloads must have different parameter types.`. Reproduce the JSON contract
with `bun test tests/CLIJsonParseability.test.ts -t "duplicate function signatures"`.

Duplicate function parameters and duplicate generic parameters also use
`BPL_SYMBOL_ALREADY_DEFINED`. For example, `frame pick(value: int, value: int)`
reports `Duplicate parameter name 'value'` with the hint
`The parameter 'value' is declared multiple times in function 'pick'.`, and
duplicate generic names report `Duplicate generic type parameter 'T'`.
Reproduce the JSON contracts with
`bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters"`.

Duplicate struct fields and duplicate enum variants also use
`BPL_SYMBOL_ALREADY_DEFINED`. For example, a second `x: int` field in
`struct Point` reports `Duplicate field 'x' in struct 'Point'`, and a repeated
`Red` variant in `enum Color` reports
`Duplicate enum variant 'Red' in enum 'Color'`. Reproduce the JSON contracts with
`bun test tests/CLIJsonParseability.test.ts -t "duplicate struct fields|duplicate enum variants"`.

Recursive type cycles use `BPL_TYPE_RECURSION_CYCLE`. This covers infinite-size
struct field cycles such as `Struct 'Node' has infinite size due to recursive
field types`, infinite-size enum variant cycles such as `Enum 'Tree' has
infinite size due to recursive variant types`, self-inheritance such as
`Struct 'Loop' cannot inherit from itself`, and multi-struct inheritance cycles
such as `Circular inheritance detected`. Hints include the concrete cycle, such
as `Recursive cycle detected: Node -> Node` or
`Inheritance cycle: A -> B -> A`. Reproduce the type-checker and JSON contracts
with:

```bash
bun test tests/TypeCheckerRecursiveTypes.test.ts
bun test tests/CLIJsonParseability.test.ts -t "recursive struct field cycles|recursive enum variant cycles"
```

Generic arity mismatches use `BPL_GENERIC_ARITY_MISMATCH`. This covers generic
type argument-count failures such as `Generic type 'Box' expects 1 type
arguments, but got 2.` and generic type-alias argument-count failures such as
`Generic type 'Alias' expects 1 type arguments, but got 2.`. Both use the hint
`Check generic argument count.`. Reproduce the type-checker and JSON contracts
with:

```bash
bun test tests/TypeCheckerGenericArity.test.ts
bun test tests/CLIJsonParseability.test.ts -t "generic type arity|generic alias arity"
```

Undefined type-name failures use `BPL_TYPE_NOT_FOUND`. This covers unresolved
type names in variable declarations and struct fields. For example, `MissingThing`
reports `Undefined type 'MissingThing'` with the hint
`The type is not defined.`. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerUndefinedTypes.test.ts
bun test tests/CLIJsonParseability.test.ts -t "undefined-type"
```

Undefined symbol failures use `BPL_SYMBOL_NOT_FOUND`. This covers value identifiers and missing callee identifiers that are not declared in the current scope or imports. Representative messages include `Undefined symbol 'missingValue'` and `Undefined symbol 'missingCall'`. The default hint is `Ensure the variable or function is declared before use.`, and similar in-scope names keep the `Did you mean 'totalCount'?` hint. Valid local, parameter, global, function, method, and imported symbol resolution remains accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerUndefinedSymbolDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "undefined symbol"
```

Invalid bare void type failures use `BPL_VOID_TYPE_INVALID`. This covers bare
`void` in variable declarations, parameters, struct fields, and generic type
arguments. For example, `local _value: void;` reports
`Variable '_value' cannot be void.`, and `Box<void>` reports
`Generic type argument cannot be 'void'.`. These diagnostics use the hint
`Use '*void' for void pointers.`. `ret void` and `*void` remain valid for
function returns and pointer-shaped types. Reproduce the type-checker and JSON
contracts with:

```bash
bun test tests/TypeCheckerVoidTypes.test.ts
bun test tests/CLIJsonParseability.test.ts -t "invalid void type"
```

Built-in type redefinition failures use `BPL_BUILTIN_TYPE_REDEFINITION`. This
covers type aliases, structs, enums, and specs named after reserved primitive
types. For example, `struct bool { ... }` reports
`Cannot redefine builtin type 'bool'` with the hint
`Builtin type names are reserved.`. The guard is limited to reserved primitive
type names, so standard-library wrapper structs such as `Long` remain valid.
Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerBuiltinRedefinition.test.ts
bun test tests/CLIJsonParseability.test.ts -t "builtin type redefinition"
```

Invalid fixed array size failures use `BPL_ARRAY_SIZE_INVALID`. This covers
zero-sized fixed array dimensions such as `int[0]` in variable declarations,
parameters, struct fields, and type aliases. For example, `local _values:
int[0];` reports `Array size must be greater than zero.` with the hint
`Arrays cannot have zero or negative size.`. Positive fixed arrays and dynamic
slices such as `int[]` remain valid. Reproduce the type-checker and JSON
contracts with:

```bash
bun test tests/TypeCheckerInvalidArraySizes.test.ts
bun test tests/CLIJsonParseability.test.ts -t "invalid array size"
```

Return type mismatch failures use `BPL_RETURN_TYPE_MISMATCH`. This covers
mismatched return expressions and `return;` in non-void functions. For example,
`return "wrong";` from a function declared `ret int` reports
`Return type mismatch: expected i32, got *i8` with the hint
`Ensure the returned value matches the function's return type.`. Valid returns
remain valid; integer literal returns that fit the declared type remain valid.
Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerReturnTypeMismatch.test.ts
bun test tests/CLIJsonParseability.test.ts -t "return type mismatch"
```

Assignment type mismatch failures use `BPL_ASSIGNMENT_TYPE_MISMATCH`. This
covers direct assignment statements such as `value = "wrong";` when the target
and value types are incompatible. For example, assigning a string to an integer
variable reports `Type mismatch in assignment: cannot assign string to i32` with
the hint
`The assigned value is not compatible with the target variable's type.`.
The compatibility rule is explicit: variable initializer mismatches keep the
legacy `E001` code for compatibility.
Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerAssignmentMismatch.test.ts
bun test tests/CLIJsonParseability.test.ts -t "assignment type mismatch"
```

Condition type mismatch failures use `BPL_CONDITION_TYPE_MISMATCH`. This covers
non-boolean `if`, `loop`, and ternary conditions. For example,
`if (1) { ... }` reports `If condition must be boolean, got int`,
`loop (1) { ... }` reports `Loop condition must be boolean, got int`, and
`1 ? 1 : 0` reports `Ternary condition must be boolean, got int`. These
diagnostics use the hint `Ensure the condition evaluates to a boolean.`. Valid
boolean conditions remain accepted. Reproduce the type-checker and JSON
contracts with:

```bash
bun test tests/TypeCheckerConditionMismatch.test.ts
bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"
```

Ternary branch type mismatch failures use
`BPL_TERNARY_BRANCH_TYPE_MISMATCH`. This covers incompatible ternary branch
types after the condition has been checked as boolean. For example,
`true ? 1 : "wrong"` reports
`Ternary branches must have compatible types: int vs string` with the hint
`Both branches must return the same type.`. Compatible branch types remain
accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerTernaryBranchMismatch.test.ts
bun test tests/CLIJsonParseability.test.ts -t "ternary branch type mismatch"
```

Switch mismatch failures use `BPL_SWITCH_VALUE_TYPE_MISMATCH` and
`BPL_SWITCH_CASE_TYPE_MISMATCH`. This covers invalid switch value types and
incompatible case pattern types. For example, switching on a `double` reports
`Switch value must be an integer, string or enum type, got double` with the hint
`Ensure the switch expression evaluates to an integer, string or enum.`, while
using a string case pattern for an integer switch reports
`Case pattern type string not compatible with switch value type i32` with the
hint `Ensure case patterns match the switch value type.`. Valid integer and
string switches remain accepted. Reproduce the type-checker and JSON contracts
with:

```bash
bun test tests/TypeCheckerSwitchMismatch.test.ts
bun test tests/CLIJsonParseability.test.ts -t "switch type mismatch"
```

Call-site mismatch failures use `BPL_CALL_TARGET_NOT_CALLABLE`,
`BPL_CALL_ARGUMENT_COUNT_MISMATCH`, `BPL_CALL_ARGUMENT_TYPE_MISMATCH`,
`BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH`, and
`BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH`. This covers non-callable targets,
function argument count and type mismatches, and enum variant argument count and
type mismatches. For example, calling a plain struct value reports
`Type 'Box' is not callable` with the hint
`Only functions or types with __call__ operator can be called.`, calling
`take()` when `take` requires one parameter reports
`No matching function for call to 'take' with 0 arguments.`, and calling
`take("wrong")` reports
`No matching function for call to 'take' with provided argument types.`. Direct
function overload failures include `Available overloads:` in the hint. Enum
constructor calls report `Enum variant 'Move' expects 2 arguments, but got 1`
with a `Usage: Message.Move(` hint for count mismatches, and
`Type mismatch for argument 2 of 'Move': expected i32, got string` with the hint
`Check the variant definition and argument types.` for argument type
mismatches. Valid function, lambda, callable object, and enum variant calls
remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerCallSiteMismatch.test.ts
bun test tests/CLIJsonParseability.test.ts -t "call-site mismatch"
```

Control-flow misuse failures use `BPL_BREAK_OUTSIDE_CONTEXT`,
`BPL_CONTINUE_OUTSIDE_LOOP`, `BPL_FALLTHROUGH_OUTSIDE_SWITCH`, and
`BPL_DEFER_RETURN_VALUE_INVALID`. This covers break outside loop/switch,
continue outside loop, fallthrough outside switch, and return-with-value inside
defer. For example, `break;` outside a loop or switch reports
`'break' statement outside of loop or switch` with the hint
`Break statements can only be used inside loops or switch statements.`,
`continue;` outside a loop reports `'continue' statement outside of loop` with
the hint `Continue statements can only be used inside loops.`, and
`fallthrough;` outside a switch reports
`'fallthrough' statement outside of switch` with the hint
`Fallthrough statements can only be used inside switch statements.`. A defer
block that returns a value reports `Return with value not allowed in defer block`
with the hint `Defer blocks must return void.`. Valid loop `break`, loop
`continue`, switch `fallthrough`, and bare `return;` from a defer block remain
accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerControlFlowMisuse.test.ts
bun test tests/CLIJsonParseability.test.ts -t "control-flow misuse"
```

Binary operator misuse failures use `BPL_POINTER_ARITHMETIC_VOID`, `BPL_POINTER_DIFFERENCE_TYPE_MISMATCH`, `BPL_STRING_CONCAT_UNSUPPORTED`, `BPL_LOGICAL_OPERAND_TYPE_MISMATCH`, `BPL_COMPARISON_TYPE_MISMATCH`, `BPL_BITWISE_OPERAND_TYPE_MISMATCH`, `BPL_MODULO_OPERAND_TYPE_MISMATCH`, `BPL_BINARY_OPERAND_TYPE_MISMATCH`, and `BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH`. This covers unsupported string concatenation, invalid logical/comparison/bitwise/modulo operands, incompatible binary/arithmetic operands, void pointer arithmetic, and incompatible pointer subtraction. Representative messages include `Cannot perform pointer arithmetic on void pointer`, `Cannot compare pointer difference between`, `String concatenation with '+' is not supported.`, `Logical operators require boolean operands`, `Cannot compare int and string`, `Bitwise operators require integer operands`, `Modulo operator requires integer operands`, `Type mismatch: int and string`, and `Operator '+' cannot be applied to types`. The corresponding hints include `Cast to a sized pointer type first`, `Pointer subtraction requires compatible pointee types.`, `Use 'string_concat(a, b)' or similar helper functions.`, `Ensure both operands are boolean expressions.`, `Operands must be of compatible types.`, `Ensure both operands are integers.`, `Ensure operands have compatible types.`, and `Arithmetic operators require numeric types.`. Valid numeric, boolean, integer, pointer, and pointer-difference operators remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerBinaryOperatorMisuse.test.ts
bun test tests/CLIJsonParseability.test.ts -t "binary operator misuse"
```

Unary operator misuse failures use `BPL_DEREFERENCE_TARGET_INVALID`, `BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH`, `BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH`, `BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH`, and `BPL_UNARY_PLUS_UNSUPPORTED`. This covers invalid dereference targets, non-boolean logical-not operands, non-integer bitwise-not operands, non-numeric negation operands, and unsupported primitive unary plus. Representative messages include `Cannot dereference non-pointer type int`, `Logical not requires boolean operand`, `Bitwise not requires integer operand`, `Unary operator '-' cannot be applied to type 'string'`, and `Unary plus operator '+' is not supported`. The corresponding hints include `Dereference requires a pointer type.`, `Ensure the operand is a boolean expression.`, `Ensure the operand is an integer.`, `Negation requires a numeric type.`, and `Simply remove the '+' prefix.`. Valid pointer dereference, logical-not, bitwise-not, and numeric negation forms remain accepted; primitive unary plus remains rejected as a no-op. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerUnaryOperatorMisuse.test.ts
bun test tests/CLIJsonParseability.test.ts -t "unary operator misuse"
```

Index expression misuse failures use `BPL_ARRAY_INDEX_TYPE_MISMATCH`, `BPL_POINTER_INDEX_TYPE_MISMATCH`, and `BPL_INDEX_TARGET_NOT_INDEXABLE`. This covers array index type mismatches, pointer index type mismatches, and indexing non-indexable targets. Representative messages include `Array index must be an integer, got float`, `Pointer index must be an integer, got bool`, and `Type 'i32' is not indexable`. The corresponding hints include `Ensure the index expression evaluates to an integer.` and `Only arrays, pointers, or types with __get__ operator can be indexed.`. Valid array, pointer, alias-pointer, and `__get__` indexing remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerIndexExpressionMisuse.test.ts
bun test tests/CLIJsonParseability.test.ts -t "index expression misuse"
```

Member access misuse failures use `BPL_STATIC_MEMBER_NOT_FOUND`, `BPL_INSTANCE_METHOD_NOT_COMPATIBLE`, `BPL_TUPLE_INDEX_INVALID`, and `BPL_MEMBER_NOT_FOUND`. This covers missing static members, incompatible instance method access, invalid tuple indices, and missing concrete-type members. Representative messages include `No static member 'x' found on type 'S'`, `No compatible instance method 'staticFunc' found on type 'S'`, `Invalid tuple index '2'`, and `Cannot access member 'y' on type 'S'`. The corresponding hints include `Ensure the member is static (does not take 'this').`, `Static methods must be called on the type, not an instance.`, `Valid indices are 0-1`, and `Check the type definition for available members.`. Valid field, instance method, static method, tuple, and imported primitive-wrapper member access remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerMemberAccessMisuse.test.ts
bun test tests/CLIJsonParseability.test.ts -t "member access misuse"
```

Expression semantic guard failures use `BPL_DIVISION_BY_ZERO`, `BPL_SHIFT_COUNT_INVALID`, `BPL_ADDRESS_OF_CONSTANT`, `BPL_ADDRESS_OF_TARGET_INVALID`, `BPL_ARRAY_LITERAL_TYPE_MISMATCH`, `BPL_CAST_INTEGER_TO_STRING`, `BPL_CAST_INVALID`, and `BPL_SIZEOF_VOID_INVALID`. This covers compile-time division/modulo by zero, invalid constant shifts, address-of misuse, array literal element mismatches, invalid casts, and `sizeof(void)`. Representative messages include `Division by zero`, `Negative shift count`, `Shift count 8 is out of range`, `Cannot take address of constant expression.`, `Cannot take address of (int, int)`, `Array literal has inconsistent element types`, `Cannot cast integer type 'i32' to 'string'`, `Cannot cast i32 to Box`, and `Cannot take size of void`. The corresponding hints include `Shift counts must be zero or greater.`, `Address-of requires an lvalue.`, `All elements in an array literal must have the same type.`, `This cast is not allowed.`, and `Void type has no size.`. Valid division/modulo, in-range shifts, mutable lvalue address-of, homogeneous array literals, allowed casts, and non-void `sizeof` remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerExpressionSemanticGuards.test.ts
bun test tests/CLIJsonParseability.test.ts -t "expression semantic guard"
```

Statement semantic guard failures use `BPL_VARIABLE_TYPE_ANNOTATION_MISSING`, `BPL_VARIABLE_REDECLARATION`, `BPL_INTEGER_LITERAL_OVERFLOW`, `BPL_ASSIGNMENT_TARGET_CONSTANT`, `BPL_ASSIGNMENT_TARGET_INVALID`, and `BPL_TUPLE_DESTRUCTURE_TARGET_INVALID`. This covers missing local type annotations, duplicate local declarations, integer literal overflow, const assignment, invalid assignment targets, and invalid tuple destructuring targets. Representative messages include `Missing type annotation for variable 'value'`, `Variable 'value' is already declared in this scope`, `Integer overflow: value 128 does not fit in type i8`, `Cannot assign to constant 'value'`, `Invalid assignment target`, and `Invalid assignment target in tuple destructuring`. The corresponding hints include `Variables must have explicit type annotations.`, `Cannot redeclare 'value' in the same scope.`, `Ensure the value is within the range of i8.`, `Constants cannot be modified.`, `Left-hand side of assignment must be a variable, member, array element, pointer dereference, or tuple destructuring.`, and `Tuple elements in assignment must be valid l-values (variable, member, array element, or pointer dereference).`. Valid typed locals, unique declarations, in-range integer literals, mutable assignments, valid assignment targets, and valid tuple destructuring remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerStatementSemanticGuards.test.ts
bun test tests/CLIJsonParseability.test.ts -t "statement semantic guard"
```

Struct literal semantic failures use `BPL_STRUCT_LITERAL_UNKNOWN_STRUCT`, `BPL_GENERIC_ARITY_MISMATCH`, `BPL_STRUCT_LITERAL_FIELD_MISSING`, `BPL_STRUCT_LITERAL_FIELD_UNKNOWN`, and `BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH`. This covers unknown struct names, generic arity mismatches, missing fields, unknown fields, and field type mismatches in struct literals. Representative messages include `Unknown struct 'Missing'`, `Generic type 'Box' expects 1 arguments, but got 2`, `Missing field 'y' in struct literal for 'Point'`, `Unknown field 'z' in struct 'Point'`, and `Type mismatch for field 'x': expected i32, got *i8`. The corresponding hints include `Ensure the struct is defined.`, `Provide the correct number of generic arguments.`, `Field 'y' is required.`, `Check the struct definition for valid fields.`, and `Field value must match the declared type.`. Valid concrete and generic struct literals remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerStructLiteralDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "struct literal diagnostics"
```

Enum variant field semantic failures use `BPL_ENUM_VARIANT_FIELD_UNKNOWN` and `BPL_ENUM_VARIANT_FIELD_TYPE_MISMATCH`. This covers unknown enum struct variant construction fields, unknown enum struct pattern fields, and enum struct variant field type mismatches. Representative messages include `Unknown field 'z' in variant 'MouseMove'` and `Type mismatch for field 'x': expected int, got *i8`. The corresponding hints include `Check the variant definition.` and `Field value must match the declared type.`. Valid enum struct variant construction and struct-pattern matching remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerEnumVariantFieldDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "enum variant field diagnostics"
```

Intrinsic call semantic failures use `BPL_INTRINSIC_GENERIC_ARITY_MISMATCH` and `BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH`. This covers missing or extra `__type_id`/`__type_info` generic type arguments and forbidden value arguments. Representative messages include `Intrinsic __type_id requires exactly 1 generic argument` and `Intrinsic __type_info accepts no arguments`. The corresponding hints include `Use __type_id<T>() with exactly one type argument.` and `Call __type_info<T>() without value arguments.`. Valid `__type_id<T>()` and `__type_info<T>()` calls remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerIntrinsicCallDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "intrinsic call diagnostics"
```

Match exhaustiveness failures use `BPL_MATCH_EXHAUSTIVENESS_MISMATCH`. This covers missing enum variants and missing default cases for non-enum matches. Representative messages include `Non-exhaustive match: missing variants: Blue` and `Non-exhaustive match: missing default case (_)`. The corresponding hints include `Match expressions must handle all enum variants or include a wildcard (_) pattern.` and `Type matching requires a default case.`. Valid exhaustive enum matches, wildcard matches, irrefutable tuple destructuring, and non-enum tuple matches with provable finite coverage remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerMatchExhaustivenessDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "match exhaustiveness diagnostics"
```

Tuple match pattern failures use `BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH` and `BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH`. This covers tuple patterns used on non-tuple values and tuple pattern element-count mismatches. Representative messages include `Tuple pattern used on non-tuple type` and `Tuple pattern has 3 elements, but type has 2`. The corresponding hints include `Expected tuple type, got BasicType` and `Pattern and type must have the same number of elements`. Valid tuple pattern matching and tuple destructuring remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerTuplePatternDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "tuple pattern diagnostics"
```

Type-query failures use `BPL_TYPE_QUERY_ENUM_NOT_FOUND` and `BPL_TYPE_QUERY_TYPE_NOT_FOUND`. This covers unresolved `match<T>(value)` enum paths, unresolved `match<T>(value)` plain types, and unresolved `expr is T` targets. Representative messages include `Cannot find enum 'Missing'`, `Unknown type 'MissingType'`, and `Unknown type: MissingType`. The corresponding hints include `The type 'Missing' in match<Missing.Some> is not a defined enum.`, `The type 'MissingType' in match<MissingType> is not defined.`, and `Ensure the type is defined.`. Valid primitive `is` checks and valid enum-variant `match<T>(value)` checks remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerTypeQueryDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "type-query diagnostics"
```

Function-attribute failures use `BPL_FUNCTION_ATTRIBUTE_UNKNOWN`, `BPL_FUNCTION_ATTRIBUTE_DUPLICATE`, `BPL_FUNCTION_ATTRIBUTE_CONFLICT`, `BPL_FUNCTION_ATTRIBUTE_NORETURN_RETURN_TYPE_MISMATCH`, and the `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_*` codes. The auto-destroy family includes `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_CONTEXT_INVALID`, `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_NAME_MISMATCH`, `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_MISSING`, `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_TYPE_MISMATCH`, and `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RETURN_TYPE_MISMATCH`. This covers unknown attributes, duplicate attributes, conflicting attributes, invalid `noreturn` return types, and invalid `auto_destroy` method shapes. Representative messages include `Unknown function attribute 'trace'`, `Duplicate function attribute 'inline'`, `Conflicting function attributes: always_inline, noinline`, `Function attribute 'noreturn' requires a void return type`, and `Function attribute 'auto_destroy' requires receiver type '*Resource'`. The corresponding hints include `Only compiler-known function attributes are supported.`, `Remove one of the conflicting attributes.`, and `Change the first parameter to 'this: *Resource'.`. Valid supported attributes, valid `noreturn` void functions, and valid `destroy(this: *T) ret void` auto-destroy methods remain accepted. Reproduce the type-checker and JSON contracts with:

```bash
bun test tests/TypeCheckerFunctionAttributeDiagnostics.test.ts
bun test tests/CLIJsonParseability.test.ts -t "function-attribute diagnostics"
```

Missing normalized explicit `std/...` modules use `BPL_MODULE_NOT_FOUND` with a
`Standard library module not found` message. Explicit `std/` and `std\` imports
do not fall back to package resolution, even when a local, workspace, global, or
extra search-path package is named `std`. Reproduce the JSON contract with
`bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"`.

### CLI JSON compatibility policy

Machine-readable CLI JSON is a tooling contract. Consumers should check both
`schemaVersion` and `check`, handle `success: false` reports on stdout where a
command documents JSON-mode validation failures, and ignore unknown fields.
Tooling that wants to inventory stable failure codes can import
`CLI_JSON_ERROR_CODE_LISTS` or the flattened `CLI_JSON_ERROR_CODES` from the
CLI API; those exports are guarded for non-empty `BPL_*` entries without
per-list duplicates.

```ts
import { CLI_JSON_ERROR_CODE_LISTS } from "bpl-v3/cli";

for (const { name, codes } of CLI_JSON_ERROR_CODE_LISTS) {
  console.log(`${name}: ${codes.join(", ")}`);
}
```

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
`BPL_RUN_TIMEOUT_MS` invalid values fall back to running without a timeout.

## Debug Information

Generate DWARF debug information for debugging with gdb/lldb:

```bash
# Enable debug info
bpl build main.bpl --debug
bpl build main.bpl --debug-ir-path debug/main.ll
```

Diagnostic debug IR output uses the same symlink safety policy as other compiler
outputs: the destination, immediate parent, and parent path components must be
real filesystem entries before a `.ll` file is written. Use
`--debug-ir-path <file>` for an explicit CLI destination, or set
`BPL_DEBUG_IR=<file>` when driving the compiler through an environment-only
workflow. Debug IR path validation failures are exported through the public CLI
JSON error-code registry under the `codegen` group and appear as top-level
`errorCode` values in `bpl build --json` reports:

- `BPL_CODEGEN_DEBUG_IR_PATH_SYMLINK`
- `BPL_CODEGEN_DEBUG_IR_PATH_NOT_FILE`
- `BPL_CODEGEN_DEBUG_IR_PARENT_NOT_FOUND`
- `BPL_CODEGEN_DEBUG_IR_PARENT_SYMLINK`
- `BPL_CODEGEN_DEBUG_IR_PARENT_NOT_DIRECTORY`

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

Timeout environment variables must be positive integers. When a timeout value
is invalid, BPL ignores it with a warning that says `expected a positive
integer` and keeps the same fallback it would have used before the invalid
override:

- `BPL_COMPILE_DRIVER_TIMEOUT_MS` invalid values fall back to 600000 milliseconds.
- `BPL_CLEAN_GIT_TIMEOUT_MS` invalid values fall back to 5000 milliseconds.
- `BPL_PACKAGE_TOOL_TIMEOUT_MS` invalid values fall back to 300000 milliseconds.
- `BPL_OBJECT_SYMBOL_TIMEOUT_MS` invalid values fall back to 30000 milliseconds.
- `BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS` invalid values fall back to 30000 milliseconds.
- `SANITIZER_RUNTIME_TEST_TIMEOUT_MS` invalid values fall back to 30000 milliseconds.

`bpl doctor --json` reports timeout environment configuration in `timeouts`.
Each entry includes the known timeout variable name plus `raw`, `isValid`,
`defaultMs`, `effectiveMs`, and `fallbackAction`, so CI logs can show whether a
timeout came from the environment, a default, or an ignored invalid override.
Text `bpl doctor` prints a `Timeouts:` section with the same effective values
and warns inline for invalid timeout values.

Unknown doctor scopes use the stable `BPL_DOCTOR_SCOPE_UNKNOWN` JSON
`errorCode` while keeping the human-readable `error` text for older consumers.
Reproduce that focused contract with
`bun test tests/CLIJsonParseability.test.ts -t "doctor scope failures"`.

**Supported Targets:**

These triples are covered by code generation smoke tests. They confirm that the
compiler emits target metadata and LLVM IR for each target. Native binary
linking and execution still require an appropriate host toolchain, sysroot, C
runtime, and runtime support for that platform.

Unsupported target triples are rejected before LLVM IR is emitted, rather than
falling back to an unrelated host data layout. JSON-mode build failures use
`BPL_BUILD_UNSUPPORTED_TARGET`. Target matching uses full triple components, so
names that only contain supported components as substrings, such as
`x86_64-unknown-notlinux-gnu` or `notwasm32-unknown-unknown`, are rejected.
Malformed triples with empty components, such as `x86_64--linux` or `wasm32-`,
are rejected for the same reason.

Supported target families: x86_64 Linux, x86_64 macOS, AArch64 Linux, AArch64
macOS, i686 Linux, x86_64 Windows, wasm32, wasm64.

- `x86_64-pc-linux-gnu` (Linux x64)
- `aarch64-unknown-linux-gnu` (Linux ARM64)
- `arm64-apple-darwin` (macOS ARM64)
- `x86_64-apple-darwin` (macOS x64)
- `i686-unknown-linux-gnu` (Linux x86)
- `x86_64-pc-windows-gnu` (Windows x64)
- `wasm32-unknown-unknown` (WebAssembly 32-bit)
- `wasm64-unknown-unknown` (WebAssembly 64-bit metadata and IR)

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
cache files. Cached linked executable outputs also reject symlinked parent path
components before compiler-driver invocation or final rename. Use `bpl clean` to
clear cache manually.
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
`BPL_WASM_LINKER_PROBE_TIMEOUT_MS` must be a positive integer; invalid values
are ignored with a warning and the 5000ms default is used.

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
strings, `%d` for signed 32-bit integers, `%x`/`%X` for unsigned 32-bit hex,
one-digit `%Nd` and `%0Nd` integer widths, `%c` for one byte, `%f`/`%.Nf` for
fixed-point doubles with one-digit precision, and `%%` for a literal percent
sign. Unsupported format specifiers are emitted literally with their leading
`%` so output remains predictable. Edge cases are also stable: null `%s`
arguments print `(null)`; a dangling `%` prints as `%`; unsupported specifiers
do not consume varargs. Use native targets or a richer host/runtime adapter for
full libc formatting such as multi-digit widths, long integer modifiers,
scientific notation, or locale-sensitive output. `wasm32-wasi`,
`wasm32-wasip1`, and
target triples with an `emscripten` component select hosted mode by default;
`wasm32-unknown-unknown` stays freestanding unless `--wasm-runtime host` is
provided. Hosted defaults match target components, so substring-only components
such as `notwasi` or `notemscripten` stay freestanding unless
`--wasm-runtime host` is explicit.

Programs that depend on full operating-system APIs such as files, sockets,
process calls, or platform-specific inline assembly still need a richer
WASI/browser host implementation before they can run as standalone wasm.

The `examples/wasm_control_flow`, `examples/wasm_lambdas_generics`,
`examples/wasm_memory_strings`, `examples/wasm_memory_intrinsics`,
`examples/wasm_stdlib_array`, and `examples/wasm_stdlib_bitset` examples are
intentionally portable: they run as native x86_64 programs and as standalone
`wasm32-unknown-unknown` modules. `examples/wasm_hosted_io` covers basic hosted
mode I/O. `examples/wasm_hosted_printf` covers dynamic `%s`/`%d`/`%c` hosted
formatting plus fixed-point `%f`/`%.Nf` output while remaining
native-compatible. `examples/wasm_hosted_transform` is the richer hosted
regression: it remains native-compatible while wasm tests execute it with
host-provided argv, stdout, stderr, stdlib `String`, enum matching, generics,
and lambda capture.

The compatibility matrix in `tests/helpers/wasmCompatibilityMatrix.ts` is the
source of truth for CI. Each tracked example is marked as `wasm-freestanding`,
`wasm-hosted`, `blocked-by-host-api`, or `native-only`. Run it locally with
`bun run test:wasm`; this keeps wasm runtime checks skippable when no wasm
linker is installed and prints the checked linker candidates plus the exact
`WASM_LD`/`BPL_REQUIRE_WASM_LD` next step. The skip is reported as an optional
prerequisite skip, not a successful wasm execution. Run
`BPL_REQUIRE_WASM_LD=1 bun run test:wasm` to match CI and fail immediately when
`wasm-ld` or `WASM_LD` cannot be used.

Start with `bpl doctor --json` to see the same
`BPL_WASM_LINKER_UNAVAILABLE` code, candidates, environment, and recommended
commands that the wasm tests report when linker probing fails. Use
`BPL_REQUIRE_WASM_LD=1 bun run test:wasm` after doctor output to reproduce CI's
required-linker behavior locally.
Reproduce the hard failure with `BPL_REQUIRE_WASM_LD=1 bun run test:wasm`.
Inspect the same linker probe with `bun index.ts doctor --json` when you want
the repository-local CLI entry point instead of an installed `bpl` binary.
`bpl doctor --json` validates backend wasm compiler/linker prerequisites; it
does not inspect browser APIs. The playground Wasm tab reports `Browser wasm
runtime` and `Browser BPL compiler` separately. `Browser BPL compiler:
unavailable` means browser execution may still work, but BPL-to-wasm
compilation is delegated to the backend `/wasm` endpoint. Load a
`BplBrowserCompiler.compileToHostedWasm` bundle only when you want the
playground to compile BPL in the browser without the backend.

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
