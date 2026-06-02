# BPL Package Manager

The BPL Package Manager allows you to create, install, and use reusable code packages in your BPL projects.

## Package Structure

A BPL package is defined by a `bpl.json` manifest file in the package root directory:

```json
{
  "$schema": "https://raw.githubusercontent.com/pr0h0/bpl3/master/bpl-package.schema.json",
  "name": "my-package",
  "version": "1.0.0",
  "description": "My awesome package",
  "main": "index.bpl",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {}
}
```

### Required Fields

- `name`: Package name using lowercase letters, digits, and hyphens only
- `version`: Semantic version (e.g., "1.0.0")

### Optional Fields

- `description`: Package description
- `$schema`: JSON Schema URI for editor validation
- `main`: Package-relative entry point file (defaults to "index.bpl")
- `entry`: Package-relative entry point alias
- `exports`: Package-relative source files that may be imported as package subpaths
- `author`: Package author
- `license`: License type
- `dependencies`: Map of package dependencies

`bpl-package.schema.json` mirrors the runtime manifest validation used by
`bpl pack`, `bpl install`, and package resolution. `main`, `entry`, `exports`,
and `bin` path values must be package-relative paths without empty, `.`, or
`..` segments. Dependency keys use the same package-name rule as `name`;
dependency sources and script commands must be non-empty strings. Script names
must be non-empty, and `bin` command names must be plain command names without
path separators. `bpl init` and `bpl new` generated manifests include the
canonical `$schema` URI so editors can use the checked-in package schema
without extra setup.

When `exports` is present, package subpath imports are restricted to the listed
package-relative source paths. Extensionless imports still use the normal
resolver fallbacks, so exporting `features/add.bpl` allows
`import [...] from "pkg/features/add"`, and exporting
`features/math/index.bpl` allows `import [...] from "pkg/features/math"`.
Packages without `exports` keep the existing permissive subpath behavior.
During `bpl pack`, exported paths must exist as regular source files inside the
package root. Missing files, directories, and symlinks are rejected before an
archive is created, and explicitly exported `.x` files are included in the
archive. Archive install revalidates those exported paths after extraction and
before replacing any installed package, so third-party archives cannot publish
broken public subpaths. Package-cache verify and repair use the same extracted
export checks before treating cached archives as healthy or repairable.
Lockfile verification and `bpl install --repair-lock` also validate installed
package exports, so a lockfile cannot silently trust or record a package with
missing, directory, or symlinked public subpaths. `bpl doctor packages` reports
the same broken installed export surfaces as package-health errors, and
`bpl list`/`bpl list --tree` append those export failures to package or
dependency-tree node problems without hiding valid child dependencies.

## CLI Commands

### Initialize a New Package

```bash
bpl init
```

Creates a new `bpl.json` file in the current directory with default values.

### Pack a Package

```bash
bpl pack [directory]
```

Creates a `.tgz` archive of the package. If no directory is specified, uses the current directory.
Pack validates public `exports` entries before writing the archive so packages
cannot publish missing, symlinked, or directory-only subpath surfaces.

Example:

```bash
cd my-package
bpl pack
# Creates: my-package-1.0.0.tgz
```

### Install a Package

Install from a local tarball:

```bash
bpl install ./my-package-1.0.0.tgz
```

Install to global location:

```bash
bpl install ./my-package-1.0.0.tgz --global
```

Installation locations:

- **Local**: `./bpl_modules/package-name/`
- **Global**: `~/.bpl/packages/package-name/`

### List Installed Packages

List local packages:

```bash
bpl list
bpl list --tree
```

List global packages:

```bash
bpl list --global
bpl list --global --tree
```

Use `--tree --json` when tooling needs the dependency tree and node `problems`
for missing packages, unsafe package roots, or invalid installed exports.

### Uninstall a Package

Uninstall a local package:

```bash
bpl uninstall <package-name>
# or use the alias
bpl remove <package-name>
```

Uninstall a global package:

```bash
bpl uninstall <package-name> --global
# or
bpl remove <package-name> --global
```

Example:

```bash
bpl uninstall math-utils --global
```

## Using Packages

Once a package is installed, you can import from it using the package name:

```bpl
# Import from installed package
import add, subtract from "math-utils";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local result: int = add(5, 3);
    printf("5 + 3 = %d\n", result);
    return 0;
}
```

### Package Resolution Order

When importing a module, BPL searches in this order:

1. **Relative imports** (./path or ../path)
2. **Standard library** (paths under `std/`, such as `std/io.bpl` and `std/math.bpl`)
3. **Installed packages**:
   - Local packages in `./bpl_modules/`
   - Global packages in `~/.bpl/packages/`
4. **Additional search paths** (if configured)

## Example: Creating a Package

### 1. Create Package Structure

```
math-utils/
├── bpl.json
├── index.bpl
└── README.md
```

### 2. Define Package Manifest (bpl.json)

```json
{
  "name": "math-utils",
  "version": "1.0.0",
  "description": "Mathematical utility functions for BPL",
  "main": "index.bpl",
  "author": "Your Name",
  "license": "MIT"
}
```

### 3. Implement Package Code (index.bpl)

```bpl
export add;
export subtract;
export multiply;
export divide;

frame add(a: int, b: int) ret int {
  return a + b;
}

frame subtract(a: int, b: int) ret int {
  return a - b;
}

frame multiply(a: int, b: int) ret int {
  return a * b;
}

frame divide(a: int, b: int) ret int {
  return a / b;
}
```

### 4. Pack and Install

```bash
cd math-utils
bpl pack
bpl install ./math-utils-1.0.0.tgz --global
```

### 5. Use in Your Project

```bpl
import add, multiply from "math-utils";

frame main() ret int {
    local x: int = add(2, 3);
    local y: int = multiply(x, 4);
    return y;  # Returns 20
}
```

## Package Caching

When compiling with the `--cache` flag, the package resolution and compilation are cached for faster subsequent builds:

```bash
bpl main.bpl --cache
```

## Best Practices

1. **Versioning**: Follow semantic versioning (MAJOR.MINOR.PATCH)
2. **Documentation**: Include a README.md with usage examples
3. **Exports**: Only export the public API of your package
4. **Testing**: Include tests for your package functions
5. **Dependencies**: List all package dependencies in bpl.json

## Troubleshooting

### Module not found

If you get a "Module not found" error:

- Verify the package is installed (`bpl list`)
- Check the import name matches the package name exactly
- Try reinstalling the package

### Package name conflicts

If you have both local and global packages with the same name:

- Local packages take precedence
- Remove one to avoid confusion

### Permission errors

For global installations:

- Ensure you have write permissions to `~/.bpl/packages/`
- Or use local installation instead
