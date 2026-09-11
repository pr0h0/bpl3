# Adding New Primitive Types

This guide explains how to add a new primitive type wrapper to the BPL language.

## Overview

BPL supports primitive types like `i32`, `i64`, `double`, etc. To provide object-oriented capabilities (like methods) on these primitives, we use "wrapper structs". For example, `Int` wraps `i32`.

When you write `42.toString()`, the compiler:

1.  Identifies `42` as an `i32`.
2.  Looks up the wrapper struct for `i32` (which is `Int`).
3.  Resolves the `toString` method on the `Int` struct.

## Steps to Add a New Primitive Wrapper

### 1. Define the Wrapper Struct

Add the struct definition in `lib/primitives.bpl`. This file contains the standard library definitions for primitive wrappers.

Example for `Long` (wrapping `i64`):

```bpl
struct Long {
    value: i64,
    frame toString(this: *Long) ret String {
        local buf: *char = malloc(32);
        sprintf(buf, "%lld", this.value); # Use %lld for long long (i64)
        local s: String = String.new(buf);
        free(buf);
        return s;
    }
}

export [Long];
```

### 2. Register the Primitive Mapping

Update `compiler/middleend/BuiltinTypes.ts` to map the primitive type name to the struct name.

```typescript
export const PRIMITIVE_STRUCT_MAP: Record<string, string> = {
  i32: "Int",
  i1: "Bool",
  double: "Double",
  i64: "Long", // Add this line
};
```

### 3. Update Implicit Imports

Update `compiler/middleend/ImportHandler.ts` to ensure the new struct is implicitly exported to the global scope.

```typescript
// In loadImplicitImports()
const symbolsToExport = ["Int", "Bool", "Double", "Long"]; // Add "Long"
```

### 4. Update Call Checker

Update `compiler/middleend/CallChecker.ts` to handle the mapping during member access.

```typescript
// In checkMember()
switch (objectType.name) {
  case "int":
  case "i32":
    structName = "Int";
    break;
  case "long": // Add these cases
  case "i64":
    structName = "Long";
    break;
  // ...
}
```

## Usage

Import the wrapper explicitly when calling its methods. In particular, the
current implicit `Long` lookup can disagree with code generation about
`toString`’s return type (BUG-281 in [the bug log](../BUGS.md)).
The explicit import below selects the standard-library declaration:

```bpl
import [IO], [String], [Long] from "std";

frame main() {
    local x: long = 1234567890123;
    local text: String = x.toString();
    IO.printString(text);
    text.destroy();

    # Casting also works
    local other: long = cast<long>(42);
    local otherText: String = other.toString();
    IO.printString(otherText);
    otherText.destroy();
}
```

## FAQ

**Q: If I cast `cast<long>(42)`, is the type `long` or `Long`?**
A: The type is the primitive `long` (which is an alias for `i64`). However, because of the wrapper mapping, you can call methods defined on `Long` as if they were on `long`.

**Q: Do I get all methods from the struct?**
A: Yes. Any method defined in the `Long` struct that takes `this: *Long` (or `this: Long`) as the first parameter can be called on a primitive `long` value. The compiler automatically handles the "boxing" (conceptually) or direct method call.
