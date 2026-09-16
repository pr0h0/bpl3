# BPL3 Language Specification

This document defines the syntax and semantics that the BPL3 compiler
implements. It is not yet a complete specification of every construct; the
numbered guides in [docs/](docs/) cover features not described here.

## Conventions

- A bullet or sentence that starts with a bold rule marker such as
  `[R-TYPE-1]` is normative. Every rule is backed by at least one test that
  references its ID in a `// spec: R-TYPE-1` comment directly above the test,
  or is listed in the pending allowlist in `tests/LanguageSpecRules.test.ts`.
- Prose without a rule marker, code examples, and sections labelled
  _Informative_ explain or illustrate the rules. They do not add requirements.
- Rule IDs are stable. A changed rule keeps its ID; a removed rule's ID is
  retired and never reused. See
  [documentation validation](docs/documentation-validation.md#specification-rule-ids).
- Sizes, layouts, and ABI facts assume the 64-bit Linux and macOS targets that
  the test suite runs on. Diagnostic codes such as `BPL_SYMBOL_NOT_FOUND` are
  the codes reported by `bpl check --json`.

## 1. Lexical Structure

### Comments

- **[R-LEX-1]** A `#` starts a comment that continues to the end of the line.
- **[R-LEX-2]** A block comment starts with `/#` and ends with the matching
  `#/`. Block comments nest.

```bpl
# This is a single-line comment

/#
This is a
/# nested #/
multi-line comment
#/
```

### Identifiers and Keywords

- **[R-LEX-3]** An identifier matches `[A-Za-z_][A-Za-z0-9_]*` and must not be
  a reserved keyword. Reserved keywords are `global`, `local`, `const`, `type`,
  `frame`, `static`, `ret`, `struct`, `enum`, `spec`, `Self`, `import`, `from`,
  `as`, `export`, `extern`, `asm`, `loop`, `if`, `else`, `break`, `continue`,
  `try`, `catch`, `return`, `throw`, `switch`, `case`, `default`,
  `fallthrough`, `cast`, `sizeof`, `typeof`, `offsetof`, `match`, `is`, `Func`,
  `Lambda`, `null`, `nullptr`, `true`, and `false`.

### Literals

- **[R-LEX-4]** Integer literals are written in decimal (`123`), hexadecimal
  (`0xFF` or `0XFF`), binary (`0b101` or `0B101`), or octal (`0o17` or
  `0O17`).
- **[R-LEX-5]** A decimal literal may contain a single `_` between two digits
  (`1_000_000`, `1_0.2_5`). Separators are not allowed at the start or end of a
  digit run or in prefixed literals. Digits separated by whitespace or comments
  are separate tokens, so `1 2` is a syntax error.
- **[R-LEX-6]** A floating-point literal has digits on both sides of the `.`
  (`3.14`). Exponent syntax (`1e3`) and forms such as `.5` are not supported.
- **[R-LEX-7]** An integer literal has type `int` when its value fits in
  `i32` and type `long` otherwise. A floating-point literal has the 64-bit
  floating-point type.
- **[R-LEX-8]** A string literal `"..."` has type `string`. The escapes `\n`,
  `\t`, `\r`, `\0`, `\\`, `\'`, `\"`, and `\xHH` produce the corresponding
  character.
- **[R-LEX-9]** A character literal `'c'` has type `char` and must contain
  exactly one character after escape processing.
- **[R-LEX-10]** `true` and `false` are `bool` literals. `null` and `nullptr`
  are two spellings of the same null pointer literal.
- **[R-LEX-11]** An interpolated string `` `text ${expression} text` ``
  produces a `String` value. The standard library `String` type must be in
  scope, for example through `import [String] from "std";`.

## 2. Semantic Core

This section defines the semantic contract the compiler currently implements.
Tests and code generation must preserve it.

### Primitive Type Commitments

- **[R-TYPE-1]** `int` and `uint` are 32-bit integer aliases for `i32` and
  `u32`.
- **[R-TYPE-2]** `long` and `ulong` are 64-bit integer aliases for `i64` and
  `u64`.
- **[R-TYPE-3]** `short` and `ushort` are 16-bit integer aliases for `i16` and
  `u16`.
- **[R-TYPE-4]** `char` and `uchar` are 8-bit integer aliases for `i8` and
  `u8`.
- **[R-TYPE-5]** `bool` is a 1-bit boolean value that lowers to LLVM `i1`;
  `sizeof(bool)` is 1.
- **[R-TYPE-6]** `float`, `double`, and `f64` are aliases for the same 64-bit
  floating-point type, lowering to LLVM `double`.
- **[R-TYPE-7]** `f32` is a distinct 32-bit floating-point type, lowering to
  LLVM `float`. There is no implicit conversion between `f32` and the 64-bit
  type in assignments or binary operations. Because floating-point literals are
  64-bit, `local x: f32 = 1.5;` is rejected; use `cast<f32>(1.5)`.
- **[R-TYPE-8]** Floating-point negation changes the sign bit, including
  signed zero.
- **[R-TYPE-9]** Floating-point equality is ordered; inequality is its
  complement, so NaN is unequal to every value including itself.
- **[R-TYPE-10]** `void` has no runtime value. `sizeof(void)` is rejected with
  `BPL_SIZEOF_VOID_INVALID`. Behind a pointer, `*void` lowers as `i8*`.
- **[R-TYPE-11]** The null pointer literal is compatible with every pointer
  type and with no other type; `local s: Point = null;` is rejected.
- **[R-TYPE-12]** `string` lowers as a C-compatible `i8*` string pointer.
- **[R-TYPE-13]** Integer `+`, `-`, and `*` wrap in two's complement on
  overflow at every optimization level.
- **[R-TYPE-14]** Integer division or remainder by zero stops the program with
  a `Division by zero` runtime failure. Signed division of the minimum value by
  `-1` stops it with an `Integer division overflow` failure.
- **[R-TYPE-15]** A constant shift count that is negative or not smaller than
  the left operand's bit width is rejected with `BPL_SHIFT_COUNT_INVALID`. A
  runtime shift count is masked to the left operand's width, so `1 << n` with
  `n == 32` on `int` yields `1`. `>>` is arithmetic for signed and logical for
  unsigned left operands.

### Array, Pointer, and Slice Semantics

- **[R-ARR-1]** `T[N]` is a fixed-size value array with exactly `N`
  contiguous elements; `sizeof(T[N])` is `N * sizeof(T)`.
- **[R-ARR-2]** Fixed arrays are values. Assigning a fixed array or passing it
  to a `T[N]` parameter copies the elements.
- **[R-ARR-3]** `T[]` is a non-owning slice. It does not allocate, free, or own
  the pointed-to storage.
- **[R-ARR-4]** `*T` is a raw pointer. It carries no length and has no
  ownership semantics. Adding or subtracting an integer moves the pointer by
  that many elements.
- **[R-ARR-5]** Indexing a fixed array with an out-of-range index stops the
  program with an `Array index I is out of bounds for size N` runtime failure.
- **[R-ARR-6]** Indexing a slice is bounds-checked against its stored length
  with the same runtime failure.
- **[R-ARR-7]** Indexing a raw pointer uses direct pointer arithmetic. The
  compiler does not bounds-check raw pointers.
- **[R-ARR-8]** Assigning or passing a fixed array where a slice is expected
  creates a view of the existing array storage; writes through the slice are
  visible in the array.
- **[R-ARR-9]** Initializing a slice from an array literal materializes backing
  storage for the literal and creates a slice view over it.
- **[R-ARR-10]** Member access, indexing, and explicit `*pointer` indirection
  check for null pointers, including indirect stores and updates. A null pointer
  raises NullAccessError when a handler is active, otherwise it stops the program
  with a null-access runtime failure. The pointer expression is evaluated once.
  These checks do not validate non-null addresses, lifetimes, or allocation bounds.

`Array<T>` is the standard library's owning growable array.

### Conversion Semantics

Implicit conversions are intentionally narrow:

- **[R-CONV-1]** Values of different integer types, including `bool` as a
  1-bit integer, convert implicitly in initialization, assignment, argument
  passing, and `return`. Widening follows the source signedness; narrowing
  retains the low bits, so assigning the `int` value `2` to a `bool` yields
  `false`.
- **[R-CONV-2]** Integer arithmetic, bitwise operations, and comparisons
  convert the right operand to the left operand's type. Arithmetic results use
  the left type, while comparisons return `bool`. An assignment destination
  does not widen an already-computed binary operation; cast the left operand
  explicitly when a wider operation is intended.
- **[R-CONV-3]** Integer and floating-point types never convert implicitly,
  including integer literals: `local f: float = 1;` is rejected.
- **[R-CONV-4]** A fixed array decays to a raw pointer only when the
  destination type is the matching `*T`.
- **[R-CONV-5]** A fixed array converts to a slice only when the destination
  type is the matching `T[]`.
- **[R-CONV-6]** Slice-to-pointer and slice-to-fixed-array conversions are not
  implicit.
- **[R-CONV-7]** A child struct value is accepted where a parent struct value
  is expected; the conversion copies the parent part (struct slicing). A
  pointer to a child converts implicitly to a pointer to its parent. Parent to
  child conversions are rejected for values and pointers.
- **[R-CONV-8]** `*void` converts implicitly to and from every pointer type.
  Pointers with other different pointee types do not convert, and pointers do
  not convert to or from integers.
- **[R-CONV-9]** `Lambda` values, including non-capturing lambda literals, are
  not implicitly assignable to `Func` values or parameters. A named `frame`
  function converts to both a matching `Func` and a matching `Lambda`.
- **[R-CONV-10]** `cast<T>(value)` and `(value as T)` are equivalent explicit
  conversions. Integer casts keep the low bits or extend according to the
  source signedness. Floating-point to integer casts truncate toward zero and
  saturate at the destination range; NaN converts to `0`. Casting an integer to
  `string` is rejected with `BPL_CAST_INTEGER_TO_STRING`.

## 3. ABI Lowering Contract

The LLVM lowering is part of the language contract for v0.1 features that
interoperate with C, inline assembly, or generated IR tests.

### Function and Lambda ABI

- **[R-ABI-1]** `Func<R>(...)` lowers to a thin function pointer; concretely,
  `Func<R>(Args...)` lowers to a raw pointer with signature `R (Args...)*`.
- **[R-ABI-2]** `Lambda<R>(...)` lowers to a closure value; concretely,
  `Lambda<R>(Args...)` lowers to `{ R (i8*, Args...)*, i8* }`. The first field
  is the thunk/function pointer. The second field is the erased capture context
  pointer.
- **[R-ABI-3]** Passing a `Func` to C ABI code passes only the raw function
  pointer. Its signature must also satisfy the external ABI restrictions below.
- **[R-ABI-4]** Passing a `Lambda` passes the closure value and is not C ABI
  compatible; an extern signature that uses a `Lambda` is rejected with
  `BPL_EXTERN_ABI_UNSUPPORTED`.

### External ABI restrictions

**[R-EXTERN-1]** Extern parameters and results may be scalars, pointers,
`string`, and function pointers whose signatures meet the callback restriction.
**[R-EXTERN-6]** Extern parameters and results may also be payload-free enums
(passed as C `int`) and C-compatible structs, which are lowered to the target C
calling convention. A struct is C-compatible when it has at least one field,
all fields are C-compatible values or fixed arrays of them, and it has no
methods, specs, parent or child structs, or generic parameters.
**[R-EXTERN-7]** Tuples, slices, fixed arrays, Lambdas, enums with payloads,
and other structs are rejected with `BPL_EXTERN_ABI_UNSUPPORTED`, as are
aggregates in callback (`Func`) signatures and in variadic extern declarations.
**[R-EXTERN-4]** Direct extern variadic calls reject aggregate arguments, except
`String` (passed as its data pointer) and payload-free enums (passed as their
`i32` tag).
**[R-EXTERN-5]** These restrictions do not change ordinary BPL aggregate calls.

### Slice ABI

- **[R-SLICE-1]** `T[]` lowers to `{ T*, i64 }`. Field 0 is the data pointer.
  Field 1 is the element count.
- **[R-SLICE-2]** `T[N]` to `T[]` lowering emits a `getelementptr` to the
  first element and inserts the compile-time length.
- **[R-SLICE-3]** The fixed-array to slice path must not copy the source
  array.

## 4. Compiler Pipeline Contract

_Informative._ The compiler currently runs as parser AST, type checker, and
LLVM code generator. Incremental lowering rules live in the middle end so
semantic conversions can be named once and consumed by both type checking and
codegen.

- The parser records syntax and source locations. It does not decide ABI
  behavior.
- The type checker resolves names, overloads, generic instantiations, and
  whether conversions are allowed.
- The incremental lowering layer classifies implicit conversions such as
  identity, array-to-pointer decay, and array-to-slice view construction.
- Codegen consumes resolved types and explicit lowering decisions. It should
  not invent new semantic conversions by string-matching LLVM types.
- Golden LLVM shape tests (`tests/GoldenLLVMShapes.test.ts`) guard the ABI
  rules in section 3.

## 5. Declarations

### Variables

- **[R-DECL-1]** Variables are declared with `local` or `global` and an
  explicit type annotation. A declaration without a type annotation is rejected
  with `BPL_VARIABLE_TYPE_ANNOTATION_MISSING`; there is no initializer-based
  type inference.
- **[R-DECL-2]** A global declared without an initializer is zero-initialized.
  A local declared without an initializer has an unspecified value until it is
  assigned; reading it first is undefined behavior and is not diagnosed.
- **[R-DECL-3]** A local variable or parameter that is never used is a compile
  error (`Unused variable`), unless its name starts with `_`.

```bpl
local x: int;
local y: int = 10;
global MAX: int = 100;
```

### Type Aliases

- **[R-DECL-4]** `type Name = Type;` and `type Name<T> = Type;` introduce a
  name that is interchangeable with the aliased type, including primitive,
  tuple, function, slice, and generic types.

```bpl
type ID = int;
type Point2D = (int, int);
type Callback = Func<void>(int);
type SortFunc<T> = Func<int>(T, T);
type IntArr = int[];
```

### Destructuring

- **[R-DECL-5]** `local (a: A, b: B) = expression;` declares one binding per
  tuple element. Each named binding requires an explicit type, and `_`
  discards an element. Tuple types have at least two elements; `(int)` is a
  parenthesized `int`.
- **[R-DECL-6]** Tuple assignment `(x, y) = (y, x);` assigns to existing
  bindings after evaluating the whole right-hand side, so it swaps values.

```bpl
local (a: int, b: bool) = getTuple();
local (x: int, y: int) = (1, 2);
(x, y) = (y, x);
```

### Constants

- **[R-DECL-7]** `const` prohibits reassignment of a local, global, or
  parameter binding, including through `++`, `--`, compound assignment, or
  assignment to a field of a `const` struct value. Violations are rejected with
  `BPL_ASSIGNMENT_TARGET_CONSTANT`.
- **[R-DECL-8]** A constant pointer binding, including a `const *T` parameter,
  does not by itself make its pointee immutable.

```bpl
local const PI: float = 3.14159;
global const MAX_USERS: int = 100;

frame process(data: const *int) {
    *data = 1; # allowed: the pointee is not constant
}
```

### Scoping

- **[R-DECL-9]** Variables are lexically scoped. A variable declared inside a
  block `{ ... }`, including a variable declared in a `loop` header, is only
  visible within that block and its sub-blocks; later uses report
  `BPL_SYMBOL_NOT_FOUND`.
- **[R-DECL-10]** An inner block may shadow a local or global from an outer
  scope. Declaring the same name twice in one scope, including redeclaring a
  parameter in the function's top-level block, is rejected with
  `BPL_VARIABLE_REDECLARATION`.

```bpl
local x: int = 10;
if (true) {
    local x: int = 20; # Shadows outer x
    printf("%d", x); # Prints 20
}
printf("%d", x); # Prints 10
```

## 6. Functions

### Declaration

- **[R-FN-1]** `frame name(parameters) ret Type { ... }` declares a function.
  Without `ret`, the function returns `void`.
- **[R-FN-2]** Every control-flow path of a non-void function must return a
  value. A `void` function cannot `return` a value
  (`BPL_RETURN_TYPE_MISMATCH`).
- **[R-FN-3]** The entry point is `main`. When `main` returns `int`, its value
  is the process exit status.
- **[R-FN-4]** A module-level function can be called before its declaration
  appears in the file.
- **[R-FN-5]** Arguments are passed by value, including structs and fixed
  arrays. Pass a pointer when the callee must modify the caller's value.
- **[R-FN-6]** Call arguments are evaluated from left to right, and the left
  operand of a binary operator is evaluated before the right operand.
- **[R-FN-7]** Functions may be overloaded by parameter count or types. Two
  declarations that differ only in their return type are rejected with
  `BPL_SYMBOL_ALREADY_DEFINED`.

<!-- bpl-doc: run=spec-methods -->

```bpl
extern printf(fmt: string, ...);

struct Counter {
    value: int,

    frame get(this: *Counter) ret int { # instance method
        return this.value;
    }

    frame add(a: int, b: int) ret int { # static method
        return a + b;
    }
}

frame main() ret int {
    local counter: Counter = Counter { value: 5 };
    printf("%d %d\n", counter.get(), Counter.add(2, 3));
    return 0;
}
```

### Generics

- **[R-FN-8]** A generic function `frame name<T, U>(...)` is instantiated with
  explicit type arguments at each call, such as `identity<int>(1)`. Type
  arguments are not inferred from call arguments, and a call with the wrong
  number of type arguments is rejected.
- **[R-FN-9]** A constrained type parameter `<T: Spec>` accepts only types that
  implement `Spec`, whether the spec is listed directly, after a parent struct,
  or on a parent struct.

```bpl
frame identity<T>(val: T) ret T {
    local temp: T = val;
    return temp;
}
```

## 7. Structs

- **[R-STRUCT-1]** A struct declares fields as `name: Type` separated by
  commas (the final comma is optional) and methods as `frame` declarations.
  There are no visibility modifiers; all members are accessible.
- **[R-STRUCT-2]** A method whose first parameter is `this: *S` or `this: S`
  is an instance method called as `value.method(...)`. A method without `this`
  is static and is called as `S.method(...)`.
- **[R-STRUCT-3]** A struct literal `S { field: value, ... }` must initialize
  every field declared directly in `S`; missing fields are rejected with
  `BPL_STRUCT_LITERAL_FIELD_MISSING` and unknown fields with
  `BPL_STRUCT_LITERAL_FIELD_UNKNOWN`. Inherited fields may be omitted and are
  then zero-initialized.
- **[R-STRUCT-4]** Fields are laid out in declaration order with C alignment
  and padding. Inherited fields precede the child's fields.
- **[R-STRUCT-5]** A struct begins with a hidden vtable pointer when it
  declares methods, lists a parent struct or spec, or is the parent of another
  struct. Other structs have no hidden storage (`struct Plain { x: int, }` is 4
  bytes).
- **[R-STRUCT-6]** A struct inherits from at most one parent struct, written
  first in the inheritance list: `struct Child : Parent, SpecA, SpecB`. Listing
  two parent structs, or a parent struct after a spec, is rejected.
- **[R-STRUCT-7]** Calls to an instance method through a pointer dispatch to
  the override of the pointed-to object's dynamic type. Calls on a struct value
  use the value's static type.
- **[R-STRUCT-8]** For type checking, every struct is a subtype of the root
  `Type` struct, so a pointer to any struct converts implicitly to `*Type`.
- **[R-STRUCT-9]** A struct that contains itself by value, directly or
  through other structs, is rejected with `BPL_TYPE_RECURSION_CYCLE`.
  Self-reference through a pointer is allowed.
- **[R-STRUCT-10]** Generic structs are instantiated with explicit type
  arguments, such as `Box<int> { val: 1 }`. Methods can declare their own type
  parameters, which are also supplied explicitly at the call.

```bpl
struct Point {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Point {
        return Point { x: x, y: y };
    }
}

struct Point3D : Point {
    z: int,
}

struct Box<T> {
    val: T,

    frame pair<X>(this: *Box<T>, other: X) ret (T, X) {
        return (this.val, other);
    }
}
```

## 7.1 Specs - Interfaces

- **[R-SPEC-1]** `spec Name { frame method(this: *Self, ...) ret Type; }`
  declares required methods, where `Self` is the implementing struct.
- **[R-SPEC-2]** A struct implements a spec by listing it in its inheritance
  list. It must declare every required method with the same parameter count;
  a missing method or a different parameter count is rejected.
- **[R-SPEC-3]** A struct can implement any number of specs, and a child
  struct also implements the specs of its parent.

```bpl
spec Drawable {
    frame draw(this: *Self) ret int;
}

spec Named {
    frame name(this: *Self) ret string;
}

struct Shape {
    id: int,
}

struct Circle : Shape, Drawable, Named {
    radius: int,

    frame draw(this: *Circle) ret int {
        return this.radius;
    }

    frame name(this: *Circle) ret string {
        return "circle";
    }
}
```

## 7.2 Enums

- **[R-ENUM-1]** An enum declares unit variants (`A`), tuple variants
  (`B(int, int)`), and struct variants (`C { x: int }`). Values are written
  `E.A`, `E.B(1, 2)`, and `E.C { x: 1 }`. Generic enums take explicit type
  arguments: `Option<int>.Some(1)`.
- **[R-ENUM-2]** Enum values compare with `==` and `!=`. Enums do not convert
  to or from integers, implicitly or with `cast`.

## 8. Control Flow

### Conditionals

- **[R-CTRL-1]** `if (condition) statement` optionally followed by
  `else statement`; `else if` chains are written as an `if` statement in the
  `else` branch. The parentheses are required, and a branch may be a block or
  a single statement.
- **[R-CTRL-2]** `if` and `loop` conditions must have type `bool`; other
  types, including integers, are rejected with `BPL_CONDITION_TYPE_MISMATCH`.

```bpl
if (x > 0) {
    # ...
} else if (x < 0) {
    # ...
} else {
    # ...
}
```

### Loops

- **[R-CTRL-3]** `loop { ... }` repeats forever, `loop (condition) { ... }`
  repeats while the condition is true, and
  `loop (init; condition; step) { ... }` is a C-style loop in which each part
  may be omitted. `loop (;;)` is equivalent to `loop`.
- **[R-CTRL-4]** `break` exits the innermost enclosing loop or `switch`, and
  `continue` starts the next iteration of the innermost enclosing loop, also
  from inside a `switch`. Outside those contexts they are rejected with
  `BPL_BREAK_OUTSIDE_CONTEXT` and `BPL_CONTINUE_OUTSIDE_LOOP`.
- **[R-CTRL-5]** `break`, `continue`, and `fallthrough` cannot target a loop
  or `switch` outside the enclosing `defer` statement or lambda body.
- **[R-CTRL-6]** There are no `for`, `foreach`, `while`, or `do ... while`
  statements.

```bpl
# Infinite loop
loop {
    if (done) {
        break;
    }
}

# While-style loop
loop (i < 10) {
    i = i + 1;
}

# C-style loop
loop (local j: int = 0; j < 10; j = j + 1) {
    printf("%d", j);
}

# C-style loops with omitted parts
loop (; i < 20; ) {
    i = i + 1;
}
loop (;;) {
    break;
}
```

### Switch

- **[R-CTRL-7]** `switch (value)` accepts integer, string, and enum values;
  other types are rejected with `BPL_SWITCH_VALUE_TYPE_MISMATCH`. Duplicate
  case values are rejected.
- **[R-CTRL-8]** A braced `case` or `default` body must end with `break`,
  `continue`, `return`, `throw`, or `fallthrough`. Control never falls into
  the next case implicitly; `fallthrough;` continues with the next case body.
  When no case matches and there is no `default`, the switch does nothing.

```bpl
switch (val) {
    case 1: {
        handleOne();
        fallthrough;
    }
    case 2: {
        handleOneOrTwo();
        break;
    }
    default: {
        break;
    }
}
```

### Defer

- **[R-DEFER-1]** `defer statement` or `defer { ... }` schedules code to run
  when the enclosing block exits: by reaching its end, `return`, `break`,
  `continue`, or a thrown exception.
- **[R-DEFER-2]** Deferred code runs in last-in, first-out order.
- **[R-DEFER-3]** A `return` value is evaluated before deferred code runs.
- **[R-DEFER-4]** A deferred block cannot return a value
  (`BPL_DEFER_RETURN_VALUE_INVALID`). An exception thrown by deferred code
  propagates like any other exception.

```bpl
frame processFile(path: string) {
    local file: File = open(path);
    defer {
        close(file);
    }

    # ... process file ...
    # close(file) is called automatically here
}
```

### Error Handling

- **[R-EXC-1]** `throw expression;` throws a value of any type, such as an
  integer, `bool`, floating-point value, string, or struct.
- **[R-EXC-2]** A `try` block is followed by one or more `catch` clauses.
  `catch (name: Type)` handles a thrown value whose type is exactly `Type`; a
  parent-struct clause does not catch a child struct value. `catch` without a
  type handles any value. Clauses are tested in order.
- **[R-EXC-3]** An exception that no clause handles propagates to the caller,
  including an exception thrown from a `catch` block. An exception that reaches
  the top of the program prints `Uncaught exception` and exits with status 1.

```bpl
try {
    throw 1;
} catch (e: int) {
    # Handle int error
} catch (e: bool) {
    # Handle bool error
} catch {
    # Handle any other value
}
```

## 9. Expressions & Operators

### Operators

- **[R-EXPR-1]** `+`, `-`, `*`, and `/` apply to numeric operands. Integer
  division truncates toward zero, and `%` takes the sign of the dividend. `%`
  requires integer operands (`BPL_MODULO_OPERAND_TYPE_MISMATCH`).
- **[R-EXPR-2]** `&&` and `||` require `bool` operands and evaluate the right
  operand only when needed. `!` requires a `bool` operand.
- **[R-EXPR-3]** `&`, `|`, `^`, `~`, `<<`, and `>>` require integer operands;
  `bool` operands are rejected with `BPL_BITWISE_OPERAND_TYPE_MISMATCH`.
- **[R-EXPR-4]** `==`, `!=`, `<`, `<=`, `>`, and `>=` return `bool`. Struct
  values compare field by field with `==` and `!=`.
- **[R-EXPR-5]** The assignment operators are `=`, `+=`, `-=`, `*=`, `/=`,
  `%=`, `&=`, `|=`, and `^=`. Assignment is a right-associative expression, so
  `x = y = 7` assigns both. The target must be a variable, member, index,
  pointer dereference, or tuple of those; otherwise it is rejected with
  `BPL_ASSIGNMENT_TARGET_INVALID`.
- **[R-EXPR-6]** Prefix and postfix `++` and `--` apply to integer and
  floating-point variables, members, elements, and dereferenced pointers. The
  prefix form yields the updated value and the postfix form yields the previous
  value. Operands that are not assignable are rejected with
  `BPL_ASSIGNMENT_TARGET_INVALID`; `bool`, pointer, and string operands are
  rejected.
- **[R-EXPR-7]** Multiplicative operators bind more tightly than additive
  operators, which bind more tightly than shifts. Comparison operators bind
  more tightly than `&`. Binary operators of equal precedence associate left to
  right.
- **[R-EXPR-8]** `condition ? a : b` evaluates only the selected branch. The
  branch types must be compatible (`BPL_TERNARY_BRANCH_TYPE_MISMATCH`).
- **[R-EXPR-9]** Unary `+` is not supported (`BPL_UNARY_PLUS_UNSUPPORTED`).

### Special Expressions

- **[R-EXPR-10]** `sizeof(Type)` and `sizeof(expression)` yield the size in
  bytes of the type.
- **[R-EXPR-11]** `&lvalue` yields a pointer to the operand, and `*pointer`
  reads or writes the pointed-to value.
- **[R-EXPR-12]** `(value is Type)` yields `bool`. For pointers to structs,
  `pointer is *Child` tests the dynamic type of the pointed-to object.
- **[R-EXPR-13]** `match<Type>(value)` yields `true` when the value's type is
  `Type` or a subtype of `Type`.

### Lambdas

- **[R-LAMBDA-1]** `|name: Type, ...| ret Type { ... }` creates a `Lambda`
  value. It may have zero parameters (`|| { ... }`), and `ret` may be omitted
  for a `void` result.
- **[R-LAMBDA-2]** A lambda captures the outer locals it uses by value when it
  is created. Later changes to the outer variable are not visible to the
  lambda, and assignments inside the lambda do not change the outer variable.
- **[R-LAMBDA-3]** A lambda can be returned from the function that created it
  and called after that function returns.

### Pattern Matching

- **[R-MATCH-1]** `match (value) { pattern => expression, ... }` is an
  expression. Arms are tested in order, and the first arm whose pattern matches
  and whose optional `if` guard is true is selected.
- **[R-MATCH-2]** Patterns are literals (`0`, `3.14`, `true`, `"hello"`,
  `'A'`), identifiers that bind the matched value, `_`, tuple patterns such as
  `(0, y)`, and enum patterns `E.V`, `E.V(a, b)`, and `E.V { field: name }`.
  Generic enum patterns may be written `Option<int>.Some(x)` or
  `Option.Some(x)`.
- **[R-MATCH-3]** An enum match must cover every variant or include a
  catch-all arm. Other matches must include an unguarded `_` or identifier arm.
  Guarded arms do not count toward exhaustiveness. Violations are rejected with
  `BPL_MATCH_EXHAUSTIVENESS_MISMATCH`.
- **[R-MATCH-4]** An arm body may be a block. Inside a block arm,
  `return expression;` yields the arm's value rather than returning from the
  enclosing function.

```bpl
# Primitive patterns (int, float, bool, string, char)
match (x) {
    0 => "zero",
    42 => "answer",
    n if n < 0 => "negative",
    _ => "other",
}

# Tuple patterns
match (point) {
    (0, 0) => "origin",
    (0, y) => "y-axis",
    (x, 0) => "x-axis",
    (x, y) if x == y => "diagonal",
    (x, y) => "other",
}

# Enum patterns
enum Option<T> { Some(T), None }
match (opt) {
    Option<int>.Some(val) => val,
    Option<int>.None => 0,
}
```

## 10. Modules and Imports

### Exports

- **[R-MOD-1]** Each file is a module. Top-level declarations are private to
  the module unless exported.
- **[R-MOD-2]** `export name;`, `export [Name];`, and `export { name };` each
  export one symbol. An export may appear before the declaration it names. An
  export that names no declaration is not diagnosed in the exporting module;
  importing that name is rejected with `BPL_IMPORT_EXPORT_NOT_FOUND`. Inline
  forms such as `export frame f()` and lists such as `export a, b;` are syntax
  errors.

```bpl
export myFunc;
export [MyStruct];
export { variable };
```

### Imports

- **[R-MOD-3]** `import a, [T], { b } from "path";` binds the listed exported
  symbols. The bracket and brace spellings are accepted for any exported
  symbol; by convention, types are written in brackets. `import name as alias`
  binds a bare name under another name.
- **[R-MOD-4]** Importing a symbol that the module does not export is rejected
  with `BPL_IMPORT_EXPORT_NOT_FOUND`, and a module path that does not resolve is
  rejected with `BPL_MODULE_NOT_FOUND`.
- **[R-MOD-5]** `import * as ns from "path";` binds a namespace. `ns.name`
  accesses only exported symbols.
- **[R-MOD-6]** `import "path";` loads the module and binds all of its
  exported symbols.
- **[R-MOD-7]** A relative path such as `"./utils.bpl"` resolves against the
  importing file's directory. `"std"` and `"std/name.bpl"` resolve to the
  standard library.

```bpl
# Import functions and values
import myFunc, myGlobal from "./utils.bpl";

# Import types (brackets by convention)
import [MyStruct], [MyType] from "./types.bpl";

# Mixed imports
import process, [Config], [DisposableSpec], { MAX_USERS } from "./lib.bpl";

# Namespace import
import * as std from "std";
```

## 11. Inline Assembly

### Syntax and Flavors

- **[R-ASM-1]** `asm { ... }` or `asm("flavor") { ... }` embeds assembly in a
  function body. The flavors are `llvm` (the default), `raw` (an alias of
  `llvm`), `intel`, `x86` (an alias of `intel`), and `att`. Other flavors are
  rejected.
- **[R-ASM-2]** In the `llvm` flavor, each non-empty line, optionally written
  as a quoted string, is emitted as an LLVM IR instruction. `(name)` is
  replaced by the storage pointer of a scalar local, by the value of a
  pointer-typed local, or by `@name` for a global. `(&name)` is replaced by the
  local's storage pointer.
- **[R-ASM-3]** The `intel` and `att` flavors emit an LLVM inline assembly call
  (`asm sideeffect`, with `inteldialect` for `intel`). Lines may be quoted.
  These flavors target x86-64.
- **[R-ASM-4]** In `intel` and `att` blocks, `(name)` passes the variable's
  value as an input, `(=name)` names an output that is stored back into the
  variable after the block, and `(&name)` passes the variable's address. The
  default constraints are `"r"` for inputs and `"=r"` for outputs;
  `(name: "{ebx}")` and `(=name: "={ecx}")` override them.
- **[R-ASM-5]** A final `[ "reg", ... ]` list sets the clobbered registers.
  Without it, the block clobbers memory and flags plus every register named in
  the assembly text.
- **[R-ASM-6]** Every `(name)`, `(=name)`, and `(&name)` operand must name a
  variable in scope.

<!-- bpl-doc: arch=x64 -->

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local sum: int = 0;
    local next: int = 0;
    local stored: int = 0;

    # Intel syntax with an explicit clobber list
    asm("intel") {
        mov eax, (a)
        add eax, (b)
        mov (=sum), eax
        [ "eax" ]
    }

    # AT&T syntax
    asm("att") {
        movl (b), %eax
        addl $1, %eax
        movl %eax, (=next)
    }

    # Raw LLVM IR
    asm("llvm") {
        "store i32 7, i32* (stored)"
    }

    printf("%d %d %d\n", sum, next, stored);
    return 0;
}
```

## 12. Standard Library Overview

_Informative._ The BPL standard library (`std`) provides core functionality.
[docs/stdlib-reference.md](docs/stdlib-reference.md) lists every exported
declaration.

- **std/io.bpl**: Input/Output.
- **std/process.bpl**: Process execution and management.
- **std/string.bpl**: String manipulation.
- **std/array.bpl**, **std/map.bpl**, **std/set.bpl**, **std/deque.bpl**:
  Collections.
