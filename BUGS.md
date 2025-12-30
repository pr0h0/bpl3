# BPL Compiler Bug Report

This file tracks bugs and edge cases found during comprehensive testing.

## Summary

| ID      | Category            | Description                                                                                                              | Status  | Notes                                                                                                                                                                                                                                                                                    |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-001 | Primitive Types     | Integer literal overflow is not detected (e.g., `i8 = 128`).                                                             | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-002 | Arithmetic          | Division by zero in constant expressions is not detected (e.g., `1 / 0`).                                                | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-003 | Structs             | Recursive structs without pointers are accepted (infinite size).                                                         | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-004 | Functions           | Duplicate parameter names are accepted in function declarations.                                                         | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-005 | Arrays              | Zero-sized arrays are accepted (`Type[0]`).                                                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-006 | Arrays              | Negative array sizes cause parser error instead of semantic error.                                                       | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-007 | Control Flow        | Duplicate cases in switch statements are accepted.                                                                       | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-008 | Scoping             | Variable shadowing in the same scope is accepted.                                                                        | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-009 | Control Flow        | Unreachable code after return is accepted.                                                                               | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-010 | Analysis            | Unused variables are accepted without warning or error.                                                                  | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-011 | Type System         | Invalid type casts (e.g., `i32` to `string`) are accepted.                                                               | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-012 | Structs             | Struct literals with missing fields are accepted (uninitialized memory).                                                 | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-013 | Control Flow        | Switch statements accept floating point values.                                                                          | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-014 | Analysis            | `sizeof<void>` is accepted.                                                                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-015 | Arithmetic          | Modulo operator `%` is accepted for floating point types.                                                                | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-016 | Arrays              | Array indexing with floating point values is accepted.                                                                   | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-017 | Operators           | Unary negation `-` is accepted for strings.                                                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-018 | Operators           | String subtraction `"a" - "b"` is accepted.                                                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-019 | Assignment          | Assignment to r-values (literals, expressions) is accepted.                                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-020 | Runtime             | Array out of bounds access returns garbage instead of crashing or erroring.                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-021 | Runtime             | Division by zero causes silent crash (exit code 1) without error message.                                                | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-022 | Runtime             | Stack overflow causes silent crash (exit code 1) without error message.                                                  | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-023 | Syntax              | Struct definitions require a trailing comma for the last field.                                                          | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-024 | Syntax              | Generic struct literals `Box<i32> { ... }` are not supported.                                                            | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-025 | Syntax              | Trailing commas in function calls `foo(1, 2,)` are not supported.                                                        | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-026 | Runtime             | Structs have hidden overhead (null bit) increasing `sizeof` unexpectedly.                                                | Ignored | This is not the case anymore, its fixed now                                                                                                                                                                                                                                              |
| BUG-027 | Codegen             | Match statements with data variants cause LLVM IR generation failure.                                                    | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-028 | Analysis            | Generic Enum type inference fails for constructors (e.g., `Option.Some(42)`).                                            | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-029 | Parser              | Calling a function pointer field directly `obj.ptr()` fails.                                                             | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-030 | No Dynamic Dispatch | BPL does not support dynamic dispatch (virtual methods). Method calls are statically resolved based on the pointer type. | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-031 | Codegen             | Comparison operators `!=` on structs generate invalid LLVM IR (`icmp` requires integer operands).                        | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-032 | Pattern Matching    | Nested enum pattern matching with qualified names doesn't extract variant data correctly                                 | Fixed   | Fixed by allowing match expressions to be used as statements without a semicolon.                                                                                                                                                                                                        |
| BUG-033 | Initialization      | Implicit constructors are not called for array elements.                                                                 | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-034 | Generics            | Using generic type parameter directly in `is` operator causes LLVM error.                                                | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-035 | Lexer               | Lexer emits `Comment` tokens instead of skipping them (Design choice, not a bug).                                        | Closed  | They are parsed but ignored later, used for formatting and docs primarly                                                                                                                                                                                                                 |
| BUG-036 | Runtime             | Integer shift overflow (e.g., `1 << 65`) results in undefined behavior.                                                  | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-037 | Runtime             | Float to Int cast overflow (e.g., `1e20` to `int`) results in INT_MIN instead of error or clamp.                         | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-038 | Semantics           | `void` variable declaration is accepted but unused.                                                                      | Fixed   | make it type checker error where no variable or argument can be "void" but allow "\*void" for pointers                                                                                                                                                                                   |
| BUG-039 | Lexer               | Multi-character literals (e.g., `'ab'`) cause "Unrecognized token" error instead of specific error.                      | Fixed   | single ' should allow only one character or sequence of characters that resolves to single character like \u00000010 in JS or whatever, but should throw that char can hold only one character                                                                                           |
| BUG-040 | Semantics           | Switch case values must be literals, preventing use of Enum variants (e.g., `case Color.Red`).                           | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-041 | Runtime             | Struct alignment/padding seems excessive or incorrect. `u8` + `u64` results in size 24 (expected 16).                    | Fixed   | there is vtable pointer too so probably that makes extra space in structs with methods, maybe add vtable only on structs that are inherited,or keep them on every struct with method since some other struct can inherit from it and the we may get incorrect behavior for parent struct |
| BUG-042 | Semantics           | Struct field and method can share the same name, potentially causing ambiguity or shadowing issues.                      | Fixed   | should be disallowed                                                                                                                                                                                                                                                                     |
| BUG-043 | Formatter           | Formatter crashes or produces invalid output when processing ASTs with syntax errors.                                    | Fixed   | Formatter now checks for `ast.errors` and throws a `CompilerError` before attempting to format.                                                                                                                                                                                          |
| BUG-043 | Syntax              | Lambda expressions require explicit return type annotation (e.g., \|x: int\| ret int { ... }`) or fail to parse.         | Fixed   | Fixed by hiding matchContext during lambda body check, allowing return statements to be checked against lambda return type.                                                                                                                                                              |
| BUG-044 | Generics            | Infinite generic recursion (e.g., `struct Node<T> { next: *Node<Box<T>> }`) hits recursion limit instead of clean error. | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-045 | Pointers            | Pointer subtraction generates invalid LLVM IR (`sub i32* ...`).                                                          | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-046 | Arrays              | Multidimensional array syntax `T[N][M]` is accepted but size is incorrect (likely flattened or ignored).                 | Invalid | Allow instantiation of multidimensional arrays without limit on number of dimensions                                                                                                                                                                                                     |
| BUG-047 | Arrays              | `sizeof` reports incorrect size for multidimensional arrays (related to BUG-046).                                        | Invalid |                                                                                                                                                                                                                                                                                          |
| BUG-048 | Types               | `int` is 32-bit (4 bytes), contradicting documentation which states 64-bit.                                              | Fixed   | Updated AGENTS.MD to reflect that int is 32-bit.                                                                                                                                                                                                                                         |
| BUG-049 | Pointers            | `cast<int>(ptr)` truncates pointers on 64-bit systems because `int` is 32-bit.                                           | Open    | pointers should be casted to long                                                                                                                                                                                                                                                        |
| BUG-050 | Pointers            | `cast<int>(ptr)` dereferences the pointer instead of casting the address.                                                | Open    | this tries to dereference pointer and cast it's value instead of raw pointer addrress, should we leave it like that?                                                                                                                                                                     |
| BUG-051 | Pointers            | `cast<*T>(int)` creates a new temporary variable and returns its address, instead of casting the integer to a pointer.   | Open    | this is effectivelly &int or &T? should we be able to cast to pointer from non pointer type int->\*int, should this be handles as &int?                                                                                                                                                  |
| BUG-052 | Strings             | String literals containing `\0` cause a JSON Parse error in the compiler.                                                | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-053 | Strings             | Hex escape sequences (e.g., `\x41`) in string literals cause a JSON Parse error.                                         | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-054 | Structs             | Struct fields shadow methods with the same name, making methods uncallable.                                              | Fixed   | forbid duplicate keys no matter if its attribute or method                                                                                                                                                                                                                               |
| BUG-055 | Enums               | Nested pattern matching (e.g., `Option.Some(Option.Some(x))`) is not supported by the parser.                            | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-056 | Enums               | Duplicate enum variants (e.g., `enum E { A, A }`) are accepted silently, creating ambiguity.                             | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-057 | Control Flow        | `if` statements require braces `{}`. Single-statement bodies are not supported.                                          | Open    | require braces for "if" and "loop"                                                                                                                                                                                                                                                       |
| BUG-058 | Control Flow        | `switch` cases require braces `{}`. Single-statement cases are not supported.                                            | Open    | allow no braces in switch/case and allow falthrough, ending switch once we reach break or default or return                                                                                                                                                                              |
| BUG-059 | Types               | Compiler allows `void` as a named function argument type (e.g., `frame foo(v: void)`).                                   | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-060 | Types               | Compiler allows arrays of `void` (e.g., `local arr: void[10]`), which is invalid as `void` has no size.                  | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-061 | Lexer               | Nested multi-line comments (`/# ... /# ... #/ ... #/`) are not supported. The first `#/` closes the comment.             | Open    | try to support it                                                                                                                                                                                                                                                                        |
| BUG-062 | Operators           | Assignment chaining (e.g., `a = b = c`) is not supported. Assignment is a statement, not an expression.                  | Open    | allow this only for assignmet, but now for declaration                                                                                                                                                                                                                                   |
| BUG-063 | Operators           | Boolean values are implicitly promoted to integers in comparisons, allowing confusing expressions like `3 > 2 > 1`.      | Open    | allow bool promotion, it's logical error, let them cope with it, maybe some warning in linter but don't do anything in compiler                                                                                                                                                          |
| BUG-064 | FFI                 | Functions are represented as fat pointers (16 bytes) and cannot be cast to `*void`, breaking FFI compatibility with C.   | Open    | it's probably because of vtable or context for lambdas, see if we can make context be passed only to lambdas since functions are declared in top level or as struct methods, they still shoudl have access to globals but IDK?                                                           |
| BUG-065 | Generics            | Generic type inference for constructors is not supported (e.g., `Box.new(10)` fails). Must use `Box<int>.new(10)`.       | Open    | no inference, type is explicit and required for now, make sure generic types work for is/as match/cast syntax                                                                                                                                                                            |
| BUG-066 | Parser              | The parser does not support empty tuples `()` in type declarations or expressions.                                       | Open    | there should be no empty tuple i guess                                                                                                                                                                                                                                                   |
| BUG-067 | Parser              | The parser does not allow accessing tuple elements using dot notation with numbers (e.g., `tuple.0`).                    | Open    | this should be supported and allowed since there is no other way to access tuple items other than destructuring and it can be bothersome to create new variables every time                                                                                                              |
| BUG-068 | Type System         | Array types (fixed `T[N]` and dynamic `T[]`) do not expose a `.len` or `.length` property.                               | Open    | no since this is raw memory, use Array<T> if you need size                                                                                                                                                                                                                               |
| BUG-069 | Type System         | Fixed-size arrays cannot be assigned to dynamic array (slice) types.                                                     | Open    | this should be supported on assignment I guess                                                                                                                                                                                                                                           |
| BUG-070 | Parser              | The parser does not support default values for function parameters.                                                      | Open    | this is in roadmap and not yet supported, leave it like that, we'll implement that later                                                                                                                                                                                                 |
| BUG-071 | Parser              | BPL function definitions (`frame`) do not support defining variadic functions.                                           | Open    | it does,sytnax is frame name (args:...type, count: int){}, this is minimal syntax, it support fixed args before variadic args, and count is implicit and passed by compiler                                                                                                              |
| BUG-072 | Compiler Crash      | The compiler crashes with a stack overflow (RangeError) when processing a recursive type alias.                          | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-073 | Code Generation     | Assigning a child struct to a parent struct variable (slicing) generates invalid LLVM IR.                                | Open    | this should be supported and should work I guess                                                                                                                                                                                                                                         |
| BUG-074 | Code Generation     | Switch statements on string types generate invalid LLVM IR.                                                              | Open    | this should work                                                                                                                                                                                                                                                                         |
| BUG-075 | Parser              | The parser does not support assigning explicit integer values to enum variants.                                          | Open    | this would be good to have                                                                                                                                                                                                                                                               |
| BUG-076 | Parser              | The compiler does not support inline `export` declarations.                                                              | Open    | nope, you have to declare something and then export                                                                                                                                                                                                                                      |
| BUG-077 | Code Generation     | Namespace import (`import * as`) fails to generate LLVM declarations, causing link errors.                               | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-078 | Type Inference      | Lambda return type inference fails when passed as function argument.                                                     | Open    | it should be explicit, keep it like that                                                                                                                                                                                                                                                 |
| BUG-079 | Code Generation     | Dereferencing a `*void` pointer generates invalid `load void` instruction.                                               | Open    | i guess thats correct implementation since we have void ptr and we dont know what is actually inside it                                                                                                                                                                                  |
| BUG-080 | Code Generation     | Destructor with value receiver (`this: D`) generates invalid LLVM IR.                                                    | Open    | require to be pointer or promote it implicitly                                                                                                                                                                                                                                           |
| BUG-081 | Equality            | Array equality uses invalid LLVM IR (`icmp eq`) instead of `memcmp`.                                                     | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-082 | Equality            | Tuple equality uses invalid LLVM IR (`icmp eq`) instead of member-wise comparison.                                       | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-083 | Strings             | String concatenation (`+`) generates invalid LLVM IR (`add i8*`) instead of runtime call.                                | Open    | depends if its "string" or "String", one is primitive, alias for \*char, other is struct defined in lib/string.bpl                                                                                                                                                                       |
| BUG-084 | Primitive Types     | `uint` and `int` are 32-bit (4 bytes) instead of 64-bit as documented.                                                   | Open    | Fix documentation to match int-4byte, long 8bytes                                                                                                                                                                                                                                        |
| BUG-085 | Parser              | `sizeof(int[10])` fails parsing (interpreted as indexing expression).                                                    | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-086 | Type Aliases        | Type alias substitution ignores precedence (e.g., `*Arr` where `Arr=int[10]` becomes array of pointers).                 | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-087 | Equality            | Function pointer equality uses invalid LLVM IR (`icmp eq` on closure struct).                                            | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-088 | Methods             | Bound methods (e.g., `obj.method`) are not supported (parser error).                                                     | Open    | in obj.method() this should work, in frame obj.method this should not work since we have struct methods                                                                                                                                                                                  |
| BUG-089 | Structs             | Recursive structs (infinite size) cause LLVM IR generation errors instead of semantic error.                             | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-090 | Enums               | Recursive enums cause stack buffer overflow in generated code (incorrect size calculation).                              | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-091 | Enums               | Enum constructor corrupts fields for small types (writes `i32` for `u8`, overwriting adjacent fields).                   | Open    | cast it to match if its in u8 range i guess                                                                                                                                                                                                                                              |
| BUG-092 | Enums               | Enum constructor overflows buffer for struct fields (incorrect size calculation).                                        | Open    |                                                                                                                                                                                                                                                                                          |
| BUG-093 | Primitive Types     | Method calls on aliased primitive types (e.g., `type MyInt = int; local x: MyInt; x.toString()`) failed to resolve.      | Fixed   | Fixed by allowing wrapping of aliased primitives in CallChecker.                                                                                                                                                                                                                         |
| BUG-094 | Runtime             | Runtime type matching for `Any` type failed due to incorrect struct layout assumption in codegen.                        | Fixed   | Fixed by updating ExpressionGenerator to access `type_id` at index 0.                                                                                                                                                                                                                    |
| BUG-095 | Tests               | `sizeof` tests expected incorrect padding (16 bytes for 2 ints instead of 8).                                            | Fixed   | Updated test expectations to match correct packed size.                                                                                                                                                                                                                                  |
| BUG-096 | Examples            | `htons` function in HTTP server example used invalid shift operands (i32 instead of u16).                                | Fixed   | Added explicit casts to shift operands.                                                                                                                                                                                                                                                  |
| BUG-093 | Structs             | Struct fields of type `void` cause LLVM IR generation errors.                                                            | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-094 | Generics            | Generic instantiation with `void` (e.g., `Box<void>`) causes LLVM IR generation errors.                                  | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-095 | Generics            | Generic array of `void` (e.g., `Arr<void>`) causes LLVM IR generation errors.                                            | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-096 | Parser              | Parentheses in type declarations (e.g., `(*int)[10]`) are not supported.                                                 | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-097 | Arrays              | Array of function types (e.g., `F[10]`) allocates single element instead of array.                                       | Fixed   | Fixed by propagating array dimensions in TypeCheckerBase.resolveType for non-BasicType aliases.                                                                                                                                                                                          |
| BUG-098 | Parser              | Array of tuples (e.g., `(int, int)[10]`) is a syntax error.                                                              | Fixed   |                                                                                                                                                                                                                                                                                          |
| BUG-099 | Generics            | Generic function type aliases fail substitution (generates invalid LLVM IR with `%struct.T`).                            | Fixed   | Fixed by correctly substituting generic parameters in function type aliases in TypeCheckerBase.                                                                                                                                                                                          |
| BUG-100 | Generics            | Generic struct type aliases fail argument count check (e.g., `B<int>` where `B<T>=Box<T>` claims 2 args).                | Fixed   | Fixed by correctly populating typeAliasMap in CodeGenerator.                                                                                                                                                                                                                             |

## Details

### BUG-001: Integer Literal Overflow

The compiler accepts integer literals that do not fit in the target type.

```bpl
frame main() {
  local x: i8 = 128; // Should fail # would be nice to handle this during type checking, by default all integer literals are treated as i32 and then casted to target type, maybe check if literal is in range of target type during cast?
  local y: i32 = 2147483648; // Should fail
}
```

### BUG-002: Division by Zero

Constant folding or type checking does not catch division by zero.

```bpl
frame main() {
  local x: i32 = 1 / 0; // Should fail # should fail, currently we dont do any sort of optimization or constant folding on our end and we leave it to llvm to handle it
}
```

### BUG-003: Recursive Structs

Structs can contain themselves directly, leading to infinite size.

```bpl
struct Node {
  next: Node, // Should fail, must be *Node
}
```

### BUG-004: Duplicate Parameters

Functions accept multiple parameters with the same name.

```bpl
frame test(a: i32, a: i32) {} // Should fail
```

### BUG-005: Zero-sized Arrays

Arrays with size 0 are accepted.

```bpl
frame main() {
  local arr: i32[0]; // Should fail?
}
```

### BUG-006: Negative Array Sizes

Negative array sizes cause a parser error `Expected ... but "-" found` instead of a clear semantic error.

```bpl
frame main() {
  local arr: i32[-1];
}
```

### BUG-007: Duplicate Switch Cases

Switch statements accept duplicate case values.

```bpl
frame main() {
  switch (1) {
    case 1: {}
    case 1: {} // Should fail
  }
}
```

### BUG-008: Variable Shadowing

Variables can be redeclared in the same scope.

```bpl
frame main() {
  local x: i32 = 1;
  local x: i32 = 2; // Should fail
}
```

### BUG-009: Unreachable Code

Code after a return statement is accepted and likely generated, which is wasteful and often a bug.

```bpl
frame main() {
  return;
  local x: i32 = 1; // Should warn or fail
}
```

### BUG-010: Unused Variables

Variables that are declared but never used are accepted without warning.

```bpl
frame main() {
  local x: i32 = 1; // Should warn
}
```

### BUG-011: Invalid Type Casts

The compiler accepts casts between incompatible types, such as `i32` to `string`.

```bpl
frame main() {
  local x: i32 = 1;
  local s: string = cast<string>(x); // Should fail
}
```

### BUG-012: Struct Literals Missing Fields

Struct literals can omit fields, leaving them uninitialized.

```bpl
struct Point { x: i32, y: i32, }
frame main() {
  local p: Point = Point { x: 1 }; // Missing y, should fail
}
```

### BUG-013: Switch on Float

Switch statements accept floating point values, which is usually not supported or requires epsilon comparison.

```bpl
frame main() {
  switch (1.5) {
    case 1.5: {}
  }
}
```

### BUG-014: Sizeof Void

`sizeof<void>` is accepted, but void has no size.

```bpl
frame main() {
  local s: i64 = sizeof<void>(); // Should fail
}
```

### BUG-015: Modulo on Float

The modulo operator `%` is accepted for floating point types.

```bpl
frame main() {
  local x: f64 = 5.5 % 2.2; // Should fail or require fmod
}
```

### BUG-016: Float Indexing

Arrays can be indexed with floating point values.

```bpl
frame main() {
  local arr: i32[10];
  local x: i32 = arr[1.5]; // Should fail
}
```

### BUG-017: String Negation

Unary negation `-` is accepted for strings.

```bpl
frame main() {
  local s: string = -"hello"; // Should fail
}
```

### BUG-018: String Subtraction

Subtraction operator `-` is accepted for strings.

```bpl
frame main() {
  local s: string = "a" - "b"; // Should fail
}
```

### BUG-019: Assignment to R-Value

The compiler accepts assignment to r-values like literals or expressions.

```bpl
frame main() {
  1 = 2; // Should fail
  (1 + 2) = 3; // Should fail
}
```

### BUG-020: Array Out of Bounds Access

The runtime does not perform bounds checking on array access. Accessing `arr[100]` of a size 3 array returns garbage values instead of terminating the program.

```bpl
frame main() {
  local arr: i32[3];
  local val: i32 = arr[100]; // Returns garbage, should crash or throw
}
```

### BUG-021: Silent Division by Zero

Division by zero at runtime causes the program to exit with code 1 (likely SIGFPE) but prints no error message to stderr.

```bpl
frame main() {
  local x: i32 = 1 / 0; // Silent crash
}
```

### BUG-022: Silent Stack Overflow

Infinite recursion causes the program to exit with code 1 (likely SIGSEGV) but prints no error message to stderr.

```bpl
frame recurse(n: i32) { recurse(n+1); }
frame main() { recurse(0); } // Silent crash
```

### BUG-023: Strict Struct Definition Syntax

The parser requires a trailing comma for the last field in a struct definition.

```bpl
struct Point { x: i32, y: i32 } // Syntax Error
struct Point { x: i32, y: i32, } // OK
```

### BUG-024: Generic Struct Literal Syntax

The parser does not support specifying type arguments in a struct literal.

```bpl
local b: Box<i32> = Box<i32> { value: 1 }; // Syntax Error
// Workaround: Use a helper function or rely on type inference if possible (not supported for literals yet)
```

### BUG-025: No Trailing Commas in Calls

Function calls do not support trailing commas, which makes multi-line arguments harder to maintain.

```bpl
foo(
  1,
  2, // Syntax Error
);
```

### BUG-026: Hidden Struct Overhead

Structs include a hidden `i1` field (null bit) which increases their size and affects alignment.

```bpl
struct Point { x: i32, y: i32, }
// sizeof<Point> is 12 (4 + 4 + 1 + padding), expected 8.
```

### BUG-027: Match Codegen Failure

Matching on enum variants with data causes an LLVM IR generation error (`expected instruction opcode`).

```bpl
match (msg) {
  Message.Move(x, y) => { ... }, // Causes codegen error
}
```

### BUG-028: Generic Enum Inference

The compiler fails to infer generic type arguments for enum constructors.

```bpl
local opt: Option<i32> = Option.Some(42); // Error: Type mismatch or undefined symbol
```

### BUG-029: Direct Function Pointer Call

Calling a function pointer stored in a struct field directly fails.

```bpl
struct S { cb: Func<void>(), }
local s: S;
s.cb(); // Fails
// Workaround:
local f = s.cb;
f(); // Works
```

### BUG-030: No Dynamic Dispatch

BPL does not support dynamic dispatch (virtual methods). Method calls are statically resolved based on the pointer type.

```bpl
frame make_speak(a: *Animal) { a.speak(); }
local d: Dog;
make_speak(&d); // Calls Animal.speak(), not Dog.speak()
```

### BUG-031: Struct Comparison Codegen Error

Comparison operators (like `!=`) on structs generate invalid LLVM IR because `icmp` requires integer operands, but the compiler tries to compare structs directly.

```bpl
struct Box { val: i32, frame __ne__(this: *Box, other: Box) ret bool { ... } }
if (b1 != b2) { ... } // Generates invalid LLVM IR
```

### BUG-032: Nested Enum Pattern Matching with Qualified Names

When pattern matching on nested enums with qualified names (e.g., `Option<Option<int>>`), the inner enum value is not extracted correctly from the outer variant's data.

```bpl
import * as std from "std";

frame test_nested() {
    local nested: std.Option<std.Option<int>> = std.Option<std.Option<int>>.Some(std.Option<int>.Some(40));

    match (nested) {
        std.Option<std.Option<int>>.Some(inner) => {
            // inner should be Option<int>.Some(40)
            match (inner) {
                std.Option<int>.Some(v) => printf("Value: %d\n", v),  // Should print 40
                std.Option<int>.None => printf("None\n"),              // Incorrectly matches this
            };
        },
        std.Option<std.Option<int>>.None => { printf("Outer None\n"); },
    };
}
```

**Expected:** Prints "Value: 40"
**Actual:** Prints "None" (inner value is not extracted correctly)

**Workaround:** Use non-qualified names (`Option` instead of `std.Option`) if the pattern is in the same module.

### BUG-033: Implicit Constructors for Arrays

When declaring an array of structs that have an implicit constructor (`new(this)`), the constructor is not called for the elements.

```bpl
struct Point {
    x: int,
    frame new(this: *Point) { this.x = 42; }
}

frame main() {
    local arr: Point[3];
    // arr[0].x is 0, expected 42
}
```

### BUG-034: Generic Type in `is` Operator

Using a generic type parameter directly in the `is` operator causes an LLVM IR generation error (`use of undefined value`).

```bpl
frame check<T>() {
    if (T is int) { ... } // Error: use of undefined value '%T_ptr'
}
```

**Workaround:** Declare a dummy variable of type `T` and check that instead: `local dummy: T; if (dummy is int) ...`.

### BUG-035: Lexer - Comment Tokens

The lexer emits `Comment` tokens for both single-line (`#`) and multi-line (`/# ... #/`) comments. This caused tests expecting only `EOF` to fail. This is likely intended behavior for tooling support (highlighting, formatting).

```typescript
// Input: "# comment\n/# block comment #/"
// Output: [Comment, Comment, EOF]
```

### BUG-036: Runtime - Shift Overflow Behavior

Shifting an integer by a value greater than or equal to its bit width (e.g., `1 << 65` for 64-bit int) results in undefined behavior (returns `2` in one test case), which might be platform-dependent or LLVM-dependent.

```bpl
local x: int = 1;
local res: int = x << 65; // Result: 2 (Unexpected)
```

### BUG-037: Runtime - Float to Int Cast Overflow

Casting a large float (e.g., `1e20`) to `int` results in `INT_MIN` (`-2147483648`) instead of clamping or erroring. This is standard LLVM `fptosi` behavior but might be unexpected for users.

```bpl
local f: float = 1e20;
local i: int = cast<int>(f); // Result: -2147483648
```

### BUG-038: Void Variable Declaration

The compiler accepts `local v: void;` but marks it as unused. Void variables should probably be disallowed entirely as they have no size or value.

```bpl
local v: void; // Accepted, but useless
```

### BUG-039: Multi-Character Literal Error

The lexer throws a generic "Unrecognized token" error for multi-character literals like `'ab'`, instead of a more specific error about invalid character literal length.

```typescript
tokenize("'ab'"); // Error: Unrecognized token ... 'ab'
```

### BUG-040: Switch Case Enum Variants

Switch statements do not accept enum variants as case values, requiring raw literals instead. This defeats the purpose of using enums in switches.

```bpl
enum Color { Red, Green }
switch (c) {
    case Color.Red: ... // Error: Switch case values must be literals
}
```

### BUG-041: Struct Alignment/Padding

Struct size calculation seems to add excessive padding or includes hidden fields.
`struct Aligned { a: u8, b: u64 }`
Expected size: 1 (u8) + 7 (padding) + 8 (u64) = 16 bytes.
Actual size: 24 bytes.
This suggests an extra 8 bytes of overhead (maybe a hidden pointer or incorrect alignment logic).

### BUG-042: Struct Member Shadowing

A struct can have a field and a method with the same name. This is confusing and can lead to ambiguity in usage.

```bpl
struct Shadow {
    x: int,
    frame x(this: *Shadow) { ... }
}
```

### BUG-043: Lambda Return Type Inference

Lambda expressions seem to require an explicit return type or fail to parse/infer correctly in some contexts.

```bpl
local l = |x: int| { return x + 1; }; // Syntax Error
// Workaround:
local l: Func<int>(int) = |x: int| { return x + 1; };
```

### BUG-044: Infinite Generic Recursion

Defining a recursive generic struct that expands the type parameter infinitely causes a "resolveType recursion limit" error. While catching it is good, the error message could be more specific about the cycle.

```bpl
struct Node<T> { next: *Node<Box<T>> } // Infinite expansion
```

### BUG-045: Pointer Subtraction Invalid LLVM IR

**Category**: Pointers
**Description**: Subtracting two pointers (e.g., `ptr2 - ptr1`) generates `sub i32* ...` in LLVM IR, which is invalid. LLVM requires `ptrtoint` before subtraction.
**Reproduction**:

```bpl
local arr: int[5];
local p1: *int = &arr[0];
local p2: *int = &arr[3];
local diff: int = p2 - p1; # Generates invalid LLVM
```

### BUG-048: Int Size Mismatch

**Category**: Types
**Description**: The documentation states that `int` is a signed 64-bit integer. However, the compiler treats `int` as a 32-bit integer (4 bytes). This causes confusion with pointer sizes and array sizes.
**Reproduction**:

```bpl
printf("Sizeof int: %d\n", sizeof(int)); # Prints 4, expected 8
```

### BUG-050: Cast Pointer to Int Dereferences

**Category**: Pointers
**Description**: Casting a pointer to an integer (`cast<int>(ptr)`) generates code that dereferences the pointer and loads the value, instead of casting the memory address to an integer.
**Reproduction**:

```bpl
local x: int = 123;
local ptr: *int = &x;
local addr: int = cast<int>(ptr); # addr becomes 123, not the address 0x...
```

### BUG-051: Cast Int to Pointer Creates Temporary

**Category**: Pointers
**Description**: Casting an integer to a pointer (`cast<*int>(addr)`) creates a new temporary variable on the stack, stores the integer value in it, and returns the address of that temporary. It does not cast the integer value to a pointer type.
**Reproduction**:

```bpl
local addr: int = 0x1234;
local ptr: *int = cast<*int>(addr); # ptr points to a new stack slot containing 0x1234
```

### BUG-052: Null Char in String Literal

**Category**: Strings
**Description**: Including a null character `\0` in a string literal causes the compiler to crash with a JSON Parse error. This suggests the compiler uses `JSON.parse` to parse string literals, which doesn't support `\0`.
**Reproduction**:

```bpl
local s: string = "Hello\0World";
```

### BUG-053: Hex Escapes in String Literal

**Category**: Strings
**Description**: Hexadecimal escape sequences (e.g., `\x41`) in string literals cause a JSON Parse error.
**Reproduction**:

```bpl
local s: string = "\x41";
```

### BUG-054: Struct Field Shadows Method

**Category**: Structs
**Description**: If a struct has a field and a method with the same name, the field takes precedence in the symbol table. This makes it impossible to call the method, as the compiler attempts to "call" the field (which is usually not callable).
**Reproduction**:

```bpl
struct S {
    process: int,
    frame process(this: S) { ... }
}
local s: S;
s.process(); # Error: Type 'int' is not callable
```

### BUG-055: Nested Pattern Matching Unsupported

**Category**: Enums
**Description**: The parser does not support nested patterns in `match` expressions. It expects a simple variable binding or literal inside the variant constructor.
**Reproduction**:

```bpl
match (nested_opt) {
    Option.Some(Option.Some(x)) => ... # Syntax Error
}
```

### BUG-056: Duplicate Enum Variants

**Category**: Enums
**Description**: The compiler allows defining an enum with duplicate variant names. This creates ambiguity when using the variant.
**Reproduction**:

```bpl
enum Status { Ok, Ok } # Compiles silently
```

### BUG-057: If Requires Braces

**Category**: Control Flow
**Description**: The parser enforces braces `{}` for `if` statements. It does not support single-statement bodies (e.g., `if (cond) stmt;`).
**Reproduction**:

```bpl
if (true) return; # Syntax Error
```

### BUG-058: Switch Case Requires Braces

**Category**: Control Flow
**Description**: The parser enforces braces `{}` for `switch` cases. It does not support single-statement cases.
**Reproduction**:

```bpl
switch (x) {
    case 1: return; # Syntax Error
}
```

### BUG-059: Void Argument Type

**Category**: Types
**Description**: The compiler allows defining function arguments with type `void`. This is semantically meaningless as `void` represents the absence of a value.
**Reproduction**:

```bpl
frame foo(v: void) { ... }
```

### BUG-060: Array of Void

**Category**: Types
**Description**: The compiler allows declaring arrays of `void`. Since `void` has no size (or undefined size), this should be disallowed.
**Reproduction**:

```bpl
local arr: void[10];
```

### BUG-061: Nested Comments Unsupported

**Category**: Lexer
**Description**: The grammar defines multi-line comments as `/# ( .* | '\n' )*? #/`. The non-greedy match `*?` causes the comment to end at the _first_ occurrence of `#/`, making nested comments impossible.
**Reproduction**:

```bpl
/#
  Outer comment
  /# Inner comment #/
  This text is now outside the comment and causes syntax error
#/
```

### BUG-062: Assignment Chaining Unsupported

**Category**: Operators
**Description**: Assignment is treated as a statement, not an expression. Therefore, chaining assignments like `a = b = 10` is not supported.
**Reproduction**:

```bpl
local a: int;
local b: int;
a = b = 10; # Syntax Error
```

### BUG-063: Implicit Bool to Int Promotion in Comparisons

**Category**: Operators
**Description**: Boolean values are implicitly promoted to integers (1 for true, 0 for false) when used in comparisons. This allows expressions like `3 > 2 > 1` to compile and evaluate to `false` (since `true > 1` -> `1 > 1` -> `false`), which is often unintended behavior.
**Reproduction**:

```bpl
if (3 > 2 > 1) { ... } # Compiles, but semantically questionable
```

### BUG-064: Functions are Fat Pointers

**Category**: FFI
**Description**: BPL functions are implemented as fat pointers (closures) containing a function pointer and an environment pointer (size 16 bytes). This makes them incompatible with C functions that expect raw function pointers (size 8 bytes), and the compiler forbids casting them to `*void`.
**Reproduction**:

```bpl
extern qsort(...); # Expects raw function pointer
frame compare(a: *void, b: *void) ret int { ... }
qsort(..., compare); # Fails or passes wrong data
local ptr: *void = cast<*void>(compare); # CastError
```

### BUG-065: No Generic Constructor Inference

**Category**: Generics
**Description**: The compiler does not infer generic type arguments for constructors or static methods based on arguments. You must explicitly specify the type parameters.
**Reproduction**:

```bpl
struct Box<T> { frame new(v: T) ... }
local b = Box.new(10); # Error: expected T, got int
local b = Box<int>.new(10); # Works
```

### BUG-066: Empty Tuple Syntax Unsupported

**Category**: Parser
**Description**: The parser does not support empty tuples `()` in type declarations or expressions.
**Reproduction**:

```bpl
local t: () = (); # Syntax error
```

### BUG-067: No Tuple Field Access

**Category**: Parser
**Description**: The parser does not allow accessing tuple elements using dot notation with numbers (e.g., `tuple.0`).
**Reproduction**:

```bpl
local t: (int, int) = (1, 2);
local x: int = t.0; # Syntax error
```

### BUG-068: Arrays Lack Length Property

**Category**: Type System
**Description**: Array types (fixed `T[N]` and dynamic `T[]`) do not expose a `.len` or `.length` property, making it impossible to query their size at runtime (for dynamic) or compile time (for fixed) via the type.
**Reproduction**:

```bpl
local a: int[3] = [1, 2, 3];
local l: int = a.len; # Error: Cannot access member 'len'
```

### BUG-069: No Implicit Array to Slice Conversion

**Category**: Type System
**Description**: Fixed-size arrays cannot be assigned to dynamic array (slice) types.
**Reproduction**:

```bpl
local a: int[] = [1, 2, 3]; # Error: cannot assign int[3] to int[]
```

### BUG-070: No Default Arguments

**Category**: Parser
**Description**: The parser does not support default values for function parameters.
**Reproduction**:

```bpl
frame foo(a: int = 10) { } # Syntax error
```

### BUG-071: No Variadic Function Definitions

**Category**: Parser
**Description**: While `extern` declarations support variadic arguments (`...`), BPL function definitions (`frame`) do not support defining variadic functions.
**Reproduction**:

```bpl
frame log(fmt: string, ...) { } # Syntax error
```

### BUG-072: Compiler Crash on Recursive Type Alias

**Category**: Compiler Crash
**Description**: The compiler crashes with a stack overflow (RangeError) when processing a recursive type alias.
**Reproduction**:

```bpl
type Node = (int, *Node);
```

### BUG-073: Invalid LLVM IR for Struct Slicing

**Category**: Code Generation
**Description**: When assigning a child struct to a parent struct variable (slicing), the compiler generates invalid LLVM IR. It incorrectly uses `i32` type for pointer fields (like the vtable pointer) in `insertvalue` instructions, causing LLVM compilation to fail.
**Reproduction**:

```bpl
struct Animal { name: string }
struct Dog : Animal { breed: string }
frame main() {
    local d: Dog;
    local a: Animal = d; # Causes LLVM error
}
```

### BUG-074: Compiler Allows String Switch but Generates Invalid LLVM

**Category**: Code Generation
**Description**: The compiler fails to reject `switch` statements on string types during semantic analysis. It then generates invalid LLVM IR (attempting to switch on a pointer type), causing the LLVM backend to fail.
**Reproduction**:

```bpl
switch ("a") {
    case "a": {}
}
```

### BUG-075: No Explicit Enum Values

**Category**: Parser
**Description**: The parser does not support assigning explicit integer values to enum variants, which is necessary for C interoperability.
**Reproduction**:

```bpl
enum Status {
    Ok = 0, # Syntax error
    Error = 1
}
```

### BUG-076: Inline Export Not Supported

**Category**: Parser
**Description**: The compiler does not support inline `export` declarations (e.g., `export frame foo...` or `export struct S...`). You must declare the symbol first and then export it separately using `export symbol;` or `export [Type];`.
**Reproduction**:

```bpl
# lib.bpl
export frame foo() {} # Syntax error
```

### BUG-077: Namespace Import Fails Linking

**Category**: Code Generation
**Description**: Using `import * as Namespace` allows resolving symbols during compilation, but fails to generate the necessary LLVM declarations or link the module, causing "use of undefined value" errors during LLVM compilation.
**Reproduction**:

```bpl
# lib.bpl
frame foo() {}
export foo;

# main.bpl
import * as Lib from "./lib.bpl";
frame main() { Lib.foo(); }
```

### BUG-078: Lambda Return Type Inference Failure in Arguments

**Category**: Type Inference
**Description**: The compiler fails to infer the return type of a lambda when it is passed directly as a function argument, causing overload resolution to fail. Explicitly specifying the return type (`ret Type`) fixes it.
**Reproduction**:

```bpl
frame apply(f: Func<int>(int)) { }
apply(|x: int| { return x; }); # Error: No matching function
apply(|x: int| ret int { return x; }); # Works
```

### BUG-079: Compiler Generates Invalid LLVM for Void Pointer Dereference

**Category**: Code Generation
**Description**: The compiler allows dereferencing a `*void` pointer, generating an invalid `load void` instruction in LLVM IR, which causes compilation to fail.
**Reproduction**:

```bpl
local p: *void = nullptr;
*p; # Causes LLVM error
```

### BUG-080: Invalid LLVM for Destructor with Value Receiver

**Category**: Code Generation
**Description**: If a `destroy` method is defined with a value receiver (`this: D`) instead of a pointer receiver (`this: *D`), the compiler generates invalid LLVM IR (attempting to bitcast a struct value to a pointer type for metadata/vtable), causing LLVM compilation to fail.
**Reproduction**:

```bpl
struct D {
    frame destroy(this: D) { } # Should be *D
}
```
