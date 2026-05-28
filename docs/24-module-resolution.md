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
