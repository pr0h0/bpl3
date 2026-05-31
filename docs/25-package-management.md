# Package Management

BPL includes a built-in package manager to help you organize code into reusable libraries and manage dependencies.

## Package Structure

A BPL package is a directory containing a `bpl.json` configuration file and source files.

```
my-package/
  bpl.json
  index.bpl       # Entry point (optional, but recommended)
  src/
    lib.bpl
```

### `bpl.json`

The configuration file defines the package metadata.

```json
{
  "name": "my-package",
  "version": "0.1.0",
  "description": "A useful library",
  "main": "index.bpl",
  "dependencies": {
    "other-package": "1.0.0"
  }
}
```

`name` must use lowercase letters, digits, and hyphens only. `version` must be
an `X.Y.Z` semantic version string. `main` and `exports` must stay inside the
package root, and optional metadata such as `keywords` and `repository` is
validated before packing or installing. Invalid manifests fail while loading
`bpl.json` instead of later during path handling or archive creation.

`main`, `exports`, and `bin` path values are strict package-relative paths.
They cannot be absolute and cannot contain empty, `.`, or `..` path segments.
Use normalized paths such as `src/index.bpl` or `bin/tool.bpl`;
`src//index.bpl`, `src/./index.bpl`, and `../secret.bpl` are rejected before
packing or installing.

## Creating a Package

The quickest path is the library template:

```bash
bpl new my-package --template library
cd my-package
bpl check src/index.bpl
```

The template uses the project name as the package manifest name, so `bpl new`
accepts package-safe names only: lowercase letters, numbers, and hyphens.
`bpl init [name]` follows the same rule for explicit names. Without a name, it
derives a package-safe default from the current directory by lowercasing it and
replacing unsupported characters with hyphens.
Package init JSON reports are available with `bpl init [name] --json`.
Successful init runs emit `schemaVersion: 1`, `check: "package-init"`,
`success: true`, `package`, `version`, and `manifestPath`. JSON-mode validation
failures stay on stdout with `success: false`, `package`, `manifestPath`,
`error`, and stable `errorCode` values including
`BPL_PACKAGE_INIT_NAME_INVALID` for invalid explicit names and
`BPL_PACKAGE_INIT_MANIFEST_EXISTS` when `bpl.json` is already present.
Reproduce the focused JSON contract with
`bun test tests/PackageManagerCLI.test.ts -t "init success and failures as JSON"`.

This creates:

```
my-package/
  bpl.json
  src/
    index.bpl
  examples/
    usage.bpl
```

`src/index.bpl` is the public package entry point. Keep exports there small and
intentional so editor tooling, package consumers, and cache invalidation all see
a stable API surface. `bpl pack` does not follow symlinked source files and
rejects symlinked `bin` entries, including broken symlinks, so package archives
contain only regular files from inside the package root. Package archive install
paths reject both final symlinks and symlinked parent directories before
extraction, so a path such as `deps-link/math-core-1.0.0.tgz` cannot redirect an
install through a linked directory. When installing package binaries, BPL only
creates or replaces symlink entries in `bpl_modules/.bin` or the global BPL bin
directory; an existing regular file or directory with the same command name is
rejected and left untouched.

To create a package manually:

1.  Create a directory for your package.
2.  Create a `bpl.json` file.
3.  Write your code.
4.  Pack it into a distributable archive:

```bash
bpl pack
bpl pack --output dist/packages
```

The first command creates `my-package-0.1.0.tgz` in the current directory.
When `--output` points to a missing directory, BPL creates that directory before
writing the archive and provenance sidecar.
Package pack JSON reports are available with `bpl pack [dir] --json`.
Successful packs emit `schemaVersion: 1`, `check: "package-pack"`,
`success: true`, `package`, `version`, `packageDir`, `outputDir`, and
`archivePath`. JSON-mode validation failures stay on stdout with
`success: false`, `packageDir`, `outputDir`, `error`, and stable PackageManager
`errorCode` values when the failure is classified, including
`BPL_PACKAGE_MANIFEST_MISSING` for package directories without `bpl.json`.
Reproduce the focused JSON contract with
`bun test tests/PackageManagerCLI.test.ts -t "pack success and failures as JSON"`.

## Installing Packages

To use a package in another project, install it from a package archive:

