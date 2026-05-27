# CLI RAII Recursive Enum Design

## Goal

Implement three focused hardening items: validate `@[auto_destroy]`, support `--flag=value` in `ArgParser`, and make pointer-recursive enum payloads compile and run.

## Design

`@[auto_destroy]` remains a compiler-only marker used by code generation to decide which value locals get automatic cleanup. The type checker will reject the attribute unless it appears on a method named `destroy`, with first parameter named `this`, first parameter type equal to a pointer to the containing struct or enum, and a `void` return type.

`ArgParser.parse` will split long or alias flags on the first `=`. Flags declared with `hasValue` store the suffix, including an empty suffix for `--flag=`. Flags declared without values reject `--flag=value` by printing an error and preserving existing parse continuation behavior. Existing `--flag value` and boolean flag behavior remains unchanged.

Recursive enum support is scoped to pointer recursion. The semantic cycle detector already rejects by-value recursion and skips pointer types; the implementation will preserve that rule. Code generation will ensure enum payload sizing/layout uses real payload byte sizes and that the existing `examples/enum_recursive` example allocates enum nodes with `sizeof<List>()` instead of a fixed byte count.

## Testing

Add type-checker tests for invalid `@[auto_destroy]` placements. Add runtime tests for `ArgParser` covering `--output=file.txt`, `--output=`, alias parsing, and value-on-bool rejection. Add recursive enum coverage through the existing integration example, expecting `List sum: 6`.
