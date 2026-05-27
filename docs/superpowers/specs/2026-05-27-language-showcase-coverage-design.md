# Language Showcase Coverage Design

## Goal

Add a small, curated set of runnable examples that demonstrate BPL language features from basic arithmetic through object-oriented and functional programming, with focused tests that prove the examples keep working.

## Scope

The repository already has hundreds of narrow examples. This work adds showcase examples that are easy to read end-to-end and act as coverage anchors:

- `examples/language_showcase_basics`: primitives, arithmetic, operators, casts, strings/interpolation, arrays, tuples, control flow, switch, and pattern matching.
- `examples/language_showcase_systems`: structs, methods, constructors, pointers, heap allocation, `sizeof`, FFI, `defer`, and typed exceptions.
- `examples/language_showcase_abstractions`: enums, pattern guards, generics, type aliases, specs, inheritance, operator overloading, function pointers, lambdas, and closures.

The examples avoid unstable platform-specific behavior. Inline assembly and low-level intrinsics already have dedicated examples and are not duplicated here because this suite is meant to be portable and consistently runnable in CI.

## Testing

Add `tests/LanguageShowcase.test.ts` to run these three example directories through `cmp.sh` and assert representative output lines. Each example also gets `test_config.json`, so the existing integration test runner discovers them automatically.
