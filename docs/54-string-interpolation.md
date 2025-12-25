# String Interpolation

BPL supports string interpolation, allowing you to embed expressions directly into string literals.

## Syntax

Use backticks (`` ` ``) to define an interpolated string. Expressions are enclosed in `${...}`.

```bpl
local name: string = "World";
local age: int = 42;

# Basic interpolation
local s: String = `Hello ${name}, age ${age}!`;

# Expressions
local x: int = 10;
local y: int = 20;
local result: String = `${x} + ${y} = ${x + y}`;
```

## How it works

The compiler desugars interpolated strings into a series of string concatenations using the `String` struct from the standard library.

```bpl
`Hello ${name}`
```

Is equivalent to:

```bpl
String.new("Hello ") + name
```

Any expression inside `${...}` is converted to a string:

1. If it's already a `String` struct, it's used directly.
2. If it's a primitive `string` (`*char`), it's wrapped in `String.new()`.
3. Otherwise, the `.toString()` method is called on the expression result.

## Requirements

- The `String` struct must be available (imported from `std/string.bpl`).
- Expressions must evaluate to a type that has a `.toString()` method (or be a string).
- Primitive types (`int`, `float`, `bool`) have built-in `.toString()` support via wrapper structs.
