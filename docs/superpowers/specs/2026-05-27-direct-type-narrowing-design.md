# Direct Type Narrowing Design

## Goal

Make BPL narrow identifiers inside `if` branches when the condition directly checks the identifier with `is` or `match<T>`, while removing the special `ret value is Type` function return syntax from the user-facing language.

## Syntax

Type checks remain ordinary boolean expressions:

```bpl
if (animal is Dog) {
    animal.breed;
}

if (match<Dog>(animal)) {
    animal.breed;
}
```

After the `if` body, `animal` resolves to its original type.

User helper functions use ordinary boolean returns:

```bpl
frame isDog(value: *Animal) ret bool {
    return value is Dog;
}
```

Calling a boolean helper does not narrow its argument. Without an explicit guard contract, inferring that relationship would require cross-function body analysis and is out of scope.

## Semantics

The type checker recognizes direct `if` conditions where the checked value is a simple identifier:

- `if (identifier is Type) { ... }`
- `if (match<Type>(identifier)) { ... }`

The then branch receives a scoped symbol override for that identifier using the checked type. The override is lexical: it applies only while checking the then branch. Else branches and following statements use the original symbol.

If the original identifier is a pointer and the target type is written without a pointer, the narrowed type preserves the original pointer depth. For example, `animal: *Animal` with `animal is Dog` narrows to `*Dog`. If the target is explicitly written as `*Dog`, the target is used as written.

## Compatibility

The old guard-return syntax:

```bpl
frame isDog(value: *Animal) ret value is *Dog { ... }
```

is removed from the grammar. It should produce a syntax error rather than silently creating guard metadata.

Existing `as` and `cast<T>` conversions are unchanged. They do not create scoped narrowing by themselves.

## Tests

Add focused tests proving:

- `ret value is *Dog` is rejected.
- `ret bool` helper functions can still return `value is Dog`.
- `if (animal is Dog)` narrows `animal` only inside the then branch.
- `if (match<Dog>(animal))` narrows `animal` only inside the then branch.
- Code generation emits the required cast for narrowed member access.
- Runtime examples return the derived field from the narrowed branch.
