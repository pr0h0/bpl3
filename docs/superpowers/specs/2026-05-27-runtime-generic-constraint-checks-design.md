# Runtime Generic Constraint Checks Design

## Goal

Add runtime validation for constrained generic function parameters using the existing generic constraint syntax, without changing the parser or formatter.

## Scope

Existing syntax stays unchanged:

```bpl
frame handle<T: Animal>(value: *T) ret int {
  return value.id;
}
```

The compiler already enforces `T: Animal` statically when a generic function is instantiated. This change adds a runtime guard for constrained generic parameters whose runtime type can be checked through struct vtables. The guard catches unsafe casts that make a value appear to have a constrained generic type while its object vtable belongs to an incompatible struct.

## Runtime Behavior

For each generic function specialization, codegen inspects constrained generic parameters and emits entry checks for parameters whose type is a constrained generic parameter or pointer to one:

- `value: T` where `T` is constrained to a struct or spec-backed struct with vtable support.
- `value: *T` where `T` is constrained to a struct or spec-backed struct with vtable support.

Null pointer arguments skip the vtable check because they do not carry object type information and should follow existing null-pointer behavior at the use site.

The expected runtime type is the concrete type argument used for `T`, allowing that concrete type and known descendants. This preserves polymorphic base-pointer use such as `T = Animal` with a `Dog` object, while rejecting an unsafe `Cat` object cast to `*Dog`.

## Failure Mode

On mismatch, generated code prints a runtime error message and exits non-zero. The message includes the function name, parameter name, and expected type. This keeps the first implementation independent of new language syntax or a larger RTTI system.

## Non-Goals

- No new syntax such as decorators, `where`, or `typeguard`.
- No parser or formatter changes.
- No runtime checks for primitive generic constraints, because primitives do not carry runtime type tags.
- No changes to existing compile-time constraint enforcement.
