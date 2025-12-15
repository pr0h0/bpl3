# Modules and Packages

BPL's module system allows you to organize code across multiple files and create reusable packages. This guide covers importing, exporting, module resolution, and package creation.

## Table of Contents

- [Module Basics](#module-basics)
- [Import Statement](#import-statement)
- [Export Statement](#export-statement)
- [Module Resolution](#module-resolution)
- [Standard Library](#standard-library)
- [Creating Packages](#creating-packages)
- [Package Configuration](#package-configuration)
- [Module Best Practices](#module-best-practices)

## Module Basics

### What is a Module?

A module is a `.bpl` file that contains code (functions, structs, constants, etc.). Modules help organize code and enable reuse.

**File: math.bpl**

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}

frame multiply(a: int, b: int) ret int {
    return a * b;
}
```

**File: main.bpl**

```bpl
import [add, multiply] from "math.bpl";

frame main() ret int {
    local sum: int = add(5, 3);
    local product: int = multiply(5, 3);
    return 0;
}
```

### Module Scope

Each module has its own scope. Items are private by default and must be explicitly exported to be accessible from other modules.

## Import Statement

The `import` statement brings items from other modules into the current scope.

### Named Imports

Import specific items:

```bpl
import [add, subtract] from "math.bpl";

frame main() ret int {
    local result: int = add(5, 3);
    return 0;
}
```

### Importing Types

Import structs and type aliases:

```bpl
import [Point, Color] from "graphics.bpl";

frame main() ret int {
    local p: Point;
    p.x = 10;
    p.y = 20;
    return 0;
}
```

### Importing Multiple Items

```bpl
import [
    Vector2,
    Vector3,
    add,
    subtract,
    dot,
    cross
] from "math/vector.bpl";
```

### Import Syntax Variations

```bpl
# Single item
import [sqrt] from "math.bpl";

# Multiple items
import [sin, cos, tan] from "math.bpl";

# Types and functions
import [Point, distance] from "geometry.bpl";
```

## Export Statement

The `export` statement makes items available to other modules.

### Exporting Functions

```bpl
# File: utils.bpl

# Private function - not accessible outside this module
frame helperFunction() ret void {
    # ...
}

# Public function - accessible via import
export frame publicFunction() ret int {
    helperFunction();  # Can call private functions internally
    return 42;
}
```

### Exporting Structs

```bpl
# File: shapes.bpl

# Public struct
export struct Circle {
    radius: float;

    frame area() ret float {
        return 3.14159 * this.radius * this.radius;
    }
}

# Private struct - only used internally
struct InternalHelper {
    data: int;
}
```

### Exporting Constants

```bpl
# File: constants.bpl

export const PI: float = 3.14159265359;
export const E: float = 2.71828182846;

# Private constant
const INTERNAL_BUFFER_SIZE: int = 1024;
```

### Multiple Exports

```bpl
# File: math.bpl

export frame add(a: int, b: int) ret int {
    return a + b;
}

export frame subtract(a: int, b: int) ret int {
    return a - b;
}

export frame multiply(a: int, b: int) ret int {
    return a * b;
}

export struct Complex {
    real: float;
    imag: float;

    frame magnitude() ret float {
        return sqrt(this.real * this.real + this.imag * this.imag);
    }
}
```

## Module Resolution

BPL uses several strategies to locate imported modules:

### Relative Imports

Import from files relative to the current file:

```bpl
# In file: src/main.bpl
import [helper] from "./utils.bpl";        # Same directory
import [Config] from "./config/app.bpl";   # Subdirectory
import [Parent] from "../shared.bpl";      # Parent directory
```

### Project Structure Example

```
project/
  ├── main.bpl
  ├── utils.bpl
  ├── config/
  │   └── app.bpl
  └── src/
      ├── module1.bpl
      └── module2.bpl
```

**In main.bpl:**

```bpl
import [helper] from "./utils.bpl";
import [Config] from "./config/app.bpl";
```

**In src/module1.bpl:**

```bpl
import [Config] from "../config/app.bpl";
import [helper] from "../utils.bpl";
```

### Standard Library Imports

Import from the standard library using `std/` prefix:

```bpl
import [String] from "std/string.bpl";
import [Vec] from "std/vec.bpl";
import [Map] from "std/map.bpl";
import [Option, Some, None] from "std/option.bpl";
```

### Package Imports

Import from installed packages:

```bpl
# Import from package in bpl_modules/
import [JsonParser] from "json_package/parser.bpl";
```

### Search Order

BPL resolves imports in this order:

1. **Relative paths** (`./`, `../`)
2. **Standard library** (`std/`)
3. **Local bpl_modules** directory
4. **Global bpl_modules** directory

## Standard Library

BPL includes a comprehensive standard library.

### Common Standard Library Modules

#### String Operations

```bpl
import [String] from "std/string.bpl";

frame main() ret int {
    local s: String;
    s.init("Hello, World!");

    printf("Length: %d\n", s.length());
    printf("Uppercase: %s\n", s.toUpper());

    s.cleanup();
    return 0;
}
```

#### Dynamic Arrays

```bpl
import [Vec] from "std/vec.bpl";

frame main() ret int {
    local v: Vec<int>;
    v.init();

    v.push(10);
    v.push(20);
    v.push(30);

    printf("Size: %d\n", v.size());
    printf("First: %d\n", v.get(0));

    v.cleanup();
    return 0;
}
```

#### Hash Maps

```bpl
import [Map] from "std/map.bpl";

frame main() ret int {
    local m: Map<string, int>;
    m.init();

    m.insert("Alice", 25);
    m.insert("Bob", 30);

    local age: int = m.get("Alice");
    printf("Alice's age: %d\n", age);

    m.cleanup();
    return 0;
}
```

#### Option Type

```bpl
import [Option, Some, None] from "std/option.bpl";

frame safeDivide(a: int, b: int) ret Option<int> {
    if (b == 0) {
        return None<int>();
    }
    return Some<int>(a / b);
}

frame main() ret int {
    local result: Option<int> = safeDivide(10, 2);

    if (result.isSome()) {
        printf("Result: %d\n", result.unwrap());
    } else {
        printf("Division by zero\n");
    }

    return 0;
}
```

#### Result Type

```bpl
import [Result, Ok, Err] from "std/result.bpl";

frame readFile(path: string) ret Result<string, string> {
    local file: File* = fopen(path, "r");
    if (file == null) {
        return Err<string, string>("Failed to open file");
    }
    # ... read file ...
    return Ok<string, string>(contents);
}
```

### Full Standard Library Reference

```bpl
# Core utilities
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [Option, Some, None] from "std/option.bpl";
import [Result, Ok, Err] from "std/result.bpl";

# Collections
import [Vec] from "std/vec.bpl";
import [Map] from "std/map.bpl";
import [Set] from "std/set.bpl";
import [Stack] from "std/stack.bpl";
import [Queue] from "std/queue.bpl";

# Iterators
import [Iter, Range] from "std/iter.bpl";

# Algorithms
import [sort, binarySearch, reverse] from "std/algorithm.bpl";

# I/O
import [print, println, readLine] from "std/io.bpl";
import [File, FileMode] from "std/fs.bpl";
import [Path] from "std/path.bpl";

# Formatting
import [format, sprintf] from "std/fmt.bpl";

# Math
import [abs, min, max, clamp] from "std/math.bpl";
import [Random] from "std/rand.bpl";

# JSON
import [JsonValue, parseJson, toJson] from "std/json.bpl";

# Logging
import [log, error, warn, info, debug] from "std/log.bpl";

# Assertions
import [assert, assertEq, assertNe] from "std/assert.bpl";

# Command-line arguments
import [Args] from "std/args.bpl";
```

## Creating Packages

Packages allow you to distribute and reuse code across projects.

### Package Structure

```
my_package/
  ├── bpl-package.json     # Package configuration
  ├── README.md            # Documentation
  ├── LICENSE              # License file
  ├── src/
  │   ├── lib.bpl         # Main library file
  │   ├── utils.bpl       # Utility functions
  │   └── types.bpl       # Type definitions
  ├── examples/
  │   └── example.bpl     # Usage examples
  └── tests/
      └── test.bpl        # Test files
```

### Creating a Simple Package

**Step 1: Create bpl-package.json**

```json
{
  "name": "my_math_lib",
  "version": "1.0.0",
  "description": "A simple math library",
  "author": "Your Name",
  "license": "MIT",
  "main": "src/lib.bpl",
  "dependencies": {},
  "keywords": ["math", "utilities"]
}
```

**Step 2: Create src/lib.bpl**

```bpl
# Main library file

export frame add(a: int, b: int) ret int {
    return a + b;
}

export frame multiply(a: int, b: int) ret int {
    return a * b;
}

export struct Complex {
    real: float;
    imag: float;

    frame magnitude() ret float {
        return sqrt(this.real * this.real + this.imag * this.imag);
    }
}
```

**Step 3: Using the Package**

Install in another project:

```bash
bpl package install my_math_lib
```

Import and use:

```bpl
import [add, multiply, Complex] from "my_math_lib/lib.bpl";

frame main() ret int {
    local sum: int = add(5, 3);

    local c: Complex;
    c.real = 3.0;
    c.imag = 4.0;
    printf("Magnitude: %f\n", c.magnitude());

    return 0;
}
```

## Package Configuration

### bpl-package.json Schema

```json
{
  "name": "package_name",           # Required: package name
  "version": "1.0.0",               # Required: semantic version
  "description": "Package description",
  "author": "Author Name <email@example.com>",
  "license": "MIT",                 # MIT, Apache-2.0, GPL-3.0, etc.
  "main": "src/lib.bpl",           # Entry point
  "homepage": "https://github.com/user/package",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/package.git"
  },
  "keywords": ["keyword1", "keyword2"],
  "dependencies": {
    "other_package": "^1.2.0"
  },
  "devDependencies": {
    "test_framework": "^2.0.0"
  },
  "scripts": {
    "test": "bpl test",
    "build": "bpl compile src/lib.bpl"
  }
}
```

### Version Specification

```json
{
  "dependencies": {
    "exact": "1.2.3",           # Exact version
    "caret": "^1.2.3",          # Compatible (1.2.3 to <2.0.0)
    "tilde": "~1.2.3",          # Patch updates (1.2.3 to <1.3.0)
    "range": ">=1.0.0 <2.0.0",  # Version range
    "latest": "*"               # Latest version (not recommended)
  }
}
```

## Module Best Practices

### 1. One Module Per File

Keep modules focused and single-purpose:

```bpl
# Good: math_utils.bpl
export frame add(a: int, b: int) ret int { ... }
export frame subtract(a: int, b: int) ret int { ... }

# Avoid: kitchen_sink.bpl with unrelated functions
```

### 2. Explicit Exports

Only export what's necessary:

```bpl
# Public API
export frame publicFunction() ret void { ... }

# Internal implementation (not exported)
frame helperFunction() ret void { ... }
```

### 3. Group Related Imports

```bpl
# Standard library
import [Vec] from "std/vec.bpl";
import [Map] from "std/map.bpl";

# Third-party packages
import [JsonParser] from "json_lib/parser.bpl";

# Local modules
import [Config] from "./config.bpl";
import [Utils] from "./utils.bpl";
```

### 4. Avoid Circular Dependencies

```bpl
# BAD: Circular dependency
# module_a.bpl imports from module_b.bpl
# module_b.bpl imports from module_a.bpl

# GOOD: Extract shared code to a third module
# module_a.bpl imports from shared.bpl
# module_b.bpl imports from shared.bpl
```

### 5. Use Package Namespacing

```bpl
# Instead of importing everything:
import [Vec, Map, Set, Stack, Queue] from "std/collections.bpl";

# Import what you need:
import [Vec] from "std/vec.bpl";
import [Map] from "std/map.bpl";
```

### 6. Document Public APIs

```bpl
# Calculates the factorial of n
# Returns 1 for n <= 0
export frame factorial(n: int) ret int {
    if (n <= 0) return 1;
    return n * factorial(n - 1);
}
```

### 7. Version Your Packages

Follow semantic versioning:

- **Major (1.0.0)**: Breaking changes
- **Minor (0.1.0)**: New features, backward compatible
- **Patch (0.0.1)**: Bug fixes

### 8. Test Your Exports

Ensure exported items work as expected:

```bpl
# tests/test_math.bpl
import [add, multiply] from "../src/math.bpl";
import [assert] from "std/assert.bpl";

frame testAdd() ret void {
    assert(add(2, 3) == 5, "2 + 3 should equal 5");
}

frame testMultiply() ret void {
    assert(multiply(2, 3) == 6, "2 * 3 should equal 6");
}
```

## Common Patterns

### Library Pattern

Create a main library file that re-exports from submodules:

**lib.bpl:**

```bpl
# Re-export from submodules
import [add, subtract] from "./math/basic.bpl";
import [sin, cos] from "./math/trig.bpl";
import [Vec2, Vec3] from "./math/vector.bpl";

export frame add(a: int, b: int) ret int;
export frame subtract(a: int, b: int) ret int;
export frame sin(x: float) ret float;
export frame cos(x: float) ret float;
export struct Vec2;
export struct Vec3;
```

Users only need to import from lib.bpl.

### Facade Pattern

Provide a simplified interface to complex subsystems:

**facade.bpl:**

```bpl
import [ComplexSystem1] from "./internal/system1.bpl";
import [ComplexSystem2] from "./internal/system2.bpl";

export frame simpleOperation() ret void {
    # Hide complexity
    local s1: ComplexSystem1;
    local s2: ComplexSystem2;
    s1.init();
    s2.init();
    s1.doComplexThing();
    s2.doOtherComplexThing();
    s1.cleanup();
    s2.cleanup();
}
```

## Next Steps

- [Standard Library Reference](24-stdlib-reference.md) - Complete stdlib documentation
- [Package Manager](PACKAGE_MANAGER.md) - Detailed package management guide
- [Build System](25-build-system.md) - Compiling multi-file projects
