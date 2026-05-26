# Function Attributes Design

## Purpose

Add first-class function attributes for compiler-known LLVM optimization and code generation hints.

This feature introduces the `@[...]` syntax family for attributes, but this implementation only supports validated LLVM/compiler hints. User decorators, AST transforms, reflection metadata, and compile-time macro behavior are explicitly out of scope for this pass.

## Goals

- Allow BPL authors to attach selected LLVM function hints to `frame` declarations.
- Preserve attributes through parsing, formatting, type checking, documentation, and LLVM code generation.
- Reject unknown or conflicting attributes during semantic analysis.
- Keep the design narrow enough to implement safely without creating a decorator or macro system.

## Non-Goals

- No user-defined decorators.
- No attribute arguments such as `@[route("/users")]`.
- No attributes on variables, structs, enums, specs, imports, or expressions.
- No semantic AST rewriting from attributes.
- No reflection or runtime metadata generated from attributes.

## Syntax

Attributes use a bracketed list before a function declaration:

```bpl
@[inline, cold]
frame parse_slow_path(input: string) ret int {
  return 0;
}
```

The attribute list attaches to the immediately following `frame` declaration. The initial implementation supports attributes on top-level functions and struct/enum methods because those all reuse `FunctionDecl` in the AST.

The formatter prints attributes on their own line above the function:

```bpl
@[always_inline]
frame add_one(value: int) ret int {
  return value + 1;
}
```

## Supported Attributes

The first supported set is:

- `inline`
- `always_inline`
- `noinline`
- `cold`
- `hot`
- `noreturn`
- `nounwind`
- `optnone`
- `optsize`
- `minsize`

The compiler maps BPL spelling to LLVM spelling at code generation time:

| BPL attribute | LLVM attribute |
| --- | --- |
| `inline` | `inlinehint` |
| `always_inline` | `alwaysinline` |
| `noinline` | `noinline` |
| `cold` | `cold` |
| `hot` | `hot` |
| `noreturn` | `noreturn` |
| `nounwind` | `nounwind` |
| `optnone` | `optnone` |
| `optsize` | `optsize` |
| `minsize` | `minsize` |

Existing frame pointer behavior remains enabled for generated function definitions by keeping `"frame-pointer"="all"` in every emitted function attribute group.

## Validation Rules

The type checker validates function attributes after parsing and before code generation.

Invalid cases:

- Unknown attribute names are compile-time errors.
- Duplicate attribute names are compile-time errors.
- `inline`, `always_inline`, and `noinline` conflict with each other.
- `hot` and `cold` conflict with each other.
- `optsize` and `minsize` conflict with each other.
- `optnone` conflicts with `inline`, `always_inline`, `optsize`, and `minsize`.
- `noreturn` on a function with a non-`void` return type is a compile-time error.

These checks intentionally stay conservative. LLVM accepts some combinations that are technically legal but semantically confusing; BPL prefers clear source intent.

## AST Model

`FunctionDecl` gains an `attributes` field:

```ts
attributes: FunctionAttribute[];
```

`FunctionAttribute` is a small node:

```ts
interface FunctionAttribute extends ASTNode {
  kind: "FunctionAttribute";
  name: string;
}
```

Keeping attributes as nodes rather than raw strings preserves locations for diagnostics and leaves room for future argument support without changing the outer `FunctionDecl` shape.

## Parser And Grammar

The grammar adds an optional `AttributeList` prefix to `FunctionDeclaration`.

Accepted:

```bpl
@[inline]
frame f() {}

@[inline, cold]
frame g() {}
```

Rejected:

```bpl
@[trace]
frame f() {}

@[inline, noinline]
frame f() {}
```

The parser does not treat unknown attribute names as syntax errors. It records names and locations, then semantic analysis emits compiler diagnostics with source locations.

## Formatter And Documentation

The formatter preserves supported attributes and emits them above the function declaration. Multiple attributes stay on one line in source order:

```bpl
@[inline, cold]
frame f() {}
```

The documentation generator includes attributes in function signatures so generated API docs match source-level declarations:

```bpl
@[inline]
frame add_one(value: int) ret int
```

## LLVM Code Generation

The backend stops hard-coding every function definition to `#0` only. Instead it assigns deterministic LLVM attribute groups based on the normalized set of function attributes plus the required frame-pointer attribute.

Example:

```llvm
define i32 @add_one_i32_(i32 %value) #1 {
entry:
  ...
}

attributes #1 = { inlinehint "frame-pointer"="all" }
```

Functions without user attributes keep using the default group containing only `"frame-pointer"="all"`.

Attribute group numbering must be deterministic for stable tests. A map keyed by sorted LLVM attribute strings is sufficient.

## Testing Strategy

Use TDD and add tests before production changes.

Parser and AST:

- Parse `@[inline, cold] frame f() {}` and assert the function has two attributes with names and locations.

Semantic validation:

- Reject unknown attributes.
- Reject duplicates.
- Reject each conflict family.
- Reject `@[noreturn]` on non-`void` functions.

Formatter:

- Format a function with `@[always_inline, hot]` and assert stable output.

LLVM shape:

- Compile a function with `@[inline]` and assert the function definition references a non-default attribute group containing `inlinehint` and `"frame-pointer"="all"`.
- Compile a function with `@[always_inline, nounwind]` and assert LLVM spelling is `alwaysinline nounwind`.
- Compile one attributed and one unattributed function and assert deterministic separate groups.

Regression:

- Existing programs without attributes continue to parse, type check, format, and compile unchanged except for any harmless attribute group numbering differences in LLVM IR.

## Future Extension Path

The syntax family remains compatible with future user decorators, but this implementation does not accept them. Later work can decide whether user decorators are:

- inert metadata for documentation and reflection,
- compile-time checks,
- AST transforms,
- plugin hooks,
- or macro-like code generators.

Until that semantic model exists, unknown attributes should remain errors.
