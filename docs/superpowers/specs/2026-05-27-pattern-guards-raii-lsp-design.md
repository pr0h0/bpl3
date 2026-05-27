# Pattern Guards, RAII, and LSP Rename Design

## Goal

Implement four requested improvements in one branch: nested enum pattern matching, user-defined type guards, opt-in automatic destructor calls, and VS Code rename correctness inside switch cases. Default function arguments remain out of scope and should not be implemented.

## Scope

This work changes existing language behavior conservatively:

- Nested enum tuple payload patterns can use the existing pattern language recursively: identifiers, `_`, literals, tuple patterns, and enum patterns.
- User-defined type guards use a function return type of the form `param is Type`.
- Automatic destructor calls apply only to local values whose resolved type is a struct with a `destroy(this: *T)` method marked `@[auto_destroy]`.
- VS Code rename treats switch case bodies as distinct lexical scopes.

## Nested Patterns

The parser already has `Pattern` nodes for enum, tuple, literal, wildcard, and identifier patterns, and tuple matching already supports recursive tuple checks. The missing piece is enum payload support. `PatternBinding` should accept the full `Pattern` rule so payloads like `Result.Ok(Option.Some(x))`, `Some((1, x))`, and `Some(_)` parse into the existing AST shapes.

The type checker already has recursive `checkPattern` support for tuple and enum tuple patterns. The implementation should harden it so nested enum payload patterns resolve the payload type, check nested enum declarations when present, and define only identifier bindings that actually bind values.

Codegen should no longer assume every non-wildcard enum tuple binding is a `PatternIdentifier`. It should extract each payload value, then recursively check and bind the nested pattern. A failed nested check must branch to the next match arm.

## Type Guards

A type guard function has this shape:

```bpl
frame isDog(value: *Animal) ret value is *Dog {
  return value is *Dog;
}
```

The return annotation references one of the function parameters. The checker treats the function body as bool-returning, while preserving guard metadata on the function declaration. A guard is valid only when:

- the referenced parameter exists,
- the target type resolves,
- the function returns a boolean-compatible expression,
- the source parameter type can be checked or cast to the target type using existing `is`/`as` compatibility rules.

At call sites, `if (isDog(animal)) { ... }` narrows `animal` inside the then branch when the argument is a simple identifier. The narrowing is scoped to that branch. Codegen should still emit the guard call normally, and should use a scoped type override for the narrowed identifier so member access and calls compile as the target type inside the branch.

## RAII

The standard library already defines `Destructible` in `lib/core_specs.bpl`, and many owning types already expose `destroy(this: *T)`. Automatic cleanup should be opt-in and local:

- A local variable with a resolved struct type and an instance `destroy` method marked `@[auto_destroy]` is registered for automatic cleanup when its declaration completes.
- Cleanup is implemented through the existing scope/defer unwinding path so normal fallthrough, `return`, `break`, `continue`, and `throw` reuse one cleanup mechanism.
- Locals prefixed with `_` are still eligible for cleanup; the prefix suppresses unused diagnostics, not ownership.
- Globals, parameters, primitive values, raw pointers, function values, and moved-return locals are not automatically destroyed.

For this pass, move handling is intentionally narrow. If a function directly returns a local variable by value, that local is marked moved before return cleanup runs so the returned owned value is not destroyed before the caller receives it. Broader assignment move semantics and shared ownership types remain future work.

## VS Code Rename

The rename handler currently scopes local variables through blocks and loops, while the switch-case test is skipped with a stale parser note. Switch statements are now supported, so the rename handler should treat each switch case body and default block as a lexical scope. Renaming `x` in one case must not rename `x` declared in another case.

## Testing

Add focused tests for each behavior:

- Runtime nested enum pattern tests with nested enum payloads, literals, wildcards, and non-match fallback.
- Parser/typechecker/codegen tests for type guard declarations and branch narrowing.
- Runtime RAII tests proving scope fallthrough and early return call `destroy`, and returned locals are not destroyed before use.
- Unskip and update the VS Code switch rename test.

Run the focused tests first, then related compiler and extension suites, strict TypeScript checking, diff hygiene, and the full test suite before merging.