```bash
bpl install ../path/to/my-package-0.1.0.tgz
```

This extracts the package into the `bpl_modules/` directory of your project.
For local installs, BPL also writes `bpl.lock` with the exact installed package
version, source archive, and content hash.
If `bpl_modules/<package-name>` already exists, BPL only treats a real
directory as an upgrade target. Existing regular files or symlinks at the
package install path are rejected and left untouched.
Direct archive installs also revalidate the selected package root immediately
before writing. If `bpl_modules/` or the configured global package directory is
replaced with a symlink after the package manager starts, install fails instead
of writing package files through the link. Missing real install roots are
recreated.

Project manifests can also declare dependencies directly:

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "math-core": "file:../packages/math-core/math-core-1.0.0.tgz",
    "math-extra": "^1.2.0"
  },
  "devDependencies": {
    "test-tools": "file:../tools/test-tools-1.0.0.tgz"
  }
}
```

Supported dependency sources are:

- `file:../path/to/pkg-1.0.0.tgz` or `../path/to/pkg-1.0.0.tgz` for local
  archives. Root project paths are resolved from the project directory;
  transitive package paths are resolved from the archive directory of the
  package that declares them.
- `1.2.3` for an exact version, resolved as `package-name-1.2.3.tgz` from the
  package cache.
- `^1.2.3`, `~1.2.3`, `>=1.2.0 <2.0.0`, or `latest` for cache-backed range
  resolution. BPL selects the highest cached package version satisfying the
  selector and records that exact archive in `bpl.lock`.
- `package-name` for the newest matching cached archive.

`dependencies` and `devDependencies` must be JSON objects whose keys are
lowercase package names and whose values are non-empty, non-whitespace strings.
Invalid dependency maps fail while loading `bpl.json`, before install or
lockfile commands mutate the project.

```json
{
  "lockfileVersion": 1,
  "packages": {
    "my-package": {
      "version": "0.1.0",
      "source": "../path/to/my-package-0.1.0.tgz",
      "hash": "..."
    }
  }
}
```

Commit `bpl.lock` for applications so repeated installs resolve the same
package contents. Libraries may commit it when they need reproducible examples
or test fixtures. Lockfiles are schema-validated before install, verify, doctor,
or repair commands use them; malformed entries fail early with an
`Invalid bpl.lock` diagnostic. Symlinked `bpl.lock` paths, including broken
symlinks, are rejected before verification so package checks never follow a
lockfile outside the project, and before project installs decide whether there
is anything to restore or install.

To restore exactly what is recorded in `bpl.lock`, run:

```bash
bpl install
```

To verify CI is using the checked-in package contents without mutating
`bpl_modules/`, run:

```bash
bpl install --locked
```

`--locked` fails if a package is missing, if `bpl_modules` or
`bpl_modules/<package>` is a symlink or non-directory, if the installed manifest
declares a different name or version than the lock entry, if the recorded source
archive is missing, a symlink, or reachable only through a symlinked parent
directory, or if its source hash no longer matches the lockfile. Missing
`bpl_modules` roots still report package-missing issues for locked entries;
symlinked roots are rejected before any locked package manifest or file content
is read through the link. It also checks installed package manifests for missing
or malformed transitive dependency roots and lock entries, so deleting
`bpl_modules/math-core` or removing `math-core` from `bpl.lock` will be reported
even when only `math-extra` imports it.

To re-resolve `bpl.json` dependency selectors and rewrite `bpl.lock`, run:

```bash
bpl install --update
```

Use this when a cache-backed selector such as `^1.2.0` should pick up a newer
matching cached archive. Without `--update`, `bpl install` restores the exact
archives already recorded in `bpl.lock`.
Package-name, version selector, and exact cached archive lookup validate the
global package cache directory itself and its parent path components before
probing tarballs. If the cache root or one of its parents is a symlink, lookup
is rejected; if the cache root is missing, install reports the package as
unavailable instead of surfacing a raw filesystem error.
Direct archive installs perform the same `lstat`-based package-root validation
before writes to local `bpl_modules/` or the global package directory.
Existing package-manager roots and newly created package-manager roots also
reject symlinked parent directories, so post-construction symlink swaps or
symlinked cache parents cannot redirect package installation or global cache
writes outside the selected package root.

To repair the lockfile from packages already installed in `bpl_modules/`, run:

```bash
bpl install --repair-lock
```

This updates recorded versions and hashes for installed packages and removes
lock entries for packages that are no longer installed.
Add `--json` to emit a `package-install` report for automation; JSON-mode
validation failures stay parseable on stdout with `success: false` and an
`error` field. When the underlying package error has a stable compiler code, the
report also includes `errorCode`, such as `BPL_LOCKFILE_UNSUPPORTED_VERSION` for
malformed lockfiles, `BPL_PACKAGE_NOT_FOUND` for package lookup misses,
`BPL_PACKAGE_INSTALL_*_CONFLICT` for project-mode option conflicts, and
`BPL_PACKAGE_ARCHIVE_*` for direct archive paths that are symlinks, pass through
symlinked parents, or are not files.
PackageManager manifest-loading failures also carry stable
`BPL_PACKAGE_MANIFEST_*` codes: `BPL_PACKAGE_MANIFEST_MISSING`,
`BPL_PACKAGE_MANIFEST_SYMLINK`, `BPL_PACKAGE_MANIFEST_NOT_FILE`,
`BPL_PACKAGE_MANIFEST_PARSE_ERROR`, `BPL_PACKAGE_MANIFEST_NOT_OBJECT`,
`BPL_PACKAGE_MANIFEST_NAME_MISSING`, `BPL_PACKAGE_MANIFEST_NAME_INVALID`,
`BPL_PACKAGE_MANIFEST_VERSION_MISSING`,
`BPL_PACKAGE_MANIFEST_VERSION_INVALID`,
`BPL_PACKAGE_MANIFEST_MAIN_INVALID`, and
`BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID`. Reproduce the focused JSON
contract with
`bun test tests/PackageJsonFailureContracts.test.ts -t "package manifest error codes"`.

`bpl doctor packages --json` reports malformed or unsafe lockfiles as
`kind: "invalid-lockfile"` issues with stable `BPL_LOCKFILE_*` codes, including
`BPL_LOCKFILE_INVALID_JSON`, `BPL_LOCKFILE_UNSUPPORTED_VERSION`,
`BPL_LOCKFILE_INVALID_PACKAGES`, `BPL_LOCKFILE_INVALID_ENTRY_NAME`,
`BPL_LOCKFILE_INVALID_ENTRY_HASH`, `BPL_LOCKFILE_NOT_FILE`, and
`BPL_LOCKFILE_SYMLINK`.

To inspect why packages are installed and which dependencies are missing, use:

```bash
bpl list --json
bpl list --tree
bpl list --tree --json
bpl doctor packages
bpl doctor packages --json
```

Use the JSON forms for CI and tooling. `bpl list --json` uses a stable
top-level contract with `schemaVersion: 1`, `check: "package-list"`,
`success`, and installed package names, versions, paths, and content hashes.
Package listing revalidates the local or global package directory with
`lstat` before scanning, including parent path components, so a symlinked
`bpl_modules`, global package cache directory, or parent directory is rejected
instead of followed. In JSON mode, unsafe package-root failures return
`success: false`, the requested `scope`, an empty `packages: []` payload, and
`error`.
`bpl list --tree --json` uses `check: "package-list-tree"` with the same
`schemaVersion` and `success` fields, plus the dependency tree data used by the
human tree output. Tree generation validates an existing local `bpl.lock`
before choosing lockfile roots; symlinked, broken-symlink, malformed, or
non-file lockfile paths are rejected instead of being treated as absent. Tree
roots and nodes also classify `bpl_modules` and `bpl_modules/<package>` paths
with `lstat`, so symlinked or non-directory package roots are reported as
problems instead of being followed. Tree JSON validation failures return the
requested `scope`, `tree: []`, and `error`.
`bpl doctor packages --json` uses a stable top-level contract with
`schemaVersion: 1`, `check: "packages"`, `success`, the legacy `ok` boolean,
lockfile details, cache verification, dependency tree data, and structured
issues with `severity`, `kind`, `message`, `path`, and `hint` fields.
When the local package directory, global package cache directory, or one of its
parent directories is unsafe to read, doctor reports an
`unsafe-package-directory` issue and leaves the affected package lists empty
instead of following the directory.

Example output:

```text
Dependency tree (local):

  math-extra@1.0.0 [locked] <- 1.0.0
    math-core@1.0.0 [locked] <- 1.0.0
