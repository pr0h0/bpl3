# BPL Package Manager

The BPL Package Manager allows you to create, install, and use reusable code packages in your BPL projects.

## Package Structure

A BPL package is defined by a `bpl.json` manifest file in the package root directory:

```json
{
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

- `name`: Package name (alphanumeric, hyphens, underscores, scopes allowed)
- `version`: Semantic version (e.g., "1.0.0")

### Optional Fields

- `description`: Package description
- `main`: Entry point file (defaults to "index.bpl")
- `author`: Package author
- `license`: License type
- `dependencies`: Map of package dependencies

## CLI Commands

### Initialize a New Package

```bash
bun index.ts init
```

Creates a new `bpl.json` file in the current directory with default values.

### Pack a Package

```bash
bun index.ts pack [directory]
```

Creates a `.tgz` archive of the package. If no directory is specified, uses the current directory.

Example:

```bash
cd my-package
bun index.ts pack
# Creates: my-package-1.0.0.tgz
```

### Install a Package

Install from a local tarball:

```bash
bun index.ts install ./my-package-1.0.0.tgz
```

Install to global location:

```bash
bun index.ts install ./my-package-1.0.0.tgz --global
```

Installation locations:

- **Local**: `./bpl_modules/package-name/`
- **Global**: `~/.bpl/packages/package-name/`

### List Installed Packages

List local packages:

```bash
bun index.ts list
```

List global packages:

```bash
bun index.ts list --global
```

### Uninstall a Package

Uninstall a local package:

```bash
bun index.ts uninstall <package-name>
# or use the alias
bun index.ts remove <package-name>
```

Uninstall a global package:

```bash
bun index.ts uninstall <package-name> --global
# or
bun index.ts remove <package-name> --global
```

Example:

```bash
bun index.ts uninstall math-utils --global
```

## Using Packages

Once a package is installed, you can import from it using the package name:

```bpl
// Import from installed package
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
2. **Standard library** (built-in modules like "std", "io", "math")
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
bun index.ts pack
bun index.ts install ./math-utils-1.0.0.tgz --global
```

### 5. Use in Your Project

```bpl
import add, multiply from "math-utils";

frame main() ret int {
    local x: int = add(2, 3);
    local y: int = multiply(x, 4);
    return y;  // Returns 20
}
```

## Package Caching

When compiling with the `--cache` flag, the package resolution and compilation are cached for faster subsequent builds:

```bash
bun index.ts main.bpl --cache
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

- Verify the package is installed (`bun index.ts list`)
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
