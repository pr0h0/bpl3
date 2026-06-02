# Imports and Exports

BPL modules are ordinary `.bpl` files. Each file has its own scope, and symbols are private unless the file exports them explicitly.

## Import Syntax

Import functions, globals, and other value symbols by name:

```bpl
import add, multiply from "./math.bpl";
```

Import types by wrapping the imported name in brackets:

```bpl
import [Point], distance from "./geometry.bpl";
```

Import every exported symbol under a namespace:

```bpl
import * as math from "./math.bpl";
```

Import a module for side effects:

```bpl
import "std/errors.bpl";
```

Repeated imports of the same exported declaration are idempotent, including
repeated `import * as namespace` imports of the same module. The compiler
implicitly makes `Error` from `std/errors.bpl` available to normal modules, so
an explicit `import [Error] from "std/errors.bpl";` is accepted and resolves to
the same declaration instead of reporting a duplicate symbol. Duplicate names
from different declarations still report `BPL_SYMBOL_ALREADY_DEFINED`.

Aliases are supported for bare value imports:

```bpl
import add as sum from "./math.bpl";
```

## Export Syntax

Declare the symbol first, then export it with a separate `export` statement. Inline exports such as `export frame foo()` and `export struct Foo` are not part of the current grammar.

```bpl
# math.bpl
frame add(a: int, b: int) ret int {
    return a + b;
}

frame multiply(a: int, b: int) ret int {
    return a * b;
}

export add;
export multiply;
```

Export types with bracket syntax:

```bpl
# geometry.bpl
struct Point {
    x: int,
    y: int,
}

frame distanceSquared(p: Point) ret int {
    return (p.x * p.x) + (p.y * p.y);
}

export [Point];
export distanceSquared;
```

Export globals the same way as functions:

```bpl
global const PI: float = 3.141592653589793;

export PI;
```

## Module Example

**math.bpl**

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}

frame multiply(a: int, b: int) ret int {
    return a * b;
}

export add;
export multiply;
```

**main.bpl**

```bpl
import add, multiply from "./math.bpl";
extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local sum: int = add(5, 3);
    local product: int = multiply(5, 3);
    printf("%d %d\n", sum, product);
    return 0;
}
```

Run it with:

```bash
bpl run main.bpl
```

## Module Resolution

BPL resolves imports in this order:

1. Relative paths such as `./utils.bpl` and `../shared.bpl`
2. Standard library modules, including bare module names such as `math` and
   explicit paths under `std/`
3. Local packages in `bpl_modules/`
4. Global packages in `~/.bpl/packages/`

Relative imports are resolved from the importing file:

```bpl
# src/module1.bpl
import [Config] from "../config/app.bpl";
import helper from "../utils.bpl";
```

Standard library imports use the `std/` prefix:

```bpl
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
```

Bare imports that match standard-library module basenames resolve to the
standard library before package lookup. A package named `math` is shadowed by
the built-in `math` module when imported as `"math"`, so package names that
collide with standard-library module basenames are not reachable through bare
imports. Use a non-stdlib package name such as `math-extra`, or use explicit
relative imports for local project files.

Explicit `std/` and `std\` paths must be normalized subpaths inside the
standard library. They cannot contain empty, `.`, or `..` path segments, so
imports such as `std//array.bpl`, `std/./array.bpl`, `std/../array.bpl`, and
`std\..\array.bpl` are rejected before the compiler resolves them against the
standard library root.

Explicit `std/` and `std\` imports are reserved for the configured standard
library. A missing normalized `std/...` module fails with
`BPL_MODULE_NOT_FOUND` and a `Standard library module not found` diagnostic;
the resolver does not fall back to local packages, workspace packages, global
packages, or extra search paths, even if a package is named `std`.

### Import Diagnostics

Normal `bpl check`, `bpl build`, and cached builds preserve resolver-specific
import diagnostics. Unsafe `std/` paths report the rejected import path, and
package failures keep package metadata details such as invalid `bpl.json`
fields, manifest-name mismatches, missing entrypoints, and searched package
paths.

JSON diagnostics include stable `code` values for import-resolution failures
that tooling can classify without parsing human text. Missing relative,
absolute, package, or search-path modules use `BPL_MODULE_NOT_FOUND`; missing
entry files use `BPL_MODULE_FILE_NOT_FOUND`; directory entry paths use
`BPL_MODULE_PATH_NOT_FILE`; broken symlink module candidates or entry files use
`BPL_MODULE_PATH_SYMLINK`; module candidates that differ only by filesystem
casing use `BPL_MODULE_PATH_CASE_MISMATCH` with the requested and actual paths;
and unsafe explicit standard-library paths use `BPL_IMPORT_STD_PATH_UNSAFE`.
Missing named imports use `BPL_IMPORT_EXPORT_NOT_FOUND` after the imported
module is resolved but the requested symbol is absent from its export list. For
example, importing `packageMath` from the built-in `math` module reports
`Module 'math' does not export 'packageMath'` with the missing-export code.
When the imported module has exported names, the hint includes
`Available exports:` with the known names sorted for deterministic output, such
as `Available exports: alpha, zeta.`.
Use the exact filesystem casing in imports so Linux, macOS, and Windows builds
resolve the same module graph.

Frontend-only outputs such as `bpl build --emit tokens`, `bpl build --emit ast`,
and `bpl build --emit formatted` parse the source without loading imported
modules. Use `bpl check` or a normal build when you need import resolution
diagnostics.

## Common Standard Library Imports

### Strings

```bpl
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    local s: String = String.new("Hello");
    IO.printString(s.toString());
    s.destroy();
    return 0;
}
```

### Dynamic Arrays

```bpl
import [Array] from "std/array.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    local values: Array<int> = Array<int>.new(4);
    values.push(10);
    values.push(20);

    IO.printIntLn(values.get(0));
    IO.printIntLn(values.len());

    values.destroy();
    return 0;
}
```

### Hash Maps

```bpl
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    local ages: Map<string, int> = Map<string, int>.new();
    ages.set("Alice", 25);

    local age: Option<int> = ages.get("Alice");
    if (age.isSome()) {
        IO.printIntLn(age.unwrap());
    }

    ages.destroy();
    return 0;
}
```

### Option and Result

```bpl
import [Option] from "std/option.bpl";