```

Missing packages are shown inline:

```text
  math-extra@1.0.0 [locked] <- 1.0.0
    math-core@1.0.0 (missing) [locked] <- 1.0.0
      ! missing from bpl_modules
```

## Using Packages

Once installed, you can import the package by its name in your BPL code.

```bpl
import [MyStruct], myFunction from "my-package";

frame main() {
    myFunction();
}
```

The compiler resolves "my-package" to `bpl_modules/my-package/index.bpl` (or
the file specified in `main`). Resolution starts from the importing file's
directory and walks upward, so `src/main.bpl` can import packages installed at
the project root even when `bpl check /path/to/project/src/main.bpl` is run from
another working directory.

During package resolution, the requested package name must use the same
lowercase package-name format as package manifests. The package directory name
and manifest must agree: `bpl_modules/my-package/bpl.json` must declare
`"name": "my-package"` and a valid `X.Y.Z` `"version"`. Global versioned
directories such as `~/.bpl/packages/my-package-1.2.3/` must also declare the
same `"version": "1.2.3"` in `bpl.json`. Global versioned package directories
must match their manifest `version`. Mismatches or malformed identity fields
are treated as package metadata errors instead of silently importing a
different package. Package import paths cannot contain empty, `.` or `..`
segments; use relative imports for filesystem traversal inside your own
project.

Global versioned package directories use the `<package>-X.Y.Z` naming form.
When resolving a global package import, BPL selects the highest semantic
version whose directory name matches the requested package, then validates that
root before reading `bpl.json`. The selected global versioned package root is
still validated with `lstat` before its manifest is read, so a symlink, regular
file, or other non-directory named like a higher version blocks fallback to
lower versions. For example, `~/.bpl/packages/math-9.0.0` as a symlink or file
blocks fallback to `~/.bpl/packages/math-1.0.0`.

Packages can expose source files below their root through subpath imports:

```bpl
import increment from "math-extra/features/increment";
```

For package subpaths, BPL searches for a file or directory entry under the
package root. The example above resolves to either
`bpl_modules/math-extra/features/increment.bpl` or
`bpl_modules/math-extra/features/increment/index.bpl`.
The resolver does not follow symlinked package search directories, package
roots, manifests, source parent directories, entry files, or subpath entries, so
package imports cannot escape the installed package root through filesystem
links. Symlinked package search directories such as `bpl_modules/`, workspace
`packages/`, and the global package directory are rejected before child package
candidates are probed. Nested package source paths such as `src/index.bpl` and
`features/add.bpl` reject symlinked parent directories before the child file is
read.
Symlinked package search directories stop package resolution instead of falling
through to lower-priority package roots: a symlinked local `bpl_modules/` stops
resolution before workspace `packages/`, and a symlinked workspace `packages/`
stops resolution before global packages. A symlinked global package directory
is rejected before global package candidates are listed.
Existing malformed package roots are terminal metadata failures, so a blocked
local package root cannot fall through to a same-name workspace or global
package. This includes symlinked package roots, non-directory package paths, and
package directories missing `bpl.json`.
Symlinked package entrypoint and subpath candidates are also terminal resolution
failures; the resolver will not fall through from a blocked `.bpl` package
candidate to a lower-priority `.x` file, including package directory
`index.bpl` candidates before `index.x`.
After a package root has been accepted, package source failures are terminal
too: unsafe manifest entrypoint values such as `../outside.bpl`, symlinked
entrypoint files, and subpath source parents such as `features/` are reported
at the import site instead of falling back to alternate candidates or following
the link.

In `bpl check --json` and `bpl build --json`, package import diagnostics use
the normal diagnostic object shape and include a stable `code` when the
resolver can classify the failure. Source-safety failures use
`BPL_PACKAGE_ENTRYPOINT_UNSAFE`, `BPL_PACKAGE_ENTRYPOINT_SYMLINK`, and
`BPL_PACKAGE_SUBPATH_SYMLINK`. Package search and metadata failures use
`BPL_PACKAGE_SEARCH_DIR_SYMLINK`, `BPL_PACKAGE_ROOT_NOT_DIRECTORY`,
`BPL_PACKAGE_MANIFEST_MISSING`, and `BPL_PACKAGE_MANIFEST_INVALID`.

Regular module import candidates use the same filesystem diagnostics: broken
symlink candidates are reported as symlinks before extension fallback can import
a lower-priority `.x` file, while valid symlink imports normalize to their real
module path. Non-package import diagnostics use stable JSON `code` values too:
`BPL_MODULE_NOT_FOUND`, `BPL_MODULE_FILE_NOT_FOUND`,
`BPL_MODULE_PATH_NOT_FILE`, `BPL_MODULE_PATH_SYMLINK`, and
`BPL_IMPORT_STD_PATH_UNSAFE`.

Workspace packages are supported without installing an archive. If an ancestor
directory contains `packages/<package-name>/bpl.json`, imports can resolve
through that workspace before falling back to global packages. The runnable
example in `examples/package_transitive_dependency/app/main.bpl` demonstrates a
workspace package, a transitive dependency, and a subpath import.

## Dependency Resolution

When you run `bpl install`, the package manager:

1.  Restores packages from `bpl.lock` when lock entries exist.
2.  Otherwise reads `dependencies` and `devDependencies` from `bpl.json`.
3.  Extracts packages to `bpl_modules/<package-name>`.
4.  Installs package dependencies recursively.
5.  Records each exact local install in `bpl.lock`.
6.  Resolves imports through the nearest `bpl_modules/`, workspace `packages/`,
    and then the global package directory.

Dependency cycles are rejected with the full package chain:

```text
Cyclic package dependency detected: app-a -> app-b -> app-a
```

Dependency names are also checked during project installs. If `bpl.json` asks
for `math-core` but the archive contains a manifest named `other-core`, install
fails instead of writing a lockfile that can never satisfy imports.

For transitive `file:` dependencies, the path belongs to the package that
declares it. If `packages/math-extra/math-extra-1.0.0.tgz` declares
`"math-core": "file:../math-core/math-core-1.0.0.tgz"`, BPL resolves that path
relative to `packages/math-extra/`, not relative to the app installing
`math-extra`. The resolved archive path must not traverse symlinked parent
directories; BPL rejects it before extraction rather than installing package
contents from outside the declared archive path.

## Package Cache

The package cache stores `.tgz` archives used by exact-version dependencies,
global installs, and restores from `bpl.lock`. `bpl pack` writes a provenance
sidecar next to each archive:

```text
math-core-1.0.0.tgz
math-core-1.0.0.tgz.bplmeta.json
```

The sidecar records the archive SHA-256, the extracted package content hash,
the package name and version, and the manifest used to produce the archive.
Global installs copy the archive into the cache and regenerate the sidecar from
the extracted package so cached installs can be audited later.

Archive creation, inspection, and extraction use `BPL_TAR`, then `TAR`, then
`tar`. Set one of these variables when the system tar is not on `PATH` or when
CI should use a specific archive tool. Archive tool invocations are bounded by
`BPL_PACKAGE_TOOL_TIMEOUT_MS`, defaulting to 300000 milliseconds.

`bpl pack` also verifies generated package LLVM IR with `BPL_CC`, `CC`, or
`clang` when available. That verifier is bounded by
`BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS` and defaults to 30000 milliseconds so a
hung compiler driver does not block package creation forever.
Timeout environment variables must be positive integers; invalid values are
ignored with a warning that says `expected a positive integer`. For package
commands, `BPL_PACKAGE_TOOL_TIMEOUT_MS` invalid values fall back to 300000
milliseconds, and `BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS` invalid values fall back to
30000 milliseconds.

```bash
bpl package-cache list
bpl package-cache list math-core --json
bpl package-cache verify
bpl package-cache verify math-core --json
bpl package-cache repair math-core --dry-run
bpl package-cache repair math-core --package-version 1.0.0
bpl package-cache clean math-core --package-version 1.0.0 --dry-run
bpl package-cache clean math-core --package-version 1.0.0 --json
```

`package-cache list --json` reports cached archives with `schemaVersion: 1`,
`check: "package-cache-list"`, `success`, and the existing cache entry payload
under `entries`. Package-name and semver cache resolution use the same
`lstat`-based archive filtering as list and verify, so symlinked cache archives
cannot shadow real cached versions. Package-cache listing, verification,
repair, and clean also validate the global cache root and its parent path
components before touching archives or provenance sidecars, so a symlinked cache
parent is rejected instead of followed. In JSON mode, unsafe cache-root
failures from `package-cache list` return `success: false`, `entries: []`, and
`error`; `package-cache verify` returns `success: false`, `ok: false`,
`entriesChecked: 0`, `issues: []`, and `error`.

`package-cache verify` checks every matching cached archive. It verifies the
sidecar schema, the archive hash, the archive file name, the manifest identity,
and the extracted package content hash. Missing sidecars are reported as
`missing-provenance` so older caches remain visible instead of being silently
trusted. Malformed sidecars and symlinked provenance paths are reported as
`invalid-provenance` issues with the cache archive path and sidecar
`provenancePath`, so automation can flag unsafe cache metadata without
following it. The `--json` report uses `schemaVersion: 1`,
`check: "package-cache-verify"`, `success`, the legacy `ok` boolean,
`entriesChecked`, and structured provenance `issues`.
`bpl doctor packages` includes the same cache verification result in its JSON
report and prints provenance warnings for stale or damaged cache entries. In
JSON output, package-cache doctor issues use
`package-cache-<verification-kind>` issue kinds such as
`package-cache-missing-provenance`, preserving the original cache entry path and
repair hint for CI annotations.

`package-cache repair` regenerates missing or malformed provenance sidecars for
valid cached archives. Its JSON result uses `schemaVersion: 1`,
`check: "package-cache-repair"`, `success`, `dryRun`, `repaired`, `unchanged`,
and `issues`. It refuses to repair archive hash mismatches or manifest
mismatches because those states may indicate a stale or damaged archive; clean
and repack those entries instead. `--package-version` filters expect one exact
cached version in `X.Y.Z` form; dependency ranges such as `^1.2.3` belong in
`bpl.json`, not cache maintenance commands. In JSON mode, clean and repair
validation failures keep stdout parseable: clean reports `removed: []`, repair
reports `repaired: []`, `unchanged: []`, and `issues: []`, and both include the
requested `dryRun` value plus `error`. Package-cache validation failures that
come from an invalid `--package-version` value also include
`errorCode: "BPL_PACKAGE_CACHE_VERSION_INVALID"`. Reproduce the focused
contract with
`bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache version filter"`.
The package-cache package filters must use the same lowercase package-name format as
package manifests. Invalid package filters in `package-cache list`, `verify`,
`clean`, and `repair` fail with `BPL_PACKAGE_CACHE_NAME_INVALID`; reproduce that
contract with
`bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache package filter"`.

