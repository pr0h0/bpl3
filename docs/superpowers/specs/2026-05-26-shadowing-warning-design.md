# Shadowing Warning Design

## Context

`TODO.md` lists semantic analysis as partially complete. Same-scope redeclarations and unused variables already exist; the remaining item is an outer-scope shadowing warning.

The user delegated feature selection and requested no questions, so this spec chooses the narrowest remaining semantic-analysis task and keeps behavior non-fatal.

## Goal

Emit a warning when a local variable declaration shadows a variable or parameter from an outer lexical scope.

## Non-Goals

- Do not reject valid programs for outer-scope shadowing.
- Do not warn for same-scope redeclarations; those remain errors.
- Do not warn for shadowing functions, structs, enums, specs, type aliases, modules, or builtins.
- Do not change code generation.

## Behavior

When checking a single local variable declaration:

1. Keep the existing same-scope redeclaration error.
2. If no same-scope declaration exists, search only parent scopes.
3. If the first matching outer symbol is a `Variable` or `Parameter`, record a warning.
4. Continue type checking normally.

The warning should include:

- Severity: `warning`.
- Message naming the new declaration and shadowed symbol kind.
- Hint recommending a rename for clarity.
- Related location pointing at the shadowed declaration.

Destructuring declarations are left unchanged for this pass because the existing declaration path is separate and more complex. This keeps the first implementation focused on ordinary local declarations, which covers the TODO without changing destructuring semantics.

## Architecture

`TypeCheckerBase` owns diagnostic state. It will gain a separate `warnings` collection plus `addWarning()` and `getWarnings()` methods. Checker modules will access warnings through `CheckerContext`.

`SymbolTable` will gain a non-mutating outer-scope lookup helper. The helper must not call `resolve()` because `resolve()` marks symbols as used and would interfere with unused-variable diagnostics.

`StatementChecker.checkVariableDecl()` will create the warning after same-scope redeclaration checks and before `defineSymbol()`.

`DiagnosticFormatter.formatError()` will respect a `CompilerError`'s stored severity when no explicit severity override is passed, so warning diagnostics render as warnings.

## Testing

Add focused tests for:

- Inner block local shadows an outer local and produces one warning but no errors.
- Function-body local shadows a parameter and produces one warning but no errors.
- Same-scope redeclaration remains an error rather than a warning.
- Formatted warning diagnostics render with a `warning` label.

Run focused tests first, then relevant type-checker regression tests, then the compiler TypeScript check.
