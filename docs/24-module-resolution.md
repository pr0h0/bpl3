# Module Resolution

When you import a module, the compiler looks for the file in specific locations.

## Relative Imports

Imports starting with `./` or `../` are resolved relative to the current file.

```bpl
import foo from "./utils.bpl";
```

## Absolute Imports

Imports without a relative path prefix are resolved from the project root or configured include paths.

```bpl
import * as std from "std";
```

## File Extensions

The `.bpl` extension is optional in import statements.

```bpl
import foo from "./utils"; # Resolves to ./utils.bpl
```

## Implicit prelude

Every module implicitly imports the error hierarchy (`Error`,
`NullAccessError`, `IndexOutOfBoundsError`, `DivisionByZeroError`, and
`StackOverflowError`) from `std/errors.bpl`, so `catch (e: NullAccessError)`
works without an import. That module also provides the runtime check helpers
the compiler inserts for null, bounds, division, and stack-depth checks, which
is why every build resolves modules even when the source has no imports. A file
that declares its own type with one of those names keeps its own declaration.

Primitive wrapper types are loaded on demand from `std/primitives.bpl`.
`--no-prelude` disables that implicit primitive loading.

## Name collisions

Module scopes are independent, so unrelated modules may use the same private
names. See [Imports and Exports](23-imports-exports.md) for how the compiler
keeps them distinct in generated code.