`package-cache clean` removes cached archives only. It does not remove installed
packages from `bpl_modules/`; use `bpl uninstall <package>` for that. When a
cached archive has a provenance sidecar, `package-cache clean` removes both
files together, including malformed sidecar directories and symlink sidecars
whose targets may already be missing. Use `--json` to return `schemaVersion: 1`,
`check: "package-cache-clean"`, `success`, the removed archive list, and dry-run
state in machine-readable form. Clean refuses to run through symlinked cache
parents, so it cannot delete archives or sidecars from an unintended target
directory.

Installing by an exact cached archive name such as `my-package-1.0.0.tgz` uses
the same archive path validation as a direct file path. Symlinked or broken
symlink cache entries are rejected as package archive symlinks rather than being
treated as missing packages.

`file:` and relative archive dependencies use the same path classification.
Broken symlink dependency archives are rejected as package archive symlinks
instead of falling back to a package-name lookup.

`bpl uninstall <package>` only removes real installed package directories. If
`bpl_modules/<package>` is a symlink, uninstall rejects it and leaves both the
symlink and its target untouched. Package manifests are validated with the same
`lstat` rules during uninstall, so symlinked or broken-symlink `bpl.json` paths
are rejected as manifest symlinks instead of being treated as missing manifests.
Package uninstall JSON reports are available with
`bpl uninstall <package> --json` and the `remove` alias. Successful uninstalls
emit `schemaVersion: 1`, `check: "package-uninstall"`, `success: true`, the
removed `package`, its `version`, and the requested `global` scope. JSON-mode
failures stay on stdout with `success: false`, `package`, `global`, `error`,
and stable `errorCode` values including `BPL_PACKAGE_UNINSTALL_NAME_INVALID`
for invalid package names and `BPL_PACKAGE_UNINSTALL_NOT_INSTALLED` for missing
local or global packages. Reproduce the focused JSON contract with
`bun test tests/PackageManagerCLI.test.ts -t "uninstall success and failures as JSON"`.
Local uninstall also validates an existing `bpl.lock` before unlinking binaries
or removing package files; symlinked, broken-symlink, malformed, or non-file
lockfile paths are rejected instead of leaving package files and lock entries
inconsistent.
Local and global uninstall revalidate the selected package root before probing
or removing `bpl_modules/<package>` or global package directories. If
`bpl_modules/` or the configured global package directory is swapped to a
symlink after the package manager starts, uninstall fails before reading or
removing package files through the link.
When uninstalling packages with `bin` entries, BPL also revalidates
`bpl_modules/.bin` or the global BPL bin directory before unlinking command
symlinks. Symlinked or non-directory bin roots are rejected; a missing bin
directory is tolerated because there are no command links to remove.