frame safeDivide(a: int, b: int) ret Option<int> {
    if (b == 0) {
        return Option<int>.None;
    }
    return Option<int>.Some(a / b);
}
```

```bpl
import [Result] from "std/result.bpl";

frame parseId(raw: int) ret Result<int, string> {
    if (raw < 0) {
        return Result<int, string>.Err("negative id");
    }
    return Result<int, string>.Ok(raw);
}
```

## Packages

A package is a directory with a `bpl.json` manifest and one or more `.bpl` files. The package manager currently works with local tarballs and installed `bpl_modules/` directories.

```json
{
  "name": "my-math-lib",
  "version": "1.0.0",
  "description": "A small math package",
  "main": "index.bpl",
  "dependencies": {}
}
```

Create a package archive:

```bash
bpl pack
```

Install a package archive:

```bash
bpl install ./my-math-lib-1.0.0.tgz
```

Import from the installed package:

```bpl
import add, multiply from "my-math-lib";
```

Package import paths cannot contain empty, `.` or `..` segments. Installed
package directories must match their manifests: `bpl_modules/my-package/bpl.json`
must declare `"name": "my-package"`, and global versioned package directories
must match their manifest `version`. The resolver does not follow symlinked
package search directories, package roots, manifests, source parent
directories, entry files, or subpath entries; malformed packages are treated as
package metadata instead of silently importing a different package. Manifest
string metadata such as `$schema`, `description`, `author`, and `license` must
be strings when present, matching package manager manifest loading. Symlinked
or non-directory package search directories such as `bpl_modules/`, workspace
`packages/`, and the global package directory are rejected before child package
candidates are probed. Nested package source paths such as `src/index.bpl` and
`features/add.bpl` reject symlinked parent directories before the child file is
read. Package search directories, package roots, manifests, entrypoints, and
subpath source candidates must also use exact filesystem casing; case-only
mismatches are rejected with stable package diagnostic codes instead of relying
on host filesystem behavior. Symlinked or non-directory package search
directories block same-name fallback to lower-priority workspace or global
packages. Existing malformed package roots, including symlinked roots,
non-directory package paths, and roots missing `bpl.json`, block same-name
workspace/global fallback. Symlinked package entrypoint and subpath candidates
also block lower-priority `.x` fallbacks for that package import, including
package directory `index.bpl` candidates before `index.x`.
Extensionless package directory imports such as `math-extra/features/increment`
may resolve to `features/increment/index.bpl`. Explicit package source-file
imports such as `math-extra/features/increment.bpl` require a file at that
exact path; explicit package source-file imports ending in `.bpl` or `.x` do
not fall back to directory indexes.

Entry module paths and import candidates are checked before parsing. Missing
files, directories, and broken symlink paths produce distinct diagnostics.
Broken symlink import candidates are rejected before falling back to
lower-priority extensions such as `.x`; valid symlink entry and import paths are
normalized to their real module path before dependency graph construction.

## Re-exports

To expose a package-level facade, import from submodules in `index.bpl` and then export the imported names.

```bpl
# index.bpl
import add, subtract from "./src/basic.bpl";
import [Vector2] from "./src/vector.bpl";

export add;
export subtract;
export [Vector2];
```

Users can then import from the package entry point:

```bpl
import add, [Vector2] from "my-math-lib";
```

## Best Practices

- Keep one coherent module per file.
- Export only the public API.
- Prefer `index.bpl` as a package facade.
- Use relative imports for local project files and `std/` for standard library modules.
- Avoid circular imports by moving shared declarations into a third module.
- Keep package manifests in `bpl.json` and use `main` for the entry file.

## Next Steps

- [Module Resolution](24-module-resolution.md)
- [Package Management](25-package-management.md)
- [Standard Library API](48-stdlib-api.md)
- [Build Systems](50-build-systems.md)
