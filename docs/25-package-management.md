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
    "other-package": "^1.0.0"
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

To use a package in another project, you must install it. Currently, you can install from a local `.tgz` file.

```bash
bpl install ../path/to/my-package-0.1.0.tgz
```

This extracts the package into the `bpl_modules/` directory of your project.
For local installs, BPL also writes `bpl.lock` with the exact installed package
version, source archive, and content hash.

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
hash no longer matches the lockfile.

## Using Packages

Once installed, you can import the package by its name in your BPL code.

```bpl
import [MyStruct], myFunction from "my-package";

frame main() {
    myFunction();
}
```

The compiler resolves "my-package" to `bpl_modules/my-package/index.bpl` (or the file specified in `main`).

## Dependency Resolution

When you run `bpl install`, the package manager:

1.  Restores packages from `bpl.lock` when lock entries exist.
2.  Otherwise reads `dependencies` and `devDependencies` from `bpl.json`.
3.  Extracts packages to `bpl_modules/<package-name>`.
4.  Records the exact local install in `bpl.lock`.
5.  Resolves imports through `bpl_modules/`, workspace `packages/`, and the
    global package directory.

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
expectations, runs a standalone `./bpl` binary smoke test, and runs the VS Code
extension tests. It is intentionally smaller than the full compiler correctness
matrix so it stays useful as a local pre-release gate.
