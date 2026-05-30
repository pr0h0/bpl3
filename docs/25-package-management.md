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

## Creating a Package

The quickest path is the library template:

```bash
bpl new my-package --template library
cd my-package
bpl check src/index.bpl
```

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
a stable API surface.

To create a package manually:

1.  Create a directory for your package.
2.  Create a `bpl.json` file.
3.  Write your code.
4.  Pack it into a distributable archive:

```bash
bpl pack
```

This will create `my-package-0.1.0.tgz` in the current directory.

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
    "math-extra": "1.0.0"
  },
  "devDependencies": {
    "test-tools": "file:../tools/test-tools-1.0.0.tgz"
  }
}
```

Supported dependency sources are:

- `file:../path/to/pkg-1.0.0.tgz` or `../path/to/pkg-1.0.0.tgz` for local
  archives.
- `1.2.3` for an exact version, resolved as `package-name-1.2.3.tgz` from the
  package cache.
- `package-name` for the newest matching cached archive.

Version ranges such as `^1.0.0` are not dependency syntax yet; use exact
versions when you need reproducible installs.

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
or test fixtures.

To restore exactly what is recorded in `bpl.lock`, run:

```bash
bpl install
```

To verify CI is using the checked-in package contents without mutating
`bpl_modules/`, run:

```bash
bpl install --locked
```

`--locked` fails if a package is missing, has a different version, or its source
hash no longer matches the lockfile. It also checks installed package manifests
for missing transitive dependencies, so deleting `bpl_modules/math-core` will be
reported even when only `math-extra` imports it.

To inspect why packages are installed and which dependencies are missing, use:

```bash
bpl list --tree
```

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

Packages can expose source files below their root through subpath imports:

```bpl
import increment from "math-extra/features/increment";
```

For package subpaths, BPL searches for a file or directory entry under the
package root. The example above resolves to either
`bpl_modules/math-extra/features/increment.bpl` or
`bpl_modules/math-extra/features/increment/index.bpl`.

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