## Package Scripts

Packages can define shell scripts in `bpl.json`:

```json
{
  "scripts": {
    "check": "bpl check src/main.bpl",
    "build": "bpl build src/main.bpl -o app"
  }
}
```

List them with `bpl run-script --list` or as JSON with
`bpl run-script --list --json`. Run one with `bpl run-script <name>` or
`bpl rs <name>`. Script commands must be non-empty strings. Extra arguments are
forwarded to the script as quoted shell arguments, so values containing spaces
or shell metacharacters remain single arguments; pass option-looking values
after `--`, for example `bpl rs build -- --release`. When `--json` is used,
`bpl run-script --list --json` returns `schemaVersion: 1`,
`check: "run-script-list"`, `success: true`, and the `scripts` array. Manifest
and script validation failures are emitted as machine-readable
JSON with the same `schemaVersion` and `check`, plus `success: false` and
`error`. Named-script validation failures from `bpl run-script <name> --json`
use `check: "run-script"` with the same error shape, so CI and editor
integrations do not need to parse logger text.

Run-script manifest loading uses the same filesystem safety posture as the
package manager: `bpl.json` must be a real file, not a symlink, and its parent
path components must not be symlinks. This check happens before parsing,
listing, or executing scripts, so launchers that preserve a symlink-spelled
working directory should run `bpl run-script` from the real project path.

