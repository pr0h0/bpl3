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

1.  Extracts the package to `bpl_modules/<package-name>`.
2.  Reads the package's `bpl.json`.
3.  (Future) Resolves and installs dependencies listed in `bpl.json`.

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
