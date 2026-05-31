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
rejects symlinked `bin` entries, so package archives contain only regular files
from inside the package root. When installing package binaries, BPL only creates
or replaces symlink entries in `bpl_modules/.bin` or the global BPL bin
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

## Installing Packages

To use a package in another project, install it from a package archive:

```bash
bpl install ../path/to/my-package-0.1.0.tgz
```

This extracts the package into the `bpl_modules/` directory of your project.
For local installs, BPL also writes `bpl.lock` with the exact installed package
version, source archive, and content hash.

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
`Invalid bpl.lock` diagnostic.

To restore exactly what is recorded in `bpl.lock`, run:

```bash
bpl install
```

To verify CI is using the checked-in package contents without mutating
`bpl_modules/`, run:

```bash
bpl install --locked
```

`--locked` fails if a package is missing, declares a different manifest name or
version than the lock entry, or its source hash no longer matches the lockfile.
It also checks installed package manifests for missing transitive dependencies,
so deleting `bpl_modules/math-core` will be reported even when only
`math-extra` imports it.

To re-resolve `bpl.json` dependency selectors and rewrite `bpl.lock`, run:

```bash
bpl install --update
```

Use this when a cache-backed selector such as `^1.2.0` should pick up a newer
matching cached archive. Without `--update`, `bpl install` restores the exact
archives already recorded in `bpl.lock`.

To repair the lockfile from packages already installed in `bpl_modules/`, run:

```bash
bpl install --repair-lock
```

This updates recorded versions and hashes for installed packages and removes
lock entries for packages that are no longer installed.

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
`bpl list --tree --json` uses `check: "package-list-tree"` with the same
`schemaVersion` and `success` fields, plus the dependency tree data used by the
human tree output.
`bpl doctor packages --json` uses a stable top-level contract with
`schemaVersion: 1`, `check: "packages"`, `success`, the legacy `ok` boolean,
lockfile details, cache verification, dependency tree data, and structured
issues with `severity`, `kind`, `message`, `path`, and `hint` fields.

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

Packages can expose source files below their root through subpath imports:

```bpl
import increment from "math-extra/features/increment";
```

For package subpaths, BPL searches for a file or directory entry under the
package root. The example above resolves to either
`bpl_modules/math-extra/features/increment.bpl` or
`bpl_modules/math-extra/features/increment/index.bpl`.
The resolver does not follow symlinked package roots, manifests, entry files, or
subpath entries, so package imports cannot escape the installed package root
through filesystem links.

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
`math-extra`.

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
under `entries`.

`package-cache verify` checks every matching cached archive. It verifies the
sidecar schema, the archive hash, the archive file name, the manifest identity,
and the extracted package content hash. Missing sidecars are reported as
`missing-provenance` so older caches remain visible instead of being silently
trusted. The `--json` report uses `schemaVersion: 1`,
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
`bpl.json`, not cache maintenance commands.

`package-cache clean` removes cached archives only. It does not remove installed
packages from `bpl_modules/`; use `bpl uninstall <package>` for that. When a
cached archive has a provenance sidecar, `package-cache clean` removes both
files together. Use `--json` to return `schemaVersion: 1`,
`check: "package-cache-clean"`, `success`, the removed archive list, and dry-run
state in machine-readable form.

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