```bash
bpl run-script --list
bpl run-script --list --json
bpl run-script check
bpl rs build -- --release
```

## Best Practices

- **Entry Point**: Use `index.bpl` to re-export the public API of your package.

  ```bpl
  # index.bpl
  import [MyStruct] from "./src/structs.bpl";
  import myFunction from "./src/funcs.bpl";

  export [MyStruct];
  export myFunction;
  ```

- **Names**: Use unique, lowercase names for packages (kebab-case recommended).

## Release Checks

Before publishing or cutting a release, run:

```bash
bun run release:check
```

This type-checks the TypeScript code, validates release metadata and workflow
expectations, runs standalone `./bpl` and packed npm tarball smoke tests, and
runs the VS Code extension tests. It is intentionally smaller than the full
compiler correctness matrix so it stays useful as a local pre-release gate.
The packed npm smoke includes package/import diagnostic JSON coverage: it runs
the installed CLI against a malformed package import and asserts the stable
`BPL_PACKAGE_MANIFEST_MISSING` diagnostic code. Reproduce that focused contract
with `bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"`,
or run the full packed smoke with `bun run release:smoke`.

To create a checksum manifest for the release artifacts, run:

```bash
bun run build
bun run release:manifest
```

This writes `dist/release-manifest.json` and records SHA-256 hashes for the
standalone compiler binary, native and wasm runtime shims, `lib/runtime_support.o`,
and the packed npm tarball. The npm artifact entry also includes the package
integrity and shasum values emitted by `npm pack --json`, so downstream release
jobs can compare the compiler package against the published archive.

For source packages, keep these checks together:

```bash
bpl format --check src/*.bpl
bpl lint --json src/*.bpl
bpl check --json src/index.bpl
bpl pack
```

`format --check` verifies that generated archives contain formatted sources,
while `lint --json` and `check --json` provide stable diagnostic ranges for CI
annotations.
