# BPL Compiler Bug Report

This file tracks bugs and edge cases found during comprehensive testing.

## Summary

| ID      | Category            | Description                                                                                                                | Status   | Notes                                                                                                                                                                                                                                                                                    |
| ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-001 | Primitive Types     | Integer literal overflow is not detected (e.g., `i8 = 128`).                                                               | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-002 | Arithmetic          | Division by zero in constant expressions is not detected (e.g., `1 / 0`).                                                  | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-003 | Structs             | Recursive structs without pointers are accepted (infinite size).                                                           | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-004 | Functions           | Duplicate parameter names are accepted in function declarations.                                                           | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-005 | Arrays              | Zero-sized arrays are accepted (`Type[0]`).                                                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-006 | Arrays              | Negative array sizes cause parser error instead of semantic error.                                                         | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-007 | Control Flow        | Duplicate cases in switch statements are accepted.                                                                         | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-008 | Scoping             | Variable shadowing in the same scope is accepted.                                                                          | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-009 | Control Flow        | Unreachable code after return is accepted.                                                                                 | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-010 | Analysis            | Unused variables are accepted without warning or error.                                                                    | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-011 | Type System         | Invalid type casts (e.g., `i32` to `string`) are accepted.                                                                 | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-012 | Structs             | Struct literals with missing fields are accepted (uninitialized memory).                                                   | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-013 | Control Flow        | Switch statements accept floating point values.                                                                            | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-014 | Analysis            | `sizeof<void>` is accepted.                                                                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-015 | Arithmetic          | Modulo operator `%` is accepted for floating point types.                                                                  | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-016 | Arrays              | Array indexing with floating point values is accepted.                                                                     | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-017 | Operators           | Unary negation `-` is accepted for strings.                                                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-018 | Operators           | String subtraction `"a" - "b"` is accepted.                                                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-019 | Assignment          | Assignment to r-values (literals, expressions) is accepted.                                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-020 | Runtime             | Array out of bounds access returns garbage instead of crashing or erroring.                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-021 | Runtime             | Division by zero causes silent crash (exit code 1) without error message.                                                  | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-022 | Runtime             | Stack overflow causes silent crash (exit code 1) without error message.                                                    | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-023 | Syntax              | Struct definitions require a trailing comma for the last field.                                                            | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-024 | Syntax              | Generic struct literals `Box<i32> { ... }` are not supported.                                                              | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-025 | Syntax              | Trailing commas in function calls `foo(1, 2,)` are not supported.                                                          | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-026 | Runtime             | Structs have hidden overhead (null bit) increasing `sizeof` unexpectedly.                                                  | Ignored  | This is not the case anymore, its fixed now                                                                                                                                                                                                                                              |
| BUG-027 | Codegen             | Match statements with data variants cause LLVM IR generation failure.                                                      | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-028 | Analysis            | Generic Enum type inference fails for constructors (e.g., `Option.Some(42)`).                                              | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-029 | Parser              | Calling a function pointer field directly `obj.ptr()` fails.                                                               | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-030 | No Dynamic Dispatch | BPL does not support dynamic dispatch (virtual methods). Method calls are statically resolved based on the pointer type.   | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-031 | Codegen             | Comparison operators `!=` on structs generate invalid LLVM IR (`icmp` requires integer operands).                          | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-032 | Pattern Matching    | Nested enum pattern matching with qualified names doesn't extract variant data correctly                                   | Fixed    | Fixed by adding generic type substitution in enum variant tuple construction and namespace-aware type lookup in resolveType.                                                                                                                                                             |
| BUG-033 | Initialization      | Implicit constructors are not called for array elements.                                                                   | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-034 | Generics            | Using generic type parameter directly in `is` operator causes LLVM error.                                                  | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-035 | Lexer               | Lexer emits `Comment` tokens instead of skipping them (Design choice, not a bug).                                          | Closed   | They are parsed but ignored later, used for formatting and docs primarly                                                                                                                                                                                                                 |
| BUG-036 | Runtime             | Integer shift overflow (e.g., `1 << 65`) results in undefined behavior.                                                    | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-037 | Runtime             | Float to Int cast overflow (e.g., `1e20` to `int`) results in INT_MIN instead of error or clamp.                           | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-038 | Semantics           | `void` variable declaration is accepted but unused.                                                                        | Fixed    | make it type checker error where no variable or argument can be "void" but allow "\*void" for pointers                                                                                                                                                                                   |
| BUG-039 | Lexer               | Multi-character literals (e.g., `'ab'`) cause "Unrecognized token" error instead of specific error.                        | Fixed    | single ' should allow only one character or sequence of characters that resolves to single character like \u00000010 in JS or whatever, but should throw that char can hold only one character                                                                                           |
| BUG-040 | Semantics           | Switch case values must be literals, preventing use of Enum variants (e.g., `case Color.Red`).                             | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-041 | Runtime             | Struct alignment/padding seems excessive or incorrect. `u8` + `u64` results in size 24 (expected 16).                      | Fixed    | there is vtable pointer too so probably that makes extra space in structs with methods, maybe add vtable only on structs that are inherited,or keep them on every struct with method since some other struct can inherit from it and the we may get incorrect behavior for parent struct |
| BUG-042 | Semantics           | Struct field and method can share the same name, potentially causing ambiguity or shadowing issues.                        | Fixed    | should be disallowed                                                                                                                                                                                                                                                                     |
| BUG-043 | Formatter           | Formatter crashes or produces invalid output when processing ASTs with syntax errors.                                      | Fixed    | Formatter now checks for `ast.errors` and throws a `CompilerError` before attempting to format.                                                                                                                                                                                          |
| BUG-043 | Syntax              | Lambda expressions require explicit return type annotation (e.g., \|x: int\| ret int { ... }`) or fail to parse.           | Fixed    | Fixed by hiding matchContext during lambda body check, allowing return statements to be checked against lambda return type.                                                                                                                                                              |
| BUG-044 | Generics            | Infinite generic recursion (e.g., `struct Node<T> { next: *Node<Box<T>> }`) hits recursion limit instead of clean error.   | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-045 | Pointers            | Pointer subtraction generates invalid LLVM IR (`sub i32* ...`).                                                            | Fixed    | Implemented pointer subtraction using ptrtoint to convert pointers to i64, subtract, then divide by element size using getelementptr null trick in BinaryExpressionGenerator.                                                                                                            |
| BUG-046 | Arrays              | Multidimensional array syntax `T[N][M]` is accepted but size is incorrect (likely flattened or ignored).                   | Invalid  | Allow instantiation of multidimensional arrays without limit on number of dimensions                                                                                                                                                                                                     |
| BUG-047 | Arrays              | `sizeof` reports incorrect size for multidimensional arrays (related to BUG-046).                                          | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-048 | Types               | `int` is 32-bit (4 bytes), contradicting documentation which states 64-bit.                                                | Fixed    | Updated AGENTS.MD to reflect that int is 32-bit.                                                                                                                                                                                                                                         |
| BUG-049 | Pointers            | `cast<int>(ptr)` truncates pointers on 64-bit systems because `int` is 32-bit.                                             | Fixed    | pointers should be casted to long                                                                                                                                                                                                                                                        |
| BUG-050 | Pointers            | `cast<int>(ptr)` dereferences the pointer instead of casting the address.                                                  | Fixed    | this tries to dereference pointer and cast it's value instead of raw pointer addrress, should we leave it like that?                                                                                                                                                                     |
| BUG-051 | Pointers            | `cast<*T>(int)` creates a new temporary variable and returns its address, instead of casting the integer to a pointer.     | Fixed    | UnaryExpressionGenerator.ts now uses `inttoptr` instruction for integer-to-pointer casts.                                                                                                                                                                                                |
| BUG-052 | Strings             | String literals containing `\0` cause a JSON Parse error in the compiler.                                                  | Fixed    | Replaced JSON.parse with custom decodeString function that properly handles \0 and other escape sequences.                                                                                                                                                                               |
| BUG-053 | Strings             | Hex escape sequences (e.g., `\x41`) in string literals cause a JSON Parse error.                                           | Fixed    | Added hex escape parsing (\xHH format) to decodeString function in grammar.                                                                                                                                                                                                              |
| BUG-054 | Structs             | Struct fields shadow methods with the same name, making methods uncallable.                                                | Fixed    | forbid duplicate keys no matter if its attribute or method                                                                                                                                                                                                                               |
| BUG-055 | Enums               | Nested pattern matching (e.g., `Option.Some(Option.Some(x))`) is not supported by the parser.                              | Fixed    | Grammar now supports nested patterns. Code generation needs work but parsing/type-checking complete.                                                                                                                                                                                     |
| BUG-056 | Enums               | Duplicate enum variants (e.g., `enum E { A, A }`) are accepted silently, creating ambiguity.                               | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-057 | Control Flow        | `if` statements require braces `{}`. Single-statement bodies are not supported.                                            | Fixed    | require braces for "if" and "loop"                                                                                                                                                                                                                                                       |
| BUG-058 | Control Flow        | `switch` cases require braces `{}`. Single-statement cases are not supported.                                              | Fixed    | Formatter now respects optional braces (brace-less single statements). Parser supports them.                                                                                                                                                                                             |
| BUG-059 | Types               | Compiler allows `void` as a named function argument type (e.g., `frame foo(v: void)`).                                     | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-060 | Types               | Compiler allows arrays of `void` (e.g., `local arr: void[10]`), which is invalid as `void` has no size.                    | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-061 | Lexer               | Nested multi-line comments (`/# ... /# ... #/ ... #/`) are not supported. The first `#/` closes the comment.               | Fixed    | The grammar now uses a recursive rule for `MultiLineComment` which correctly handles nesting.                                                                                                                                                                                            |
| BUG-062 | Operators           | Assignment chaining (e.g., `a = b = c`) is not supported. Assignment is a statement, not an expression.                    | Ignored  | By design - assignment is a statement, not an expression in BPL.                                                                                                                                                                                                                         |
| BUG-063 | Operators           | Boolean values are implicitly promoted to integers in comparisons, allowing confusing expressions like `3 > 2 > 1`.        | Closed   | Works as designed - bool promotion is intentional. This is a logical error, not a compiler bug. Linter may add warning in the future.                                                                                                                                                    |
| BUG-064 | FFI                 | Functions are represented as fat pointers (16 bytes) and cannot be cast to `*void`, breaking FFI compatibility with C.     | Fixed    | Func<T> is now a raw function pointer (thin), and Lambda<T> is a closure (fat). Func is C-compatible.                                                                                                                                                                                    |
| BUG-065 | Generics            | Generic type inference for constructors is not supported (e.g., `Box.new(10)` fails). Must use `Box<int>.new(10)`.         | Closed   | By design for v0.1: generic constructor/static method calls require explicit type arguments. Confirmed `Box.new(10)` fails with `expected T, got int`; `Box<int>.new(10)` compiles and runs.                                                                                            |
| BUG-066 | Parser              | The parser does not support empty tuples `()` in type declarations or expressions.                                         | Ignored  | By design - empty tuples are not supported in BPL.                                                                                                                                                                                                                                       |
| BUG-067 | Parser              | The parser does not allow accessing tuple elements using dot notation with numbers (e.g., `tuple.0`).                      | Fixed    | Added grammar support for numeric member access (.0, .1, etc.) and implemented tuple element extraction using extractvalue in ExpressionGenerator and AddressExpressionGenerator.                                                                                                        |
| BUG-068 | Type System         | Array types (fixed `T[N]` and dynamic `T[]`) do not expose a `.len` or `.length` property.                                 | Closed   | no since this is raw memory, use Array<T> if you need size                                                                                                                                                                                                                               |
| BUG-069 | Type System         | Fixed-size arrays cannot be assigned to dynamic array (slice) types.                                                       | Fixed    | Fixed-size arrays and array literals now lower to `{ ptr, len }` slice views for `T[]` assignments and parameters.                                                                                                                                                                        |
| BUG-070 | Parser              | The parser does not support default values for function parameters.                                                        | Ignored  | this is in roadmap and not yet supported, leave it like that, we'll implement that later                                                                                                                                                                                                 |
| BUG-071 | Parser              | BPL function definitions (`frame`) do not support defining variadic functions.                                             | Fixed    | it does,sytnax is frame name (args:...type, count: int){}, this is minimal syntax, it support fixed args before variadic args, and count is implicit and passed by compiler                                                                                                              |
| BUG-072 | Compiler Crash      | The compiler crashes with a stack overflow (RangeError) when processing a recursive type alias.                            | Fixed    | Added typeAliasResolutionStack to TypeCheckerBase.ts to detect cycles in type alias resolution before infinite recursion occurs.                                                                                                                                                         |
| BUG-073 | Code Generation     | Assigning a child struct to a parent struct variable (slicing) generates invalid LLVM IR.                                  | Fixed    | Implemented struct slicing in emitCast() that extracts parent fields and replaces vtable with parent's vtable.                                                                                                                                                                           |
| BUG-074 | Code Generation     | Switch statements on string types generate invalid LLVM IR.                                                                | Fixed    | Implemented string switch as if-else chain with strcmp calls in StatementGenerator, added strcmp declaration to CodeGenerator standard library functions.                                                                                                                                |
| BUG-075 | Parser              | The parser does not support assigning explicit integer values to enum variants.                                            | Ignored  | Feature deferred - may be added in future version.                                                                                                                                                                                                                                       |
| BUG-076 | Parser              | The compiler does not support inline `export` declarations.                                                                | Closed   | nope, you have to declare something and then export                                                                                                                                                                                                                                      |
| BUG-077 | Code Generation     | Namespace import (`import * as`) fails to generate LLVM declarations, causing link errors.                                 | Fixed    | Added module-function detection/mangling and emits extern/module declarations when called via namespace imports.                                                                                                                                                                         |
| BUG-078 | Type Inference      | Lambda return type inference fails when passed as function argument.                                                       | Fixed    | it should be explicit, keep it like that                                                                                                                                                                                                                                                 |
| BUG-079 | Code Generation     | Dereferencing a `*void` pointer generates invalid `load void` instruction.                                                 | Fixed    | Compiler now properly validates and rejects void variables, preventing dereference of void pointers into void variables. Error: "Variable cannot be of type 'void'"                                                                                                                      |
| BUG-080 | Code Generation     | Destructor with value receiver (`this: D`) generates invalid LLVM IR.                                                      | Fixed    | Added validation in TypeChecker to reject value receivers for destroy methods, requiring pointer receivers (\*D).                                                                                                                                                                        |
| BUG-081 | Equality            | Array equality uses invalid LLVM IR (`icmp eq`) instead of `memcmp`.                                                       | Fixed    | Implemented array comparison using memcmp for byte-wise comparison in BinaryExpressionGenerator.                                                                                                                                                                                         |
| BUG-082 | Equality            | Tuple equality uses invalid LLVM IR (`icmp eq`) instead of member-wise comparison.                                         | Fixed    | Implemented member-wise tuple comparison with short-circuit evaluation using extractvalue in BinaryExpressionGenerator.                                                                                                                                                                  |
| BUG-083 | Strings             | String concatenation (`+`) generates invalid LLVM IR (`add i8*`) instead of runtime call.                                  | Deferred | Deferred due to memory leak concerns. String concatenation requires runtime allocation and deallocation which needs proper lifetime management. Will be revisited when memory management improvements are implemented.                                                                   |
| BUG-084 | Primitive Types     | `uint` and `int` are 32-bit (4 bytes) instead of 64-bit as documented.                                                     | Fixed    | Fix documentation to match int-4byte, long 8bytes                                                                                                                                                                                                                                        |
| BUG-085 | Parser              | `sizeof(int[10])` fails parsing (interpreted as indexing expression).                                                      | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-086 | Type Aliases        | Type alias substitution ignores precedence (e.g., `*Arr` where `Arr=int[10]` becomes array of pointers).                   | Fixed    | Pointer-to-array indexing now loads the pointee array and uses correct GEP, preserving alias precedence for `*Arr` -> pointer-to-array.                                                                                                                                                  |
| BUG-087 | Equality            | Function pointer equality uses invalid LLVM IR (`icmp eq` on closure struct).                                              | Fixed    | Already works correctly - generates valid `icmp eq` instruction for direct pointer comparison.                                                                                                                                                                                           |
| BUG-088 | Methods             | Bound methods (e.g., `obj.method`) are not supported (parser error).                                                       | Fixed    | in obj.method() this should work, in `frame obj.method()` this should not work since we have struct methods                                                                                                                                                                              |
| BUG-089 | Structs             | Recursive structs (infinite size) cause LLVM IR generation errors instead of semantic error.                               | Fixed    | Added detectStructCycle() method to TypeChecker.ts to detect cyclic struct field references before LLVM generation.                                                                                                                                                                      |
| BUG-090 | Enums               | Recursive enums cause stack buffer overflow in generated code (incorrect size calculation).                                | Fixed    | Added detectEnumCycle() method to TypeChecker.ts to detect cyclic enum variant references before LLVM generation.                                                                                                                                                                        |
| BUG-091 | Enums               | Enum constructor corrupts fields for small types (writes `i32` for `u8`, overwriting adjacent fields).                     | Fixed    | Added type truncation when storing enum tuple variant arguments to handle small integer types (u8, i8, u16, i16).                                                                                                                                                                        |
| BUG-092 | Enums               | Enum constructor overflows buffer for struct fields (incorrect size calculation).                                          | Fixed    | Added type checking and truncation in struct literal field assignments to handle small integer types.                                                                                                                                                                                    |
| BUG-093 | Primitive Types     | Method calls on aliased primitive types (e.g., `type MyInt = int; local x: MyInt; x.toString()`) failed to resolve.        | Fixed    | Fixed by allowing wrapping of aliased primitives in CallChecker.                                                                                                                                                                                                                         |
| BUG-094 | Runtime             | Runtime type matching for `Any` type failed due to incorrect struct layout assumption in codegen.                          | Fixed    | Fixed by updating ExpressionGenerator to access `type_id` at index 0.                                                                                                                                                                                                                    |
| BUG-095 | Tests               | `sizeof` tests expected incorrect padding (16 bytes for 2 ints instead of 8).                                              | Fixed    | Updated test expectations to match correct packed size.                                                                                                                                                                                                                                  |
| BUG-096 | Examples            | `htons` function in HTTP server example used invalid shift operands (i32 instead of u16).                                  | Fixed    | Added explicit casts to shift operands.                                                                                                                                                                                                                                                  |
| BUG-093 | Structs             | Struct fields of type `void` cause LLVM IR generation errors.                                                              | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-094 | Generics            | Generic instantiation with `void` (e.g., `Box<void>`) causes LLVM IR generation errors.                                    | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-095 | Generics            | Generic array of `void` (e.g., `Arr<void>`) causes LLVM IR generation errors.                                              | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-096 | Parser              | Parentheses in type declarations (e.g., `(*int)[10]`) are not supported.                                                   | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-097 | Arrays              | Array of function types (e.g., `F[10]`) allocates single element instead of array.                                         | Fixed    | Fixed by propagating array dimensions in TypeCheckerBase.resolveType for non-BasicType aliases.                                                                                                                                                                                          |
| BUG-098 | Parser              | Array of tuples (e.g., `(int, int)[10]`) is a syntax error.                                                                | Fixed    |                                                                                                                                                                                                                                                                                          |
| BUG-099 | Generics            | Generic function type aliases fail substitution (generates invalid LLVM IR with `%struct.T`).                              | Fixed    | Fixed by correctly substituting generic parameters in function type aliases in TypeCheckerBase.                                                                                                                                                                                          |
| BUG-100 | Generics            | Generic struct type aliases fail argument count check (e.g., `B<int>` where `B<T>=Box<T>` claims 2 args).                  | Fixed    | Fixed by correctly populating typeAliasMap in CodeGenerator.                                                                                                                                                                                                                             |
| BUG-101 | Tuples              | Nested tuple destructuring generated invalid LLVM IR (used outer tuple type instead of inner).                             | Fixed    | Fixed by using correct nestedTupleType/nestedTupleVal parameters in extractvalue instruction in StatementGenerator.                                                                                                                                                                      |
| BUG-102 | Enums               | Qualified name resolution in type lookups fails for nested generic enums with namespaces.                                  | Fixed    | Fixed by adding namespace-aware fallback in TypeGenerator.resolveType() to strip namespace prefix when direct lookup fails.                                                                                                                                                              |
| BUG-103 | Enums               | Enum-to-enum casting only copies discriminant tag, losing data payload.                                                    | Fixed    | Fixed by enhancing emitCast() in UnaryExpressionGenerator to copy both tag and data fields using extractvalue/insertvalue for same-size data, memcpy for different sizes.                                                                                                                |
| BUG-104 | Pattern Matching    | Nested tuple patterns in match expressions are not supported (e.g., `((a, b), c) => ...`).                                 | Fixed    | Fixed by adding recursive handling for nested PatternTuple in MatchExpressionGenerator.ts.                                                                                                                                                                                               |
| BUG-105 | Generics            | Infinite recursion in generic function calls (monomorphization) causes compiler hang/crash (timeout).                      | Fixed    | Added generation batch limit (50) in CodeGenerator to detect and error on infinite recursion.                                                                                                                                                                                            |
| BUG-106 | Safety              | Escape analysis is missing; functions can return pointers to local stack variables (use-after-free).                       | Fixed    | Added check in StatementChecker to error when returning the address of a local variable or parameter.                                                                                                                                                                                    |
| BUG-107 | Code Generation     | Code generator fails to emit function definitions (e.g. `main`) when using `extern` or `try-catch`, causing linker errors. | Fixed    | Fixed by clearing `definedFunctions` set in `CodeGenerator.ts` to prevent stated leakage between compilations.                                                                                                                                                                           |
| BUG-108 | Parser/Analysis     | Duplicate fields in `struct` definitions cause an internal compiler crash.                                                 | Fixed    | TypeChecker.ts now explicitly checks for duplicate fields/methods and throws a proper CompilerError.                                                                                                                                                                                     |
| BUG-109 | Safety              | `const` variables can be modified by taking their address (`local ptr: *int = &const_var`).                                | Fixed    | ExpressionChecker.ts now throws a CompilerError when attempting to take the address of a constant variable.                                                                                                                                                                              |
| BUG-110 | Codegen             | String concatenation (`"a" + "b"`) generates invalid LLVM IR (`add i8* ...` or `add %String ...`).                         | Fixed    | The backend generates integer/float instructions for non-numeric types when operator overloads are missing or not resolved.                                                                                                                                                              |
| BUG-111 | Inline Asm          | Variable names with underscores (e.g., `asm_res`) fail in inline assembly blocks.                                          | Fixed    | Fixed regex in `AsmGenerator.ts` to support variable names containing underscores by using non-greedy match `(.+?)` instead of `([^_]+)`.                                                                                                                                                |
| BUG-112 | Codegen             | Nested tuple pattern matching doesn't bind variables in nested patterns.                                                   | Fixed    | Fixed MatchExpressionGenerator.ts to recursively handle PatternTuple for nested tuple patterns.                                                                                                                                                                                          |
| BUG-113 | Standard Library    | arg_parser ParsedArgs.destroy() crashes when freeing FlagEntry strings.                                                    | Fixed    | Root cause was BUG-114 (nullptr comparison bug). Removed unnecessary null checks from destroy code.                                                                                                                                                                                      |
| BUG-114 | Codegen             | Comparing pointer to vtable-struct with nullptr crashes at runtime.                                                        | Fixed    | Pointer comparisons now always do pointer identity, not operator overloads. Use dereference for value equality: `*a == *b`.                                                                                                                                                              |
| BUG-115 | Inheritance         | Self-inheriting struct (`struct A : A`) causes compiler stack overflow instead of semantic error.                          | Fixed    | TypeChecker now detects self-inheritance early before type resolution and throws a proper error.                                                                                                                                                                                         |
| BUG-116 | Inheritance         | Circular inheritance (`struct A : B`, `struct B : A`) causes compiler stack overflow instead of semantic error.            | Fixed    | TypeChecker now detects circular inheritance chains before type resolution and throws a proper error with cycle path.                                                                                                                                                                    |
| BUG-117 | Generics            | Duplicate generic type parameters (e.g., `struct T<T, T>`) are silently accepted.                                          | Fixed    | TypeChecker now validates that all generic type parameter names are unique for functions, structs, and enums.                                                                                                                                                                            |
| BUG-118 | Strings             | Unicode characters in string literals cause LLVM IR generation error (string length mismatch).                             | Fixed    | escapeString and getUtf8ByteLength now correctly handle multi-byte UTF-8 characters using TextEncoder.                                                                                                                                                                                   |
| BUG-119 | Type System         | `is` operator returns false for `*Derived` when checked against base type through `*Base` pointer.                         | Fixed    | Runtime vtable comparison now used for `is` operator on struct pointers and values. Structs in inheritance hierarchies get vtables.                                                                                                                                                      |
| BUG-120 | Type System         | `as` operator returns non-null for invalid downcasts (e.g., `*Animal as *Cat` when object is Dog).                         | Fixed    | Runtime vtable comparison now used for `as` operator. Returns nullptr if vtable doesn't match target type.                                                                                                                                                                               |
| BUG-121 | Codegen             | `sizeof<float>()` and `sizeof<f64>()` cause LLVM IR generation error (getelementptr on unsized type).                      | Fixed    | TypeGenerator.resolveType now correctly maps `float`, `f32`, `f64`, `double` to proper LLVM types (`float` or `double`).                                                                                                                                                                 |
| BUG-122 | Enums               | Empty enum (`enum E {}`) is accepted but has no valid values or constructors.                                              | Fixed    | TypeChecker now validates that enums have at least one variant and throws a proper error for empty enums.                                                                                                                                                                                |
| BUG-123 | Specs               | Spec extending itself (`spec S : S`) is silently accepted.                                                                 | Fixed    | TypeChecker now detects self-extension in specs and throws a proper error.                                                                                                                                                                                                               |
| BUG-124 | Parser              | Unary plus operator (`+5`) causes syntax error instead of being accepted or giving clear error message.                    | Fixed    | Grammar now parses unary plus, and TypeChecker throws a clear error explaining it's a no-op and should be removed.                                                                                                                                                                       |
| BUG-125 | Type System         | Undefined types in variable declarations/struct fields are not caught at type-check time, causing LLVM errors.             | Fixed    | Added undefined type detection in StatementChecker.checkVariableDecl() to catch undefined types at declaration time.                                                                                                                                                                     |
| BUG-126 | Type System         | Type aliases can shadow builtin types (`type int = string;`), causing confusing behavior.                                  | Fixed    | Added BUILTIN_TYPE_NAMES check in TypeChecker.checkTypeAlias() to prevent shadowing primitives.                                                                                                                                                                                          |
| BUG-127 | Pointers            | Pointer arithmetic on `*void` is accepted, but void has no size so offset calculation is undefined.                        | Fixed    | Added void pointer check in ExpressionChecker.checkBinaryExpression() before pointer arithmetic.                                                                                                                                                                                         |
| BUG-128 | Linker              | Missing `main` function only detected at link time, not during type-checking.                                              | Fixed    | Added checkEntryPoint() method in TypeChecker that validates main function existence and signature.                                                                                                                                                                                      |
| BUG-129 | Specs               | Duplicate method signatures in specs (`spec S { frame f(); frame f(); }`) are silently accepted.                           | Fixed    | Added duplicate method signature detection with Set-based tracking in TypeChecker.checkSpecBody().                                                                                                                                                                                       |
| BUG-130 | Analysis            | Variables used in string interpolation (`${var}`) are reported as "unused".                                                | Fixed    | Was already fixed - checkInterpolatedString calls checkExpression on each part which calls resolve() marking variables as used.                                                                                                                                                          |
| BUG-131 | Generics            | Generic enum types (Option<T>, Result<T,E>) cause LLVM error "Cannot allocate unsized type".                               | Fixed    | Was already fixed - generic enum types work correctly now.                                                                                                                                                                                                                               |
| BUG-132 | Control Flow        | Match expression exhaustiveness not recognized for return paths - requires explicit return after match.                    | Fixed    | Added ExpressionStmt case in checkAllPathsReturn() to detect Match expressions where all arms have return statements.                                                                                                                                                                    |
| BUG-133 | Inline Assembly     | Variables used in inline assembly blocks are reported as unused by the linter.                                             | Fixed    | `StatementChecker.checkAsm()` now recognizes constrained input/output operands like `(a: "r")` and `(=out: "={eax}")`, and reports undefined constrained operands. Regression: `tests/BugFixes_Batch5.test.ts`.                                                                          |
| BUG-134 | Inline Assembly     | LLVM IR inline assembly generates incorrect type references for pointer parameters.                                        | Fixed    | Raw LLVM `(ptr_param)` now resolves pointer locals to the pointer value; `(&ptr_param)` remains available when raw LLVM needs the variable's stack slot. Regression: `tests/V01BugRepros.test.ts`.                                                                                       |
| BUG-135 | IO Library          | `IO.printInt`, `IO.printFloat`, and `IO.printBool` add implicit newlines unlike typical print functions.                   | Fixed    | Primitive `IO.print*` helpers now print without implicit newlines; explicit `IO.printIntLn`, `IO.printFloatLn`, and `IO.printBoolLn` helpers provide line output. Regression: `tests/V01BugRepros.test.ts`.                                                                              |
| BUG-136 | Codegen             | Method calls on array-element-derived pointers can crash when vtables are not initialized.                                | Fixed    | Vtables are initialized for stack arrays, `init` methods use direct dispatch on uninitialized memory, and `init` bodies inject vtable initialization. Regression coverage remains in integration examples.                                                                                |
| BUG-137 | Runtime/Vtable      | `mini_database_engine` crashes during INSERT/SELECT due to uninitialized vtables in heap-allocated struct arrays/clones.  | Fixed    | Example now uses direct `.init()` calls on heap-array elements and clone destinations before virtual method use. Regression: `examples/mini_database_engine`.                                                                                                                            |
| BUG-138 | TypeChecker         | Invalid constant shift counts compile to target-dependent or undefined LLVM behavior.                                     | Fixed    | Type checking now rejects negative constant shift counts and constant counts greater than or equal to the shifted integer width. Regression: `tests/V01BugRepros.test.ts`.                                                                                                                |
| BUG-139 | Codegen/Optimization | Trivial wrapper functions are not zero-cost after LLVM optimization because stack-frame instrumentation survives in callers. | Fixed    | Codegen omits stack-frame hooks for trivial leaf return wrappers while keeping hooks for `main` and call-bearing functions, allowing LLVM `-O2` to erase the wrapper. Regression: `tests/V01BugRepros.test.ts`.                                                                          |
| BUG-140 | Codegen             | Fixed array to raw pointer implicit decay is accepted by lowering/type checking but rejected by codegen.                   | Fixed    | Local variable initialization now lowers `array-to-pointer` with an address-based first-element GEP, preserving the original array storage. Regression: `tests/BugFixes_Batch6.test.ts`.                                                                                                 |
| BUG-141 | Lowering            | `integer-compatible` implicit conversion classification is unreachable for different integer aliases.                      | Fixed    | Scalar integer compatibility is now classified before same-name element matching, while pointer/array integer types remain unsupported. Regression: `tests/Lowering.test.ts`.                                                                                                             |
| BUG-142 | Strings/Codegen     | String interpolation evaluates side-effecting expressions twice when converting non-string values.                         | Fixed    | Integer primitive intrinsic dispatch no longer eagerly generates receiver expressions for unrelated methods, and virtual receiver preparation spills rvalues without regenerating them. Regression: `tests/LanguageExploration_2026_05_26.test.ts`.                                      |
| BUG-143 | Safety              | Escape analysis misses stack addresses hidden inside aggregate return values.                                              | Fixed    | Return checking now recursively rejects stack addresses hidden in struct, tuple, array, enum-struct, cast, group, and ternary return expressions. Regression: `tests/LanguageExploration_2026_05_26.test.ts`.                                                                                |
| BUG-144 | Pointers            | Pointer subtraction across incompatible pointee types is accepted.                                                         | Fixed    | Pointer subtraction now requires compatible pointer operands before lowering to an integer difference. Regression: `tests/LanguageExploration_2026_05_26.test.ts`.                                                                                                                        |
| BUG-145 | Inheritance/VTable  | Method overrides with incompatible return types are accepted and can dispatch through the wrong signature.                 | Fixed    | Struct body checking now validates inherited method overrides with matching non-`this` parameters and rejects incompatible return types before vtable dispatch can use mismatched signatures. Regression: `tests/LanguageExploration_2026_05_26.test.ts`.                                  |
| BUG-148 | TypeChecker/Codegen | Aggregate `+` expressions on structs or tuples compile to invalid LLVM `add` instructions.                                | Fixed    | Arithmetic validation now includes `+`, so aggregate addition without an overload is rejected before code generation. Regression: `tests/InternalErrorBoundary.test.ts`.                                                                                                                   |
| BUG-151 | Package Manager     | Package installs can replace regular files or symlinks at `bpl_modules/<package>`.                                        | Fixed    | Package install targets are now preflighted before staging replacement; only absent paths or real directories are replaceable. Regression: `tests/PackageManager.test.ts`.                                                                                                                  |
| BUG-152 | Package Manager     | Package uninstall treats symlinked package roots as installed packages.                                                    | Fixed    | Uninstall now rejects symlinked package roots before reading manifests, unlinking binaries, or removing the package path. Regression: `tests/PackageManager.test.ts`.                                                                                                                       |
| BUG-153 | Package Manager     | Lock verification treats symlinked installed package roots as valid packages.                                              | Fixed    | `bpl install --locked` and lock verification now reject symlinked or non-directory package roots before loading manifests or hashing package contents. Regression: `tests/PackageManager.test.ts`.                                                                                          |
| BUG-154 | Package Manager     | Lock verification treats symlinked recorded package sources as reachable.                                                  | Fixed    | Lock source reachability now requires a real regular file, so `bpl install --locked` reports symlinked recorded sources as unreachable instead of accepting sources that restore/install would reject. Regression: `tests/PackageManager.test.ts`.                                          |
| BUG-155 | Package Manager     | Lock verification accepts installed transitive dependencies that are missing from `bpl.lock`.                              | Fixed    | `verifyLockFile()` now reports `missing-transitive-lock-entry` when an installed package manifest depends on another installed package that is not recorded in the lockfile. Regression: `tests/PackageManager.test.ts`.                                                                    |
| BUG-156 | Package Manager     | Broken symlink `bpl.lock` paths are reported as missing lockfiles during locked verification.                              | Fixed    | `verifyLockFile()` now uses `lstat` to distinguish absent lockfiles from symlinked lockfile paths before loading the lockfile, so broken and valid-target symlinks are both rejected. Regression: `tests/PackageManager.test.ts`.                                                            |
| BUG-157 | Package Manager     | Plain project install ignores broken symlink `bpl.lock` paths when no dependencies need installing.                        | Fixed    | `installProject()` now uses `lstat` to distinguish absent lockfiles from symlinked lockfile paths before restore or no-op install decisions. Regression: `tests/PackageManager.test.ts`.                                                                                                  |
| BUG-158 | Package Manager     | Local uninstall removes package files before rejecting a broken symlink `bpl.lock`.                                        | Fixed    | `uninstall()` now preloads and validates an existing local lockfile before unlinking binaries or removing package directories. Regression: `tests/PackageManager.test.ts`.                                                                                                                  |
| BUG-159 | Package Manager     | Dependency-tree generation ignores broken symlink `bpl.lock` paths and reports packages as unlocked.                       | Fixed    | `getDependencyTree()` now uses `lstat` to detect existing local lockfile paths before loading them, so symlinked and broken symlink lockfiles are rejected consistently. Regression: `tests/PackageManager.test.ts`.                                                                        |
| BUG-160 | Package Manager     | Dependency-tree generation follows symlinked package roots in `bpl_modules`.                                               | Fixed    | Dependency-tree node construction now classifies package roots with `lstat` and reports symlinked or non-directory roots as problems without loading manifests through them. Regression: `tests/PackageManager.test.ts`.                                                                    |
| BUG-161 | Package Manager     | Package-cache clean leaves broken symlink provenance sidecars behind.                                                      | Fixed    | `cleanPackageCache()` now uses `lstat` to remove provenance sidecars, including broken symlinks, before deleting cached archives. Regression: `tests/PackageManager.test.ts`.                                                                                                               |
| BUG-162 | Package Manager     | Broken symlink package `bin` entries are reported as missing files during pack.                                             | Fixed    | `validatePackageBinFile()` now uses `lstat` before missing-file classification so broken symlink bin entries are rejected as unsupported symlinks. Regression: `tests/PackageManager.test.ts`.                                                                                              |
| BUG-163 | Module Resolver     | Broken symlink entry modules are reported as missing files.                                                                | Fixed    | `assertReadableModuleFile()` now uses `lstat` before missing-file classification, so broken entry symlinks get symbolic-link diagnostics while valid symlink entries still normalize to their real paths. Regression: `tests/ModuleResolver.test.ts`.                                      |
| BUG-164 | Module Resolver     | Broken symlink import candidates are skipped during extension fallback.                                                     | Fixed    | `tryResolveWithExtensions()` now classifies candidates with `lstat`, rejects broken symlinks before lower-priority extension fallback, and still normalizes valid import symlinks to their real paths. Regression: `tests/ModuleResolver.test.ts`.                                           |
| BUG-217 | macOS Runtime Build | Runtime support builds only for the shell architecture under Rosetta.                                                       | Fixed    | macOS runtime builds now compile x86_64 and arm64 objects and combine them into a universal object before archiving. Linux keeps its native single-architecture build. Regression: `tests/RuntimeBuildScript.test.ts`.                                                                         |
| BUG-218 | macOS Tests         | Temporary paths compare `/var` aliases with canonical `/private/var` paths.                                                  | Fixed    | Bun tests now canonicalize macOS temporary-directory environment variables before loading test files. Linux test environments are unchanged.                                                                                                                                                |
| BUG-219 | macOS Runtime Cache | Cached module builds can mix Bun's arm64 host target with Rosetta's default x86_64 compiler target.                          | Fixed    | Module compilation now resolves the same explicit host target used by runtime-object injection. Linux keeps its existing native target behavior.                                                                                                                                              |
| BUG-220 | Test Infrastructure | Command shims require `node` to be available through `PATH` even when tests run with Bun.                                    | Fixed    | Non-Windows command shims now use the active runtime executable in their shebang, remaining portable across Bun-based Linux and macOS test environments.                                                                                                                                       |
| BUG-221 | WebAssembly Tooling | Bare wasm linker candidates can fail probing when the runtime does not resolve modified `PATH` entries for `spawnSync`.     | Fixed    | Wasm linker probes now resolve executable candidates explicitly before spawning them, preserving bare-name and absolute-path behavior on Linux and macOS.                                                                                                                                       |
| BUG-222 | Playground Runtime  | Playground native builds can mix runtime-object and final-link architectures under Rosetta.                                | Fixed    | Playground codegen, runtime-object caching, and final native links now share one explicit host target. Linux keeps its explicit native host target.                                                                                                                                               |
| BUG-223 | Release Smoke       | Release smoke inherits a polluted user npm cache and requires an optional wasm backend.                                    | Fixed    | Packed npm smoke uses an isolated temporary npm cache and skips an unavailable wasm compiler target unless CI explicitly requires wasm.                                                                                                                                                           |
| BUG-224 | Cross-Platform Tests| macOS runs Linux/x86/GNU-tar-specific integration contracts as universal tests.                                            | Fixed    | Platform-specific examples and GNU-tar security fixtures are capability-gated, while portable pointer and temporary-directory expectations remain active everywhere. Linux retains the full Linux/x86/GNU coverage.                                                                           |
| BUG-225 | Runtime Diagnostics | Generated runtime diagnostics reference glibc's `stderr` global directly.                                                   | Fixed    | Generated IR now calls a runtime-support stderr helper instead of depending on a host libc's private `stderr` ABI. Regression: `tests/CodeGenerator.test.ts`.                                                                                                                                      |
| BUG-165 | Package Manager     | Broken symlink package manifests are reported as missing during uninstall.                                                  | Fixed    | `uninstall()` now uses `lstat` before its missing-manifest branch, so broken symlink `bpl.json` paths are rejected by `loadManifest()` as manifest symlinks. Regression: `tests/PackageManager.test.ts`.                                                                                     |
| BUG-167 | Package Manager     | Exact cached `.tgz` archive names skip broken symlink archive validation.                                                   | Fixed    | Exact global cache archive lookup now uses `lstat`, so broken symlink cache entries are passed to `ensurePackageArchiveFile()` and rejected as archive symlinks. Regression: `tests/PackageManager.test.ts`.                                                                                 |
| BUG-168 | Package Manager     | Broken symlink `file:` dependency archives fall back to package-name lookup.                                                | Fixed    | Dependency source resolution now uses `lstat` for file/path archive specs, so broken symlink dependency archives are passed to archive validation and rejected as archive symlinks. Regression: `tests/PackageManager.test.ts`.                                                               |
| BUG-169 | Module Cache        | Broken symlink `.bpl-cache` directories are reported as generic non-writable cache directories.                             | Fixed    | Cache object and manifest write preflights now classify parent directories with `lstat`, so symlinked cache directories produce symbolic-link diagnostics. Regression: `tests/ModuleCache.test.ts`.                                                                                          |
| BUG-171 | Package Manager     | Symlinked package cache archives can shadow real cache entries during package-name resolution.                              | Fixed    | `findGlobalPackageTarballs()` now filters candidates with `lstat`, so package-name and semver cache resolution only selects real archive files. Exact cached `.tgz` names still route to archive validation. Regression: `tests/PackageManager.test.ts`.                                    |
| BUG-172 | Package Resolver    | Symlinked preferred `.bpl` package entrypoint or subpath candidates can fall through to lower-priority `.x` files.          | Fixed    | Package source candidate resolution now treats symlinked candidates as terminal package-resolution failures, so package imports do not silently resolve legacy `.x` fallbacks after a blocked `.bpl` candidate. Regression: `tests/PackageResolver.test.ts`.                                |
| BUG-174 | Package Resolver    | Symlinked preferred `index.bpl` package directory candidates can fall through to lower-priority `index.x` files.            | Fixed    | Package directory index resolution now treats symlinked index candidates as terminal package-resolution failures, so package imports do not silently resolve `index.x` fallbacks after a blocked `index.bpl`. Regression: `tests/PackageResolver.test.ts`.                                   |
| BUG-175 | Package Resolver    | Symlinked local package roots are skipped, allowing workspace or global packages with the same import name to load.         | Fixed    | Package root candidate resolution now treats symlinked package roots as terminal metadata failures, so local package-root symlinks block same-name workspace/global fallback without following the link. Regression: `tests/PackageResolver.test.ts`.                                      |
| BUG-176 | Package Resolver    | Existing malformed local package roots can be skipped, allowing workspace or global packages with the same name to load.    | Fixed    | Package root candidate resolution now treats existing non-directory package roots and directories missing `bpl.json` as terminal metadata failures, blocking same-name workspace/global fallback. Regression: `tests/PackageResolver.test.ts`.                                             |
| BUG-180 | Package Resolver    | Symlinked package search directories can be followed before child package candidates are classified.                        | Fixed    | Package search directory resolution now rejects symlinked `bpl_modules`, workspace `packages`, and configured global package directories before probing package roots or falling back to lower-priority package sources. Regression: `tests/PackageResolver.test.ts`.                         |
| BUG-181 | Package Resolver    | Nested package source paths can follow symlinked parent directories inside a package root.                                  | Fixed    | Package source candidate resolution now checks parent path segments with `lstat`, so nested entrypoints and subpaths reject symlinked parents before reading child files or trying lower-priority extension fallbacks. Regression: `tests/PackageResolver.test.ts`.                           |
| BUG-182 | Package Manager     | Package listing and doctor checks can follow package directory symlinks swapped in after manager construction.              | Fixed    | Package listing, package-cache listing, dependency-tree roots, and package doctor checks now revalidate package directories with `lstat` before scanning. Doctor reports `unsafe-package-directory` instead of following the symlink. Regression: `tests/PackageManager.test.ts`.              |
| BUG-183 | Package Manager     | Package-name install lookup can follow a symlinked global package cache root.                                               | Fixed    | Global package cache lookup now validates the cache root with `lstat` before package-name, version selector, or exact cached archive probes. Missing cache roots report ordinary package misses instead of raw filesystem errors. Regression: `tests/PackageManager.test.ts`.                  |
| BUG-184 | Package Manager     | Direct archive installs can follow package install root symlinks swapped in after manager construction.                     | Fixed    | Direct archive installs now revalidate the selected local or global package install root with `lstat` immediately before package/cache writes. Missing real roots are still recreated safely. Regression: `tests/PackageManager.test.ts`.                                                     |
| BUG-185 | Package Manager     | Package uninstalls can follow package root symlinks swapped in after manager construction.                                  | Fixed    | Local and global uninstalls now revalidate the selected package root with `lstat` before probing or removing package directories, so swapped roots cannot redirect removals outside the configured package root. Regression: `tests/PackageManager.test.ts`.                                   |
| BUG-186 | Package Manager     | Package uninstalls can follow symlinked binary directories swapped in after install.                                        | Fixed    | Uninstall now revalidates local `.bin` and global binary directories with `lstat` before unlinking package commands, rejecting symlinked bin-directory roots while still tolerating missing bin directories. Regression: `tests/PackageManager.test.ts`.                                        |
| BUG-187 | Package Manager     | Lock verification can follow a symlinked local package directory swapped in after manager construction.                     | Fixed    | Lock verification now revalidates `bpl_modules` with `lstat` before scanning locked package entries, so `bpl install --locked` cannot verify external package contents through a swapped package root. Missing package roots still report ordinary missing-package issues. Regression: `tests/PackageManager.test.ts`. |
| BUG-188 | Package Manager     | Package archive source paths can follow symlinked parent directories.                                                       | Fixed    | Archive install validation now rejects symlinked parent directories before extraction, `file:` dependencies inherit the same guard, and lock verification treats recorded sources through symlinked parents as unreachable. Regression: `tests/PackageManager.test.ts`.                            |
| BUG-189 | Package Manager     | Package cache maintenance and global installs can follow symlinked parent directories of the global package cache.          | Fixed    | Package-manager directory validation now rejects symlinked parent directories before reading, repairing, cleaning, creating, or writing package/cache roots, so cache archives and provenance sidecars cannot be redirected through a symlinked cache parent. Regression: `tests/PackageManager.test.ts`. |
| BUG-190 | Module Cache        | Module cache operations can follow symlinked parent directories after project-root swaps.                                  | Fixed    | Module cache construction, object writes, manifest writes, and cache cleaning now reject symlinked parent directories, while cached-object lookup and stats ignore object files reached through symlinked parents. Regression: `tests/ModuleCache.test.ts`. |
| BUG-191 | CLI Clean           | `bpl clean` can scan and remove artifacts through symlinked working-directory path components when the runtime preserves the symlink spelling. | Fixed    | Clean now rejects working directory paths containing symlink components before git probing, artifact scanning, or deletion. JSON mode returns a parseable `success: false` clean report. Regression: `tests/CLI.test.ts`. |
| BUG-192 | CLI Output          | Shared CLI output writes can follow symlinked ancestor directories even when the immediate parent is real.                  | Fixed    | Shared output-path validation now rejects symlinked parent path components before atomic temp creation, chmod, rename, or cleanup, covering format, docs, bindgen, and compile outputs that use `writeFileAtomically`. Regression: `tests/CLIUtils.test.ts`. |
| BUG-193 | Linker              | Native linker executable outputs can be redirected through symlinked ancestor directories.                                | Fixed    | Linker output validation now rejects symlinked parent path components before selecting temporary outputs, revalidates temp output paths before final rename, and avoids best-effort cleanup through symlinked parents. Regression: `tests/Linker.test.ts`. |
| BUG-194 | Codegen             | Debug IR output can be redirected through symlinked ancestor directories.                                                  | Fixed    | CodeGenerator debug IR emission now rejects symlinked parent path components before writing diagnostic `.ll` files, preserving final-path and immediate-parent symlink protections. Regression: `tests/CodeGenerator.test.ts`. |
| BUG-195 | Module Cache        | Cached module linked executable outputs can be redirected through symlinked ancestor directories.                          | Fixed    | `ModuleCache.linkModules` now rejects symlinked parent path components before compiler-driver invocation and before final rename, while temporary cleanup continues to avoid paths through symlinked parents. Regression: `tests/ModuleCache.test.ts`. |
| BUG-196 | Release             | Release manifest outputs can be redirected through symlinked ancestor directories.                                        | Fixed    | Release manifest output validation now rejects symlinked parent path components before writing manifest JSON, preserving final-output and immediate-parent symlink diagnostics. Regression: `tests/ReleaseMetadata.test.ts`. |
| BUG-197 | Fuzzing             | Compiler fuzz crash artifacts can be redirected through symlinked crash-directory ancestors.                              | Fixed    | Fuzz crash artifact directory validation now rejects symlinked parent path components before creating or writing repro source, minimized source, or metadata artifacts. Regression: `tests/CompilerFuzzRunner.test.ts`. |
| BUG-198 | Fuzzing             | Fuzz regression promotion can write promoted corpus files through symlinked corpus-directory ancestors.                    | Fixed    | `fuzz:promote` now rejects symlinked corpus-directory parent path components before duplicate-name checks, directory creation, or promoted repro writes. Regression: `tests/CompilerFuzzRunner.test.ts`. |
| BUG-199 | Fuzzing             | Fuzz promotion metadata updates can follow symlinked metadata paths or symlinked metadata parents.                        | Fixed    | `fuzz:promote` now rejects symlinked crash metadata paths and symlinked metadata parent path components before reading metadata or writing `promotedTo` updates. Regression: `tests/CompilerFuzzRunner.test.ts`. |
| BUG-200 | Fuzzing             | Fuzz promotion can read promoted source content through symlinked source paths or symlinked source parents.                | Fixed    | `fuzz:promote` now rejects symlinked source paths and symlinked source parent path components before reading repro source content for corpus promotion. Regression: `tests/CompilerFuzzRunner.test.ts`. |
| BUG-201 | Fuzzing             | Fuzz artifact repro planning can follow symlinked metadata files or symlinked metadata parents.                           | Fixed    | `fuzz:repro` metadata discovery now rejects symlinked metadata files and symlinked metadata parent path components before generating replay or promotion commands. Regression: `tests/FuzzArtifactRepro.test.ts`. |
| BUG-202 | Documentation       | Documentation generation can read input files through symlinked parent directories.                                      | Fixed    | Documentation input resolution now rejects symlinked parent path components before reading source files, while preserving final symlink, non-file, and missing-input diagnostics. Regression: `tests/DocumentationGenerator.test.ts`. |
| BUG-203 | Bindgen             | C bindgen can read header inputs through symlinked parent directories.                                                    | Fixed    | Bindgen header validation now rejects symlinked parent path components before reading input headers, preserving final symlink, broken-symlink, directory, and output path protections. Regression: `tests/CLI.test.ts`. |
| BUG-204 | Object Parser       | Object and LLVM IR symbol parsing can read inputs through symlinked parent directories.                                  | Fixed    | ObjectFileParser input validation now rejects symlinked parent path components before parsing LLVM IR or binary object/archive inputs. Regression: `tests/ObjectFileParser.test.ts`. |
| BUG-205 | Runtime Resources   | `BPL_HOME` and bundled runtime resource lookup can resolve through symlinked parent directories.                          | Fixed    | PathResolver rejects BPL roots reached through symlinked parent components; BinaryRunner, CompilationRunner, and `bpl doctor` reject bundled runtime files reached through symlinked resource parents before linking or reporting success. Regressions: `tests/PathResolver.test.ts`, `tests/BinaryRunner.test.ts`, `tests/CLI.test.ts`. |
| BUG-206 | CLI Scripts         | `bpl run-script` can read `bpl.json` through symlinked working-directory parent components.                               | Fixed    | Run-script manifest validation now rejects symlinked parent components before parsing `bpl.json`, listing scripts, or executing script commands. Regression: `tests/CLI.test.ts`. |
| BUG-207 | Fuzzing             | `fuzz:replay --minimize --out` can write minimized repro files through symlinked output ancestors.                       | Fixed    | Fuzz replay output validation now rejects final output symlinks, non-directory output parents, and symlinked output parent components before writing minimized repro files. Regression: `tests/CompilerFuzzRunner.test.ts`. |
| BUG-210 | Cross Platform      | macOS compiler-correctness CI rejects wasm output paths below the trusted `/var` system symlink used by `os.tmpdir()`.    | Fixed    | Shared path-safety validation now allows trusted macOS root temp symlinks such as `/var -> /private/var` and `/tmp -> /private/tmp` while still rejecting user-controlled nested symlink ancestors. Regression: `tests/PathSafety.test.ts`. |
| BUG-216 | Package Resolver    | Unsafe global versioned package roots can be ignored, allowing fallback to lower package versions.                       | Fixed    | Versioned global package root candidates are now collected by name before `lstat` validation, so symlinks and non-directories block fallback consistently. Regression: `tests/PackageResolver.test.ts`. |

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
local f: Func<void>() = s.cb;
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

**Status**: ✅ FIXED

**Description**: When pattern matching on nested enums with qualified names (e.g., `Option<Option<int>>`), the inner enum value was not extracted correctly from the outer variant's data.

**Root Cause**: This issue was caused by two separate bugs:

1. BUG-102: Qualified name resolution failing in TypeGenerator (e.g., "std.Option" not found when only "Option" was in the maps)
2. BUG-103: Enum-to-enum casting only copying the discriminant tag, losing the data payload

**Fix**: Both underlying issues have been resolved (see BUG-102 and BUG-103 for detailed fixes).

**Testing**: Examples/enum_chaining_test/main.bpl now compiles and runs successfully, correctly printing "Nested value: 40".

**Reproduction** (now fixed):

```bpl
import * as std from "std";

frame test_nested() {
    local nested: std.Option<std.Option<int>> = std.Option<std.Option<int>>.Some(std.Option<int>.Some(40));

    match (nested) {
        std.Option<std.Option<int>>.Some(inner) => {
            // inner is correctly Option<int>.Some(40)
            match (inner) {
                std.Option<int>.Some(v) => printf("Value: %d\n", v),  // Now correctly prints 40
                std.Option<int>.None => printf("None\n"),
            };
        },
        std.Option<std.Option<int>>.None => { printf("Outer None\n"); },
    };
}
```

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

Lambda expressions used to require an explicit return type or fail to infer correctly in some contexts. This has been fixed when the target function type is known.

```bpl
local l: Func<int>(int) = |x: int| { return x + 1; }; # Works
local explicit: Func<int>(int) = |x: int| ret int { return x + 1; }; # Also works
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
**Status**: ✅ FIXED
**Description**: Casting an integer to a pointer (`cast<*int>(addr)`) creates a new temporary variable on the stack, stores the integer value in it, and returns the address of that temporary. It does not cast the integer value to a pointer type.
**Resolution**: The `unaryExpressionGenerator.ts` now identifies integer-to-pointer casts and emits the correct `inttoptr` LLVM instruction instead of allocating temporary memory.

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
**Status**: ✅ FIXED
**Description**: The grammar defines multi-line comments as `/# ( .* | '\n' )*? #/`. The non-greedy match `*?` causes the comment to end at the _first_ occurrence of `#/`, making nested comments impossible.
**Resolution**: The `bpl.peggy` grammar has been updated to use a recursive rule for `MultiLineComment`, effectively supporting arbitrarily nested comments.

### BUG-062: Assignment Chaining Unsupported

**Category**: Operators
**Status**: Ignored (By Design)
**Description**: Assignment is treated as a statement, not an expression. Therefore, chaining assignments like `a = b = 10` is not supported. This is intentional - BPL follows the design where assignment is a statement, not an expression.
**Reproduction**:

```bpl
local a: int;
local b: int;
a = b = 10; # Syntax Error - by design
```

### BUG-063: Implicit Bool to Int Promotion in Comparisons

**Category**: Operators
**Status**: Closed (Works as designed)
**Description**: Boolean values are implicitly promoted to integers (1 for true, 0 for false) when used in comparisons. This allows expressions like `3 > 2 > 1` to compile and evaluate to `false` (since `true > 1` -> `1 > 1` -> `false`), which is often unintended behavior. This is intentional language design - it's a logical error, not a compiler bug. Future linter may add warnings.
**Reproduction**:

```bpl
if (3 > 2 > 1) { ... } # Compiles successfully, evaluates to false
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
**Status**: Closed (By Design)
**Description**: The compiler does not infer generic type arguments for constructors or static methods based on arguments. You must explicitly specify the type parameters.
**Reproduction**:

```bpl
struct Box<T> { frame new(v: T) ... }
local b1: Box<int> = Box.new(10); # Error: expected T, got int
local b2: Box<int> = Box<int>.new(10); # Works
```

**Resolution**: Explicit generic type arguments are required for v0.1 constructor/static method calls. Confirmed current behavior: `Box.new(10)` fails with `Argument 1 type mismatch: expected T, got int`, while `Box<int>.new(10)` compiles and runs.

### BUG-066: Empty Tuple Syntax Unsupported

**Category**: Parser
**Status**: Ignored (By Design)
**Description**: The parser does not support empty tuples `()` in type declarations or expressions. This is intentional - empty tuples are not supported in BPL.
**Reproduction**:

```bpl
local t: () = (); # Syntax error - by design
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
**Status**: Fixed
**Description**: Fixed-size arrays cannot be assigned to dynamic array (slice) types.
**Reproduction**:

```bpl
local a: int[] = [1, 2, 3]; # Error: cannot assign int[3] to int[]
```

**Resolution**: `T[]` now lowers to a slice value `{ T*, i64 }`. Fixed arrays and array literals can initialize `T[]` locals and can be passed directly to `T[]` parameters; the fixed-array path builds the slice from the existing array address and length.

### BUG-070: No Default Arguments

**Category**: Parser
**Status**: Ignored (Planned Feature)
**Description**: The parser does not support default values for function parameters. This is in the roadmap and will be implemented later.
**Reproduction**:

```bpl
frame foo(a: int = 10) { } # Syntax error - not yet supported
```

### BUG-071: No Variadic Function Definitions

**Category**: Parser
**Status**: ✅ FIXED
**Description**: BPL function definitions (`frame`) now support variadic functions. The syntax is `frame name(args: ...type, count: int){}`. It supports fixed args before variadic args, and count is implicit and passed by compiler.
**Reproduction**:

```bpl
frame log(fmt: string, args: ...int, count: int) { } # Now supported
```

### BUG-072: Compiler Crash on Recursive Type Alias

**Status**: ✅ FIXED

**Category**: Compiler Crash
**Description**: The compiler crashes with a stack overflow (RangeError) when processing a recursive type alias.
**Root Cause**: The `resolveType()` method in TypeCheckerBase.ts recursively resolved type aliases without cycle tracking, causing infinite recursion.
**Fix**: Added `typeAliasResolutionStack` to track types being resolved. When a type is found in the stack during resolution, a CompilerError is thrown with a helpful message instead of infinite recursion.
**Implementation**:

- Added `private typeAliasResolutionStack: Set<string>` field to TypeCheckerBase class
- Modified `resolveType()` to check the stack before resolving type aliases
- Wrapped resolution in try-finally to ensure stack cleanup even on errors
  **Testing**: Examples/bug_072_recursive_type_alias/main.bpl now properly errors with "Recursive type alias 'List' detected" instead of stack overflow

**Reproduction** (now fixed):

```bpl
type Node = (int, *Node);
```

### BUG-087: Function Pointer Equality

**Status**: ✅ FIXED (Already Working)

**Category**: Equality
**Description**: Function pointer equality comparison was expected to use invalid LLVM IR, but testing revealed it already works correctly.
**Finding**: The compiler generates valid `icmp eq` instructions for direct pointer comparison on function types.
**Testing**: Examples/bug_087_function_equality/main.bpl compiles and runs successfully with correct function pointer comparisons.

### BUG-088: Bound Methods Not Supported

**Category**: Methods
**Status**: ✅ FIXED
**Description**: Bound methods (e.g., `obj.method` as a value) are now supported. In `obj.method()` calls this works, and methods can be used as values creating a `Lambda` that captures the object instance (`this`). Note: `frame obj.method()` syntax is not supported since we have struct methods.

```bpl
struct Counter {
    count: int,
    frame increment(this: *Counter) { this.count = this.count + 1; }
}

frame main() {
    local c: Counter = Counter { count: 0 };
    # 'inc' is a Lambda<void> that captures 'c'
    local inc: Lambda<void>() = c.increment;
    inc();
}
```

### BUG-089: Recursive Structs Cause LLVM Errors

**Status**: ✅ FIXED

**Category**: Structs
**Description**: Recursive structs (infinite size) caused LLVM IR generation errors instead of semantic error during type checking.
**Root Cause**: Only direct self-references were checked, not indirect cycles like `A → B → A`. The error occurred in LLVM backend instead of at semantic analysis.
**Fix**: Added `detectStructCycle()` method to TypeChecker.ts that performs depth-first traversal to detect all cyclic references.
**Implementation**:

- Added recursive `detectStructCycle()` method to TypeChecker class
- Method tracks visited structs and maintains path for cycle detection
- Skips pointer and array fields (they break infinite size cycles)
- Throws CompilerError with full cycle path when detected
- Called during `checkStructBody()` after duplicate field validation
  **Testing**: Examples/bug_089_recursive_struct/main.bpl now properly errors with "Struct 'Node' has infinite size due to recursive field types" instead of LLVM error

**Reproduction** (now fixed):

```bpl
struct Node {
    value: int,
    next: Node,  # Recursive without pointer - infinite size!
}
```

### BUG-073: Invalid LLVM IR for Struct Slicing

**Status**: ✅ FIXED

**Category**: Code Generation
**Description**: When assigning a child struct to a parent struct variable (slicing), the compiler generates invalid LLVM IR. It incorrectly uses `i32` type for pointer fields (like the vtable pointer) in `insertvalue` instructions, causing LLVM compilation to fail.
**Root Cause**: The `emitCast` function in UnaryExpressionGenerator didn't handle child-to-parent struct assignments (struct slicing). It would fall through to the generic enum/struct cast which only extracted the tag field.
**Fix**: Added struct slicing logic in `emitCast` that:

1. Detects parent-child struct relationships by comparing struct declarations and layouts
2. Extracts each parent field from the child struct using `extractvalue`
3. Replaces the vtable pointer with the parent's vtable (not the child's) using `bitcast` to get the correct pointer
4. Builds the parent struct by inserting each field with `insertvalue` instructions
   **Testing**: Example/bug_073_struct_slicing/main.bpl compiles and runs successfully, correctly calling the parent's method instead of the child's after slicing.

**Reproduction** (now fixed):

```bpl
struct Animal {
    name: string,
    frame speak(this: *Animal) { printf("Animal: %s\n", this.name); }
}

struct Dog : Animal {
    breed: string,
    frame speak(this: *Dog) { printf("Dog: %s (%s)\n", this.name, this.breed); }
}

frame main() {
    local dog: Dog;
    dog.name = "Buddy";
    dog.breed = "Golden Retriever";

    # Struct slicing - extracts only Animal fields and uses Animal's vtable
    local animal: Animal = dog;
    animal.speak();  # Correctly calls Animal.speak(), not Dog.speak()
}
```

### BUG-074: Compiler Allows String Switch but Generates Invalid LLVM

**Status**: ✅ FIXED

**Category**: Code Generation
**Description**: The compiler fails to reject `switch` statements on string types during semantic analysis. It then generates invalid LLVM IR (attempting to switch on a pointer type), causing the LLVM backend to fail.
**Root Cause**: Switch statement code generation didn't handle string types, attempting to use LLVM switch instruction on pointer values.
**Fix**: Implemented string switch as if-else chain with strcmp calls in StatementGenerator, added strcmp declaration to CodeGenerator standard library functions.
**Testing**: Examples/bug_074_string_switch/main.bpl compiles and runs successfully.

**Reproduction** (now fixed):

```bpl
switch ("a") {
    case "a": {}
}
```

### BUG-075: No Explicit Enum Values

**Category**: Parser
**Status**: Ignored (Feature Deferred)
**Description**: The parser does not support assigning explicit integer values to enum variants, which is necessary for C interoperability. Feature deferred - may be added in future version.
**Reproduction**:

```bpl
enum Status {
    Ok = 0, # Syntax error - not supported
    Error = 1
}
```

### BUG-083: String Concatenation Generates Invalid LLVM

**Status**: ⏸️ DEFERRED

**Category**: Strings
**Description**: String concatenation (`+`) generates invalid LLVM IR (`add i8*`) instead of calling a runtime concatenation function.
**Root Cause**: The `+` operator on string types (pointers) generates an arithmetic `add` instruction instead of recognizing it needs runtime allocation and string copy operations.
**Reason for Deferral**: String concatenation requires dynamic memory allocation (`malloc`) and proper deallocation, which creates memory management challenges. A proper implementation needs:

- Runtime string concatenation function
- Memory lifetime management (who frees the result?)
- Potential GC or RAII integration
  **Current Workaround**: Users can manually implement concatenation using malloc, strcpy, and strcat (see examples/stdlib_string_concat_sim for implementation).
  **Future Plan**: Will be revisited when memory management improvements (e.g., RAII, automatic memory tracking) are implemented.
  **Testing**: Test case created at Examples/bug_083_string_concat/main.bpl but fix intentionally deferred.

**Reproduction** (deferred):

```bpl
local s1: string = "Hello";
local s2: string = " World";
local result: string = s1 + s2; # Currently generates invalid LLVM
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

**Status**: Fixed. Module calls reached through namespace imports are now mangled with resolved function types and emit the needed extern/module declarations, preventing undefined symbol errors.

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
**Status**: Fixed
**Description**: The compiler now properly validates and rejects attempts to dereference `*void` pointers into void variables. Previously this would generate invalid `load void` instructions in LLVM IR. The compiler now produces a clear error: "Variable cannot be of type 'void'". While you still cannot dereference `*void` directly, this is correct behavior since void has no size.
**Reproduction**:

```bpl
local p: *void = nullptr;
local val: void = *p; # Error: Variable 'val' cannot be of type 'void'
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

### BUG-086: Pointer-to-Array Alias Precedence

**Category**: Type Aliases
**Status**: Fixed
**Description**: `*Arr` where `Arr = int[10]` was treated like an array-of-pointers during indexing, generating invalid GEP instructions (operating on the stack slot instead of the pointee array). Pointer indexing now loads the pointee array, performs bounds checks, and indexes elements correctly, preserving alias precedence.
**Reproduction**:

```bpl
type Arr = int[10];
frame main() {
  local p: *Arr = cast<*Arr>(malloc(sizeof<Arr>()));
  p[0] = 42;
}
```

### BUG-102: Qualified Name Resolution in Nested Generic Enums

**Status**: ✅ FIXED

**Category**: Enums
**Description**: When using nested generic enums with qualified names (e.g., `std.Option<std.Option<int>>`), the type resolution in the LLVM IR generator failed because it looked up "std.Option" but the internal type maps only contained "Option".
**Root Cause**: The `resolveType()` method in TypeGenerator only performed direct lookups in `enumDeclMap` and `structDeclMap` without handling namespace-qualified names. When a qualified name like "std.Option" was provided, the lookup failed and returned an opaque struct type, causing invalid LLVM IR generation.
**Fix**: Added namespace-aware fallback logic in `TypeGenerator.resolveType()`:

1. When a type lookup fails, check if the name contains a namespace separator (`.`)
2. Strip the namespace prefix and retry the lookup with just the base name
3. Applied to both generic and non-generic type resolution paths

**Implementation**:

- Modified `resolveType()` in TypeGenerator.ts at two locations (generic and non-generic branches)
- Added code to detect qualified names, extract base name, and retry lookup
- Preserved all existing behavior for non-qualified names

**Testing**: Examples/enum_chaining_test/main.bpl now compiles and runs successfully with nested qualified enum types like `std.Option<std.Option<int>>`.

**Reproduction** (now fixed):

```bpl
import * as std from "std";

frame main() {
    # Nested generic enum with qualified names
    local nested: std.Option<std.Option<int>> =
        std.Option<std.Option<int>>.Some(std.Option<int>.Some(40));

    match (nested) {
        std.Option<std.Option<int>>.Some(inner) => {
            match (inner) {
                std.Option<int>.Some(v) => printf("Nested value: %d\n", v),
                std.Option<int>.None => printf("Nested None\n"),
            };
        },
        std.Option<std.Option<int>>.None => printf("Outer None\n"),
    };
}
```

### BUG-103: Enum-to-Enum Casting Data Loss

**Status**: ✅ FIXED

**Category**: Enums
**Description**: When casting from one enum type to another (e.g., assigning `Option<int>` to `Option<Option<int>>`), only the discriminant tag was copied, losing the data payload stored in the enum's data array.
**Root Cause**: The `emitCast()` function in UnaryExpressionGenerator only extracted and inserted the tag field (index 0) for enum-to-enum casts. It ignored the data field (index 1), which contains the actual payload for tuple/struct variants.
**Fix**: Enhanced `emitCast()` in UnaryExpressionGenerator to handle enum data payload copying:

1. Extract both tag (index 0) and data array (index 1) from source enum
2. Check if source and target data arrays have same size
3. If same size: Use extractvalue/insertvalue to copy data directly
4. If different sizes: Use memcpy to copy data, handling truncation or extension
5. Insert both tag and data into target enum struct

**Implementation**:

- Modified `emitCast()` in UnaryExpressionGenerator.ts around line 827-900
- Added logic to detect enum-to-enum casts with data fields
- Used LLVM extractvalue/insertvalue instructions for efficient copying
- Added memcpy fallback for different-sized data arrays
- Preserved existing behavior for non-enum casts

**Testing**: Examples/enum_chaining_test/main.bpl now correctly preserves nested enum values during assignment and pattern matching.

**Reproduction** (now fixed):

```bpl
import * as std from "std";

frame main() {
    # Create inner enum with value
    local inner: std.Option<int> = std.Option<int>.Some(40);

    # Wrap it in outer enum - data payload should be preserved
    local outer: std.Option<std.Option<int>> =
        std.Option<std.Option<int>>.Some(inner);

    # Extract and verify the nested value
    match (outer) {
        std.Option<std.Option<int>>.Some(inner_extracted) => {
            match (inner_extracted) {
                # This now correctly prints 40 instead of garbage/None
                std.Option<int>.Some(v) => printf("Value: %d\n", v),
                std.Option<int>.None => printf("None\n"),
            };
        },
        std.Option<std.Option<int>>.None => printf("Outer None\n"),
    };
}
```

### BUG-104: Nested Tuple Patterns Not Supported

**Status**: ✅ FIXED

**Description**: Match expressions with nested tuple patterns (e.g., `((a, b), c)`) are now implemented. The code generation for binding nested tuple identifiers has been completed by adding recursive handling for nested PatternTuple in MatchExpressionGenerator.ts.

**Regression Example**:

```bpl
match (nested) {
    ((0, 0), 0) => printf("All zeros\n"),
    ((a, b), c) => printf("Nested: (%d, %d), %d\n", a, b, c),
}
```

**Technical Details**: `MatchExpressionGenerator.ts` recursively extracts nested tuple elements and binds nested pattern identifiers. Regression coverage lives in `tests/NestedTupleMatch.test.ts`.

### BUG-105: Infinite Monomorphization

**Status**: ✅ FIXED

Generic function calls that create new instantiations recursively (e.g., `explode<Box<T>>`) now trigger a proper error. Added generation batch limit (50) in CodeGenerator to detect and error on infinite recursion.

```bpl
struct Box<T> { val: T }
frame explode<T>(val: T) {
    if (false) { return; }
    local box: Box<T>;
    box.val = val;
    # Creates Box<Box<T>>, then Box<Box<Box<T>>>...
    explode<Box<T>>(box);
}
frame main() {
    explode<int>(1);
}
```

### BUG-106: Escape Analysis Missing

**Status**: ✅ FIXED

The compiler now checks for returning pointers to local stack variables and produces an error. Added check in StatementChecker to error when returning the address of a local variable or parameter.

```bpl
frame foo() ret *int {
    local x: int = 42;
    return &x; # Now produces error: Cannot return address of local variable
}
```

### BUG-107: Code Generation Failure (Missing Functions) - Fixed

The code generator frequenty fails to emit function definitions (including `main`) in the output LLVM IR, leading to "undefined reference to main" linker errors. This has been observed when:

1. An `extern` declaration is present.
2. A `try-catch` block is used.
3. Certain variable declarations are used.

**Resolution:** This was caused by the `CodeGenerator` reusing state (`definedFunctions` set) between compilation runs. The set was not being cleared, so subsequent runs (or runs sharing the same compiler instance) would assume functions were already emitted and skip them. This has been fixed by properly resetting the generation state in `generate()`.

```bpl
# Example 1: Extern
extern printf(fmt: *char, ...) ret int;
frame main() { printf("Hi"); } # main not generated

# Example 2: Try-Catch
frame main() {
    try { throw 1; } catch(e: int) {}
} # main not generated
```

### BUG-108: Compiler Crash on Duplicate Struct Fields - Fixed

**Status**: ✅ FIXED

**Category**: Compiler Crash
**Description**: The compiler crashed with an internal error (TypeError) when a struct definition contained duplicate fields, instead of reporting a proper error message.

**Resolution**: Fixed by checking for duplicates in `TypeChecker.ts` and throwing a clean `CompilerError` instead of allowing the duplicate keys to crash the analysis phase.

### BUG-109: Const Correctness Violation - Fixed

**Status**: ✅ FIXED

**Category**: Safety
**Description**: The compiler allowed taking the address of a `const` variable (`&x`), producing a mutable pointer that could be used to modify the constant value.

**Resolution**: Updated `ExpressionChecker` to forbid taking the address of constant variables (`isConst`). Also updated `CallChecker` to properly propagate constness when accessing members of constant structs (e.g., `&constObj.field` is now forbidden).

### BUG-110: Invalid IR for String Concatenation - Fixed

String concatenation using the `+` operator generated invalid LLVM IR (`add` instruction on pointers), leading to bad code generation or crashes.

**Resolution**: Updated `ExpressionChecker` to explicitly check for and reject string concatenation using `+`. Users should use helper functions like `string_concat` instead.

### BUG-111: Inline Assembly Variable Name with Underscore

**Status**: Fixed

**Description**: Using a variable name with an underscore (e.g., `asm_res`, `my_var`) in an inline assembly block causes a compilation error. The compiler fails to replace the placeholder correctly in the generated output.

**Resolution**: Updated the regex in `AsmGenerator.ts` to correctly match placeholders containing underscores. Previously, the regex `([^_]+)` stopped matching at the first underscore, failing to replace the full placeholder. It now uses `(.+?)` to match the full key until the closing `__` delimiter.

### BUG-112: Nested Tuple Pattern Matching Codegen - Fixed

**Status**: ✅ FIXED

**Category**: Codegen
**Description**: Nested tuple patterns in match expressions did not properly generate variable bindings. For example:

```bpl
match (nested_tuple) {
  ((a, b), c) => { ... }  # a, b, c were not bound
}
```

**Resolution**: Updated `MatchExpressionGenerator.ts` to recursively extract nested tuple elements and bind pattern variables. Both `bindTuplePatternVariables` and `generateTuplePatternCheck` now handle nested `PatternTuple` cases.

### BUG-113: arg_parser Destroy Crash - Fixed

**Status**: ✅ FIXED

**Category**: Standard Library
**Description**: Calling `destroy()` on `ParsedArgs` crashed when attempting to free `FlagEntry` strings.

**File**: `lib/arg_parser.bpl:325`

**Root Cause**: The crash was NOT due to double-free or ownership issues. It was caused by BUG-114 (pointer-to-struct nullptr comparison crash). The original code used `if (entry.key != nullptr)` which triggers the compiler bug.

**Resolution**: Since `setFlag` always allocates both `key` and `value`, the nullptr checks are unnecessary. Removed the null checks and uncommented the destroy calls. Memory is now properly freed without crashes. Note: BUG-114 is now fixed, so these checks would work correctly now.

### BUG-114: Pointer-to-Struct Nullptr Comparison Crash - Fixed

**Status**: ✅ FIXED

**Category**: Codegen
**Description**: Comparing a pointer to a struct that has a vtable (implements interfaces) to `nullptr` crashed at runtime.

**Root Cause**: The ExpressionChecker was treating pointer comparisons (`*Struct == *Struct` or `*Struct != nullptr`) as operator overload lookups. When comparing `*String != nullptr`, the compiler would try to call `String.__ne__(nullptr)` which failed because:

1. The operator overload expected `*String` argument, not `nullptr`
2. Even if it worked, it would do value comparison, not pointer identity

**Fix**: Modified `ExpressionChecker.ts` to skip operator overload resolution for ALL pointer comparisons (not just nullptr). When comparing pointers, you always want pointer identity. For value comparison, explicitly dereference: `*ptr1 == *ptr2`.

**Before** (crashed):

```bpl
if (str != nullptr) { ... }  # Tried to call String.__ne__()
if (str1 == str2) { ... }    # Called String.__eq__(), wrong semantics
```

**After** (works correctly):

```bpl
if (str != nullptr) { ... }  # Direct pointer comparison (icmp)
if (str1 == str2) { ... }    # Pointer identity comparison (icmp)
if (*str1 == *str2) { ... }  # Value comparison via operator overload
```

**Files Changed**:

- `compiler/middleend/ExpressionChecker.ts`: Added `isPointerComparison` check to skip operator overloads when both operands are pointer types (including nullptr)
- `examples/hash_test/main.bpl`: Updated `strEq` to use `*a == *b` for proper value equality

---

### BUG-115: Self-Inheriting Struct Stack Overflow

**Status**: ✅ FIXED

**Category**: Inheritance

**Description**: A struct that inherits from itself now produces a proper semantic error instead of crashing.

**Reproduction**:

```bpl
struct SelfInherit : SelfInherit {
    x: int,
}

frame main() {
    printf("Test\n");
}
```

**Expected**: Compiler error: "Struct 'SelfInherit' cannot inherit from itself"

**Resolution**: TypeChecker now detects self-inheritance early before type resolution and throws a proper error.

**Test File**: `examples/bug_hunt_session/test_self_inherit.bpl`

---

### BUG-116: Circular Inheritance Stack Overflow

**Status**: ✅ FIXED

**Category**: Inheritance

**Description**: Circular inheritance chains (A extends B, B extends A) now produce a proper semantic error instead of crashing.

**Reproduction**:

```bpl
struct CircleA : CircleB {
    a: int,
}
struct CircleB : CircleA {
    b: int,
}

frame main() {
    printf("Test\n");
}
```

**Expected**: Compiler error: "Circular inheritance detected: CircleA -> CircleB -> CircleA"

**Resolution**: TypeChecker now detects circular inheritance chains before type resolution and throws a proper error with cycle path.

**Test File**: `examples/bug_hunt_session/test_circular_inherit.bpl`

---

### BUG-117: Duplicate Generic Type Parameters Accepted

**Status**: ✅ FIXED

**Category**: Generics

**Description**: Structs and functions with duplicate generic type parameter names now produce an error.

**Reproduction**:

```bpl
struct DupParam<T, T> {
    x: T,
}

frame main() {
    printf("Test\n");
}
```

**Expected**: Compiler error: "Duplicate type parameter 'T'"

**Resolution**: TypeChecker now validates that all generic type parameter names are unique for functions, structs, and enums.

**Test File**: `examples/bug_hunt_session/test_dup_generic_param.bpl`

---

### BUG-118: Unicode Strings Cause LLVM Error

**Status**: ✅ FIXED

**Category**: Strings

**Description**: String literals containing multi-byte UTF-8 characters (like Chinese characters) cause LLVM IR compilation to fail due to incorrect string length calculation.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

frame main() {
    local unicode: string = "Hello 世界";
    printf("Unicode: %s\n", unicode);
}
```

**Expected**: Prints "Unicode: Hello 世界"

**Actual (before fix)**: LLVM error: `constant expression type mismatch: got type '[13 x i8]' but expected '[9 x i8]'`

**Root Cause**: The compiler counted characters instead of bytes when calculating string literal size for LLVM IR.

**Fix**: Updated `escapeString()` and `getUtf8ByteLength()` in `BaseCodeGenerator.ts` to properly encode non-ASCII characters as UTF-8 bytes using `TextEncoder`.

**Test File**: `tmp/unicode_test.bpl`

---

### BUG-119: `is` Operator Fails for Derived Types Through Base Pointer

**Status**: ✅ FIXED

**Category**: Type System

**Description**: The `is` operator returns `false` when checking if a derived type pointer (accessed through a base type pointer) is an instance of the derived type.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

struct Animal { name: string, }
struct Dog : Animal { breed: string, }

frame main() {
    local dog: Dog = Dog { name: "Rex", breed: "German Shepherd" };
    local animal: *Animal = cast<*Animal>(&dog);

    if (*animal is Dog) {
        printf("*animal is Dog: true\n");
    } else {
        printf("*animal is Dog: false\n");  # This WAS printed before fix!
    }
}
```

**Expected**: Prints "\*animal is Dog: true"

**Actual (before fix)**: Printed "\*animal is Dog: false"

**Root Cause**: The `is` operator used compile-time type comparison instead of runtime vtable comparison.

**Fix**: Modified `generateRegularTypeMatch()` in `MatchExpressionGenerator.ts` to:

1. Check if both types have vtables (inheritance hierarchy)
2. Load the actual vtable pointer from the object
3. Compare against the expected vtable for the target type

Also modified `computeVTableLayout()` in `StructEnumGenerator.ts` to give vtables to ALL structs in inheritance hierarchies (not just those with methods).

**Test File**: `examples/bug_119_120_is_as/main.bpl`

---

### BUG-120: `as` Operator Returns Non-Null for Invalid Downcasts

**Status**: ✅ FIXED

**Category**: Type System

**Description**: The `as` operator (safe downcast) returns a non-null pointer even when the downcast should fail. It appears to just reinterpret the pointer without runtime type checking.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

struct Animal { name: string, }
struct Dog : Animal { breed: string, }
struct Cat : Animal { indoor: bool, }

frame main() {
    local dog: Dog = Dog { name: "Rex", breed: "German Shepherd" };
    local animal: *Animal = cast<*Animal>(&dog);

    local maybeCat: *Cat = animal as *Cat;
    printf("animal as *Cat: %p (should be null)\n", maybeCat);

    if (maybeCat != nullptr) {
        printf("BUG: Cast succeeded but should have failed!\n");
    }
}
```

**Expected**: `maybeCat` should be `nullptr` since `dog` is not a `Cat`

**Actual (before fix)**: `maybeCat` was non-null (same address as `dog`)

**Root Cause**: The `as` operator just did a bitcast without validating the runtime type.

**Fix**: Modified `generateAs()` in `MatchExpressionGenerator.ts` to:

1. Check if both source and destination are pointers to structs with vtables
2. Load and compare vtables at runtime
3. Return nullptr if vtables don't match, otherwise return the cast pointer

**Security Impact**: This fix prevents memory corruption from invalid downcasts accessing wrong fields.

**Test File**: `examples/bug_119_120_is_as/main.bpl`

---

### BUG-121: sizeof on Floating Point Types Causes LLVM Error

**Status**: ✅ FIXED

**Category**: Codegen

**Description**: Using `sizeof<float>()` or `sizeof<f64>()` now works correctly.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

frame main() {
    printf("sizeof(float) = %lu\n", sizeof<float>());
}
```

**Expected**: Prints "sizeof(float) = 8"

**Resolution**: TypeGenerator.resolveType now correctly maps `float`, `f32`, `f64`, `double` to proper LLVM types (`float` or `double`).

**Test File**: `examples/bug_hunt_session/test_sizeof.bpl`

---

### BUG-122: Empty Enum Accepted

**Status**: ✅ FIXED

**Category**: Enums

**Description**: An enum with zero variants now produces an error.

**Reproduction**:

```bpl
enum Empty {}

frame main() {
    # Cannot create a value of type Empty
    printf("Test\n");
}
```

**Expected**: Compiler error: "Enum must have at least one variant"

**Resolution**: TypeChecker now validates that enums have at least one variant and throws a proper error for empty enums.

**Test File**: `examples/bug_hunt_session/test_empty_enum.bpl`

---

### BUG-123: Spec Extending Itself Accepted

**Status**: ✅ FIXED

**Category**: Specs

**Description**: A spec (interface/trait) that extends itself now produces an error.

**Reproduction**:

```bpl
spec SelfSpec : SelfSpec {
    frame method(this: *SelfSpec);
}

frame main() {
    printf("Test\n");
}
```

**Expected**: Compiler error: "Spec 'SelfSpec' cannot extend itself"

**Resolution**: TypeChecker now detects self-extension in specs and throws a proper error.

**Test File**: `examples/bug_hunt_session/test_spec_self.bpl`

---

### BUG-124: Unary Plus Not Supported

**Status**: ✅ FIXED (By Design)

**Category**: Parser

**Description**: The unary plus operator (`+5`) is intentionally not supported in BPL. It is a no-op in most languages and provides no value.

**Reproduction**:

```bpl
frame main() {
    local x: int = +5;  # Syntax error
}
```

**Resolution**: Unary plus is not supported by design. Use the value directly without the `+` prefix. The syntax error is the expected behavior.

---

### BUG-125: Undefined Types Not Caught at Type-Check Time

**Status**: ✅ FIXED

**Category**: Type System

**Description**: Using an undefined type in a variable declaration or struct field now produces a proper error during type checking.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

# Case 1: Undefined type in variable declaration
frame main() ret int {
    local x: UndefinedType;
    printf("test\n");
    return 0;
}

# Case 2: Undefined type in struct field
struct Wrapper {
    value: UndefinedType
}
```

**Expected**: Compiler error: "Undefined type 'UndefinedType'"

**Resolution**: Added undefined type detection in StatementChecker.checkVariableDecl() to catch undefined types at declaration time.

---

### BUG-126: Type Alias Can Shadow Builtin Types

**Status**: ✅ FIXED

**Category**: Type System

**Description**: Type aliases can no longer redefine primitive type names like `int`, `bool`, `string`, etc.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

type int = string;  # Now produces error!

frame main() ret int {
    local x: int = 42;
    printf("x = %d\n", x);
    return 0;
}
```

**Expected**: Compiler error: "Cannot redefine builtin type 'int'"

**Resolution**: Added BUILTIN_TYPE_NAMES check in TypeChecker.checkTypeAlias() to prevent shadowing primitives.

---

### BUG-127: Pointer Arithmetic on Void Pointer

**Status**: ✅ FIXED

**Category**: Pointers

**Description**: Pointer arithmetic operations (`+`, `-`) on `*void` pointers now produce an error.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local p: *void = nullptr;
    local q: *void = p + 1;  # Now produces error!
    printf("q = %p\n", q);
    return 0;
}
```

**Expected**: Compiler error: "Cannot perform pointer arithmetic on void pointer"

**Resolution**: Added void pointer check in ExpressionChecker.checkBinaryExpression() before pointer arithmetic.

---

### BUG-128: Missing Main Function Not Detected

**Status**: ✅ FIXED

**Category**: Linker

**Description**: When compiling an executable without a `main` function, the error is now detected during type checking.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

frame helper() ret int {
    return 42;
}
# Note: No main function
```

**Expected**: Compiler error: "Entry point function 'main' is not defined"

**Resolution**: Added checkEntryPoint() method in TypeChecker that validates main function existence and signature.

---

### BUG-129: Duplicate Method Signatures in Spec

**Status**: ✅ FIXED

**Category**: Specs

**Description**: A spec (interface/trait) can no longer have multiple methods with the exact same signature.

**Reproduction**:

```bpl
extern printf(fmt: string, ...);

spec Printable {
    frame print(this: *Self);
    frame print(this: *Self);  # Now produces error!
}

struct Point : Printable {
    x: int,
    y: int,

    frame print(this: *Point) {
        printf("(%d, %d)\n", this.x, this.y);
    }
}

frame main() ret int {
    local p: Point = Point { x: 1, y: 2 };
    p.print();
    return 0;
}
```

**Expected**: Compiler error: "Duplicate method 'print' in spec 'Printable'"

**Resolution**: Added duplicate method signature detection with Set-based tracking in TypeChecker.checkSpecBody().

---

### BUG-142: String Interpolation Evaluates Expressions Twice

**Status**: Fixed

**Category**: Strings/Codegen

**Description**: Interpolating side-effecting non-string expressions evaluates each expression twice while converting it to `String`.

**Reproduction**:

```bpl
import [String] from "std/string.bpl";
extern printf(fmt: string, ...) ret int;

frame bump(counter: *int, base: int) ret int {
    *counter = *counter + 1;
    return base + *counter;
}

frame main() ret int {
    local counter: int = 0;
    local message: String = `${bump(&counter, 10)}:${bump(&counter, 20)}`;
    printf("%s %d\n", message.toString(), counter);
    message.destroy();
    return 0;
}
```

**Expected**: `11:22 2`

**Actual**: `12:24 4`

**Evidence**: Generated LLVM contains two `call @bump...` instructions for each interpolation expression.

**Resolution**: Integer primitive intrinsic dispatch now generates receiver expressions only for matching intrinsic methods. Virtual receiver preparation also spills non-addressable rvalues using the already-generated value instead of asking address generation to regenerate the expression.

---

### BUG-143: Escape Analysis Misses Stack Addresses Inside Aggregate Returns

**Status**: Fixed

**Category**: Safety

**Description**: The direct `return &local` check works, but stack addresses can still escape when nested inside a returned struct or tuple literal.

**Reproduction**:

```bpl
struct Holder {
    ptr: *int,
}

frame leak() ret Holder {
    local value: int = 7;
    return Holder { ptr: &value };
}

frame main() ret int {
    local holder: Holder = leak();
    return *holder.ptr;
}
```

Tuple variant:

```bpl
frame leak() ret (*int, int) {
    local value: int = 7;
    return (&value, 1);
}
```

**Expected**: Compile-time escape-analysis error.

**Actual**: Program compiles, runs, and exits with code `7` with no diagnostic output.

**Resolution**: Return checking now recursively scans aggregate return expressions and reports the same stack-address escape diagnostic for nested `&local` values.

---

### BUG-144: Incompatible Pointer Subtraction Is Accepted

**Status**: Fixed

**Category**: Pointers

**Description**: Pointer subtraction accepts pointers with incompatible pointee types.

**Reproduction**:

```bpl
frame main() ret int {
    local int_ptr: *int = nullptr;
    local float_ptr: *float = nullptr;
    local diff: long = int_ptr - float_ptr;
    return 0;
}
```

**Expected**: Compile-time type error, matching the existing incompatible pointer equality behavior.

**Actual**: Program compiles and runs successfully.

**Resolution**: Pointer subtraction now checks pointer operand compatibility before returning the integer difference type.

---

### BUG-145: Incompatible Override Return Types Corrupt VTable Dispatch

**Status**: Fixed

**Category**: Inheritance/VTable

**Description**: A derived method with the same name and receiver shape as a base method can change the return type. The vtable treats it as an override, but callers through the base type still use the base method signature.

**Reproduction**:

```bpl
extern printf(fmt: string, ...) ret int;

struct Base {
    frame value(this: *Base) ret int {
        return 1;
    }
}

struct Child : Base {
    frame value(this: *Child) ret float {
        return 2.5;
    }
}

frame read(base: *Base) ret int {
    return base.value();
}

frame main() ret int {
    local child: Child;
    printf("%d\n", read(&child));
    return 0;
}
```

**Expected**: Compile-time override compatibility error.

**Actual**: Program compiles and prints a garbage integer. The generated `Child_vtable` stores `@Child_value_Child_ptr` with `double` return type in the slot used by a base call emitted as `i32`.

**Resolution**: Struct method checking now validates inherited override signatures for matching non-`this` parameters and rejects incompatible return types before vtable layout/codegen.

---

### BUG-148: Aggregate Addition Lowers To Invalid LLVM

**Status**: Fixed

**Category**: TypeChecker/Codegen

**Description**: Struct and tuple operands with matching types could use `+`
without defining an overload. The type checker treated the operands as
compatible and returned the aggregate type, then code generation emitted invalid
LLVM such as `add %struct.Box ...` or `add { i32, i32 } ...`.

**Reproduction**:

```bpl
struct Box {
    value: int,
}

frame bad() ret Box {
    local lhs: Box = Box { value: 1 };
    local rhs: Box = Box { value: 2 };
    return lhs + rhs;
}
```

**Expected**: Compile-time type error explaining that `+` cannot be applied to
`Box` and `Box` without an overload.

**Actual**: The program compiled and generated verifier-invalid LLVM.

**Resolution**: Arithmetic operator validation now includes `+` alongside `-`,
`*`, and `/`, while preserving pointer arithmetic and explicit operator
overload handling.

---

### BUG-149: Aggregate Arithmetic Guard Rejects Generic and Bool Arithmetic

**Status**: Fixed

**Category**: TypeChecker/Generics

**Description**: The BUG-148 aggregate arithmetic guard correctly rejected
non-overloaded struct and tuple `+`, but it also rejected unresolved generic
parameter arithmetic and canonical `bool` values that had resolved to `i1`.
This broke generic helper bodies and examples that intentionally use `bool` in
integer expressions.

**Reproduction**:

```bpl
frame add<T>(a: T, b: T) ret T {
    return a + b;
}

frame main() ret int {
    local lhs: bool = true;
    local rhs: bool = false;
    return add<int>(10, 20) + lhs + rhs;
}
```

**Expected**: Generic arithmetic bodies remain valid for later instantiation,
and `bool`/`i1` operands continue to participate in numeric arithmetic.

**Actual**: Type checking failed with `Operator '+' cannot be applied to types
'T' and 'T'` or `Operator '+' cannot be applied to types 'i1' and 'i1'`.

**Resolution**: Numeric type detection now recognizes canonical aliases such as
`i1`, and the aggregate arithmetic guard allows unresolved generic parameters
while still rejecting aggregate operands that do not define an operator
overload.

---

### BUG-150: Package Binary Install Can Replace Existing Files

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Installing a package with a `bin` entry rejected existing
directory targets under `bpl_modules/.bin`, but it did not reject regular files
with the same command name. On POSIX systems, the atomic `rename` of the staged
symlink could replace that user-owned file.

**Reproduction**:

```json
{
  "name": "tool-package",
  "version": "1.0.0",
  "main": "index.bpl",
  "bin": {
    "tool": "bin/tool.sh"
  }
}
```

Before installing the package, create `bpl_modules/.bin/tool` as a regular
file.

**Expected**: Installation fails before replacing the file and leaves the file
contents unchanged.

**Actual**: Installation succeeded and replaced the file with a package binary
symlink.

**Resolution**: Package binary link preflight and the atomic link path now only
allow absent targets or existing symlinks. Existing regular files and
directories produce a `CompilerError` and remain untouched.

---

### BUG-151: Package Install Can Replace Existing Files Or Symlinks

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Installing a package moved any existing
`bpl_modules/<package>` path into a temporary backup before replacing it with
the new package directory. If that path was a regular file or symlink, install
could silently remove a user-owned filesystem entry instead of reporting that
the package target was unsafe.

**Reproduction**:

```bash
mkdir -p app/bpl_modules
printf 'user-owned\n' > app/bpl_modules/tool-package
bpl install ../tool-package-1.0.0.tgz
```

The same issue applied when `app/bpl_modules/tool-package` was a symlink.

**Expected**: Installation fails before replacing the target and leaves the
existing file or symlink untouched.

**Actual**: Installation succeeded, replaced the target with a package
directory, and removed the temporary backup.

**Resolution**: Package install target preflight now only allows absent paths
or real directories. Regular files and symlinks produce a `CompilerError`
before staging replacement begins.

---

### BUG-152: Package Uninstall Treats Symlinked Roots As Installed Packages

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Package listing and doctor checks ignored symlinked entries in
`bpl_modules`, but `bpl uninstall <package>` only checked that the path existed.
It could load the manifest through a symlink and then remove the symlink as if
it were an installed package root.

**Reproduction**:

```bash
mkdir -p app/bpl_modules outside-package
printf '{"name":"linked-pkg","version":"1.0.0"}\n' > outside-package/bpl.json
ln -s ../../outside-package app/bpl_modules/linked-pkg
cd app
bpl uninstall linked-pkg
```

**Expected**: Uninstall rejects the symlinked package root and leaves the
symlink and external target untouched.

**Actual**: Uninstall succeeded and removed the symlink.

**Resolution**: Uninstall now checks the package root with `lstat` before
loading its manifest. Missing packages still report "not installed", real
directories continue through the normal uninstall path, and symlinked roots
produce a `CompilerError`.

---

### BUG-153: Package Lock Verification Treats Symlinked Roots As Valid Packages

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Lock verification checked `bpl_modules/<package>` with
`existsSync` and then loaded the manifest and hash through that path. If the
package root itself was a symlink, verification followed the symlink and could
accept the external target as matching the lock entry.

**Reproduction**:

```bash
mkdir -p app/bpl_modules outside-package
printf '{"name":"linked-pkg","version":"1.0.0","main":"index.bpl"}\n' > outside-package/bpl.json
printf 'export stable;\n' > outside-package/index.bpl
ln -s ../../outside-package app/bpl_modules/linked-pkg
cd app
bpl install --locked
```

**Expected**: Locked install rejects the symlinked installed package root and
reports that the package root is invalid.

**Actual**: Lock verification followed the symlink and could succeed when the
target contents matched the lock hash.

**Resolution**: Lock verification now checks installed package roots with
`lstat` before reading manifests or calculating package hashes. Missing
packages still report `missing-package`; symlinked roots and non-directory
roots report `invalid-package-root`, and locked install fails with the lock
verification diagnostic.

---

### BUG-154: Package Lock Verification Treats Symlinked Sources As Reachable

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Package restore and direct install reject symlinked `.tgz`
archive paths before extraction, but lock verification only checked whether the
recorded source path existed. A `bpl.lock` entry whose `source` pointed at a
symlink could pass `bpl install --locked`, even though restoring that same
source would fail later.

**Reproduction**:

```bash
mkdir -p app
printf 'archive placeholder\n' > app/real-source.tgz
ln -s real-source.tgz app/source.tgz
# bpl.lock records "source": "file:source.tgz" for an installed package.
cd app
bpl install --locked
```

**Expected**: Locked verification reports the symlinked source as unreachable
or unsafe, matching restore/install behavior.

**Actual**: Locked verification treated the symlinked source as reachable and
could succeed when the installed package hash matched.

**Resolution**: Lock source reachability now uses `lstat` and requires a real
regular file. Missing sources, directories, and symlinks all produce the
existing `unreachable-source` lock verification issue.

---

### BUG-155: Package Lock Verification Accepts Incomplete Transitive Locks

**Status**: Fixed

**Category**: Package Manager/Reproducibility

**Description**: Lock verification checked that a package manifest's
dependencies existed in `bpl_modules`, but it did not require those transitive
dependencies to have their own entries in `bpl.lock`. A hand-edited or damaged
lockfile could omit an installed transitive dependency and still pass
`bpl install --locked`, weakening CI reproducibility checks.

**Reproduction**:

```bash
bpl install
# Remove the transitive dependency entry from bpl.lock while leaving
# bpl_modules/<transitive-package> installed.
bpl install --locked
```

**Expected**: Locked verification reports that the dependency is installed but
missing from `bpl.lock`.

**Actual**: Locked verification succeeded because the dependency directory
existed.

**Resolution**: `verifyLockFile()` now emits
`missing-transitive-lock-entry` when an installed package manifest declares a
dependency that is present on disk but absent from the lockfile.

---

### BUG-156: Broken Symlink Lockfiles Are Reported As Missing

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: `verifyLockFile()` used `fs.existsSync()` before loading
`bpl.lock`. Because `existsSync()` follows symlinks, a broken symlink at
`bpl.lock` was treated as an absent lockfile. That produced a misleading
`missing-lockfile` verification result and let locked install report the wrong
remediation.

**Reproduction**:

```bash
mkdir app
ln -s ../missing-lock.json app/bpl.lock
cd app
bpl install --locked
```

**Expected**: Locked verification rejects `bpl.lock` as a symbolic link.

**Actual**: Locked verification reported that no `bpl.lock` was found.

**Resolution**: `verifyLockFile()` now uses `lstat` to decide whether the
lockfile path exists before delegating to `loadLockFile()`, preserving the
existing symbolic-link rejection for both valid-target and broken symlinks.

---

### BUG-157: Project Install Ignores Broken Symlink Lockfiles

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Plain `bpl install` used `fs.existsSync()` to decide whether a
project lockfile should be restored before resolving `bpl.json` dependencies.
For a dependency-free project, a broken symlink at `bpl.lock` was treated as no
lockfile at all, so install returned "No dependencies to install" instead of
rejecting the unsafe lockfile path.

**Reproduction**:

```bash
mkdir app
printf '{"name":"app","version":"1.0.0"}\n' > app/bpl.json
ln -s ../missing-lock.json app/bpl.lock
cd app
bpl install
```

**Expected**: Project install rejects `bpl.lock` as a symbolic link.

**Actual**: Project install ignored the broken symlink and reported no
dependencies to install.

**Resolution**: `installProject()` now uses `lstat` before restore or no-op
decisions, matching the stricter lockfile checks used by `loadLockFile()` and
locked verification.

---

### BUG-158: Local Uninstall Removes Packages Before Lockfile Rejection

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Local `bpl uninstall` removed package binaries and package
directories before updating `bpl.lock`. The lock removal helper used
`fs.existsSync()`, so a broken symlink at `bpl.lock` was treated as no lockfile
and uninstall completed after deleting package files.

**Reproduction**:

```bash
bpl install ./example-package-1.0.0.tgz
rm bpl.lock
ln -s ../missing-lock.json bpl.lock
bpl uninstall example-package
```

**Expected**: Local uninstall rejects `bpl.lock` as a symbolic link before
removing package files or binaries.

**Actual**: Uninstall removed the installed package and skipped the broken
symlink lockfile.

**Resolution**: `uninstall()` now preloads and validates an existing local
lockfile before any destructive package or binary removal, then reuses that
validated lock object when removing the package entry.

---

### BUG-159: Dependency Trees Ignore Broken Symlink Lockfiles

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: `getDependencyTree()` used `fs.existsSync()` to decide whether
to load `bpl.lock`. Because `existsSync()` follows symlinks, a broken symlink at
`bpl.lock` was treated as no lockfile. Tree generation then fell back to
manifest dependencies or installed package directories and reported packages as
unlocked instead of rejecting the unsafe lockfile path.

**Reproduction**:

```bash
bpl install ./example-package-1.0.0.tgz
rm bpl.lock
ln -s ../missing-lock.json bpl.lock
bpl list --tree
```

**Expected**: Dependency-tree generation rejects `bpl.lock` as a symbolic link.

**Actual**: Dependency-tree generation ignored the broken symlink and produced
a fallback tree.

**Resolution**: `getDependencyTree()` now uses `lstat` before lockfile loading,
matching `loadLockFile()`, locked verification, install preflight, and
uninstall preflight behavior.

---

### BUG-160: Dependency Trees Follow Symlinked Package Roots

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: Dependency-tree node construction used `fs.existsSync()` to
classify `bpl_modules/<package>` roots. When a package root was a symlink to an
outside directory, the node was treated as installed and `loadManifest()` read
the outside target's manifest through the symlink component.

**Reproduction**:

```bash
mkdir -p bpl_modules
ln -s ../outside-package bpl_modules/example-package
bpl list --tree
```

**Expected**: Dependency-tree generation reports the symlinked package root as
a problem and does not follow the symlink target.

**Actual**: Dependency-tree generation followed the symlink and reported the
outside target as an installed package.

**Resolution**: Dependency-tree node construction now classifies package roots
with `lstat`, reports symlinked and non-directory roots as problems, and only
loads manifests from real package directories.

---

### BUG-161: Package Cache Clean Leaves Broken Provenance Symlinks

**Status**: Fixed

**Category**: Package Manager/Safety

**Description**: `cleanPackageCache()` used `fs.existsSync()` before removing
the provenance sidecar associated with a cached archive. Since `existsSync()`
follows symlinks, a broken symlink sidecar was treated as absent. The cache
archive was deleted, but the dangling `.bplmeta.json` symlink remained.

**Reproduction**:

```bash
bpl package-cache list example
# Replace example-1.0.0.tgz.bplmeta.json with a symlink to a missing path.
bpl package-cache clean example --package-version 1.0.0
```

**Expected**: Cache clean removes both the archive and the symlink sidecar path.

**Actual**: Cache clean removed the archive but left the broken symlink
sidecar.

**Resolution**: `cleanPackageCache()` now uses `lstat` for provenance sidecar
removal, so valid-target symlinks, broken symlinks, malformed directories, and
regular sidecar files are all cleaned without following symlink targets.

---

### BUG-162: Broken Symlink Package Bin Entries Report As Missing

**Status**: Fixed

**Category**: Package Manager/Diagnostics

**Description**: `validatePackageBinFile()` used `fs.existsSync()` before
calling `lstat` on a package `bin` path. Since `existsSync()` follows symlinks,
a broken symlink `bin` entry was reported as a missing file even though
symlinked `bin` entries are unsupported whether their targets exist or not.

**Reproduction**:

```bash
mkdir -p bin
ln -s ../missing-tool.sh bin/tool.sh
bpl pack
```

**Expected**: Pack rejects `bin/tool.sh` as an unsupported symlink bin entry.

**Actual**: Pack reported `bin/tool.sh` as missing.

**Resolution**: `validatePackageBinFile()` now uses `lstat` before deciding
whether a `bin` path is missing, preserving the same symlink rejection for
valid-target and broken symlink entries.

---

### BUG-163: Broken Symlink Entry Modules Report As Missing

**Status**: Fixed

**Category**: Module Resolver/Diagnostics

**Description**: Module entry paths are normalized before loading. Valid
symlink entries are normalized to their real file path, but broken symlinks
cannot be resolved with `realpath`. The readable-file preflight then used
`fs.existsSync()`, so a broken symlink entry was reported as a missing module
instead of as a symbolic-link path.

**Reproduction**:

```bash
ln -s missing-main.bpl linked-main.bpl
bpl check linked-main.bpl
```

**Expected**: Module resolution reports that the entry path is a symbolic link.

**Actual**: Module resolution reported that the module file was missing.

**Resolution**: `assertReadableModuleFile()` now uses `lstat` before
missing-file classification. Valid symlink entries still normalize to their
real file path before this preflight runs, while broken symlink entries keep the
original path and get a symbolic-link diagnostic.

---

### BUG-217: macOS Runtime Support Builds Only for the Shell Architecture

**Status**: Fixed

**Category**: Runtime Build/macOS

**Description**: `lib/build_runtime.sh` compiled `runtime_support.o` only for
the architecture reported by the shell process. Under Rosetta, the shell can be
x86_64 while Bun and the BPL compiler target arm64, causing native links to
reject the runtime support object.

**Expected**: A macOS runtime build links with both x86_64 and arm64 BPL
programs.

**Actual**: Programs targeting the architecture different from the shell failed
to link with an incompatible runtime support object.

**Resolution**: macOS runtime builds now compile x86_64 and arm64 objects and
combine them with `lipo`. Linux keeps the existing native single-architecture
build.

---

### BUG-218: macOS Tests Mix `/var` and `/private/var` Temporary Paths

**Status**: Fixed

**Category**: Tests/macOS

**Description**: macOS exposes `/var` as a symlink to `/private/var`.
Temporary test fixtures were created from the non-canonical `/var` alias while
compiler safety code correctly returned canonical `/private/var` paths, causing
path equality assertions to fail.

**Expected**: Tests compare a consistent temporary-path representation without
weakening production path canonicalization.

**Actual**: Tests compared `/var/...` fixture paths against canonical
`/private/var/...` compiler results.

**Resolution**: The Bun test preload canonicalizes temporary-directory
environment variables on macOS before test files load. Linux is unchanged.

---

### BUG-219: Cached macOS Module Builds Mix Architectures

**Status**: Fixed

**Category**: Runtime Cache/macOS

**Description**: Cached module compilation left its target undefined while
runtime-object injection resolved Bun's explicit host target. Under Rosetta,
the default `clang` invocation could produce x86_64 module objects while the
runtime cache produced arm64 objects.

**Expected**: Unqualified native builds always link runtime code matching the
architecture selected by the active compiler.

**Actual**: Cached module builds could fail with an incompatible architecture
warning and undefined BPL runtime symbols.

**Resolution**: Module compilation now resolves the same explicit host target
used by runtime-object injection. Linux keeps its existing native target
behavior.

---

### BUG-220: Test Command Shims Require `node` Through `PATH`

**Status**: Fixed

**Category**: Tests/Portability

**Description**: Non-Windows command shims used `#!/usr/bin/env node`, even
though the test suite runs with Bun. Tests that intentionally replaced `PATH`
could make otherwise valid shims unavailable.

**Expected**: Test command shims execute with the runtime running the tests.

**Actual**: Shim probes failed when `node` was unavailable through the modified
`PATH`.

**Resolution**: Non-Windows command shims now use `process.execPath` in their
shebang. This works with Bun on both Linux and macOS.

---

### BUG-221: Bare Wasm Linker Probes Depend on Runtime PATH Resolution

**Status**: Fixed

**Category**: WebAssembly Tooling/Portability

**Description**: Wasm linker probes passed bare candidate names directly to
`spawnSync`. Some Bun/macOS environments did not resolve recently modified
`PATH` entries for those calls.

**Expected**: Bare linker names such as `wasm-ld` resolve consistently through
`PATH`.

**Actual**: Valid linker candidates were treated as unavailable.

**Resolution**: Wasm linker probes now resolve executable candidates
explicitly before spawning them. Absolute paths and Linux behavior remain
supported.

---

### BUG-222: Playground Native Builds Mix Architectures Under Rosetta

**Status**: Fixed

**Category**: Playground Runtime/macOS

**Description**: Playground code generation, cached runtime IR compilation,
and the final clang link did not share an explicit host target. Under Rosetta,
they could produce incompatible arm64 and x86_64 objects.

**Resolution**: All three playground native-build stages now use the same
explicit host target. Linux keeps its explicit native host target.

---

### BUG-223: Release Smoke Inherits User npm State and Requires Optional Wasm

**Status**: Fixed

**Category**: Release Smoke/Portability

**Description**: Release smoke inherited the user's npm cache and always
required a wasm-capable compiler backend, causing unrelated local environment
state or an optional toolchain capability to fail the packed CLI smoke test.

**Resolution**: Packed npm smoke uses a temporary isolated npm cache. An
unavailable wasm compiler target is skipped unless `BPL_REQUIRE_WASM_LD=1`
makes wasm toolchain coverage mandatory.

---

### BUG-224: Cross-Platform Tests Assume Linux, x86, and GNU tar

**Status**: Fixed

**Category**: Tests/Portability

**Description**: The full suite ran x86 inline assembly, Linux mmap allocator
examples, GNU-tar-only archive construction, and Linux-specific output
expectations on macOS.

**Resolution**: Platform-specific examples and GNU-tar fixtures are
capability-gated. Portable output assertions remain active on every platform,
and Linux retains the full Linux/x86/GNU coverage.

---

### BUG-225: Runtime Diagnostics Depend on glibc `stderr` ABI

**Status**: Fixed

**Category**: Runtime Diagnostics/Portability

**Description**: Generated LLVM IR declared and loaded glibc's private
`stderr` global directly, which fails to link against macOS libc.

**Resolution**: Generated IR calls `__bpl_write_stderr`, implemented by the C
runtime support layer using the host libc's public `stderr` interface.

---

## Audit findings — 2026-09-08

Source revision: `23e88536`. See [the audit report](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md) for complete reproductions, validation scope, and repair priorities. Original observations are retained below; each entry records its current status and resolution.

### BUG-226: Switch fallthrough skips deferred cleanup

**Status**: Fixed

**Priority**: P1

**Source**: `compiler/backend/codegen/StatementGenerator.ts:2514`

**Observed**: Expected `one → cleanup → two → end`; actual `one → two → end`. No cleanup message is printed, even at function exit. LANGUAGE_SPEC.md:293 explicitly includes fallthrough among scope exits that execute defer.

**Cause**: generateFallthrough emits a branch without unwinding the case scope. The normal block cleanup is bypassed by the terminator.

**Suggested resolution**: Emit cleanup for every scope exited by fallthrough before branching. Share scope-exit lowering with break, continue, return, and match yields; preserve LIFO order.

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-226).

**Resolution (2026-09-08)**: Fallthrough now emits LIFO cleanup for the exited case scopes through a shared scope-exit helper. Numeric/string switch regression and existing defer suite: 14 tests passed; bun run check passed.

### BUG-227: Returning a match-arm value skips deferred cleanup

**Status**: Fixed

**Priority**: P1

**Source**: `compiler/backend/codegen/StatementGenerator.ts:2138`

**Observed**: Expected `cleanup` before `value=1`; actual output is only `value=1`. The arm return correctly yields to the match expression, but never executes the arm cleanup.

**Cause**: The !isMatchYield guard encloses all deferred cleanup. A match yield then branches directly to the merge block.

**Suggested resolution**: Track the scope depth at match entry and unwind the scopes exited by a yield. Keep enclosing function cleanup pending.

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-227).

**Resolution (2026-09-08)**: Match contexts now record retained scope depth. Yields clean only exited scopes and exclude a moved result from destruction. Nested primitive, enum, string, tuple, and resource-yield tests pass at O0/O3 with LLVM verification; 15 cleanup tests and typecheck passed.

### BUG-228: A return in one branch suppresses destruction in another branch

**Status**: Fixed

**Priority**: P1

**Source**: `compiler/backend/codegen/StatementGenerator.ts:2141`

**Observed**: choose(false) returns resource 2 but fails to destroy resource 1. Expected `destroy 1 → chosen 2 → destroy 2`; actual `chosen 2 → destroy 2`. The reproduction uses logging destructors, with no resource allocation.

**Cause**: Generating the earlier return a inserts a into movedAutoDestroyAddresses, a mutable set shared across the rest of function generation. generateAutoDestroy at line 1497 consults that set on the later return b path, even though the earlier branch did not execute.

**Suggested resolution**: Make the return-value cleanup exclusion local to each emitted exit, or introduce control-flow-aware move state with explicit branch merges. Test both flag values and nested branches.

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-228).

**Resolution (2026-09-08)**: Removed function-wide moved-address state. Each return now passes its own cleanup exclusion into the shared exit helper. Both conditional return paths and nested branches pass at O0/O3 with LLVM verification; 33 tests and typecheck passed.

### BUG-229: Default Map equality silently rejects supported-looking key types

**Status**: Fixed

**Priority**: P1

**Source**: `lib/map.bpl:127`

**Observed**: After set(true, 1), has(true) is false. Setting true again increments count to 2 instead of updating the existing entry. The generic constructor accepts Map<bool, int> without a diagnostic.

**Cause**: _mapDefaultEq falls through to false for bool, while _mapDefaultHash falls through to zero. Other types absent from the dispatch also lack defaults, but runtime validation here specifically covered bool.

**Suggested resolution**: Define an explicit default-key capability, supply correct hash/equality for permitted keys, and reject unsupported default constructors at compile time. Keep the custom hasher/equaler overload available.

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-229).

**Resolution (2026-09-08)**: Default equality now supports boolean/narrow integer and equality-comparable compound keys. Numeric hashes cover all integer widths and f32/f64; signed zeros and NaNs have documented map equivalence. Compound-key fallback uses a correct constant hash with custom hashing documented for performance. Reflection now uses shared primitive metadata, fixing f32 aggregate comparisons exposed by Map. Five map/numeric runtime tests and typecheck passed.

### BUG-230: NaN inequality disagrees with negated equality

**Status**: Fixed

**Priority**: P2

**Source**: `compiler/backend/codegen/BinaryExpressionGenerator.ts:1009`

**Observed**: For n = nan(""), printing n == n, n != n, !(n == n) produces `0 0 1`; expected ordinary floating-point inequality is `0 1 1`. This also breaks the familiar x != x NaN check.

**Cause**: Scalar != uses fcmp one, which requires both operands to be ordered. fcmp une includes unordered operands and is the complement of ordered equality.

**Suggested resolution**: Use fcmp une for scalar floating-point != and lock down NaN behavior for scalar and aggregate comparisons. See [LLVM fcmp semantics](https://llvm.org/docs/LangRef.html#fcmp-instruction).

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-230).

**Resolution (2026-09-08)**: Scalar floating-point inequality now uses fcmp une. Scalar/aggregate NaN and finite comparison regressions pass at O0/O3 with LLVM verification; 3 tests and typecheck passed.

### BUG-231: Floating-point unary minus loses negative zero

**Status**: Fixed

**Priority**: P2

**Source**: `compiler/backend/codegen/UnaryExpressionGenerator.ts:149`

**Observed**: With z = 0.0, copysign(1.0, -z) prints `1.0`, whereas sign-changing negation should produce `-1.0`.

**Cause**: Negation is emitted as fsub double 0.0, value. Subtracting positive zero from positive zero does not implement sign-bit negation.

**Suggested resolution**: Use LLVM fneg for floating-point negation. It flips the sign bit and preserves the remaining representation. See [LLVM fneg semantics](https://llvm.org/docs/LangRef.html#fneg-instruction).

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-231).

**Resolution (2026-09-08)**: Floating negation now emits fneg for both LLVM float widths. Signed-zero and finite negation regressions pass at O0/O3. Removed an obsolete codegen test assertion requiring the function-wide move state eliminated by BUG-228. All 90 selected numeric/codegen tests and typecheck passed.

### BUG-232: f32 is recognized as a type but rejected as numeric

**Status**: Fixed

**Priority**: P2

**Source**: `compiler/middleend/TypeUtils.ts:108`

**Observed**: A function returning -x for an f32 parameter is rejected with BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH. A separate check of cast<f32>(1.5) fails with BPL_CAST_INVALID. docs/06-operators.md lists f32 and f64 among supported arithmetic types.

**Cause**: TypeUtils.isNumericType and NUMERIC_TYPES omit f32/f64, while TypeGenerator.ts:61 maps them to LLVM floating-point types and TypeCheckerBase.ts reserves them as builtins. Fixing the frontend alone is insufficient: the unary emitter also only special-cases double.

**Suggested resolution**: Centralize builtin type definitions: category, width, signedness, canonical aliases, conversion rules, LLVM type, and debug metadata. Exercise all documented numeric spellings through arithmetic and conversions. Runtime reproduction here covers f32; f64 omission is source evidence.

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-232).

**Resolution (2026-09-08)**: Added a shared primitive-type registry used by builtin registration, numeric checking, aliases, integer conversion eligibility, LLVM lowering, signedness, and DWARF metadata. Implemented f32/f64 conversions and clarified widths in the spec/type guide. Numeric and compiler selection: 282 tests passed; typecheck passed.

### BUG-233: JSON Unicode escapes are silently decoded incorrectly

**Status**: Fixed

**Priority**: P2

**Source**: `lib/json.bpl:144`

**Observed**: Parsing the valid JSON string "\u0041" returns `u0041` rather than `A`, without reporting an error.

**Cause**: parseString handles short escapes but has no Unicode escape branch. The fallback copies the escape letter and subsequently treats the hexadecimal digits as ordinary text.

**Suggested resolution**: Decode four-digit Unicode escapes, combine valid surrogate pairs, and encode the resulting code points consistently with the string representation. Reject invalid escapes instead of silently changing text. See [RFC 8259 section 7](https://www.rfc-editor.org/rfc/rfc8259#section-7).

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-233).

**Resolution (2026-09-08)**: JSON strings now decode Unicode escapes and surrogate pairs through UTF8.encodeCodepoint. Invalid escapes, malformed surrogates, and raw controls report errors; U+0000 is explicitly rejected because primitive strings are null-terminated. Parser callers propagate failed key decoding. Valid/invalid Unicode regressions passed at O0/O3; typecheck passed; behavior documented.

### BUG-234: README advertises local type inference that the compiler forbids

**Status**: Fixed

**Priority**: P2

**Source**: `compiler/middleend/StatementChecker.ts:855`

**Observed**: local x = 1 is rejected with BPL_VARIABLE_TYPE_ANNOTATION_MISSING. README.md:38 advertises type inference, and AGENTS.MD contains unannotated local examples.

**Cause**: The statement checker explicitly enforces annotations. This appears to be an intentional implementation rule, so the confirmed defect is the conflicting documentation.

**Suggested resolution**: Choose and publish one contract. Either remove the unsupported inference claim and repair examples, or implement local initializer-based inference. Compile documented snippets in CI, including deliberately invalid examples with expected diagnostics.

**Validation**: Reproduced using source CLI at both `-O0` and `-O3`. [Full reproduction](https://github.com/pr0h0/bpl3/blob/8e04706b25bb14dc4a4dc80cc836235d75835732/docs/audits/2026-09-08.md#bug-234).

**Resolution (2026-09-08)**: Kept the existing explicit-local-type language contract; corrected README/AGENTS/type-guide claims and examples, including float widths and runtime safety/overhead wording. Added executable README and typed-generic examples plus the expected missing-type diagnostic. Both new doc tests and typecheck pass. Existing MarkdownDocs has 94 passing tests and one Git-tracked-link check blocked because the new audit report cannot be staged in this read-only .git session.

### BUG-235: Map bucket storage never scales with entry count

**Status**: Fixed

**Priority**: P2

**Category**: Standard library / Performance

**Source**: `lib/map.bpl:171`, `lib/map.bpl:207`.

**Evidence**: Default construction creates 16 buckets; insertion adds nodes to linked chains without load-factor tracking, growth, or rehash. No later growth path exists in Map. The fixed bucket count makes chain length grow with entry count and invalidates the unconditional O(1) description. This is source-confirmed algorithmic analysis, not a measured slowdown.

**Suggested resolution**: Add load-factor-based growth, rehashing, reserve, and size-sensitive benchmarks; document iterator/reference invalidation.

**Resolution (2026-09-08)**: Map insertion now maintains a maximum 3/4 load factor; reserve() rehashes existing nodes and bucketCount() exposes capacity. Value-preservation, update, collision, removal, and clear tests pass at O0/O3. Added map_scaling.bpl: 1k/10k/100k entries grew to 2048/16384/262144 buckets with all hit/miss checks correct. Typecheck passed; iterator and callback contracts documented.

### BUG-236: Cleanup refactor uses an API outside the extension's library target

**Status**: Fixed

**Priority**: P2

**Source**: `compiler/backend/codegen/StatementGenerator.ts`

**Observed**: The audit cleanup refactor passed the root ESNext typecheck but failed the extension's ES2022 typecheck because `Array.findLastIndex` is unavailable in that target.

**Resolution (2026-09-09)**: Scope lookup now uses a shared reverse-loop helper. Compiler typecheck, all three audit cleanup regressions, and all 236 extension tests pass.

### BUG-237: C variadic calls do not promote f32 arguments to double

**Status**: Fixed

**Priority**: P2

**Source**: `compiler/backend/codegen/CallExpressionGenerator.ts`

**Observed**: Passing `f32` values 1.5, -2.25, and 3.5 directly to `printf` produced `0.00 0.00 0.00` on the local native target. Integer argument promotions existed, but the C default promotion from float to double was missing.

**Resolution (2026-09-09)**: Extern variadic arguments now extend LLVM `float` to `double`. Fixed parameters retain their declared widths. The runtime regression also calls `fabsf` with a fixed f32 parameter; it passes at O0/O3 with LLVM verification. All 99 selected numeric, TypeUtils, and codegen tests, compiler typecheck, and ESLint pass.

### BUG-238: Audit cross-reference anchors fail documentation validation

**Status**: Fixed

**Priority**: P3

**Source**: `docs/audits/2026-09-08.md`

**Observed**: Once the audit report was tracked, nine cross-references from BUGS.md failed the Markdown validator. The report used explicit HTML anchors, while the validator recognizes heading-generated anchors only.

**Resolution (2026-09-09)**: Findings now use short BUG-number headings that generate the same stable anchors; descriptions remain directly below each heading. All 95 Markdown documentation tests pass without changing the validator.

### BUG-239: Early exits from try leave an exception handler active

**Status**: Fixed

**Priority**: P1

**Observed**: Breaking out of a loop from its inner try block, then throwing in an enclosing try, invokes the exited inner catch instead of the enclosing catch at both O0 and O3.

**Cause**: `ExceptionGenerator.generateTry` restores `exception_top` only on normal fallthrough and exception entry. Scope-exit cleanup does not restore handlers on break, continue, return, or match yield.

**Resolution (2026-09-09)**: Try scopes now carry the previous exception frame, restored by shared scope cleanup after deferred work on normal and early exits. Three new O0/O3 regressions cover break, continue, function return, match yield, retained outer scopes, and throwing deferred cleanup. Existing cleanup/defer/runtime-failure coverage, typecheck, and lint pass.

**Validation follow-up (2026-09-09)**: Broader codegen tests caught the lost empty-cleanup fast path. The guard now skips scopes with neither defers nor an exception frame, retaining required handler restoration. All 102 selected codegen, cleanup, exception, and working-directory tests pass.

### BUG-240: Fractional f32 match patterns emit invalid LLVM constants

**Status**: Fixed

**Priority**: P2

**Observed**: Matching `cast<f32>(0.1)` against `0.1` emits `fcmp oeq float ..., 0.1`, rejected by clang at O0/O3 as a floating-point constant invalid for its type.

**Cause**: Match literal generation emits the original decimal without converting it to the matched floating-point width.

**Resolution (2026-09-09)**: A shared LLVM literal formatter rounds f32 constants and encodes them at the required precision for scalar, tuple, and enum patterns. It also preserves valid exponent notation when JavaScript stringifies very small or large decimal literals (the old formatter appended `.0` after the exponent). Both defects were reproduced before the fix; the new runtime regressions pass at O0/O3 with LLVM verification.

### BUG-241: JSON.parse accepts trailing non-whitespace input

**Status**: Fixed

**Priority**: P2

**Observed**: `JSON.parse<int>("1 false")` succeeds at O0/O3 and ignores the trailing value.

**Cause**: The root parser does not require complete consumption after parsing one value.

**Resolution (2026-09-09)**: The root parser skips trailing JSON whitespace and rejects any remaining input through its existing partial-allocation cleanup path. O0/O3 tests cover numbers, booleans, strings, objects, and nested fixed arrays, with adjacent garbage, extra values, and valid whitespace.

### BUG-242: JSON custom-parser fallback invokes the same hook again

**Status**: Fixed

**Priority**: P1

**Observed**: A `fromJson` hook returning `JsonParseResult.Default` is invoked twice when a guard stops further recursion; the field value remains zero instead of the input's 42 at O0/O3. Without the guard, fallback repeatedly invokes the same hook.

**Cause**: The Default branch calls `JSON.parseAny` on the same type, which rediscovers and invokes `fromJson` rather than entering the default parser.

**Resolution (2026-09-09)**: Default fallback now enters a separate built-in parser dispatcher. Nested fields still invoke their own hooks. Three new O0/O3 regressions verify bounded hook counts, parsed values, nested error propagation, and unchanged Success/Ignore behavior; the complete six-test JSON audit set passes.

### BUG-243: Clean loses symlinked working-directory validation on Bun 1.4.2

**Status**: Fixed

**Priority**: P1

**Observed**: GitHub Actions run 34345008118 failed three clean-command regressions on Ubuntu with Bun 1.4.2. The adjacent check/lint no-input test passed. Reproduced locally with the same Bun version: clean returned success for a symlinked parent directory.

**Cause**: Bun 1.4.2 canonicalizes `process.cwd()`, while Bun 1.3.14 preserves the logical path supplied by `--cwd`. Checking only the canonical path misses the symlink.

**Resolution (2026-09-09)**: Clean additionally validates logical paths from shell `PWD` and runtime `--cwd` arguments when they resolve to the actual current directory. Stale, missing, and relative inherited PWD values are ignored. Regression coverage checks shell paths, absolute/relative runtime paths, and the equals form without weakening the existing JSON or exit-code assertions.

### BUG-244: Forwarding generic pointer types can add an extra pointer level

**Status**: Fixed

**Priority**: P2

**Observed**: A generic wrapper that stores `JSON.parse<T>` in `*T` and calls `JSON.free<T>` on it fails type checking with `expected **T, got *T`, even when instantiated with `int`.

**Resolution (2026-09-09)**: Calls whose callee is an explicit generic instantiation now use its already-substituted signature. A runtime regression covers JSON wrappers and pointer-valued generic arguments at O0/O3 with LLVM verification; 262 selected checker/codegen tests, typecheck, and lint pass.

### BUG-245: JSON.parse cannot instantiate a fixed-array root type

**Status**: Fixed

**Priority**: P2

**Observed**: `JSON.parse<int[2]>` fails compilation with an unsupported cast from `i8*` to `[2 x i32*]`. Generic substitution flattens the pointer and array modifiers rather than representing a pointer to the whole array. Fixed arrays inside a struct work and provide a workaround.

**Resolution (2026-09-09)**: Substitution now preserves the existing pointer-to-array marker when a pointer-qualified type parameter is replaced with a fixed array. The JSON root regression verifies parsing, element access, and freeing at O0/O3 with LLVM verification. All 19 selected array, generic, and type-utility tests pass.

### BUG-246: JSON mistakes unrelated Array-prefixed structs for dynamic arrays

**Status**: Fixed

**Priority**: P2

**Observed**: A normal `ArrayRecord { values: int[2] }` is rejected when parsing its JSON object. The serializer, parser, and cleanup identify dynamic arrays using only the first five characters of the reflected type name.

**Resolution (2026-09-09)**: A shared predicate checks the reflected array name boundary and required data/length/capacity field types before choosing array serialization, parsing, or cleanup. O0/O3 regressions round-trip ArrayRecord, Array_Record, and the actual standard-library Array<int>, including freeing allocated strings and array storage.

### BUG-247: Reflecting Array methods emits unresolved generic types

**Status**: Fixed

**Priority**: P2

**Observed**: A minimal program inspecting `typeof<Array<int>>()` emits an `Array_U` vtable whose signatures contain unresolved `%struct.U`, rejected by clang. Reproduced before and after the generic forwarding fix. Reflection currently attempts to expose methods whose own type parameters have not been instantiated.

**Resolution (2026-09-09)**: Reflection uses the concrete struct declaration, skips methods with unbound method-level parameters, and emits raw function-pointer signatures without a closure context. The regression obtains and calls Array<int>.len through MethodInfo at O0/O3 with LLVM verification, and all five existing reflection examples pass.

### BUG-248: f32 compound assignments emit integer LLVM instructions

**Status**: Fixed

**Priority**: P2

**Observed**: `f32` addition and multiplication assignments emit `add float` and fail clang compilation at O0/O3. Compound assignment recognizes only LLVM double as floating point.

**Resolution (2026-09-10)**: Compound assignment recognizes both LLVM floating widths. O0/O3 regressions cover all five arithmetic assignments, f32 array elements, and single evaluation of an index expression. All five selected numeric tests and typecheck pass.

### BUG-249: Integer compound division ignores unsignedness and runtime checks

**Status**: Fixed

**Priority**: P1

**Observed**: Starting with u32 value 4000000000, `/= 3` produces 4196644864 instead of 1333333333, and `%= 3` produces 0 instead of 1 at O0/O3. The compound path unconditionally selects signed division/remainder and bypasses the ordinary division checks.

**Resolution (2026-09-10)**: Compound assignments reuse ordinary binary arithmetic after evaluating their address and operands once. Signedness, zero-divisor checks, and signed overflow checks now agree with binary expressions; narrowing remains visible to constant-divisor analysis. O0/O3 tests cover u32/u64 and signed results, both failure operators, and a divisor narrowed to zero. Typecheck and lint pass.

**Validation follow-up (2026-09-10)**: Two existing codegen performance checks located the shared helper by its former private modifier. Their lookup now identifies the method independently of visibility, retaining all checks on lazy type resolution, signedness classification, and emitted instructions.

### BUG-250: Unmatched typed catches swallow exceptions

**Status**: Fixed

**Priority**: P1

**Observed**: An int thrown inside a try with only a bool catch falls through instead of reaching an enclosing int catch at O0/O3. The final unsuccessful catch check branches to the end of the try statement.

**Resolution (2026-09-10)**: Failed typed-catch dispatch reuses exception transfer to reach the next handler without overwriting the payload. Regressions cover multiple nonmatching clauses, function boundaries, deferred cleanup, an outer catch-all, floating payload forwarding, and explicit failure without a handler. All ten selected exception/cleanup/runtime-failure tests, typecheck, and lint pass.

### BUG-251: Floating-point exception payloads lose precision

**Status**: Fixed

**Priority**: P1

**Observed**: Throwing float 1.75 and f32 -2.25 produces caught values 1.0 and -2.0 at O0/O3. Payload transport numerically converts floating-point values to i64 and back instead of preserving their bits.

**Resolution (2026-09-10)**: Floating throws and catches now bitcast their payloads through the i64 transport slot, zero-extending f32 bits. O0/O3 regression coverage preserves fractions, large finite values, NaNs, infinities, and negative zero for both widths; all four selected exception tests pass.

### BUG-252: Documented bitwise compound assignments fail code generation

**Status**: Fixed

**Priority**: P2

**Observed**: `flags &= 3` parses and typechecks but fails code generation with an unsupported compound-assignment error. The same missing dispatch affects `|=` and `^=`. The operator guide also advertises shift-assignment tokens absent from the grammar.

**Resolution (2026-09-10)**: The shared compound-to-binary dispatch now includes integer AND/OR/XOR. Non-integer operands receive the existing bitwise diagnostic during type checking. Runtime regressions cover narrow/signed values and single evaluation of array indexes; the guide no longer advertises unsupported shift-assignment tokens. All 12 selected tests, typecheck, lint, and documentation checks pass.

### BUG-253: Playground accepts cross-origin native execution on the host

**Status**: Fixed

**Priority**: P1

**Observed**: The playground executes submitted native code with the web server's access and sends wildcard CORS headers. A website can submit code to a developer's local playground; loopback binding alone also permits DNS rebinding attacks.

**Resolution (2026-09-10)**: Docker is the default runner. Explicit host mode binds only to loopback, rejects non-local Host headers and foreign/null Origin headers, and returns same-origin CORS headers. HTTP regressions exercise both rejected requests and valid local formatting. Docker workers receive neither host filesystem mounts nor host environment variables.

### BUG-254: Tutorial requests target localhost instead of the deployed playground

**Status**: Fixed

**Priority**: P2

**Observed**: Tutorial loading and code execution use hard-coded `http://localhost:3001` URLs. Custom ports target the wrong service, remote visitors target their own machines, and explicit host mode correctly rejects the resulting foreign-origin requests.

**Resolution (2026-09-10)**: Tutorials now use same-origin API paths for served pages, matching the main playground. A browser-script regression executes tutorial loading and the Run handler at both a custom local port and a remote HTTPS origin.

### BUG-255: A controller crash can leave unstarted playground containers behind

**Status**: Fixed

**Priority**: P2

**Observed**: The controller creates a container before attaching and starting it. A crash between these operations leaves a stopped container: neither its watchdog nor Docker's remove-on-exit behavior has run. Cleanup failures also permanently disable a live controller while its health endpoint still reports success.

**Resolution (2026-09-10)**: Added labelled expiry leases, startup/periodic orphan cleanup, retryable failed cleanup, and readiness reporting. Recovery never removes unexpired jobs belonging to other controllers. Nine runner tests and eleven real Docker tests pass, including actual memory, process, and tmpfs exhaustion; typecheck passes. Docker transport outages are injected in tests without restarting the shared host daemon.

### BUG-256: Abandoned playground requests continue occupying execution slots

**Status**: Fixed

**Priority**: P2

**Observed**: HTTP request cancellation is not passed to the runner or subprocesses, so disconnecting clients leave work running until its timeout. A single client can also occupy both Docker slots, and the UI has no Stop action.

**Resolution (2026-09-10)**: Added cancellation through HTTP, Docker and host subprocess execution, plus per-address admission limits and browser Stop controls. Docker creation completes before cancellation cleanup to avoid leaving a late-created container behind.

### BUG-257: Subprocess output corrupts UTF-8 split across chunks

**Status**: Fixed

**Priority**: P2

**Observed**: Each stdout/stderr Buffer was decoded independently, replacing partial multibyte characters split between stream events.

**Resolution (2026-09-10)**: Streams now use incremental UTF-8 decoding. A subprocess regression deliberately splits a euro sign across writes and verifies exact output.

### BUG-258: Auto-format can race the subsequent Run request

**Status**: Fixed

**Priority**: P2

**Observed**: Run triggers formatting and waits a fixed 100 ms before reading the editor. Slower formatting can change the editor after compilation has already started and conflicts with one-active-job admission.

**Resolution (2026-09-10)**: Run now awaits formatting completion before submitting compilation, sharing the cancellation signal across both phases.

### BUG-259: Browser Wasm execution can freeze the playground UI

**Status**: Fixed

**Priority**: P2

**Observed**: Wasm exports execute on the browser main thread. Infinite loops prevent the UI from processing Stop or any other interaction, and captured output grows without a bound.

**Resolution (2026-09-10)**: Moved execution into a disposable Web Worker with termination on Stop, a five-second timeout, and a 1 MiB output budget.

### BUG-260: Readiness ignores a missing pinned Docker worker image

**Status**: Fixed

**Priority**: P2

**Observed**: Rebuilding the local worker tag on a containerd-backed Docker installation can remove the previous unreferenced image ID. A running controller still pins that ID and fails jobs, while Docker listing succeeds and health remains ready.

**Resolution (2026-09-10)**: Periodic recovery now also verifies the pinned image. Missing images make health unavailable without silently switching compiler versions. Restart the controller after rebuilding as documented. A regression checks readiness and the exact image ID probed.

### BUG-261: Process timeout regression assumes Bun starts within 50 ms

**Status**: Fixed

**Priority**: P2

**Observed**: During the full CI-safe unit suite, surrounding subprocess startups took 57–94 ms. The timeout test killed its child at 50 ms before its first write, then incorrectly failed the partial-output assertion.

**Resolution (2026-09-10)**: Give startup a one-second margin and keep the child alive with an interval. The test still requires timeout termination and exact captured stdout/stderr, without assuming a 50 ms Bun startup.

### BUG-262: Tutorial editor references an undefined Monarch symbols attribute

**Status**: Fixed

**Priority**: P2

**Observed**: The real-browser tutorial smoke test raises a Monaco exception because the language definition references `@symbols` without defining it.

**Resolution (2026-09-10)**: Added the operator-symbol expression required by the tutorial tokenizer, with regression coverage alongside the tutorial script tests.

### BUG-263: Queue destruction leaves stale element counts and indices

**Status**: Fixed

**Priority**: P2

**Observed**: Destroying a nonempty queue frees its storage but preserves its count, head, and tail. It still reports nonempty and subsequent access or reuse fails. Negative initial capacities also pass invalid sizes to the backing array.

**Resolution (2026-09-10)**: Reset queue state on destruction and normalize negative initial capacity to zero. Regression coverage checks wrapped growth, draining, repeated destruction, clear, reuse, and non-positive capacities at O0/O3 with LLVM verification.

### BUG-264: Empty encoding results violate their documented ownership contract

**Status**: Fixed

**Priority**: P2

**Observed**: Hex and Base64 string helpers promise caller-owned allocations but return string literals for empty or null input. Following the contract and freeing those results aborts the process with an invalid free.

**Resolution (2026-09-10)**: Empty results now use allocated, NUL-terminated buffers. Regression coverage frees empty, null-input, and nonempty results at O0/O3. Corrected the API reference to name the existing `decodeToString` methods.

### BUG-265: Hexadecimal e/E digits cause floating-point literal classification

**Status**: Fixed

**Priority**: P1

**Observed**: The literal checker treats any spelling containing e/E as floating point, including hexadecimal digits. `cast<u64>(0xfedcba9876543210)` consequently loses low bits through a double conversion, producing bytes ending in `3000` instead of `3210`. Smaller hexadecimal literals also receive the wrong type and arithmetic semantics.

**Resolution (2026-09-10)**: Exclude hexadecimal prefixes from floating-point spelling detection. Regression coverage checks lower/upper-case hex, integer division, inferred width, and both halves of a 64-bit value at O0/O3 with LLVM verification. Binary reader/writer golden-byte tests independently cover this case.

### BUG-266: Standard-library guides describe nonexistent APIs and incorrect ownership

**Status**: Fixed

**Priority**: P2

**Observed**: Guides advertise nonexistent String/FS methods, describe substring's length as an end index, claim automatic String cleanup, misname BitSet/Env/Date operations, and omit unimplemented threading/synchronization/iterator modules.

**Resolution (2026-09-11)**: Corrected the standard-library chapters and added a parsed declaration reference for every library module, with a drift regression. Documented ownership, platform assumptions, incomplete error handling, and stub modules.

### BUG-267: Rand fractions and distributions violate their advertised contracts

**Status**: Fixed (fractions, ranges, Gaussian sampling)

**Priority**: P2

**Observed (2026-09-11)**: `Rand.seed(cast<ulong>(2782269413)).nextFloat()` returns -0.5. Absolute signed-int normalization otherwise covers only roughly half of [0,1), and `range` inherits bias/overflow issues. `nextGaussian` uses an ad-hoc polynomial instead of the advertised normal sampler.

**Documentation/workaround**: The API guide now states these limitations. Avoid these helpers for unbiased sampling, statistical simulation, and security-sensitive randomness until their algorithms are replaced.

**Resolution (2026-09-12)**: Normalize unsigned outputs, use wide arithmetic and rejection sampling for integer ranges, avoid overflowing floating range differences, and implement Box–Muller with native math. Deterministic O0/O3 model and moment tests pass. LCG correlations, low-bit helpers, and unchecked weighted-choice totals remain documented limitations.

### BUG-268: String.replaceAll can repeatedly expand replacement text

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: The implementation repeatedly replaces the first match and rescans the resulting string. Replacing "a" with "aa" continually creates another match and does not terminate normally.

**Documentation/workaround**: The String guide documents this behavior. Avoid replacements that introduce further matches; a future fix should scan the original input once and append to a builder.

**Resolution (2026-09-12)**: Count and copy non-overlapping matches from the original input, without rescanning replacement text. Preserve clone/null semantics and reject oversized results. O0/O3 regressions cover expansion, deletion, overlaps, identical replacements, and input ownership.

### BUG-269: UUID.v4 repeats identifiers generated within one second

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-11)**: Each call seeds a fresh LCG from whole seconds and emits the same byte sequence for that seed. A local reproduction generated two equal UUIDs in consecutive calls.

**Documentation/workaround**: The API guide now rejects uniqueness and security guarantees for this generator. Use an external suitable generator until the implementation uses an appropriate entropy source.

**Resolution (2026-09-12)**: Use native getentropy for all 16 bytes, then set the version and variant bits. Add tryV4 with unchanged-output failure semantics; v4 throws on failure. Tests cover repeated generation, bit layout, round-trips, null outputs, and injected entropy failure.

### BUG-270: IO.readLine has no input bound and mishandles EOF

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-11)**: `IO.readLine` calls `gets(buf)` without a capacity, ignores the return value, and calls strlen on the buffer. The former documentation presented a 100-byte buffer as sufficient for arbitrary line input.

**Documentation/workaround**: Replaced the example with a width-limited token read and documented the unsafe legacy method. A replacement API needs a buffer capacity and explicit EOF/error handling.

**Resolution (2026-09-12)**: Replace the unsafe one-argument API with readLine(buffer, capacity), returning LineReadResult for complete/truncated input, EOF, native errors, and invalid buffers. Drain oversized lines, NUL-terminate valid buffers, and migrate the demo/docs.

### BUG-271: FS.mkdirp loses absolute roots and ignores creation failures

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: Path splitting discards the leading slash, reconstruction starts from an empty relative path, all mkdir return values are discarded, and the helper unconditionally returns true.

**Documentation/workaround**: The filesystem guide marks it experimental and unsuitable for reliable absolute-path creation. It also describes the limited error checks and Linux x86-64 directory-layout assumption of the surrounding FS helpers.

**Resolution (2026-09-12)**: Preserve the original path while creating each component with native mkdir/stat checks. Existing non-directories and native errors return false; temporary storage is always freed. O0/O3 tests cover absolute/relative paths, repeated separators, symlink directories, idempotency, and file collisions.

### BUG-272: Date timestamp conversion mishandles dates before 1970

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: `Date.fromTimestamp(-86400)` produces 1970-1-0, which `isValid()` rejects. Timestamp/date conversion loops only move forward from 1970; Time.formatTimestamp has the same limitation for negative input.

**Progress (2026-09-12)**: Date and DateTime now use constant-time Gregorian conversion, floor negative timestamps to the containing UTC day, and normalize clock fields. Invalid fields and timestamps outside the int year range throw strings. O0/O3 tests cover a complete 400-year cycle crossing year zero, independent JavaScript UTC cases, and int year boundaries. Time.formatTimestamp delegates to DateTime conversion and formatting, including negative timestamps and range checks.

### BUG-273: Repeated ignored lambda parameters produce duplicate LLVM names

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: A lambda such as `|_: int, _: int| ret int { return 1; }` passes the frontend but Clang rejects duplicate `%_` parameters in the generated function.

**Documentation/workaround**: Use distinct ignored names, such as `_a` and `_b`. The lambda guide now demonstrates this form.

**Resolution (2026-09-13)**: Lambda lowering gives each ignored parameter a unique generated name.

### BUG-274: Some interpolation expressions cannot resolve primitive conversion

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: Interpolating `${cast<float>(items) * price}` fails with `BPL_INSTANCE_METHOD_NOT_COMPATIBLE` for float.toString. Isolated interpolation of String.toString calls succeeds; the logging failure was caused by the separate intrinsic-name collision in BUG-276.

**Documentation/workaround**: Bind computed values to typed locals before interpolation. The repaired guide exercises that form. Importing only String's module also does not load all primitive conversion wrappers; examples using primitive interpolation import from `std`.

**Resolution (2026-09-13)**: Primitive member lookup now uses the shared wrapper map, including float/f64, so computed float interpolation selects Double.toString.

### BUG-275: Casting a local Func value to Lambda generates invalid return IR

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: Assigning `add` to a local `Func<int>(int, int)`, then casting that local to `Lambda<int>(int, int)`, emits a wrapper with `%ret` typed as a pointer but returned as i32. Clang rejects the module.

**Documentation/workaround**: Use an explicit lambda that calls the function pointer. The conversion example now demonstrates this workaround.

**Resolution (2026-09-13)**: Adapters call the raw pointer using its return type; zero-argument signatures omit the extra comma. Verified integer, long, void, and aggregate returns at O0/O3.

### BUG-276: User function named log is lowered as the math intrinsic

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: A user-defined `frame log(level: string, message: string)` can be lowered as `llvm.log.f64` when `std` is imported. A call with two strings then fails LLVM validation because a pointer is supplied as a double.

**Documentation/workaround**: The interpolation logging example now uses `logMessage`. Intrinsic selection needs to respect the resolved declaration rather than matching a function name alone.

**Resolution (2026-09-13)**: Intrinsic lowering uses the resolved extern declaration, preserving user frames and local function pointers even when their names match intrinsics.

### BUG-277: JSON array parsing can loop without consuming input

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-11)**: Both `JSON.parse<int[1]>("[1,2]")` and `JSON.parse<float[1]>("[1.25]")` compile but fail to terminate in bounded local reproductions. The fixed-array loop neither consumes nor rejects excess values, and unsupported primitive parsing can return without advancing the cursor.

**Documentation/workaround**: The JSON guide documents supported primitive parsing and the lack of a strict arbitrary-input contract. Parser loops need explicit progress/error handling; unsupported types and excess elements need rejection.

**Resolution (2026-09-11)**: Added parser progress/error checks, strict container separators and skipped-value scanning, explicit unsupported-type rejection, and fixed-array capacity rejection. Regression tests cover malformed fixed/dynamic arrays, unknown fields, valid partial arrays, and nested cleanup at O0/O3.

### BUG-278: JSON serialization emits unescaped control bytes

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: Stringifying a one-byte string containing 0x01 emits a raw control byte between quotes. Python's JSON parser rejects the output. The serializer handles quotes, backslash, newline, carriage return, and tab but omits the remaining control-byte escapes.

**Documentation/workaround**: The JSON guide calls out the limitation. Escape all bytes below 0x20 before claiming standards-compliant string serialization.

**Resolution (2026-09-11)**: Escape all representable control bytes, using short escapes where defined and lowercase Unicode escapes otherwise. Regression tests compare exact output to an independent JSON encoder and round-trip control bytes plus UTF-8 at O0/O3.

### BUG-279: JSON float serialization can overflow its fixed formatting buffer

**Status**: Fixed

**Priority**: P1

**Observed in source (2026-09-11)**: `JSON.serializePrimitive` allocates 64 bytes then calls unbounded `sprintf(buf, "%f", f)`. Large finite doubles require more than 64 characters in fixed notation. Non-finite values also have no JSON-compatible policy. The overflow was identified by source inspection, not executed.

**Documentation/workaround**: The JSON guide warns against large-magnitude and non-finite floats. Replace unbounded formatting with sized allocation/formatting and define a finite-number policy.

**Resolution (2026-09-11)**: Use bounded snprintf with 17 significant digits and a 64-byte stack buffer. Detect non-finite binary64 values and emit null. Tests cover maximum finite doubles, subnormals, signed zero, adjacent representable values, aliases, and non-finite inputs against an independent JSON parser at O0/O3.

### BUG-280: Language and assembly guides contain noncompiling or misleading examples

**Status**: Fixed

**Priority**: P2

**Observed**: Guides claimed generic inference and absent const support, omitted imports and tuple-binding annotations, used nonexistent JSON hook signatures, and mixed LLVM/BPL floating-point widths. The SSE example used packed f32 instructions on f64 buffers and therefore did not compute its advertised result.

**Resolution (2026-09-11)**: Corrected language contracts, examples, FFI declarations, JSON ownership/hooks, and assembly widths. Added automatic compilation of complete guide programs, explicit companion-module fixtures and negative examples, and O0/O3 output checks for representative programs including SIMD and JSON.

### BUG-281: Implicit Long method lookup disagrees with generated return types

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: With only `IO` and `String` imported from `std`, assigning `x.toString()` for `x: long` to `String` is rejected as pointer-to-String mismatch. Assigning it to `string` passes checking but produces invalid LLVM because the actual call returns the String struct.

**Documentation/workaround**: Explicitly import `[Long]` from `std` before using its methods. The contributor example compiles with this import and destroys the returned owned Strings.

**Resolution (2026-09-13)**: Checked stdlib wrapper declarations replace internal fallback symbols in the global scope. Implicit Long methods now agree with backend String returns; direct checking also loads wrappers before lookup.

### BUG-282: Documentation maintenance helpers violate the release tools inventory

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: The broad CI-safe run rejected the two new documentation helpers under `tools/`, a directory included in the npm payload. These helpers depend on repository compiler/test sources and should not be shipped as standalone package helpers.

**Resolution**: Moved them to `tests/helpers`, updated imports and the docs:stdlib script, and documented the source-checkout requirement. Retained the existing release inventory checks without weakening them.

### BUG-283: JSON accepts malformed skipped values and null literals

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: Unknown fields were skipped by consuming arbitrary non-delimiter text; pointer null parsing consumed any four-byte spelling beginning with n. Container loops also accepted trailing commas or lacked separator checks.

**Resolution**: Validate skipped strings, numbers, booleans, nulls, and nested containers; require complete null spelling and correct separators. Tests reject malformed known and unknown fields and preserve valid nested skipped values.

### BUG-284: Reflection does not resolve fixed-array aliases at JSON generic call sites

**Status**: Fixed (non-generic aliases)

**Priority**: P2

**Observed (2026-09-11)**: For `type Pair = int[2]`, `JSON.parse<Pair>("[]")` reaches the unsupported primitive path, whereas `JSON.parse<int[2]>("[]")` correctly parses an array. The alias receives incompatible reflected metadata.

**Workaround**: Use the concrete array type as the JSON generic argument; a pointer variable can still use `*Pair`. The JSON guide and regression fixtures use this form.

**Resolution (2026-09-12)**: Resolve transparent aliases before generating type metadata; preserve outer pointer/array modifiers and resolve alias chains. O0/O3 LLVM-verified JSON tests cover root aliases, nested fields, pointer fields, and recursive freeing. Generic pointer substitution is tracked separately in BUG-290.

### BUG-285: Documentation incorrectly advertises exponent notation in BPL source

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-11)**: The NumberToken grammar accepts integer and decimal-fraction spellings but not exponent suffixes. The attempted `1.7976931348623157e308` literal fails parsing; the recently edited primitive-type guide incorrectly said source exponent notation was supported.

**Resolution**: Corrected the source-literal guide. JSON numeric text and BPL source literal syntax are separate contracts. The JSON formatter detects non-finite values through binary64 exponent bits, without requiring an unsupported source literal.

### BUG-286: StringBuilder.appendInt loses the minimum signed integer

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: Appending -2147483648 negates the value in an int temporary, which cannot represent its magnitude. The digit loop writes no digits, producing only a minus sign. JSON integer serialization inherits this invalid output.

**Resolution**: Widen the magnitude to long before negation. An O0/O3 regression with LLVM verification covers both signed boundaries, zero, nearby values, buffer growth, and builder reuse.

### BUG-287: JSON integer parsing silently overflows and accepts leading zeros

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: The primitive int parser accumulated unchecked int arithmetic and accepted any run of digits, so values outside the signed 32-bit range could wrap and invalid JSON spellings such as 01 were accepted.

**Resolution**: Validate JSON number syntax, accumulate with signed range checks before each arithmetic step, and reject fractional/exponent spellings for integer destinations. Added checked long/i64 parsing and finite binary64 parsing for float/double/f64. O0/O3 tests cover exact boundaries, adjacent overflows, malformed syntax, subnormals, signed zero, large exponents, aliases, fields, and arrays.

### BUG-288: Astral Unicode string literals produce invalid LLVM constants

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: A literal containing an emoji is sized as four UTF-8 bytes but escapeString encodes each UTF-16 surrogate separately, emitting two replacement characters (six bytes). Clang rejects the constant type mismatch. BMP UTF-8 text is unaffected.

**Workaround**: Construct astral UTF-8 text with explicit byte arrays until whole-string UTF-8 encoding is used during LLVM escaping.

**Resolution (2026-09-12)**: Encode the complete string before escaping LLVM bytes, matching UTF-8 length calculation. Runtime/LLVM regression covers astral, BMP, ASCII, quote, and backslash characters together.

### BUG-289: Throwing without a printf import emits invalid LLVM

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: A program importing only UUID and exercising a string throw fails LLVM compilation because the generated uncaught-exception fallback calls undeclared printf, even when the exception is caught.

**Resolution**: Send the fallback diagnostic through the always-declared runtime stderr writer. Regressions cover caught and uncaught string exceptions without libc imports at O0/O3.

### BUG-290: Generic fixed-array aliases lose element substitution through pointers

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: For type GenericPair<T> = T[2], indexing a *GenericPair<int> is checked as T rather than int. JSON.parse<GenericPair<int>> also encounters incompatible pointer-to-array versus array-of-pointer casts during code generation.

**Resolution (2026-09-13)**: Preserve each instantiated alias target separately from its generic declaration, carry that target through subsequent substitution, and use it for pointer indexing and LLVM layout. Address-of modifier calculation now substitutes generic alias arguments instead of duplicating array dimensions. O0/O3 LLVM-verified tests cover alias chains, generic forwarding, pointer-valued elements, rectangular arrays, and JSON root/field parse, stringify, and free. Multiple outer pointer levels are tracked separately in BUG-300.

### BUG-291: Reflected aggregate sizes can underestimate array-alias fields

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-12)**: A struct with int[2] and float[2] aliases plus a pointer occupies 32 bytes in LLVM but reflection reports 24. JSON allocation can corrupt the heap when filling its final field.

**Resolution**: Derive reflected struct and array byte sizes from LLVM getelementptr constant expressions. This also uses the actual target layout rather than manual alignment estimates. The follow-up layout audit replaces remaining size/alignment estimates with a shared calculator over emitted LLVM types and target data layouts. Enum reflection uses LLVM size expressions; enum storage and DWARF use checked layout calculations (BUG-305).

### BUG-292: CLI subcommand discovery duplicates variadic compiler options

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: selectCliSubcommandGroup calls parseOptions on the real command before parseAsync. The second parse appends --object/--clang-flag values again, causing duplicate object definitions at link time.

**Resolution**: Parse discovery arguments with a separate Command instance. Regression checks that discovery leaves real options untouched and each explicit value reaches the final parse once.

### BUG-293: Wasm lacks the runtime stderr writer used by exception fallback

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: The BUG-289 compiler fix caused hosted String programs to import an undefined env.__bpl_write_stderr symbol. Native runtime support supplied this function, but neither Wasm runtime did.

**Resolution**: Provide a weak no-output writer for freestanding Wasm and a hosted override forwarding to the existing fd-2 host write hook. Tests exercise both modes, and the affected String-based hosted programs are rerun.

### BUG-294: UUID parsing accepts incomplete input and trailing garbage

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: fromString fills as many byte pairs as available and returns a partial UUID; after 16 bytes it ignores remaining input. It also skips misplaced hyphens.

**Resolution**: Validate the complete dashed/compact format before decoding. Add tryFromString with unchanged-output failure semantics, and make fromString return nil for invalid input. O0/O3 LLVM-verified tests cover invalid lengths, misplaced separators, extra input, mixed case, and valid nil UUIDs.

### BUG-295: Primitive reflection reports incorrect alias and f32 sizes

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: Reflection uses an approximate type-size helper whose default is eight bytes; aliases such as uchar/short/ushort and f32 can therefore receive incorrect sizes. Reflective array parsing and serialization depend on these sizes for element spacing.

**Resolution**: Read scalar bit widths from the shared primitive type contract, rounding boolean storage to one byte. O0/O3 LLVM-verified tests compare reflection against sizeof for canonical scalar types and aliases.

### BUG-296: Date formatting can overflow buffers and leaks separator storage

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-12)**: Date.format allocates 16 bytes, but a valid int-min year needs 18 bytes including the terminator. DateTime.format/formatISO similarly allocate only 24 bytes. Invalid stored fields can expand every integer conversion. Date.formatSep also never frees its separate two-byte separator allocation.

**Resolution**: Use bounded snprintf with buffers sized for all signed int fields, check allocation failure, and keep the separator in stack storage. O0/O3 regression tests exercise minimum/maximum years, invalid extreme fields, embedded-NUL separator behavior, and repeated formatting.

### BUG-297: Calendar arithmetic wraps at integer boundaries

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: Date.subDays negates an int before widening; addMonths multiplies the int year by 12 and uses truncating division for negative months; addYears adds in int; diffDays narrows without a range check. DateTime additions multiply/add long values without overflow checks.

**Resolution (2026-09-13)**: Date arithmetic widens before calculation, normalizes negative months with floor division, checks resulting years, and rejects invalid dates. diffDays checks before narrowing; new diffDaysLong supports the full year range. O0/O3 regression tests cover int limits, negative years, leap-day clamping, invalid inputs, and exact full-range differences. DateTime checks offsets against inclusive supported timestamp bounds before scaling and addition. O0/O3 BigInt-oracle tests cover exact limits, just-outside limits, long extrema, wrap-to-zero products, and unchanged inputs. New DateTime.addMonths/addYears reuse the checked calendar rules and preserve clock fields.

### BUG-298: Date week helpers mishandle ISO week 53 and negative years

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: weekOfYear unconditionally maps week 53 to 1 and dates in the preceding ISO year to 52. dayOfWeek uses signed remainders and subtracts one from the int year, which fails for some negative years and the minimum year.

**Resolution**: Derive weekdays from normalized Gregorian epoch days, retain valid ISO week 53, and account for the preceding year's leap status at January boundaries. O0/O3 LLVM-verified tests compare 358 cases against an independent JavaScript Thursday-based oracle, including negative years and both int year limits. Invalid date queries throw strings.

### BUG-299: Literal-left arithmetic with long operands can emit mismatched LLVM types

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-12)**: The date conversion expression `5 * dayOfYear`, with dayOfYear declared long, emitted `mul i32 5, %55` where %55 had type i64. Clang rejected the LLVM IR.

**Workaround**: Explicitly widen the literal (`cast<long>(5) * dayOfYear`). Date conversion uses explicit casts for these expressions.

**Resolution (2026-09-13)**: Materialize the compatible RHS conversion to the checked left operand type before integer arithmetic, comparisons, bitwise operations, shift masking, and runtime guards. Constant division proofs normalize values through source and operation widths; cached nonzero facts include the operation width. O0/O3 tests cover 896 BigInt-oracle results across all signed/unsigned width pairs, literal-left and nested expressions, single left-to-right evaluation, mixed-width shifts, and converted zero/overflow divisors. The language spec and operator guide document the existing left-type rule and explicit casts for wider operations.

### BUG-300: Indexing a pointer to an array-alias pointer drops indirection

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-13)**: For type Pair<T> = T[2], indexing a **Pair<int> is checked as the scalar element instead of *Pair<int>. The pointer-to-alias indexing helper removes all outer pointer levels when selecting an element. The same helper handles non-generic array aliases.

**Resolution (2026-09-13)**: Indexing consumes one outer pointer level while retaining alias metadata until reaching the array. Address generation distinguishes actual LLVM array values from pointers carrying array dimensions. O0/O3 LLVM-verified tests cover generic/non-generic aliases, double/triple pointers, generic forwarding, pointer-valued elements, writes, and null/bounds runtime guards.

### BUG-301: Filesystem reads trust unchecked sizes and writes ignore failure

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-13)**: readFile uses the wrong ftell ABI, unchecked seek/size/allocation/read results, and int length+1 arithmetic. writeFile reports success after failed writes or close. File.write/close discard status.

**Resolution**: Native streaming reads validate allocation, size, read, and close results, returning an owned buffer or IOError with a native error code. Whole-file and handle writes report errors; close consumes the handle and reports buffered failures. Added binary readBytes/writeBytes APIs and rejected invalid readLine buffers/limits.

### BUG-302: Directory listing assumes Linux x86-64 dirent layout

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-13)**: listDir reads names at byte offset 19, which is not portable to macOS.

**Resolution**: A native accessor uses the platform's struct dirent.d_name field.

### BUG-303: Time arithmetic wraps and elapsed timers use the wall clock

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-13)**: Duration factories/operators silently wrap; sleep multiplies in int and ignores interruption/failure. Stopwatch and measure can jump with wall-clock adjustments. gettimeofday errors and platform-specific layout are unchecked.

**Resolution**: Checked Duration arithmetic; native clock_gettime wrappers and 64-bit nowSeconds; monotonic Stopwatch/measure; long sleep arguments with checked scaling and EINTR retry. Clock and sleep failures throw strings. Stopped timers retain elapsed time; legacy Time.now throws outside its int range.

### BUG-304: Zero-argument Func-to-Lambda casts emit a dangling comma

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-13)**: The adapter pointer signature is emitted as ret(i8*, ) for functions without parameters.

**Resolution**: Reuse the complete context-plus-parameters signature; removed the duplicate unreachable conversion branch. O0/O3 and LLVM verification cover zero-argument long and void calls.

### BUG-305: Enum payload storage underestimates aggregates and misaligns fields

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-13)**: Manual size estimates lose array-alias and generic layouts; alignment is guessed from total size. Byte-array payload storage starts at offset four even for eight-byte fields. DWARF repeats size/offset guesses and assumes 64-bit pointers.

**Resolution (2026-09-14)**: Resolve aliases/generics through emitted LLVM types; compute field alignment, offsets, padding, and target pointer widths centrally. Enum payload arrays carry their required alignment, and enum reflection uses LLVM sizeof expressions. DWARF uses real field offsets and aggregate sizes. Clang C ABI oracle tests cover all eight supported target families; native O0/O3 tests exercise nested aliases and generic enum payloads. This changes enum layout: rebuild dependent code together.

### BUG-306: Equality of array-alias fields emits scalar comparisons on arrays

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-13)**: Comparing enum payload structs with int[9] alias fields generates icmp eq [9 x i32], which LLVM rejects.

**Resolution (2026-09-14)**: Classify recursively compared values by their lowered LLVM shape. Array aliases compare elements, including floating-point values, rather than emitting scalar icmp on aggregate values.

### BUG-307: Partially returning match arms emit incomplete phi nodes

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-13)**: A match block with an if-return and an implicit fallthrough infers a value type, but emits a merge phi missing the fallthrough predecessor. Block return yields a match value; use throw for assertion failures.

**Resolution (2026-09-14)**: Reject reachable value-producing arm fallthrough during lowering with an explicit diagnostic. When both if branches terminate, mark the unused continuation unreachable instead of creating a spurious phi predecessor. Regressions cover enum, scalar, tuple, fully returning, and void arms.

### BUG-308: Importing the codegen base directly triggers a module initialization cycle

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-14)**: Directly importing target layout helpers from BaseCodeGenerator throws Cannot access BaseCodeGenerator before initialization because its CompilerError import traverses the compiler barrel.

**Resolution**: Import CompilerError and AST types from their defining modules. The layout oracle exercises direct import.

### BUG-309: Database example reads enum payloads at a hard-coded byte offset

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-14)**: The library-system integration loses active loan rows after payload alignment is corrected because compare_values reads integers at byte offset four. Its fallback nested match results are also discarded.

**Resolution**: Use nested value-returning matches to compare payloads without inspecting enum representation. Removed obsolete workaround dispatch and debug prints. Updated the filesystem error example to expect the checked read diagnostic and a platform-native code.

### BUG-310: Aggregate-layout changes fail the separate ESLint gate

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-14)**: test:ci passed but the separate GitHub lint step rejected three unused payload-size variables, a duplicate CompilerError import, and two nested ternaries. The separate lint command was omitted from the initial validation.

**Resolution**: Remove obsolete locals, combine imports, and express layout branches without nested ternaries. bun run lint, TypeScript checking, 414 compiler tests, and five targeted layout/match tests pass after the cleanup.

### BUG-311: File.open passes null mode strings to libc and crashes

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-14)**: File.open("/dev/null", nullptr) reaches _IO_file_fopen and raises SIGSEGV. Other path wrappers also pass null pointers to native APIs without defining their behavior.

**Resolution**: File.open returns a closed handle for null path/mode. FS.exists/mkdir return false and listDir returns an empty owned array for null paths. Regression tests cover null arguments across filesystem operations, preserving existing false/IOError conventions.

### BUG-312: Directory listing silently returns partial results after read failure

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-14)**: FS.listDir treats every null readdir result as EOF, ignores closedir errors, and copies entries through unchecked allocations. Callers cannot distinguish a complete empty directory from a failed listing, and allocation failure can crash while copying names.

**Resolution**: Add FS.listDirChecked with native error codes, checked allocation and size limits, and cleanup on every failure. The legacy listDir returns an empty array on failure instead of a partial result. Native fault-injection tests cover every allocation point, read/close failures, error precedence, and resource release under ASan/UBSan; BPL tests verify owned names and invalid paths at O0/O3 with LLVM verification.

### BUG-313: Return analysis rejects functions whose try and catch branches return

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-14)**: A function ending in try { return value; } catch (error: IOError) { return fallback; } is rejected with "may not return a value on all code paths". A temporary workaround is assigning a result in the try/catch and returning it afterwards.

**Resolution**: Return analysis checks the try block and all catch bodies, with unmatched exceptions propagating. Codegen marks the continuation unreachable when every branch terminates; without this, fully yielding try/catch blocks inside match arms were incorrectly rejected too. Regressions cover typed and catch-all handlers, nesting, rethrowing, deferred cleanup, match yields, and rejected reachable fallthrough.

### BUG-314: FS.exists opens files and blocks on named pipes without a writer

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: FS.exists calls fopen(path, "r") to test existence. A compiled program checking an existing FIFO with no writer remains blocked until killed. This also confuses existence with file read permission and cannot correctly recognize filesystem sockets.

**Resolution**: Use native stat metadata without opening the file. Preserve false-on-error and symlink-following behavior. O0/O3 LLVM-verified regressions cover an unconnected FIFO, a mode-000 file, directories, symlinks, invalid paths, and non-directory path components.

### BUG-315: Path helpers mishandle empty bases, trailing separators, and dotfiles

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: Path.join("", "file.txt") returns /file.txt, basename("/a/b/") returns an empty string, dirname("/a/b/") returns /a/b, and extname(".profile") returns .profile. The helpers also pass null arguments to strlen and allocate intermediate copies without checks.

**Resolution**: Define slash-separated lexical behavior for empty inputs, roots, separator boundaries, trailing separators, and extensions. Reject null inputs, bound sizes before arithmetic, and allocate each returned String once with a checked allocation. O0/O3 LLVM-verified regressions cover components, joining, UTF-8 byte preservation, backslashes, and invalid arguments.

### BUG-316: Path.normalize leaks its temporary strings and arrays

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: Normalization creates a source String, split component Strings, two Arrays, a StringBuilder, and joined Strings without releasing their storage. Absolute and empty-result branches abandon additional allocations.

**Resolution**: Normalize directly into one checked output buffer. Resolve destroys its joined temporary on both success and exception paths. An allocation-tracking regression reproduces the old leak and checks zero live allocations after repeated calls and injected failures at O0/O3. A seeded POSIX lexical oracle checks normalization output with BPL's existing trailing-separator removal convention.

### BUG-317: Path.relative only strips literal prefixes

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: Path.relative("/a/b", "/a/c") returns /a/c instead of ../c. It does not normalize inputs, count parent traversals, or define incompatible absolute/relative input behavior.

**Resolution**: Compare normalized components, emit parent traversals and the target suffix, and reject incompatible roots or unresolved source parents requiring unknown ancestor names. Free normalized temporaries on every error. O0/O3 LLVM-verified tests cover a 100-pair absolute-path oracle and explicit relative cases; allocation tracking injects failure at all three allocations.

### BUG-318: Lambda capture and defer registration allocations are unchecked

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: Injecting malloc failure while registering a captured defer in Path.resolve causes SIGSEGV at address 0x10. ExpressionGenerator.generateLambda stores captures through an unchecked malloc result; generateDefer also fills an unchecked allocated DeferNode.

**Resolution**: Check capture and defer-node allocations before storing through them. Failures throw strings; a failed node allocation releases its capture context before propagating. O0/O3 fault injection covers regular captures, captured and capture-free defers, and cleanup of previously registered defers. Path operations retain explicit cleanup to avoid allocating deferred closures for internal temporary buffers.

### BUG-319: Exception unwinding leaks deferred storage and can re-enter a throwing defer

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: Allocation tracking detects a live DeferNode after exception-driven cleanup. emitExceptionTransfer calls the deferred callback before unlinking its node and never frees the node or capture storage. A callback that throws can therefore encounter the same node again during nested unwinding.

**Resolution**: Unlink and free each node before invoking its callback. Compiler-generated defer callbacks copy captures to local storage and release their capture allocation before running user code. Remove the redundant normal-return free. Allocation tracking and O0/O3 execution cover normal exits, exception unwinding, throwing callbacks, earlier registered cleanup, and zero remaining allocations.


### BUG-320: Arena and stack allocation sizes wrap and overlap later allocations

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: On Linux x86-64 at O0 and O3, initialize an ArenaAllocator or StackAllocator with 4096 bytes, then call `alloc(cast<ulong>(0xffffffffffffffff))` followed by `alloc(8)`. Both calls return the same non-null pointer. Rounding the huge request to eight-byte alignment wraps to zero. Stack capacity checks also add sizes without overflow guards. No out-of-bounds writes were needed to reproduce the incorrect successful allocation.

**Next step**: Check alignment rounding, header/page arithmetic, and capacity subtraction before allocation. Extend the audit to pool/page allocators and reject unsupported sizes without changing state. Reproduction is preserved in the comparative language audit report.

**Resolution**: Guard alignment, mapping headers, capacity checks, and pool chunk arithmetic before mutation. O0/O3 LLVM-verified regressions exercise near-UINT64_MAX requests, preserved data, capacity exhaustion, and allocation after rejected requests.

### BUG-321: PageAllocator returns storage that violates its page-alignment promise

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: `PageAllocator.alloc(16)` returns an address whose remainder modulo 4096 is 8, at both O0 and O3 on Linux x86-64. The implementation stores an eight-byte header and returns the mapping address plus eight despite documenting that memory is always page-aligned.

**Next step**: Define the allocator alignment contract, preserve it while storing metadata, and test alignment and size overflow. Review other allocators' fixed eight-byte alignment before using them for arbitrary types.

**Resolution**: Query the native page size, reserve a leading metadata page, and return the next page boundary. Guard rounding and header arithmetic before mapping. O0/O3 LLVM-verified tests cover page boundaries, writable payload ends, zero and oversized requests.

### BUG-322: Language specification and comparison documentation contradict implemented contracts

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: LANGUAGE_SPEC.md says all structs implicitly inherit Type, but a method-free `struct Plain { x: int, }` has size 4 on Linux x86-64, consistent with the POD implementation. docs/06-operators.md calls negative/out-of-width shifts undefined or implementation-defined, while invalid constant counts are rejected and dynamic counts are masked; `shift(32)` for `1 << n` returns 1 and `shift(-1)` returns -2147483648 at O0/O3. README's comparison labels Go exceptions without distinguishing panic/recover and presents unmeasured ordinal compilation/performance ratings. The numbered specification guide calls the partial language document a formal specification.

**Next step**: Consolidate the normative contract, correct these claims, include specification programs in executable documentation coverage, and replace unsupported comparison ratings with scoped evidence. No compiler behavior changes were made during this comparative audit.

**Resolution**: LANGUAGE_SPEC.md now separates the `Type` subtyping relationship from storage (only structs that declare or inherit methods carry a vtable pointer). docs/06-operators.md documents the verified shift contract: constant invalid counts are rejected, runtime counts are masked, signed `>>` is arithmetic, and left shifts wrap. README qualifies Go's panic/recover model and BPL's memory-safety scope and removes unmeasured ratings. docs/44-language-spec.md no longer calls the partial document formal. Linking specification rules to executable tests remains future work.

### BUG-323: C aggregate arguments use incompatible ABI lowering

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: On Linux x86-64 with Clang 21, a separately compiled C function `int sum_pair(struct Pair p)` for `struct Pair { int x; int y; };` returns 7 when BPL passes `Pair { x: 7, y: 11 }`, instead of 18. Reproduced at O0 and O3. Matching field layout does not establish the platform's function-call ABI: the C function receives the two fields packed into an i64 while BPL declares and passes an LLVM aggregate.

**Next step**: Introduce target-specific C ABI argument/result classification, including coercions and indirect passing, with bidirectional C/BPL fixtures. Until supported, reject aggregate-by-value extern signatures or document and enforce pointer-based wrappers. Aggregate returns and other target ABIs require separate tests; this reproduction proves the two-i32 argument case only.


**Resolution**: Extern calls with by-value C-compatible structs or payload-free enums go through an internal wrapper that lowers them to the target C ABI (x86-64 System V with register exhaustion, Windows x64, AArch64 AAPCS and Apple arm64, i386 System V, WebAssembly). tests/CAbiLowering.test.ts compares the lowered declarations with clang on all seven target families; tests/ExternAbiSafety.test.ts runs a separately compiled C fixture at O0/O3 covering register-sized, SSE, mixed, sret, nested, array-field, bool-field, register-exhausted, enum, and function-pointer cases. Non-C-compatible aggregates, aggregate callbacks, and aggregates in variadic externs remain rejected with BPL_EXTERN_ABI_UNSUPPORTED.

### BUG-324: Manual allocator lifecycle and native mapping contracts are unsafe

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: PoolAllocator.destroy leaves chunk_head/free_head pointing into unmapped memory, so repeated destruction or subsequent allocation can access freed storage. StackAllocator accepts forward or unaligned rewind markers. Allocators hard-code Linux MAP_ANONYMOUS=32 instead of using the host platform's native constant.

**Next step**: Clear released pool bookkeeping, reject invalid rewind markers without state changes, and move OS mapping constants and native size validation into runtime helpers. Keep allocation ownership manual and require destroy before reinitialization.

**Resolution**: Use checked native Linux/macOS mapping helpers, clear pool state after destruction, and reject forward/unaligned stack markers. O0/O3 tests cover repeated destruction, pool reuse, marker failure atomicity, and native mapping failure; native checks also support ASan/UBSan.

### BUG-325: Variadic String arguments pass the vtable pointer instead of text

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: `printf("%s", s)` with `s: String` printed garbage at O0 and O3. Code generation extracted field 0 of `%struct.String`, but String implements specs, so field 0 is its vtable pointer and `data` is field 1.

**Resolution**: Extract the `data` field using the struct layout index. Covered by tests/ExternAbiSafety.test.ts.

### BUG-326: Builtin runtime error declarations type text fields as String

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: The checker's builtin NullAccessError, IndexOutOfBoundsError, and DivisionByZeroError declarations typed `message`, `function`, and `expression` as the `String` struct, while lib/errors.bpl and generated LLVM use `string` (`i8*`). `local m: string = e.message` was rejected with a type mismatch, and String members were offered on C string values.

**Resolution**: Declare those builtin fields as `string`. Covered by tests/BuiltinErrorFieldTypes.test.ts at O0/O3 with LLVM validation.

### BUG-327: Payload-free enums pass to C varargs as aggregates

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: `printf("%d", kind)` for a payload-free enum passed the LLVM aggregate `%enum.Kind = { i32 }` to a C variadic function, relying on target aggregate classification.

**Resolution**: Direct extern variadic calls pass the i32 tag. Tagged enums with payloads remain rejected with BPL_EXTERN_ABI_UNSUPPORTED.

### BUG-328: Decimal digit separators fail and spaced digits merge into one literal

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: `local d: int = 1_000;` failed with `Unexpected syntax`, although the token lexer and docs/04-syntax-comments.md accept underscores in decimal literals. The Peggy rule `[0-9] (_?[0-9])*` used the whitespace rule `_` instead of a literal underscore, so the parser joined digits separated by whitespace or comments: `local d: double = 1.5 5;` compiled and printed `nan`, and `1 2` reported a confusing invalid-literal error.

**Resolution**: The grammar and the optimized number scanner accept one `_` between decimal digits and never skip trivia inside a literal. Decimal parsing strips separators. Covered by tests/LanguageSpecCore.test.ts (R-LEX-5).

### BUG-329: Indexing through a slice type alias reads the wrong element type

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: With `type IntArr = int[];`, `frame sum(v: IntArr) ret int { return v[0] + v[1]; }` returned garbage for `[5, 6]` at O0 and O3. Slice index lowering derived the element type by dropping one array dimension from the alias node, which resolved back to the whole `{ i32*, i64 }` slice, so the `getelementptr` stepped by 16 bytes.

**Resolution**: Slice indexing uses the checked element type of the index expression. Covered by tests/LanguageSpecCore.test.ts (R-DECL-4, R-ARR-8).

### BUG-330: Specs after a parent struct are ignored and extra parent structs are accepted

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: For `struct Circle : Shape, Drawable`, `render<Circle>` with `T: Drawable` failed with `Type argument 'Circle' does not satisfy constraint 'Drawable'`, because subtyping only followed the first inheritance entry. `struct C : A, B` with two structs compiled and silently ignored `B` (`Unknown field 'y'`), and a parent struct listed after a spec was ignored the same way.

**Resolution**: Subtyping walks every inheritance entry, including parent specs. The checker rejects a second parent struct and a parent struct that is not listed first. Covered by tests/LanguageSpecDeclarations.test.ts (R-STRUCT-6, R-FN-9, R-SPEC-3).

### BUG-331: break and continue inside defer or lambda bodies pass checking

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: `loop { defer { break; } }` and a lambda body containing `break` inside a loop passed `bpl check`, then code generation failed with `Break statement outside of loop or switch`.

**Resolution**: The checker clears loop and switch context while checking deferred statements and lambda bodies. Covered by tests/LanguageSpecControlFlow.test.ts (R-CTRL-5).

### BUG-332: Increment and decrement accept constants, non-lvalues, and non-numeric operands

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: `local const c: int = 1; c++;` compiled and printed 2. `(a + 1)++` and `5++` passed checking and failed in code generation. `bool` increments wrapped silently, pointer and string increments produced LLVM IR that Clang rejected, and `f32` increments emitted an integer constant.

**Resolution**: `++` and `--` require an assignable, mutable integer or floating-point operand, with `BPL_ASSIGNMENT_TARGET_INVALID` and `BPL_ASSIGNMENT_TARGET_CONSTANT` diagnostics. Code generation uses a floating-point constant for `f32`. Covered by tests/LanguageSpecExpressions.test.ts (R-EXPR-6) and tests/LanguageSpecDeclarations.test.ts (R-DECL-7).

### BUG-333: Exporting an undefined symbol is accepted

**Status**: Fixed

**Priority**: P3

**Observed (2026-09-15)**: `export g;` in a module without `g` compiles without a diagnostic; only a module that imports `g` fails with `BPL_IMPORT_EXPORT_NOT_FOUND`. examples/bpl_db/src/types.bpl exports a nonexistent `ValueType`.

**Resolution (2026-09-16)**: Both complete-program checking and on-demand module loading validate exports after all declarations, preserving exports before globals and imported re-exports. Undefined symbols receive `BPL_EXPORT_SYMBOL_NOT_FOUND`. Package and release fixtures now declare their exported placeholders, and the stale `ValueType` export was removed. Failed on-demand module loads restore checker scopes and discard partially checked cache entries. Tests cover all export forms, forward globals, aliases, and failure recovery.

### BUG-334: The raw assembly flavor emits invalid IR and unknown flavors are accepted

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: `asm("raw") { "store i32 5, i32* (d)" }` emitted the quoted line verbatim, so Clang failed with `expected instruction opcode`, although the guides describe `raw` as an alias of `llvm`. `asm("foo")` compiled as raw LLVM.

**Resolution**: `raw` uses the `llvm` path, including quote stripping and interpolation, and the checker rejects unknown flavors. Covered by tests/LanguageSpecModules.test.ts (R-ASM-1, R-ASM-2).

### BUG-335: Struct literals leave omitted inherited fields undefined

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: The checker requires fields declared directly on a struct but allows inherited fields to be omitted, as in `throw IOError { message: "..." }`. Code generation built the literal from `undef`, so `B { y: 1 }` for `struct B : A` read an unpredictable `x`.

**Resolution**: Struct literals that omit a field start from `zeroinitializer`; complete literals keep their previous IR. Covered by tests/LanguageSpecDeclarations.test.ts (R-STRUCT-3).

### BUG-336: Chained assignment assigns only the leftmost target

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: `x = y = 7;` parsed as `(x = y) = 7`, leaving `y` unchanged and assigning 7 to `x`. `c += d += 3` also left `d` unchanged.

**Resolution**: The grammar and the optimized assignment parser build right-associative assignment trees. Covered by tests/LanguageSpecExpressions.test.ts (R-EXPR-5).

### BUG-337: Explicit dereference of a null pointer is not checked

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: Member access and indexing through a null pointer stop with a null-access runtime failure, but `local n: *int = nullptr; printf("%d", *n);` segfaults at O0 and prints an arbitrary value at O3. Unary `*` loads directly without `__bpl_check_null`.

**Resolution (2026-09-16)**: Explicit pointer loads and lvalue addresses share the existing null-check/proof path. O0/O3 regressions cover loads, stores, compound assignments, increments, nested pointers, single evaluation, and defer cleanup with typed catches. R-ARR-10 now specifies this behavior. Non-null dangling or invalid pointers remain outside the guarantee.

### BUG-338: Implicit integer-to-bool conversion keeps only the low bit

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-15)**: `local i: int = 2; local b: bool = i;` compiles, and `b` is `false`, because `bool` participates in implicit integer narrowing. Conditions reject integers, but assignments and arguments do not.

**Resolution (2026-09-16)**: Per the user's language-policy decision, implicit integer-to-bool conversions are rejected. Shared compatibility and lowering reject scalar integer sources, and initializer literal handling cannot bypass this for zero. Regressions check literals, aliases, globals, assignments, arguments, returns, aggregates, and expressions. O0/O3 execution and LLVM verification retain explicit cast low-bit behavior, zero/nonzero comparisons, and bool-to-integer conversion. R-CONV-1 and the variable guide describe the revised rule.

### BUG-339: Slices of fixed-array aliases pass checking but fail code generation

**Status**: Fixed

**Priority**: P3

**Observed (2026-09-15)**: With `type Row = int[2];`, passing `local grid: int[2][2]` to `frame cell(m: Row[], i: int, j: int)` passes `bpl check`, then `bpl run` fails with `Unsupported cast from [2 x [2 x i32]] to { [2 x i32]*, i64 }`.

**Resolution (2026-09-16)**: Alias expansion and generic substitution prepend use-site dimensions to the aliased element shape. LLVM modifier differences consume that outer prefix, and slice element extraction removes consumed alias metadata. Explicit generic arguments are resolved before signature substitution so checking and code generation share the concrete shape. O0/O3 execution and LLVM verification cover rectangular arrays, generic aliases, alias chains, local views, reassignment, and independent inner/outer bounds checks; pointer-to-array regressions remain covered.

### BUG-340: Same-named private declarations in different modules silently replace each other

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-15)**: Type checking scopes names per module, but code generation merged all modules into one flat namespace, de-duplicating structs by bare name and skipping functions whose mangled name was already defined. An importer's own `helper()` ran an imported module's private `helper()`; two modules with private `struct Hid { x: int }` and `struct Hid { x: long }` shared one layout, so the `long` store wrote past the 4-byte field; a private struct replaced an importer's struct of the same name ("Unknown field"). `bpl check` also reported false "Duplicate symbol definition … in module unknown" errors.

**Resolution**: After type checking, compiler/middleend/ModuleSymbolUniquer.ts renames colliding module-level declarations (standard library first, then the entry module keep their names) to `Name__N` and rewrites every reference by resolved declaration or module-visible name; reflection keeps the source name. Cached builds key objects on the rename set. Lazily loaded modules in `bpl check` now record their own module path. tests/ModuleSymbolIsolation.test.ts covers importer, sibling, method-private-type, transitive, reflection, and `--cache` cases.

### BUG-341: Generic struct method signatures fail their own constraint in module builds

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: `struct Wrapper<T: Printable> { frame display(this: *Wrapper<T>) {...} }` compiled through module resolution failed with "Type 'T' does not satisfy constraint 'Printable'", while the same program passed `bpl check`. Resolving a method's parameter and return types switched to the defining module's scope, which has no generic parameters of the owning type, so `Wrapper<T>` was constraint-checked with `T` unknown. The failure was previously visible only in programs with imports; it reached every program once builds always resolve modules.

**Resolution**: compiler/middleend/CallChecker.ts resolves method types in module context without constraint checking; declarations and instantiation sites still check constraints. Covered by tests/GenericsConstraints.test.ts.

### BUG-342: Runtime error helpers built errors that did not match the language's error types

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: `lib/runtime.ll` rebuilt `NullAccessError`, `IndexOutOfBoundsError`, `DivisionByZeroError`, and `StackOverflowError` by hand, duplicating layouts, vtables, and type ids that also exist in lib/errors.bpl and compiler/middleend/BuiltinTypes.ts. The copies had drifted: `__bpl_throw_division_by_zero` and `__bpl_throw_index_out_of_bounds` stored the `NullAccessError` vtable, left `code`, `stack_frames`, and `stack_depth` uninitialized from `malloc`, and skipped defer unwinding, so `defer` blocks did not run when those errors were caught. Panic text went to stdout, `runtime.ll` hardcoded the x86-64 Linux target triple, and its `destroy` methods freed the error a catch clause had copied. The wasm runtime's `__bpl_check_null` took `(expr, func)` while generated code passed `(func, expr)`, so its reports swapped the two.

**Resolution**: The check helpers are written in BPL in lib/errors.bpl (`__bpl_check_null`, `__bpl_throw_null_access`, `__bpl_throw_index_out_of_bounds`, `__bpl_throw_division_by_zero`, `__bpl_throw_stack_overflow`), so every error has one definition, throws through the normal lowering including defer unwinding, and is caught with all fields set. Without an active handler they call C panics that print to stderr and exit. `lib/runtime.ll` and the dead `lib/runtime.c` are deleted; runtime state, argc/argv, stack-depth helpers, and panics live in lib/runtime_support.c.

### BUG-343: Optimized catches lose local updates made before a throw

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: A deferred callback updates a stack local through a captured pointer, then a checked null store transfers control into a typed catch. At O0 the catch sees the update; at O3 LLVM reuses the local's value from before `setjmp`. Ordinary local assignments in a try body have the same risk. The runtime-helper rewrite makes checked failures unwind correctly, but handler functions still need to preserve memory across the nonlocal return.

**Resolution**: Functions containing their own try/catch lower memory loads and stores as volatile, preventing promotion or reuse of pre-throw stack values. This deliberately includes indirect accesses to cover aliases. Handler detection happens during ordinary try-block emission, and the memory pass runs only for functions that emitted a handler; no eager AST traversal is needed. Nested generated functions independently determine whether they need the protection. O0/O3 execution and LLVM verification cover scalar and parameter writes, aggregate aliases, deferred writes on checked runtime failure, nested rethrows, repeated loop handlers, and handlers inside deferred functions. The conservative policy can limit memory optimizations in handler functions; a future precise liveness analysis could narrow it without changing the guarantee.

### BUG-344: Caught exceptions leak the runtime stack-depth counter

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: A loop making 10,010 sequential calls to a frame that throws `7`, catching each `int`, terminates with an uncaught stack-overflow exception at O0. Each call increments the runtime depth, while `longjmp` skips its exit hook. Actual call depth stays constant. The inlined counter used at O2 has the same issue.

**Resolution**: Every handler saves the runtime depth before `setjmp` and restores it on its catch entry, before catch dispatch or rethrow. Regressions exercise repeated calls and nested propagation through recursive frames at O0/O3 with LLVM verification; O2 is checked separately.

### BUG-345: Handler frames allocated inside loops accumulate stack storage

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: After fixing BUG-344, 10,010 iterations of a try/catch around a throwing call still fail at O3. `allocateStack` emits fixed-size `alloca` instructions at their use sites: the exception frame allocates another 256 bytes on every loop iteration and does not release it until the function returns. Local variables and compiler temporaries allocated inside loops have the same lifetime problem. LLVM cannot reliably hoist these allocations around `setjmp`, and the O3 stack-limit probe reports overflow despite bounded live local storage.

**Resolution**: Fixed-size local, handler, pattern-binding, and expression-temporary slots are collected per generated function and emitted at entry. Named temporary slots preserve LLVM register numbering; reserving an output entry also preserves the compiler's instruction-index bookkeeping. Initializers and stores remain at their original execution sites. O0/O3 execution and LLVM verification cover 10,010 loop-local handlers, repeated 1 KiB arrays, and enum construction/matching with 1 KiB payloads.

### BUG-346: Re-exported global aliases use the wrong linker symbol

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: A module imports global `value` as `forwarded` and exports `forwarded`. An entry module importing that re-export passes checking but fails to link with `undefined reference to forwarded`. Global address generation uses the identifier's visible spelling instead of its resolved declaration; a coincidentally matching local or global can also select the wrong storage.

**Resolution**: Global reads, writes, and address-taking use the resolved global declaration's linker name before name-only local/global lookup. Direct aliases, transitive re-exports, and namespace access are covered at O0/O3, including updates observed through multiple imports.

### BUG-347: Scalar integer widening bypasses array argument compatibility

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: Overload argument checking accepts integer arrays and slices as scalar widening conversions without comparing dimensions or element storage. For example, `int[3][3]` passes checking as an argument to `int[][2]`, even though the row widths differ. The shared widening helper rejects pointers but fails to exclude arrays.

**Resolution**: Implicit integer widening applies only to scalar, non-pointer types. Array arguments must pass normal shape and element compatibility checks. Negative checking tests cover mismatched row widths, lengths, element widths, and scalar/array arguments; O0/O3 execution with LLVM verification covers valid array overloads and scalar widening.

### BUG-348: Imported constant globals lose assignment protection

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: Importing `global const value:int=42` as `alias` permits `alias=0` in the importing module. `bpl check` reports success because imported symbols do not retain the source symbol's constant flag. Code generation can then store through the constant's address.

**Resolution**: Import bindings preserve `isConst` in both checker import paths. Namespace global expressions carry constant type metadata, and mutation checks consult the resolved global declaration. Regressions cover assignment, compound assignment, increments, aggregate member/index writes, pointer rebinding, and address-taking through direct imports, re-exports, and namespaces. Valid reads and constant-pointer pointee updates execute at O0/O3.

### BUG-349: Renamed main parameters produce undefined LLVM registers

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-16)**: `frame main(argc:int, _argv:**char)` passes checking but compilation fails at both O0 and O3: parameter initialization references `%_argv` while the native entry signature declares `%argv`. Discovered while measuring runtime overhead.

**Resolution**: Main parameter locals read the fixed ABI argument registers by position rather than by source spelling. O0/O3 execution with LLVM verification covers renamed arguments, ignored underscore names, swapped spellings, and mutation of the count parameter.

### BUG-350: `return` in a match statement is discarded

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: Code generation treated every `return` inside a match arm as the arm's value, including matches used as statements, which have no value. The arm body ran, the returned value was computed and dropped, and execution continued after the match:

```bpl
frame described(s: Shape) ret int {
    match (s) {
        Shape.Circle(r) => { return cast<int>(r) * 2; },
        Shape.Empty => { return -1; },
    };
    return -2;
}
```

`described(Shape.Circle(2.5))` ran the arm and then returned `-2` at O0 and O3. There was no other way to return from inside a match arm, so any such function silently produced the wrong value. Checking also validated those returns against the arm type instead of the function's return type.

**Resolution**: Matches in statement position are marked during checking (`MatchExpr.isStatementPosition`). Their arm blocks check `return` against the enclosing function's return type, and code generation emits a real function return, including scope cleanup and the stack-depth exit, instead of a branch to the match merge block. Expression matches keep yielding arm values, which remains the only way for a block arm to produce one. LANGUAGE_SPEC.md R-MATCH-4 now states both cases. Covered by tests/LanguageSpecExpressions.test.ts at O0/O3 with LLVM validation.

### BUG-351: Throwing skips automatic destructors

**Status**: Fixed (partial: see remaining gap)

**Priority**: P1

**Observed (2026-09-17)**: `@[auto_destroy]` cleanup was emitted only on normal control flow, so a throw leaked every resource it unwound past, although `defer` in the same position still ran:

```bpl
frame thrower() ret int {
    local t: Res;          # t.destroy() never ran
    t.id = 30;
    defer { printf("defer\n"); }   # this did run
    throw 5;
}
```

Locals of a `try` block were also left undestroyed when a throw inside the block reached its handler. `defer` is precise here because its cleanup is a runtime list the unwinder walks; destructor cleanup is emitted statically at scope exits, and the throw path had none.

**Resolution**: A throw now destroys the live `@[auto_destroy]` locals of its own frame before transferring control, from the innermost scope out to the nearest enclosing `try` in that frame, or to the function scope when the frame has no handler. Only locals declared before the throw are registered, so an uninitialized local is never destroyed, and a local moved into the thrown value is skipped. Covered by tests/RAIIAutoDestroy.test.ts (throw after acquiring, throw inside a `try`, moved throw, and a throw from a loop body) at O0/O3.

**Remaining gap**: a frame between the throwing function and the handler that has no `try` of its own is skipped entirely by `longjmp`, so its locals are still not destroyed. Fixing that requires registering destructors in the runtime unwind list like `defer`, which currently allocates a node per entry. Destructor and `defer` ordering also differs on the throw path: destructors of the throwing frame run first, then the unwinder runs defer entries.

### BUG-352: Namespace-qualified types resolve to another module's type of the same name

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: With `import * as bmod from "./b.bpl"`, the type `bmod.Wrap<int>` resolved to a different `Wrap` that the importer had in scope from another module. Type checking reported `Cannot access member 'first' on type 'Wrap<i32>'` for a field that `b.bpl`'s `Wrap` declares. Qualified lookup itself was correct; resolving the qualified name rewrote the node to the bare name `Wrap`, and a later resolution of that node looked the bare name up again in the importer's scope and found the other module's declaration. The reuse guard that would have prevented the second lookup skipped any type with generic arguments, so generic types were affected while non-generic ones were not.

**Resolution**: Type resolution now prefers the declaration a type node already recorded, instead of resolving the bare name again (`recordedDeclarationSymbol` in compiler/middleend/TypeCheckerBase.ts). Module symbol uniquing also rewrites namespace-qualified references (`ns.Type`) when that module's declaration is renamed for a collision. Covered by tests/ModuleSymbolIsolation.test.ts, which checks, builds, and runs two modules that both declare a generic `Wrap`, one reached through a namespace import.

### BUG-353: Spec pointers crash outside call arguments

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: A `*Spec` value is a pointer to a `{ data, method table }` pair, and only the call-argument path built that pair. Every other conversion produced a bare struct pointer, so dispatching through it read the struct's first field as a method table and crashed:

```bpl
spec Shape { frame area(this: *Self) ret int; }
struct Sq: Shape { side: int, frame area(this: *Sq) ret int { return this.side * this.side; } }
frame main() ret int {
    local sq: Sq;
    sq.side = 4;
    local direct: *Shape = &sq;   # SIGSEGV on the call below
    return direct.area();
}
```

Local initializers, assignments, array elements, `cast<*Shape>(...)`, and returns all segfaulted at O0 and O3, while passing the same pointer as an argument worked. Returning was worse than the others: the pair is built in the frame performing the conversion, so a returned `*Spec` pointed into the callee's dead frame.

**Resolution**: The conversion is one helper (`emitSpecFatPointer`) used by the argument path and by `emitCast`, so every value conversion builds the pair: arguments, local initializers and assignments, array elements, and explicit casts. Positions that outlive the frame that builds the pair are rejected during checking with `BPL_SPEC_POINTER_ESCAPES`: a `*Spec` return type, global type, or struct field type. No standard library, example, or package used those positions. LANGUAGE_SPEC.md R-SPEC-4 states the rule; covered by tests/LanguageSpecDeclarations.test.ts, which runs dispatch through every supported conversion at O0/O3 with LLVM validation and checks the three rejected positions.

**Remaining gap**: the restriction, rather than a representation change, is what keeps spec pointers safe. Representing `*Spec` as the pair by value would allow returns and stored fields; that changes the ABI of every spec-typed value and its null handling, so it is not done here.

### BUG-354: Destructors skip owned array elements and struct fields

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: `@[auto_destroy]` ran only for a local whose own type declared the marked method. A local holding the same type inside an array or a struct field was never destroyed, so the resource it owned leaked with no diagnostic:

```bpl
struct Resource {
    handle: int,
    @[auto_destroy]
    frame destroy(this: *Resource) ret void { printf("destroy %d\n", this.handle); }
}
struct Holder { inner: Resource }

frame main() ret int {
    local items: Resource[2];   # neither element destroyed
    local holder: Holder;       # holder.inner never destroyed
    items[0].handle = 1;
    items[1].handle = 2;
    holder.inner.handle = 3;
    return 0;                   # prints nothing
}
```

Three further defects surfaced while fixing this. Cleanup entries run in reverse registration order, so registering a value's own destructor before its fields ran the fields first, and the outer destructor then observed already-destroyed members. The move check that suppresses cleanup for a returned or thrown local compared only that local's own cleanup entry, so returning a struct destroyed its fields in the callee and again in the caller: a double destroy. Locals are not zero-initialized, so a destructor for a local that was never assigned read whatever the previous frame left on the stack.

**Resolution**: Registration walks the type: fixed-array dimensions are unrolled into one cleanup entry per element, and struct fields are reached with `getelementptr`, both recursively and cycle-guarded (`ownsAutoDestroy` and `registerAutoDestroy` in compiler/backend/codegen/StatementGenerator.ts). Owned entries are registered before the value's own destructor, so cleanup runs the owner first and then its elements and fields in reverse declaration order. Every entry records the address of the local it belongs to (`AutoDestroyStmt.ownerAddress`), and moving a local suppresses that whole subtree, on both the return and throw paths. A local whose cleanup will read it is zeroed at its declaration, before any default value, vtable, or `new` constructor writes to the same storage. Covered by tests/RAIIAutoDestroy.test.ts, which runs elements, nested arrays, fields, destruction order, the throw path, moved returns, and zeroed storage at O0/O3 with LLVM validation.

**Follow-up (same day)**: ownership was not followed through generic type arguments. A field declared as the struct's type parameter (`Box<Resource>.item`), and a local declared as a generic function's type parameter (`local held: T` in `holdsTypeParameter<Resource>`), were both left undestroyed, because the walk read the declared field types without substituting the arguments of the instantiation being generated. Field types are now substituted from the struct's type arguments (`getAutoDestroyFields`), and every type the walk visits is resolved through the instantiation's `currentTypeMap` (`concreteAutoDestroyType`). The cycle guard keys on the instantiation rather than the declaration, so `Box<Box<Resource>>` is walked to full depth instead of stopping at the repeated declaration.

**Remaining gap**: cleanup is still per-frame and static. A local whose ownership was moved by anything other than returning or throwing it directly, such as storing it into a longer-lived structure, is still destroyed at scope exit. Dynamically sized storage is not walked: only fixed array dimensions are unrolled, so elements reached through a pointer or a slice are not destroyed.

### BUG-355: Writes to a captured variable are silently discarded

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: A lambda captures by value, and the body reads its captures from a copy. A write to a captured variable therefore changed only that copy: the outer variable kept its old value, and the write was not even visible to the next call of the same lambda.

```bpl
frame main() ret int {
    local count: int = 41;
    local next: Lambda<int>() = || ret int {
        count = count + 1;
        return count;
    };
    printf("%d %d %d\n", next(), next(), count);   # 42 42 41
}
```

The same loss applied to a field or element of a captured value (`captured.field = x`, `captured[0] = x`) and to `captured++`. Nothing reported it: the program compiled, ran, and quietly produced a value the source does not describe. `examples/func_lambda_closure_mut` asserted the discarded result as expected output.

**Resolution**: Such a write is rejected during checking with `BPL_CAPTURED_VALUE_ASSIGNED`. Capture analysis already walks the lambda body, so it now also records writes whose target resolves to a captured declaration (`noteCapturedAssignment` in compiler/middleend/CaptureAnalyzer.ts), including the `++` and `--` forms, which are unary nodes rather than assignments. The walk stops at a pointer: writing through a captured pointer reaches the original value, so `*ptr = x`, `ptr.field = x`, and `ptr[i] = x` stay valid, as do writes to globals and to the lambda's own parameters and locals. LANGUAGE_SPEC.md R-LAMBDA-4 states the rule and R-LAMBDA-2 no longer claims the write happens; docs/53-lambdas.md shows the rejected form and the pointer form. The example now captures a pointer and prints the incremented value. Covered by tests/LanguageSpecExpressions.test.ts, which rejects the scalar, field, element, and `++` forms and runs the pointer form at O0/O3.

**Remaining gap**: none. The `defer` form of the same loss is BUG-356, fixed directly after this one.

### BUG-356: Writes to an outer variable inside a defer block are silently discarded

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: A `defer` block runs against copies of the values it uses, the same way a lambda does, so a write to a variable declared outside the block changed only the copy:

```bpl
frame main() ret int {
    local n: int = 1;
    {
        defer {
            n = 99;
            printf("in defer n=%d\n", n);   # 99
        }
    }
    printf("after block n=%d\n", n);        # 1
}
```

The block observed its own write, so the value looked correct from inside, and the variable it named never changed. `tests/LanguageSpecControlFlow.test.ts` asserted the discarded result while demonstrating R-DEFER-3.

**Resolution**: Rejected during checking with the same `BPL_CAPTURED_VALUE_ASSIGNED` diagnostic as BUG-355, worded for defer. Capture analysis is reused rather than duplicated: `CaptureAnalyzer.findDiscardedWrites` runs the existing walk over the deferred statement, treating anything not declared inside it as a capture, and `checkDefer` reports what it returns. The pointer, global, and block-local forms stay valid. The copy is not a defect to remove: it is what lets the unwinder run a deferred block after the frame that registered it is gone.

LANGUAGE_SPEC.md R-DEFER-5 states the rule, and docs/07-control-flow.md shows the rejected form and the pointer form. The R-DEFER-3 demonstration now writes through a pointer, which proves the ordering rule more directly: the write happens, and the returned value was evaluated before it. Covered by tests/LanguageSpecControlFlow.test.ts, which rejects the scalar, element, and `++` forms and runs the pointer form at O0/O3.

### BUG-357: A spec conversion ignores inherited methods

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: R-SPEC-3 states that a child struct implements the specs of its parent, and calling an inherited method directly worked. Converting that child to a spec pointer did not: building the method table looked only at the methods the struct declared itself, so a child that overrode part of a spec and inherited the rest was rejected during code generation.

```bpl
spec Shape { frame area(this: *Self) ret int; frame name(this: *Self) ret string; }
struct Base : Shape {
    w: int,
    frame area(this: *Base) ret int { return this.w; }
    frame name(this: *Base) ret string { return "base"; }
}
struct Middle : Base {
    h: int,
    frame area(this: *Middle) ret int { return this.w * this.h; }
}
frame describe(s: *Shape) { printf("%s %d\n", s.name(), s.area()); }
frame main() ret int {
    local m: Middle;
    describe(&m);   # Error: Struct Middle does not implement method name of spec Shape
}
```

A child that declared every required method itself worked, and a child that declared none of them also worked, because the parent's own table was reused. The failure needed a partial override, which is the ordinary reason to derive from an implementing struct. The type checker accepted the program; only code generation rejected it, and the failure was a bare error without source location.

**Resolution**: The method-table builder resolves each required method through the inheritance chain and calls the implementation belonging to the nearest ancestor that declares it (`findSpecMethodImplementation` in compiler/backend/codegen/UnaryExpressionGenerator.ts). The thunk's callee is mangled with that ancestor's name rather than the converted struct's, since the inherited symbol belongs to the ancestor, and its `this` parameter already has the ancestor's type, so the thunk casts to the right struct. A generic ancestor is monomorphized first, so the mangled name matches the instantiated symbol.

Covered by tests/LanguageSpecDeclarations.test.ts, which converts a three-level chain where the middle struct overrides one required method and inherits the other, and the leaf inherits that override and overrides the other. Dispatch is checked through `*Spec`, through the leaf directly, and through a pointer to the middle struct, at O0/O3 with LLVM validation.

### BUG-358: Destructors skip tuple elements and destructured locals

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: The ownership walk from BUG-354 covered structs and fixed arrays but not tuples, so a tuple holding a destructible value leaked it, and a local bound by tuple destructuring was never registered for cleanup at all:

```bpl
local r: Res;
local t: (Res, int) = (r, 5);        # t's copy of Res never destroyed
local (first: Res, second: int) = t; # first never destroyed
```

**Resolution**: A tuple lowers to a plain aggregate, so its elements are reached with `getelementptr` exactly as struct fields are, and the walk recurses through them (`registerAutoDestroy` in compiler/backend/codegen/StatementGenerator.ts). The tuple-destructuring branch of variable generation now registers each target, since a destructured target is an ordinary local. Each copy is destroyed once, in reverse declaration order. Covered by tests/RAIIAutoDestroy.test.ts, which checks tuple elements, nested destructuring, and ordering at O0/O3 with LLVM validation; the same program was verified to produce identical output at O0, O1, O2, and O3.

### BUG-359: An enum payload silently skips its destructor

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: An enum payload holding a type with `@[auto_destroy]` was never destroyed, with no diagnostic:

```bpl
enum Slot { Has(Res), Empty }
frame scoped() {
    local r: Res;
    local s: Slot = Slot.Has(r);   # the copy inside s is never destroyed
}
```

Unlike a struct field or an array element, which payload is present is known only at run time, so cleanup has to select a destructor from the variant tag. Nothing did, and the value leaked.

**Resolution**: The enum declaration is rejected with `BPL_AUTO_DESTROY_ENUM_PAYLOAD`, naming the variant and the owning struct, and pointing at the alternatives: hold a pointer in the payload and free it explicitly, or drop the attribute and call `destroy` directly. The check walks the payload type through fields, array elements, tuple elements, and inherited fields, stopping at pointers, which do not own their target (`findAutoDestroyOwner` in compiler/middleend/TypeChecker.ts). Rejecting was chosen over implementing tag-directed cleanup because the latter is a new mechanism in the unwinding path rather than a fix, and a silent leak is worse than a clear error. Covered by tests/RAIIAutoDestroy.test.ts for both tuple and struct payload forms.

**Remaining gap**: tag-directed cleanup is still unimplemented, so an owning enum payload cannot be expressed at all. Lifting the restriction means emitting a switch on the tag at every cleanup site, including the throw path.

### BUG-360: A by-value parameter is never destroyed

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: Passing a value with an `@[auto_destroy]` destructor to a frame gave the callee its own copy, and that copy was never destroyed:

```bpl
frame takesByValue(r: Res) ret int { return r.id; }   # r's copy leaks
frame main() ret int {
    local a: Res;
    takesByValue(a);     # only main's 'a' is ever destroyed
}
```

Cleanup was registered from variable declarations only, and a parameter is not one, even though parameter storage is an ordinary stack slot the callee owns.

**Resolution**: Parameters whose type owns a destructor are registered when the body's scope is pushed, since their storage is allocated before that scope exists (`pendingParameterAutoDestroy` in compiler/backend/codegen/StatementGenerator.ts). They are then cleaned up like a local declared at the top of the body: destroyed when the frame returns, destroyed when a `throw` leaves it, and moved rather than destroyed when the parameter itself is returned. A pointer parameter owns nothing, so `this` is unaffected and a method does not destroy its receiver. Covered by tests/RAIIAutoDestroy.test.ts, which checks the move, the method receiver, two parameters destroyed in reverse order, and the throw path at O0/O3 with LLVM validation; the same program was verified to produce identical output at O0 and O3.

### BUG-361: A caught value is never destroyed

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: A `catch` clause copies the thrown value into its binding, and that binding was never destroyed:

```bpl
try {
    throw make(4);
} catch (caught: Res) {
    printf("%d\n", caught.value);
}   # nothing destroys 'caught'
```

Once the exception storage is released, the handler holds the only copy, so nothing else could destroy it.

**Resolution**: A catch binding whose type owns a destructor is registered with the handler's block scope, so it is destroyed when the handler exits, including when the handler leaves by throwing again. Registration goes through a new `ownedStorage` argument to block generation, which covers storage that belongs to a scope although it was allocated before that scope was pushed. By-value parameters (BUG-360) were moved onto the same argument, replacing the field they used, so the entries cannot be picked up by an unrelated block generated in between. Covered by tests/RAIIAutoDestroy.test.ts, which checks a nested handler that rethrows and a multi-clause catch at O0/O3 with LLVM validation.

**Remaining gap**: two positions still have no owner. A value returned into a discarded expression statement, as in `makeResource();`, is not destroyed, since nothing binds it and there is no temporary lifetime to attach cleanup to. A global with a destructor is never destroyed, because program exit runs no cleanup. Both are documented in docs/21-constructors-destructors.md.

### BUG-362: An inline-assembly example overran a local's storage

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-17)**: `examples/asm_x86_test` stored an `i64` result into `res`, declared `local res: int`, which is 32 bits:

```bpl
asm {
    %res_val = call i64 asm sideeffect "movq $$42, %rax; movq %rax, $0", "=r,~{rax},..."()
    store i64 %res_val, i64* (res)
}
```

An interpolated `(res)` is the variable's own storage, and LLVM pointers carry no element type, so nothing rejected an eight-byte store into a four-byte slot. The program printed `Result: 42` unoptimized and `Result: 0` at `-O 3`. The integration suite runs examples at the default optimization level, so it never saw the second result.

Found by a differential sweep that ran all 479 examples at `-O 0` and `-O 3` and compared output and exit status. It was the only real difference; three other examples differed solely in printed stack or heap addresses, which vary per run.

**Resolution**: The example uses `i32` and `%eax` to match the width of `int`, and prints `Result: 42` at O0, O1, O2, and O3. docs/35-inline-assembly.md states that the interpolated pointer is unchecked and that a store wider than the variable overruns it silently. The compiler is unchanged: a raw assembly block is an escape hatch whose contents it does not type-check.

### BUG-363: Returning the address of a local's field or element is accepted

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: Returning `&local` was rejected, but the check matched only an address-of applied directly to an identifier. Taking the address of a field or an element of that same local produced the same dangling pointer and compiled without complaint:

```bpl
frame leakField() ret *int {
    local holder: Holder;
    return &holder.field;   # accepted
}
frame leakElement() ret *int {
    local values: int[2];
    return &values[0];      # accepted
}
```

**Resolution**: The check resolves an address-of expression to the variable whose storage it refers to, walking through field and element access (`rootStackOperand` in compiler/middleend/StatementChecker.ts). The walk stops at a pointer, so `&pointer.field` and `&pointer[i]` remain valid: what a pointer refers to is not this frame's storage. Verified that returning through a pointer parameter, a global, and a pointer element still compiles and returns the right values. The existing `_` prefix still suppresses the check.

**Remaining gap**: this is a storage check, not an escape analysis. An address assigned to a local pointer and then returned (`local p: *int = &x; return p;`), or written through an out-parameter (`*out = &x;`), is still accepted. Both need dataflow through pointer values, which this check does not do; docs/15-pointers.md states the limit and shows the undetected form.

### BUG-364: `String.includes` disagrees with `indexOf` about the empty text

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-17)**: Four search methods on `String` answered the same question differently for an empty search text:

| Call | Result before | Convention |
| --- | --- | --- |
| `s.includes("")` | `false` | true |
| `s.indexOf("")` | `0` | 0 |
| `s.startsWith("")` | `true` | true |
| `s.endsWith("")` | `true` | true |
| `s.lastIndexOf("")` | `s.length` | length |

`includes(x)` should agree with `indexOf(x) >= 0`, and for every other method in the same file an empty text is present. Only `includes` treated it as absent, which silently reverses code such as a filter that includes everything when its query is empty.

**Resolution**: `includes` returns true for an empty text, matching `indexOf` and the behavior of C `strstr` and the containment operations of other languages. A null text is still rejected rather than treated as empty, and a non-empty text is unaffected. `count` deliberately keeps reporting zero for an empty text, since a count of empty matches is not meaningful; docs/29-stdlib-string.md now states the whole family's behavior, including that exception. Covered by tests/StdlibStringEmptyNeedle.test.ts at O0/O3 with LLVM validation.

### BUG-365: `String.substring` crashes on a length near the integer maximum

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: `substring` clamped its copy length by comparing `start + len` against the string's length. That sum overflows for a large length, so the comparison failed, the clamp was skipped, and the copy length stayed enormous:

```bpl
local text: String = String.new("hello");
local part: String = text.substring(1, 2147483647);   # SIGSEGV
```

With `start` at 0 the sum still fit and the call behaved; any non-zero start overflowed. The oversized allocation that followed failed, and the copy loop wrote through the resulting null pointer, so the program died with a segmentation fault. Had the allocation succeeded, the loop would have read far past the end of the source.

**Resolution**: The length is compared against the bytes remaining, `this.length - start`, which cannot overflow because `start` is already known to be within the string. The out-of-range guards are unchanged, so a negative start, a start at or past the end, and a non-positive length still return an empty String. docs/29-stdlib-string.md states that the length is clamped to the end. Covered by tests/StdlibStringSubstringBounds.test.ts, which checks whole, oversized, interior, trailing, maximum-length, zero, negative, and out-of-range arguments, plus an empty receiver, at O0/O3 with LLVM validation.

### BUG-366: `String.repeat` overflows its size computation

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: `repeat` computed its result size as `this.length * count` in `int`, which wraps:

```bpl
String.new("ab").repeat(2000000000);   # SIGSEGV
```

A wrapped size is either negative, so the allocation fails and the copy loops write through the resulting null pointer, or small and positive, so the allocation succeeds and the loops overrun it by the full untruncated length. The second case is a heap buffer overflow driven by the `count` argument. `replaceAll` in the same file already guarded its size and threw; `repeat` did not.

**Resolution**: The size is computed in `long`, so it cannot wrap, and is rejected before allocating if it would not fit in the signed `int` length of a `String`, throwing `"String.repeat result too large"`. A failed allocation throws as well, matching `replaceAll`. A count of zero or less still returns an empty String, and ordinary repeats are unchanged. docs/29-stdlib-string.md states that `repeat` and `replaceAll` throw when the result would not fit or the allocation fails. Covered by tests/StdlibStringSubstringBounds.test.ts at O0/O3 with LLVM validation.

### BUG-367: By-value automatic-destructor parameters duplicate heap ownership

**Status**: Open — confirmed during review of `c5911822`

**Priority**: P1

**Observed (2026-09-17)**: A struct with a heap pointer and an `@[auto_destroy]`
method calling `free(this.data)` is shallow-copied when passed to a by-value
parameter. The new parameter cleanup frees that pointer when the callee returns;
the caller still owns its original local and frees the same allocation again.
A minimal program allocating 16 bytes, calling `use(r)`, and returning from
`main` passes `check` and aborts with `free(): double free detected in tcache 2`.
The parameter regression tests use printing destructors, so they do not detect
this resource-ownership failure. Returning the copied parameter to another local
also duplicates ownership. Pass a pointer and keep one explicit owner as a
workaround. A fix must coordinate copying/moving and cleanup, rather than only
adding destructor calls.

Baseline comparison: the same observable allocation program passes at
`2ff45b01` and double-frees at `004ef27c`, at both O0 and O3, with and without
AddressSanitizer. Printing the passed pointer prevents optimization from
eliminating the allocation and masking the defect. Complete reproductions and
review coverage are in docs/audits/2026-09-17-last-15-review.md.

### BUG-368: Owning enum rejection misses aliases and generic payloads

**Status**: Open — confirmed during review of `bffa7fe1`

**Priority**: P1

**Observed (2026-09-17)**: `findAutoDestroyOwner` inspects raw declaration types
without resolving aliases or substituting generic arguments. All three forms
below pass `check`, compile, and exit without invoking `Resource.destroy`:
`enum Slot<T> { Has(T), Empty }` instantiated with `Resource`,
`enum Slot { Has(Box<Resource>), Empty }` where `Box<T>` owns a `T` field, and
`enum Slot { Has(R), Empty }` where `type R = Resource`. `Resource` declares an
`@[auto_destroy]` method. Payloads are constructed from temporaries, so no other
local owns or destroys the value. The documented blanket rejection is therefore
incomplete. Until fixed, avoid owned enum payloads, including indirect ones.

### BUG-369: Stack-address validation rejects borrowed slice elements

**Status**: Open — confirmed during review of `93a113d4`

**Priority**: P2

**Observed (2026-09-17)**: `frame first(xs: int[]) ret *int { return &xs[0]; }`
is rejected as returning stack storage even when `xs` borrows an array in the
caller. `rootStackOperand` stops at pointer types but walks through slice
indexing, mistaking the borrowed element's address for the local slice
descriptor's address. Slice element access must be distinguished from fixed-array
storage; returning an address into a local fixed array must remain rejected.

### BUG-370: Inherited spec dispatch leaves ancestor generic types unresolved

**Status**: Open — confirmed during review of `72d7ab70`

**Priority**: P1

**Observed (2026-09-17)**: `Base<T>` implements a spec and `Child : Base<int>`
inherits its method. Converting `&child` to the spec pointer passes `check` but
fails native compilation: the generated thunk references undefined
`%struct.Base_T`. `findSpecMethodImplementation` identifies the ancestor's
symbol, but the thunk substitutes the child's generic map into the ancestor's
method signature instead of the ancestor's concrete arguments. A generic
`Child<U> : Base<U>` also fails with unresolved `%struct.Base_U`. The added
regression covers only non-generic ancestors, so inherited dispatch is still
incomplete.

### BUG-371: Deferred slice element writes are rejected as discarded captures

**Status**: Open — confirmed during review of `315ff3d8`

**Priority**: P2

**Observed (2026-09-17)**: `frame update(xs: int[]) { defer { xs[0] = 42; } }`
is rejected with `BPL_CAPTURED_VALUE_ASSIGNED`. Copying the slice descriptor
preserves the borrowed data pointer, so this writes to the original backing
array rather than a discarded value copy. `CaptureAnalyzer` stops at raw
pointers but not slice element access. The same helper is used for lambda
captures. Rebinding a captured slice and mutating a captured fixed array must
remain distinguished from writing through a slice.

### BUG-367: Destroying a by-value parameter double-frees the caller's resource

**Status**: Fixed (cleanup withheld; copy rejection tracked below)

**Priority**: P0

**Observed (2026-09-17)**: BUG-360 made a callee destroy its by-value parameters. A by-value argument is a bitwise copy and BPL has no move semantics, so the caller kept owning the same resource and both copies freed it:

```bpl
struct Resource {
    data: *void,
    @[auto_destroy]
    frame destroy(this: *Resource) ret void { free(this.data); }
}
frame use(r: Resource) ret void { printf("%p\n", r.data); }
frame main() ret int {
    local r: Resource = Resource { data: malloc(16) };
    use(r);          # double free at O0 and O3
    return 0;
}
```

The change turned a leak into memory corruption, which is strictly worse. It was not caught because the destructor tests print counters rather than freeing an allocation, so duplicated ownership looked like an extra line of output rather than a fault. A callee cannot tell whether its argument was a temporary it may consume or a copy the caller still owns, so callee-side cleanup cannot be made correct on its own.

**Resolution**: The parameter cleanup from BUG-360 is withheld. The reproduction above exits cleanly at O0 and O3, and under AddressSanitizer. The test for it is skipped rather than deleted, with the reason recorded, because the cleanup becomes correct once copying an owning value is rejected: every by-value argument is then necessarily a fresh value whose ownership transfers.

**Remaining gap**: the leak BUG-360 described is back. An owning temporary passed directly to a frame, as in `use(make())`, is destroyed by nobody. More importantly, the same duplicated ownership exists wherever an owning value is copied, which predates this batch: `local copy: Resource = original;` frees the same allocation twice at every optimization level. Copying an owning value is what has to be rejected; that is tracked as BUG-372.

### BUG-372: Copying a value that owns a destructor duplicates ownership

**Status**: Open

**Priority**: P0

**Observed (2026-09-17)**: A value whose type has an `@[auto_destroy]` destructor is copied bitwise, and every copy is destroyed:

```bpl
local original: Resource = Resource { data: malloc(16) };
local copy: Resource = original;    # both destroyed, same allocation freed twice
```

This is not specific to parameters (BUG-367); it applies to initializing a local from another, assigning one, storing one into a field, an array element, or a tuple, and passing one as an argument. It predates the ownership work: the baseline destroyed directly-typed locals, so two locals holding the same resource already double-freed.

The destructor tests did not detect it because they count destructor calls instead of releasing a resource, so a duplicated owner reads as an extra counter increment.

**Planned resolution**: reject copying an owning value in the type checker. Producing one fresh, returning a local, and throwing a local remain valid, because each transfers ownership rather than duplicating it. Once copies are rejected, every by-value argument and every stored owning value is a transfer, which makes the withheld parameter cleanup from BUG-367 correct and lets it be restored.

### BUG-369: Returning an address into a borrowed slice is rejected

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-17)**: BUG-363 taught the stack-address check to walk through field and element access to the variable that owns the storage, but it treated slice indexing like indexing a local fixed array:

```bpl
frame first(xs: int[]) ret *int { return &xs[0]; }   # rejected
```

A slice is a non-owning view (R-ARR-3): only the descriptor is local, and the elements belong to whoever owns the backing array, so the address legitimately outlives the frame. The program compiled at the baseline.

### BUG-371: A deferred write through a slice is rejected

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-17)**: BUG-356 rejects writes to a captured variable because the block holds a copy, and the walk stopped at a pointer but not at a slice:

```bpl
frame update(xs: int[]) { defer { xs[0] = 42; } }   # rejected
```

A captured slice descriptor still carries the backing pointer, so the write reaches the caller's array and is observable (R-ARR-8). The program printed 42 at the baseline. The same shared walk affects lambda captures.

**Resolution (both)**: The two walks share one predicate, `TypeUtils.isBorrowedIndirection`, which is true for a pointer and for a slice, so reaching through either stops the search for owned storage. A fixed array keeps its previous treatment in both checks: returning `&local[0]` is still rejected, and writing to a captured fixed array's element is still rejected, because that storage is the frame's own. LANGUAGE_SPEC.md R-LAMBDA-4 and R-DEFER-5, docs/15-pointers.md, docs/07-control-flow.md, and docs/53-lambdas.md now distinguish borrowed slices from owned arrays. Covered by tests/LanguageExploration_2026_05_26.test.ts and tests/LanguageSpecControlFlow.test.ts.

### BUG-368: The enum ownership guard misses aliases and generic arguments

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: The rejection added for BUG-359 walked the payload types a variant declared, without resolving aliases or substituting generic arguments, so three ways of naming the same owning type passed:

```bpl
enum Slot<T> { Has(T), Empty }              # Slot<Resource> accepted
struct Box<T> { value: T }
enum Slot { Has(Box<Resource>), Empty }     # accepted
type Held = Resource;
enum Slot { Has(Held), Empty }              # accepted
```

Each compiled and leaked at O0 and O3. All three leaked at the baseline as well, so this was an incomplete fix rather than a new defect, but the destructor guide claimed owning payloads were rejected, which was too broad.

**Resolution**: The walk resolves type aliases and binds a declaration's type parameters to the arguments at each use (`findAutoDestroyOwner` and `bindGenericArguments`, now shared in compiler/middleend/TypeCheckerBase.ts). A generic parameter is registered as an alias of itself, so alias names are marked while following them; without that the walk did not terminate. Payloads that mention a type parameter are checked again at each instantiation: uses are recorded while types are resolved and examined in a pass after checking, since type resolution is hot and re-entrant, and running the walk inside it hung the compiler. Covered by tests/RAIIAutoDestroy.test.ts for the generic argument, the generic wrapper, and the alias, alongside the direct forms.

### BUG-370: An inherited spec method keeps its ancestor's type parameters

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: BUG-357 made a spec's method table use a method inherited from an ancestor, but built the thunk with the converted struct's own substitutions. A method inherited from a generic ancestor therefore kept that ancestor's type parameters:

```bpl
struct Base<T> : Value { value: T, frame get(this: *Base<T>) ret int { ... } }
struct Child : Base<int> { tag: int }
use(&c);   # error: use of undefined type named 'struct.Base_T'
```

Checking succeeded and code generation emitted a thunk casting to `%struct.Base_T`, which does not exist. A generic child of a generic parent, `Wrapper<U> : Base<U>` used as `Wrapper<int>`, failed the same way with `%struct.Base_U`. Both failed at the baseline too, in an earlier phase, so this was incomplete generic support rather than a new defect.

**Resolution**: The search up the inheritance chain now carries substitutions. Each parent's type parameters are bound to the arguments the child supplies, resolved through the bindings gathered so far, and the walk starts from the converted struct's own substitutions so a parent named `Base<U>` resolves `U` to the concrete argument. The implementation's signature is substituted with those bindings as well as the struct's, so the thunk casts to the instantiated ancestor and calls its monomorphized symbol. Covered by tests/LanguageSpecDeclarations.test.ts, which dispatches through a spec for a non-generic child of `Base<int>` and a generic child passing its own argument, at O0/O3 with LLVM validation.

### BUG-368 revalidation: generic enum ownership guard remains incomplete

**Status**: Reopened after validating `305d0375`

**Priority**: P1

**Observed (2026-09-17)**: The original direct generic, alias, and single-wrapper
reproductions are now rejected, but three additional cases pass `check`, compile,
and exit at O0/O3 without invoking the payload's destructor:

- Declare `Slot<*Resource>` before constructing `Slot<Resource>`.
- Declare `Slot<Box<int>>` before constructing `Slot<Box<Resource>>`.
- Declare `enum Slot<T> { Has(Box<Box<T>>), Empty }` and construct
  `Slot<Resource>.Has(...)` from fresh nested wrapper literals.

The first two are order-dependent: removing the earlier safe declaration makes
the unsafe construction fail with `BPL_AUTO_DESTROY_ENUM_PAYLOAD` as intended.
`recordEnumInstantiation` keys basic arguments by name alone, discarding pointer
depth and nested generic arguments, so distinct instantiations collide. The
nested wrapper case also loses enclosing substitutions while following bindings;
the ownership walk's recursion key similarly omits complete type structure.

The guard additionally rejects a non-owning `Resource[]` slice payload as if it
owned its elements; the walk stops at pointers but does not stop at slices.
That false positive predates the latest fixes. The compiler implementation is
unchanged by this validation; these findings remain open. Reproductions and
validation scope are appended to docs/audits/2026-09-17-last-15-review.md.

### BUG-373: The enum ownership guard conflates instantiations and loses nested substitutions

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: The guard from BUG-368 keyed each instantiation by the plain name of its arguments and substituted only a directly named parameter, so three cases slipped through:

```bpl
enum Slot<T> { Has(T), Empty }
local _safe: Slot<*Resource> = ...;      # checked, correctly accepted
local _bad: Slot<Resource> = ...;        # skipped: same key as Slot<*Resource>

local _safe: Slot<Box<int>> = ...;       # checked
local _bad: Slot<Box<Resource>> = ...;   # skipped: both keyed as Slot<Box>

enum Slot<T> { Has(Box<Box<T>>), Empty }
local _bad: Slot<Resource> = ...;        # accepted: T lost two wrappers deep
```

The first two only leaked when the safe instantiation came first, which is why a single-declaration test passed. The third failed regardless of order, because binding a parameter to a wrapper argument dropped the enclosing bindings.

The same guard also had a false positive: `enum Slot { Has(Resource[]), Empty }` was rejected although a slice borrows its elements, which contradicted the ownership distinction used for the slice fixes.

**Resolution**: Instantiations and walked types are identified by a full type identity, `typeIdentityKey`, covering pointer depth, array and slice dimensions, and generic arguments at every depth. Binding a declaration's parameters substitutes the enclosing bindings into each argument instead of looking it up by name, so a parameter is followed through wrappers of any depth. A slice payload is treated as borrowed and accepted; a fixed array is still owned and rejected.

Covered by tests/RAIIAutoDestroy.test.ts, which puts the safe instantiation first in both conflating cases, nests a parameter two wrappers deep, and runs a slice payload at O0/O3 with LLVM validation.

### BUG-374: An address into a slice over local storage is accepted

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-17)**: The correction for BUG-369 stopped the stack-address walk at every slice, which also accepted a slice that views this frame's own array:

```bpl
frame descriptor() ret *int {
    local items: int[3];
    local view: int[] = items;
    return &view[0];      # accepted, and dangling
}
```

**Resolution**: The walk no longer stops at a slice. It continues to the root and records that it passed through one, and the root decides: a slice parameter views storage the caller owns, so an address into its elements is accepted, while a slice held in a local is treated as this frame's storage. Pointers are unchanged. The remaining imprecision is conservative rather than unsafe: a local slice that views a caller's array is rejected, and the `_` prefix allows it. Distinguishing that case needs the pointer escape analysis that BUG-363 records as absent. docs/15-pointers.md shows both forms. Covered by tests/LanguageExploration_2026_05_26.test.ts alongside the accepted slice-parameter case.

### BUG-375: A repeated generic wrapper skips its nested destructor

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-17)**: The cycle guard in the code generator's ownership walk keyed an instantiation by the plain names of its arguments, which gives a type and its own field the same identity when a wrapper repeats:

```bpl
local deep: Box<Box<Box<Resource>>>;   # nothing destroyed
```

`Box<Box<Box<Resource>>>` keyed as `Box<Box>`, and so did its field `Box<Box<Resource>>`, so the guard treated the field as a cycle and stopped. Two levels of nesting worked, which is why the earlier generic test passed; three did not. This is the code generator's instance of the defect that BUG-373 fixed in the checker.

**Resolution**: The key renders the type at every depth, including pointer depth and array or slice dimensions, so a field can no longer collide with its enclosing type. The walk also treats a slice as owning nothing, matching the checker: a fixed array is storage of its own, a slice borrows its elements. Covered by tests/RAIIAutoDestroy.test.ts, which nests three wrappers and pairs distinct instantiations of the same wrapper in one program, at O0/O3 with LLVM validation.

### BUG-376: Reassigned slice parameters bypass the returned-stack-address check

**Status**: Open

**Priority**: P1

**Observed (2026-09-17, reviewing `c6c851a4`)**: The slice-origin check from
BUG-374 assumes that every slice parameter still borrows the caller's storage.
Parameters are mutable, so a parameter can be redirected to a local array:

```bpl
frame leak(xs: int[]) ret *int {
    local own: int[1] = [42];
    xs = own;
    return &xs[0];
}
```

This passes `check` and compiles at O0/O3. Dereferencing the returned pointer
in the caller produced invalid values at both levels. `borrowedFromCaller` in
compiler/middleend/StatementChecker.ts exempts the root solely because its
symbol is a parameter, without considering reassignment. The new local-slice
regression test does not cover this case. No implementation change was made
during validation. Until origin tracking exists, the exemption must account
for writes to the parameter or conservatively reject this return path.

### BUG-376: A rebound slice parameter escapes as a dangling pointer

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-17)**: The correction for BUG-374 exempts a slice parameter from the stack-address check, because it views storage the caller owns. Assigning the parameter first defeats that:

```bpl
frame first(xs: int[]) ret *int {
    local items: int[3];
    xs = items;
    return &xs[0];      # accepted, and dangling
}
```

**Resolution**: The exemption applies only to a parameter the frame never assigns to. Each function's body is scanned once for assignments that replace a parameter as a whole, and a rebound parameter is treated as this frame's storage. Writing through a parameter, `xs[0] = value`, does not rebind it and keeps the exemption. Covered by tests/LanguageExploration_2026_05_26.test.ts.

### BUG-372: Copying a value that owns a destructor duplicates ownership

**Status**: Fixed

**Priority**: P0

**Observed (2026-09-17)**: A value whose type has an `@[auto_destroy]` destructor was copied bitwise, and every copy was destroyed, so the same resource was released twice:

```bpl
local original: Resource = Resource { data: malloc(16) };
local copy: Resource = original;    # double free at O0 and O3
```

This predates the ownership work, applied to every position that stores a value, and was the reason a callee could not safely destroy its by-value parameters (BUG-367). AddressSanitizer confirmed the double free. The destructor tests counted destructor calls instead of releasing a resource, so a duplicated owner looked like an extra line of output.

**Resolution**: Reading an owning value out of existing storage is rejected with `BPL_OWNING_VALUE_COPIED`, at every position that would store the result: a variable initializer, the right of an assignment, a call argument, a struct field, a tuple or array element, and the source of a destructuring. Handing ownership over is unaffected, because it leaves a single owner: a value produced fresh by a call or a literal, a returned local or parameter, and a thrown local.

With copies rejected, a by-value argument is necessarily a transfer, so the parameter cleanup withheld for BUG-367 is correct and has been restored. That also closes the leak it was introduced for: `use(make())` now frees the temporary in the callee, verified under AddressSanitizer.

Breaking change. Nothing in the standard library, the examples, or the packages uses `@[auto_destroy]`, so no existing program changed; three of this session's own tests did, because they were written against the unsound behaviour, and they now pass fresh values instead of copying named ones.

**Remaining gaps**: assigning over a value that already owns a resource does not destroy the old one first, so the overwritten resource leaks. A tuple of owning values can be built and destroyed but not read, since destructuring copies its elements. Both are recorded in docs/21-constructors-destructors.md.

### BUG-377: A loop's init variable outlives the loop and clobbers the name it shadows

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-18)**: A variable declared in a loop's init is scoped to the loop, but code generation never restored a name it shadowed, so the outer binding kept pointing at the loop's storage:

```bpl
local i: int = 100;
loop (local i: int = 0; i < 3; i = i + 1) { }
printf("after %d\n", i);       # prints 3, not 100
```

When the shadowed name is a parameter of another type the result is worse than a wrong value. A slice parameter shadowed by an `int` was read as a slice descriptor after the loop, so returning `&xs[0]` faulted:

```bpl
frame first(xs: int[]) ret *int {
    loop (local xs: int = 0; xs < 2; xs = xs + 1) { }
    return &xs[0];              # SIGSEGV, address 0x200000002
}
```

Blocks already saved and restored the names they declared; the loop's init was generated without that, since it is not part of the body block.

**Found by**: fixing BUG-379. The false positive in the parameter-rebinding check had been rejecting exactly these programs, so the code generation defect behind them could not be reached. Removing the false positive turned a spurious compile error into a crash, which is how it surfaced.

**Resolution**: The names a loop's init declares are saved before it is generated and restored after the loop ends, matching what block generation already did (`generateLoop` in compiler/backend/codegen/StatementGenerator.ts). Covered by tests/LoopVariableScope.test.ts, which checks the shadowed outer value, an ordinary loop counter, and the slice-parameter case at O0/O3 with LLVM validation.

### BUG-378: Finite nested generic aliases are rejected as recursive

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `Identity<Identity<int>>` expands finitely to `int`, but was rejected with `Recursive type alias 'Identity' detected`, while `Identity<int>` was accepted:

```bpl
type Identity<T> = T;
frame main() ret int { local value: Identity<Identity<int>> = 7; return value; }
```

Alias resolution added the alias name to its cycle stack before resolving the generic arguments, so a nested use of the same alias in an argument looked like a cycle in its own expansion.

**Resolution**: A generic argument is a type in its own right, so the arguments are resolved before the alias joins the cycle stack. Naming the alias in its own body is still a cycle and still terminates: the guard is in place while the substituted body is resolved. Verified that directly recursive, indirectly recursive, and generic self-referential aliases are rejected exactly as before this change. Covered by tests/TypeAliasRecursion.test.ts, which runs one, two, and three levels of nesting plus a nested array alias, and keeps the three recursive forms rejected.

### BUG-379: A shadowing local is mistaken for rebinding a parameter

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The rebinding scan added for BUG-376 matched assignments by name, so a local that shadowed a slice parameter made the parameter look rebound and its element addresses were rejected:

```bpl
frame first(xs: int[]) ret *int {
    { local xs: int = 1; xs = 2; }
    return &xs[0];             # rejected: 'xs' treated as rebound
}
```

**Resolution**: The scan follows lexical scope. Declarations in blocks, loop inits, catch clauses, and match arm patterns shadow the parameter name for as long as they are in scope, and a lambda body is skipped entirely because writing to a captured variable is already rejected, so nothing inside one can rebind a parameter. Rebinding from an inner block, or after a shadow has ended, is still detected. Covered by tests/LanguageExploration_2026_05_26.test.ts.

### BUG-380: Standard library arithmetic loses representable answers to intermediate values

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: Five numeric operations produced wrong results for operands whose answers are perfectly representable, because an intermediate value was not. Each was confirmed at O0 and O3, exiting normally with incorrect output.

| Call | Result | Expected |
| --- | --- | --- |
| `Stats.median` of two `2147483647` | `-1.0` | `2147483647.0` |
| `Range.new(-2000000000, 2000000000, 2000000000).len()` | `0` | `2` |
| `Range.betweenInclusive(2147483646, 2147483647).len()` | `0` | `2` |
| `Rational.fromLong(4611686018427387904).compare(&half)` | `-1` | `1` |
| `Rational.fromLong(4611686018427387904).round()` | `-4611686018427387904` | `4611686018427387904` |
| `Complex.fromReal(2.0).pow(-2147483648)` | `1.0` | `0.0` |
| `Complex.new(3e200, 4e200).abs()` | `inf` | `5e200` |

The causes differ but share a shape: the median added two `int` values before widening; `Range` computed spans, counts, and membership offsets in `int` although a span can exceed it, and `betweenInclusive` incremented an already maximal endpoint; `Rational.compare` cross-multiplied and `round` doubled the numerator; `Complex.pow` negated an `int` exponent, which leaves the minimum negative so the loop never ran; and `Complex.abs` squared both components at full magnitude.

**Resolution**: Each computes the answer without forming a value it cannot hold. The median widens both operands before adding. `Range` holds its exclusive end as `long`, so an inclusive maximum endpoint is representable, and computes lengths, offsets, and reversal in `long`. `Rational.compare` compares whole parts and then remainders through their reciprocals, and `round` compares the remainder against what is left of the denominator instead of doubling. `Complex.pow` widens the exponent before negating it, and `Complex.abs` factors out the larger component and squares only the ratio.

Covered by tests/StdlibNumericBoundaries.test.ts at O0/O3 with LLVM validation, including ordinary controls, a descending range, negative rounding, and a zero magnitude.

### BUG-381: The argument parser selects flags by prefix

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `matchFlag` accepted any argument beginning with a flag's name or alias, without checking what followed. An unregistered `--outline=file` was accepted as `--out`, and when one flag's name was a prefix of another's, registration order decided which won, so `--output=file` selected `--out`.

**Resolution**: An argument names a flag when it is exactly the name, or the name followed by `=` introducing a value (`namesFlag` in lib/arg_parser.bpl). Aliases are matched the same way, so `-op` no longer selects `-o`. Covered by tests/ArgParser.test.ts, which registers the prefix flag first and checks the overlapping name, the unregistered name, the bare name, and both alias forms.

### BUG-382: Complex magnitude mishandles infinite and NaN components

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The scaled magnitude introduced for BUG-380 dropped the non-finite cases the previous implementation handled. `Complex.new(inf, inf).abs()` divided infinity by infinity and returned NaN instead of infinity, and `Complex.new(0.0, nan).abs()` returned zero: comparисons against NaN are unordered, so the components were not ordered and the zero shortcut answered before the NaN was seen.

This was introduced by that fix; the implementation before it returned infinity and NaN for these inputs.

**Resolution**: An infinite component returns an infinite magnitude before the ratio is formed, whatever the other component is, and a NaN component returns NaN before the zero shortcut. `Math.isNan` and `Math.isInfinite` are new predicates: NaN is the only value unequal to itself, and halving any finite non-zero value changes it while halving an infinity does not. Covered by tests/StdlibNumericBoundaries.test.ts for both component orders, both infinite, infinite beside NaN, NaN beside zero, and an ordinary magnitude.

### BUG-383: Comparing an invalid rational divides by zero

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The comparison introduced for BUG-380 divides by each denominator. The constructor represents a zero denominator as the invalid `0/0` value, which other methods guard, so comparing one stopped the program with a division-by-zero failure. The cross-multiplying comparison it replaced never divided.

**Resolution**: An invalid operand is ordered rather than divided by: two invalid values compare equal, and an invalid value orders below every valid one, which keeps the comparison total and deterministic for `lessThan` and the other callers built on it.

### BUG-384: Range reversal cannot negate the minimum step

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `reverse` negated the step in `int`, and negating the minimum leaves it negative, so reversing a range whose step is `-2147483648` produced a range that stepped the wrong way, reported itself empty, and rejected both of its own elements.

**Resolution**: The step is held as `long`, as the exclusive end already was for BUG-380, so `+2147483648` is representable. Covered by tests/StdlibNumericBoundaries.test.ts, which checks the reversed length, membership of both elements, the first element, and an ordinary reversal.

### BUG-385: Rational sign normalization corrupts the minimum long

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The constructor negated the numerator to make a negative denominator positive. Negating the minimum long wraps, so `Rational.new(-9223372036854775808, -2)` stayed negative although its reduced value, `4611686018427387904`, is representable. `gcd` had the same problem: it took magnitudes before reducing.

**Resolution**: The fraction is reduced before its sign is normalized, and `gcd` takes magnitudes only after the first remainder step, which brings the operands into a range whose magnitude is representable.

### BUG-386: Rational arithmetic overflows before reducing

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `add`, `sub`, `mul`, and `div` formed cross products before the constructor reduced them, so representable answers were lost: `(MAX/2) + (MAX/2)` is exactly `MAX`, and `(MAX/2) * (2/3)` is `MAX/3`, but each returned `-1` over its denominator.

**Resolution**: Multiplication and division cancel across the two fractions before multiplying, so a representable result never passes through an unrepresentable product. Addition and subtraction add the whole parts separately and combine only the proper fractions over their least common denominator. The remaining gap is unchanged and now deliberate: when even the reduced result is unrepresentable, the value wraps rather than reporting failure.

### BUG-387: Vector lengths do not converge

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-18)**: `Vec2.length` and `Vec3.length` ran exactly ten Newton iterations starting from half the sum of squares, regardless of error. For a vector of length one million the estimate starts at 500 billion, so ten halvings come nowhere near: the length was reported as 488281932, and `normalize` returned a vector of length 0.002 instead of one. No extreme input was needed, only an ordinary large magnitude.

**Resolution**: Both take the square root directly through `Math.sqrt`, with the largest component factored out so no square overflows on its own. Covered by tests/StdlibNumericBoundaries.test.ts for a large magnitude, unit normalization, ordinary vectors, negative components, and a zero vector.

### BUG-388: Float statistics overflow for finite samples

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The float `mean` summed before dividing and the float `median` added its central pair before halving, so two copies of `1e308` gave infinity for both although the answer is finite. `variance` then used that infinite mean and returned infinity rather than zero for a constant sample. The integer median repair in BUG-380 did not cover the float overload.

**Resolution**: The mean accumulates one sample at a time, the median halves each central value before adding them, and the variance uses Welford's method, so neither a large sum nor a large mean times a large count is formed. Covered by tests/StdlibNumericBoundaries.test.ts alongside ordinary samples checked against independently computed values.

### BUG-389: Complex division and reciprocal lose finite results

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `div` and `reciprocal` formed the sum of squares of the divisor, which overflows for large components and underflows for small ones. Dividing `3e200 + 4e200i` by itself gave NaN instead of one, and its reciprocal gave zero. Correcting `abs` for BUG-380 did not cover these.

**Resolution**: Both use the scaled method: the smaller part of the divisor is divided by the larger first, so nothing is squared at full magnitude. `reciprocal` is now one divided by the value, sharing that path. Covered by tests/StdlibNumericBoundaries.test.ts, which checks a large divisor, a small divisor, the reciprocal, the product of a value and its reciprocal, and an ordinary control.

### BUG-390: Arc tangent is inaccurate and discontinuous

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `Math.atan` was a four-term Taylor series with the reciprocal identity applied above one. At x = 1 it was about 0.0616 radians, or 3.5 degrees, wrong, and crossing one reversed the sign of that error, so the result jumped by roughly 0.123 radians across an input change of 1e-12. `asin`, `acos`, `atan2`, and `Complex.phase` are built on it and inherited both problems.

The reported classification was an improvement rather than a defect, because the source described itself as an approximation. It is recorded as a bug here: the error was large enough to make a documented example wrong, and the discontinuity is not a matter of precision.

**Resolution**: `Math.atan` calls the platform implementation, as `sqrt`, `sin`, `cos`, and `pow` already did. It now agrees with C `atan` to within 1e-12 across the tested range, and the jump across one is gone. Two expectations in `examples/stdlib_complex` recorded the old error and were corrected against independently computed values: the phase of 3 + 4i is 0.9273, not 0.9330, and the square root of 3 + 4i is exactly 2 + i, where the previous expectation squared back to 2.977 + 4.017i.

### BUG-391: Statistics sort with a complete bubble sort

**Status**: Fixed

**Priority**: P3

**Observed (2026-09-18)**: Both `median` overloads and `percentile` ran a full bubble sort whatever the input, needing n*(n-1)/2 adjacent comparisons: about five billion to take the median of 100,000 samples, and the same quadratic cost for an already sorted one.

**Resolution**: The three sites share an in-place heapsort, which is O(n log n) in the worst case and still leaves the array fully sorted, since callers may depend on that. Sorting 20,000 samples went from 693 ms to 15 ms, with identical results. Covered by tests/StdlibNumericBoundaries.test.ts for duplicates, already sorted and reversed input, single and paired elements, and a check that the array is left in order.

### BUG-392: Streaming mean and midpoint lose opposite-sign extremes and subnormals

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The overflow repairs in BUG-388 introduced two failures of their own, confirmed against the previous implementation, which handled both.

The mean subtracted the running value from the next sample. For `[-1e308, 1e308]` that difference is not representable although the mean is exactly zero, so the result was infinity. The median halved each central value before adding them, and halving is not exact for subnormals: the two smallest positive subnormals each rounded to zero, so their median became zero instead of that same value. The comment claiming halving is always exact was wrong.

**Resolution**: The mean scales both terms before combining them, `running - running/count + sample/count`, which never forms a difference of two extremes. The median adds first and halves the sum, which keeps subnormals exact, and falls back to halving each value only when the sum itself is not representable.

### BUG-393: Rational addition still overflows before reducing

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: Splitting off whole parts in BUG-386 left the proper fractions to be added directly. For `9223372036854775805/9223372036854775806` added to itself, that sum exceeds the signed range while the reduced answer, `9223372036854775805/4611686018427387903`, does not.

**Resolution**: Both parts are non-negative and each is below the common denominator, so their sum fits an unsigned 64-bit value even when it exceeds the signed range. It is formed and reduced there, then brought back.

### BUG-394: Complex division overflows for divisors near the limit

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: The scaled division in BUG-389 divides the smaller component by the larger, but still forms `real + imag * ratio`, which overflows when both components are near the finite limit. Dividing `(1e308, 1e308)` by itself gave NaN, and its reciprocal zero.

**Resolution**: Both operands are divided by the divisor's largest component before the ratio is taken, so the divisor's components are at most one and the denominator cannot overflow.

### BUG-395: UTF-8 validation accepts non-scalar and malformed encodings

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `UTF8.isValid` asked `codepointByteLength` for a length, and that reports one for any byte it does not recognise, so an isolated continuation byte and an `FF` were read as single characters and accepted. The multi-byte branches also had no surrogate exclusion or upper limit, so `ED A0 80` (U+D800) and `F4 90 80 80` (above U+10FFFF) passed.

**Resolution**: Validation derives both the length and the permitted range of the second byte from the leading byte, which is what excludes overlong forms, the surrogate block, and anything above U+10FFFF. `codepointByteLength` is unchanged, since other callers depend on its current behaviour. Checked against Python's strict decoder over 25 sequences, including every boundary: `E0 9F BF` and `F0 8F BF BF` overlong, `ED 9F BF` and `F4 8F BF BF` valid, truncated sequences, and `C0`/`C1`/`F5`-`FF` leads.

### BUG-396: Integer gcd and lcm lose representable answers

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `Math.gcd` took magnitudes in `int`, and the magnitude of the minimum int is not one, so `gcd(-2147483648, 6)` returned `-2`. `Math.lcm` multiplied before dividing by the common factor, so `lcm(50000, 50000)` overflowed although the answer is 50000.

**Resolution**: Magnitudes are taken in `long`, and the common factor is divided out before multiplying.

### BUG-397: Float modulo forms an overflowing quotient

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `Math.mod` computed `x - floor(x / y) * y`. For `x = 1e308` and `y = 1e-308` the quotient is not representable, so the remainder came back infinite rather than lying in `[0, y)`.

**Resolution**: The platform remainder is used, which never materializes the quotient, and one divisor is added back when the signs differ, preserving the floor-modulo convention the previous implementation had.

### BUG-398: Interpolation loses endpoints for opposite-sign extremes

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: `Math.lerp` and `Stats.percentile` scaled the difference between the endpoints. For `-1e308` and `1e308` that difference is infinite, so even the zero and one positions returned NaN or infinity instead of the endpoints themselves, and the midpoint, exactly zero, was lost.

**Resolution**: Each endpoint is weighted separately, and the two endpoint positions return their endpoint exactly. `percentile` shares `Math.lerp` rather than repeating the formula.

### BUG-399: atan2 mishandles infinities, NaN, and signed zero

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-18)**: Replacing the arc tangent in BUG-390 left `atan2` with its own quadrant logic, which divides before selecting a branch. Infinity over infinity was indeterminate, a NaN argument fell through every comparison to zero, and a negative zero numerator on the negative real axis satisfied `y >= 0` and gave `+pi` where `-pi` is required. `Complex.phase` inherited all three.

**Resolution**: `Math.atan2` calls the platform implementation, as `atan` now does.

### BUG-400: Rational subtraction returns an unrelated fraction

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-19)**: `1/2 - 1/3` returned `3689348814741910323/3689348814741910322`. The unsigned accumulation added for BUG-393 requires a positive denominator, but `sub` was passing a negated one, so the remainders were floored against a negative value and then read as unsigned.

This is ordinary arithmetic, not a boundary case, and it was introduced by the previous fix. It survived a full suite because the rational tests only covered the specific extreme values each report had named; none of them subtracted two ordinary fractions.

**Resolution**: `sub` negates the numerator, which is what `addFractions` is built to accept, and keeps the denominator positive. The minimum long has no positive counterpart, so that one value is subtracted in two halves, which is exact because it is even.

tests/StdlibRationalIdentities.test.ts is the response to how this was missed: it walks every sign combination over a grid of numerators and denominators, 1296 pairs, and checks the laws the operations must obey, including that addition and subtraction invert each other and that reversing a subtraction negates it. It was confirmed to fail against the broken implementation before being kept.

### BUG-401: Complex division overflows for a tiny divisor

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: The scaling added for BUG-394 divides the numerator by the divisor's magnitude, which overflows when the divisor is tiny: `(1 + i) / (1e-308 + 1e-308i)` is about `1e308` and representable, but the scaled numerator was not.

**Resolution**: The two operands are scaled independently, each by its own largest component, so neither can leave the range, and the two scales are reapplied in separate steps afterwards. Combining them into one factor first would overflow for exactly the case that motivated the change. All three divisor regimes now hold together: near the limit, ordinary, and near zero.

### BUG-402: Harmonic mean returns zero for small positive samples

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: `harmonicMean` accumulated `1 / value`, and the reciprocal of `1e-309` is not representable, so the harmonic mean of that value was zero rather than the value itself, even for a single sample.

**Resolution**: The reciprocals are accumulated relative to the largest sample, which makes each term at least one, and the scale is reapplied at the end.

### BUG-403: Vector normalization collapses large vectors to zero

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: `normalize` divided by `length()`. For `(1.5e308, 1.5e308)` the magnitude is not representable although the direction is, so the length came back infinite and the result was the zero vector. Both Vec2 and Vec3 were affected; scaling inside `length` alone does not help, because the value it must return is the part that overflows.

**Resolution**: The components are scaled by their largest magnitude first, and the unit vector is computed from those scaled values, so the unrepresentable magnitude is never formed. The zero-vector policy is unchanged.

### BUG-404: Interpolating identical subnormal endpoints returns zero

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: The weighted endpoint form introduced for BUG-398 halves each endpoint, and halving is not exact for subnormals, so `lerp(x, x, 0.5)` returned zero for the smallest positive subnormal, and `percentile` inherited it for a constant sample.

This is the same mistake as BUG-392, made again in a different function: assuming that scaling each operand separately is free.

**Resolution**: Identical endpoints return that endpoint. Otherwise the span is used directly, which is exact for ordinary values, and the weighted form is kept only for endpoints too far apart to subtract.

### BUG-405: Streaming mean drifts for ordinary samples

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: Accumulating the mean one sample at a time, introduced to survive extreme operands, rounds at every step. The mean of `-3, -1, 1, 3` came out as `-2.2e-16` rather than exactly zero. Summing and dividing once, which it replaced, was exact for those values.

Found by comparing against Python's `statistics.fmean` over a grid of samples rather than by a reported case: the printed value at nine decimal places read as `-0.000000000`, which looks like a signed zero and hides the drift.

**Resolution**: The largest magnitude decides the method. When the samples cannot sum past the range, which is the ordinary case, they are summed and divided once, exactly as before. The scaled accumulation is kept only for samples large enough to overflow, where its rounding is the price of getting an answer at all.

### BUG-406: Complex division discards the sign of a zero

**Status**: Fixed

**Priority**: P3

**Observed (2026-09-19)**: Dividing a zero numerator returned a fixed `(0, 0)`, so the sign the quotient should carry was lost. Twenty-seven of 4753 grid cases disagreed with the same divisions in Python, all of them differing only in the sign of a zero component.

**Resolution**: The shortcut is gone. The scale is set to one when the numerator is zero and the ordinary path runs on the signed zeros themselves, which carries their signs through division as IEEE arithmetic requires.

### BUG-407: Float modulo gives a zero the wrong sign

**Status**: Fixed

**Priority**: P3

**Observed (2026-09-19)**: A zero remainder was returned straight from the platform remainder, which gives it the sign of the dividend. Under the floor convention this function implements, a zero takes the sign of the divisor, so ten of the grid cases disagreed with Python.

**Resolution**: A zero remainder is returned as `0.0 * y`, which carries the divisor's sign.

### BUG-408: Integer gcd and lcm silently wrap

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: `Math.gcd` and `Math.lcm` returned `int`, but neither result fits one in general. The greatest common divisor of the minimum int with itself is 2147483648, and the least common multiple of two coprime ints can approach 2^62; both wrapped silently, so `gcd(-2147483648, -2147483648)` returned `-2147483648`.

The earlier repair for these functions widened their intermediates and left the return type alone, which fixed the reported values and left this one reachable.

**Resolution**: Both return `long`, which every result of two ints fits. Breaking change: the two call sites in the repository, an example and a test, print with `%ld`.

**Validation for all four**: rational addition, subtraction, multiplication and division were compared against Python's `Fraction` over 5040 operations covering every sign combination, complex multiplication and division against Python's `complex` over 4753 operations, statistics against `statistics.fmean`, `pvariance`, `median` and `harmonic_mean`, and `gcd`, `lcm`, `mod`, `lerp`, `atan` and `atan2` against the `math` module over 531 cases. All four groups now agree exactly.

### BUG-409: Signed operations become unsigned inside a generic frame

**Status**: Fixed

**Priority**: P0

**Observed (2026-09-19)**: Every operation whose instruction depends on signedness took the unsigned form when its operands were typed as a type parameter. For `T = int`:

| Expression | Result | Correct |
| --- | --- | --- |
| `lessThan<int>(-2, 1)` | `false` | true |
| `greaterThan<int>(1, -2)` | `false` | true |
| `divide<int>(-7, 2)` | `2147483644` | -3 |
| `cast<long>` of `-5` | `4294967291` | -5 |

The signedness of an operand was decided by looking up its type name in the table of signed primitives. A type parameter is named `T`, which is not in that table, so the answer was "unsigned" and comparison, division, remainder, shift, and widening all silently took the unsigned instruction. The same expressions outside a generic frame were correct, which is why this survived: the comparison tests all used concrete types.

Found while probing the standard library rather than the compiler: `PriorityQueue<int>` returned its smallest element last, because its sift routines compare values of the element type, so a negative element sank instead of rising. Any generic code ordering, dividing, or widening signed integers was affected; `Algorithm.sortAsc` was not, because it takes a concrete `Array<int>`.

**Resolution**: The classifier resolves a type parameter to the argument of the instantiation being generated before classifying it, the same way the rest of code generation resolves parameters. All fourteen signedness decisions share that one helper, so comparison, division, remainder, shift, and widening are all covered. Covered by tests/GenericSignedOperations.test.ts, which checks each operation through a type parameter at `int`, `long`, and `i8`, leaves `u32` and `float` unaffected, and orders a priority queue containing negative elements.

**Note**: `%` and `>>` on an unconstrained type parameter are rejected during checking, since nothing establishes that the parameter is an integer. That is a separate limitation, not part of this defect.

### BUG-410: Library diagnostics are written to standard output

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: `JSON.parse` and the argument parser reported failures with `printf`, so a parse error or a flag complaint landed in the middle of a program's own output. A tool that emits JSON on stdout would have produced invalid output whenever it was handed a malformed document, and the caller had no way to separate the two streams.

The repository already settled this question for the runtime: `Error.printStack` writes to stderr, with the comment that diagnostics must never mix into program output. These three call sites predate that decision.

**Resolution**: Both modules format their message and write it through the runtime's stderr writer. `JSON.parse` still returns a null pointer, so failure handling is unchanged for callers; only the destination of the text moved. Seven test files asserted the messages on stdout and now assert them on stderr, including two that required stderr to be empty and now require it to contain nothing but those diagnostics.

### BUG-411: Indexing a value returned by a call reads through it

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-19)**: `makeInts()[1]` faulted, and `makeText()[0]` faulted at address `0x41`, which is the character `A` the expression should have produced. Indexing takes its base from a slot holding the value, but a call produces a value rather than a location, and the returned pointer was used as that slot: the load read the first element and the index then used it as an address.

```bpl
frame makeText() ret string { ... }          # returns "AB"
printf("%c\n", makeText()[0]);               # SIGSEGV at 0x41
```

Every shape of indexed call was affected, including pointers, arrays returned by value, slices, and strings, as well as writes through one. Member access on a call result was always correct, because there the returned pointer really is the address the field is measured from, and so was dereferencing one.

Found by probing `StringBuilder`, where a test expression indexed `toString()` directly.

**Resolution**: The object of an index is materialized into a slot when it is a call, so the base has the location the index path expects. Member access is untouched. Covered by tests/IndexCallResult.test.ts for pointer, array, slice and string results, a grouped call, a write through a call result, and the unaffected member-access forms, with a separate check that bounds checking still applies to an indexed call result.

### BUG-412: Complex division overflows when rescaling a large quotient

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: The independent operand scaling from BUG-401 reapplies the two scales as `part * valueScale / divisorScale`, which overflows when the numerator is large and the divisor is small but greater than one. `(1.6e308 + 1.6e308i) / (2 + i)` is `9.6e307 + 3.2e307i`, well inside the range, but the scaled real part is about 1.2 and multiplying that by 1.6e308 is not representable, so the real part came back infinite.

Scaling the operands separately is not enough on its own: the order in which the scales are reapplied decides whether the intermediate stays in range.

**Resolution**: The division is applied first when the divisor's scale is greater than one, and the multiplication first otherwise. Each of the four regimes now holds together: a divisor near the limit, an ordinary divisor with a large numerator, a tiny divisor, and equal magnitudes. Verified against 50-digit decimal arithmetic on the binary64 inputs, and the 4753-value comparison against Python's complex type still matches exactly.

### BUG-413: Harmonic mean scaled by the wrong end of the range

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: The scaling added for BUG-402 divides the largest sample by each one, and that ratio overflows as soon as the samples span a wide range. For `[1e-308, 1e308]` the harmonic mean is about `2e-308`, but `largest / smallest` is not representable, so the result was zero. The comment claiming no individual ratio could overflow was wrong: it holds only while the samples are close together, which was the case in the reported reproduction.

**Resolution**: The scale is the smallest sample rather than the largest, which makes every term at most one, with at least one term exactly one, so the sum lies between one and the count. The count is divided by that sum before being scaled back, since forming the count times the smallest sample first could leave the range. Covered by tests/StdlibNumericBoundaries.test.ts for samples spanning the whole range, identical tiny samples, and an ordinary pair.

### BUG-414: Complex division underflows a small component

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: Choosing the order of the two rescaling steps by the divisor's magnitude, as BUG-412 did, avoids one overflow and introduces the opposite failure. For `(1e200 + 1i) / (1e200 + 0i)` the quotient is `1 + 1e-200i`, but dividing the scaled imaginary part by `1e200` before multiplying by the same value rounds it to zero, so the imaginary part was lost.

Three attempts at this now: scaling only the ratio, scaling the operands by their magnitudes and reapplying in a fixed order, and choosing that order by magnitude. Each fixed the case in front of it and broke another, because no order of two separate operations on a representable quotient is safe when each of them can leave the range.

**Resolution**: Each operand is scaled by a power of two taken from its largest component, which is exact and leaves both operands with components of magnitude at most one. The two scales cancel into a single exponent shift, applied once with `ldexp`, which never forms the factor itself and so stays correct where that factor is not representable.

All six stored division cases now hold together at O0 and O3: a numerator near the limit over an ordinary divisor, a small component beside a large one, an ordinary numerator over a tiny divisor, a divisor near the limit, a reciprocal of a subnormal-scale value, and equal magnitudes. A sweep of every pair drawn from 1e-300, 1e-150, 1, 1e150 and 1e300 matches Python exactly, as does the existing 4753-value comparison.

### BUG-415: Normalizing the numerator in complex division discards a small component

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-19)**: `(1e200 + 1e-200i) / 1` returned `1e200 + 0i`. The exponent scaling added for BUG-414 divided both operands down by a power of two taken from their own largest component. For the numerator that step is not free: its two components here lie 2^665 apart, so scaling the real part into `[0.5, 1)` pushes the imaginary part to 2^-1329, below the subnormal range, and it rounds to zero before the division ever runs. The divisor cannot suffer this, because after scaling its quotient components are reapplied by the same shift.

**Resolution**: The numerator is only scaled when it would otherwise overflow during the division, that is when its exponent exceeds 1000; the shift taken is just the excess over that threshold rather than the whole exponent. Below the threshold the numerator is used as it stands, so a small component keeps every bit it has. The divisor is still normalized in full, and both shifts are still folded into one `ldexp` on the result.

**Coverage**: `tests/StdlibNumericBoundaries.test.ts` now divides `(1e200 + 1e-200i)` by one alongside the five regimes it already pinned, so any future rescaling that rounds a component away fails there. A 147-case sweep over component magnitudes from 1e-300 to 1e300 against divisors 1, 1e150 and 1e-150 matches Python exactly, as do the six stored fixtures at O0 and O3 and the 4753-value comparison.

### BUG-416: A codec accepted strings its own decoder could not decode

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-20)**: `Base64.isValid` and `Hex.isValid` answered for a grammar their decoders did not implement. `Base64.isValid("QUJ")`, `("QQ=")` and `("Q")` were all true, and each decoded to nothing: the decoder gathered characters into groups of four and silently dropped a partial group. `Hex.isValid("abc")` and `("414")` were true while the decoder dropped the unpaired digit, and `Hex.isValid("")` was false although the decoder accepted it and Base64 called the empty string valid. In the other direction the decoders were too lenient: `Base64.decodeToString("QU!JD")` skipped the `!` and returned `ABC`, and hex decoding stopped at the first bad character and reported the prefix as a successful decode. `Base64.decodedLength` was documented as approximate and returned `(len * 3) / 4` with no account of padding or whitespace.

A caller had no way to tell a failed decode from an empty one, because both returned 0 with no other signal.

**Resolution**: Each codec now has one scanner that knows the grammar, and `isValid`, `decodedLength` and `decode` all run it, so a string is valid exactly when it decodes. Base64 takes whitespace anywhere, then groups of four, with `=` only in the last one or two places of the final group and nothing but whitespace after it; both the standard and URL-safe alphabets decode. Hex takes an optional `0x` prefix and pairs of digits, with whitespace between pairs but not inside one, which is what Python's `bytes.fromhex` accepts. Anything else is refused: `decode` and `decodedLength` return -1, and `decodeToString` returns nullptr rather than a truncated string. `decodedLength` is now exact.

**Coverage**: `tests/StdlibCodecContract.test.ts` pins 46 accepted and rejected strings, each checked against Python's `base64.b64decode(validate=True)` and `bytes.fromhex`, and asserts the four entry points agree on every one; a second test round-trips every length from 0 to 48 through both codecs including the uppercase hex form. A separate 82-case differential run against Python matched exactly. The encoders were unchanged and already matched Python for every length.

### BUG-417: A bit set asked for the largest possible size crashed

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-20)**: `BitSet.new(2147483647)` segfaulted at O0 and O3. The word count was rounded up in int, so `numBits + 63` wrapped negative, the multiplication by 8 stayed negative, and `memset` received a length that became an enormous `size_t`. `BitSet.new(-5)` did not crash but produced a set reporting a size of -5, for which `all()` was false and no operation could ever make it true. `setAll`, `clearAll` and `clone` also called `memset` and `memcpy` on a possibly-null pointer when the set held no words, and `clearExcessBits` computed `numWords * 64` in int, which leaves the range for a set near the maximum size.

**Resolution**: A negative request is an empty set, as it is for `Deque` and `Queue`. The round-up and the excess-bit arithmetic are done in long, allocation failure throws rather than being written through, and the zero-word case skips the memory calls. 2147483647 bits now allocates its 33554432 words and behaves.

**Coverage**: `tests/StdlibBitSet.test.ts` walks every size from 0 to 130, which crosses the word boundary in both directions, checking count, first and last set bit, flip, clone, equality and the masking of the bits past the end, and pins both extremes of the size range.

### BUG-418: A StringBuilder with a negative capacity wrote through a null pointer

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-20)**: `StringBuilder.new(-5)` segfaulted. The capacity reached `malloc` as a huge `size_t`, which returned null, and the null terminator was written through it immediately. `new(-1)` wrote one byte into a zero-byte allocation instead. No allocation in the type was checked for failure, and `ensureCapacity` computed `length + additional` and `capacity * 2` in int, so a large builder could wrap into a small allocation and then be written past.

**Resolution**: A negative capacity is zero, allocation failure throws, and the sizes in `ensureCapacity` are computed in long with the request refused above 2147483646 rather than wrapping.

### BUG-419: Two modules could declare one C function with different types

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-20)**: A module only sees its own `extern` line. Two modules describing the same C function differently were both accepted: the first declaration was the one emitted, and the other module's calls were generated against a signature the callee does not have. `lib/string_builder.bpl` declared `strlen` as returning `int` while `lib/base64.bpl` declared it as returning `long`, and a program importing both produced `declare i64 @strlen(i8*)` next to `call i32 @strlen(i8* %3)`. On x86-64 that happens to read the low half of the return register and gives the right answer for a string under 2GB; for a return type of a different class, such as a float against an integer, it would read the wrong register entirely. Within one file the conflict was already an error; across modules nothing checked.

**Resolution**: Codegen records the LLVM signature each external symbol is called with and reports `BPL_EXTERN_SIGNATURE_CONFLICT` when a later module describes it differently. The comparison is on what LLVM sees, not on how the types were spelled, so `*void`, `string` and `*char` are interchangeable, as are `long`, `ulong` and `u64`. Declaring no return type stays compatible with any return type, since ignoring a result is something every calling convention allows.

The stdlib is now consistent: `strlen` returns `long` everywhere, which is what C's `size_t` is. The same conflict existed in `packages/bpl-http-parser`, `packages/bpl-db` and `packages/bpl-templ`, and is fixed there too.

**Coverage**: `tests/ExternSignatureConflict.test.ts` builds a three-module program that trips the check, a second that spells the same C types four different ways and must still compile, and a third that imports the stdlib modules which used to disagree.

### BUG-420: Sorting an ordered array overflowed the stack

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-20)**: `Algorithm.quickSort` took the last element as its pivot, which makes an already-sorted array the worst case rather than the easy one: every partition peeled off a single element and the recursion went as deep as the array was long. Sorting 100000 ordered integers crashed with a stack overflow at O0 and O3. Ordered input is the shape a sort is most often handed.

`Algorithm.sortAsc`, `sortDesc` and the float `sortAsc` were bubble sorts with no early exit, so they did not crash but spent n² comparisons regardless of the input; the same 100000 elements cost ten billion comparisons. `Algorithm.binarySearch` computed `(left + right) / 2`, which overflows once an array passes 2^30 elements.

The cost was documented in `docs/34-stdlib-algorithms.md`, so the weakness was known, but a sort that dies on sorted input is a defect rather than a trade-off.

**Resolution**: The three bubble sorts are heapsorts, which are O(n log n) on every input, sort in place and never recurse. `quickSort` is an introsort: the pivot is the median of the first, middle and last elements, so ordered input splits evenly; recursion goes into the smaller partition and loops on the larger, bounding the stack at about log2(n) frames; a depth limit falls back to heapsort so the comparison count is bounded as well; and short ranges finish with insertion sort. `binarySearch` takes the midpoint as `left + ((right - left) / 2)`. Sorting 200000 elements in four shapes through all three sorts now takes 3.4 seconds at O0.

**Coverage**: `tests/StdlibSorting.test.ts` runs all three integer sorts over six input shapes — ordered, reversed, all equal, heavy duplicates, wide random and organ pipe — at thirteen sizes either side of the insertion-sort cutoff, comparing against the order computed in the test; a second test sorts 50000 elements in four shapes and requires quickSort and sortAsc to agree element for element and sortDesc to be their reverse; a third covers the float sort and binary search. The scale test fails against the previous library.

### BUG-421: An array with an impossible capacity wrote through a null pointer

**Status**: Fixed

**Priority**: P1

**Observed (2026-09-20)**: `Array<T>.new(-5)` passed a negative size to malloc, which became an enormous `size_t` and returned null. The array reported a capacity of -5 with null storage, and the first `push` wrote through that pointer and segfaulted. `push` also doubled the capacity in int, so an array past 2^30 elements wrapped to a negative capacity and then to a small or failed allocation that was written past, and neither allocation was ever checked for failure — an out-of-memory condition silently corrupted memory instead of reporting.

**Resolution**: A negative capacity is an empty array, as it already was for `Deque` and `Queue`. The growth is computed in long and refused above 2147483646, and both allocation sites throw when malloc fails.

### BUG-422: A zero step ended the program instead of producing nothing

**Status**: Fixed

**Priority**: P2

**Observed (2026-09-20)**: `Algorithm.rangeStep(0, 10, 0)` divided by the step to size its result before either of its two branches looked at the sign, so the program stopped with a division by zero. The branch structure shows a zero step was meant to yield an empty array, and `Range.len()` answers 0 for exactly this case.

**Resolution**: A zero step returns an empty array. The size is also computed in long now, since the distance between the endpoints can exceed the int range even when the element count does not.

**Coverage**: `tests/StdlibArrayGrowth.test.ts` covers the array guards and checks `rangeStep` against Python's `range()` for twelve combinations of sign and step, including zero.

## Fixed HTTP package compatibility issues (2026-10-14)

- Header storage previously discarded repeated values, including independent Set-Cookie lines. Shared HttpHeaders now preserves lines and exposes getAll; sensitive request singleton duplicates remain rejected. Covered by tests/WebHeaders.test.ts.
- Signed-byte validation rejected valid high header-value octets, including UTF-8. Value validation now accepts high octets while continuing to reject C0 controls and DEL; request, response and client coverage is in tests/WebHeaders.test.ts. Fixed in 9218e925.

## Fixed container publication guard issue (2026-10-15)

- A failed registry manifest probe containing generic `not found` text was treated
  as an absent image, including a proxy routing failure. This allowed publication
  to proceed without establishing whether a version already existed. The workflow
  now accepts only recognized missing-manifest/name diagnostics and stops on other
  registry failures. `tests/ContainerPublication.test.ts` reproduces the previous
  behavior and verifies that proxy failures produce no pushes.

## Fixed HTTP client custom HEAD handling (2026-10-15)

- `methodCustom("HEAD")` sent a HEAD request but parsed the response using ordinary
  body semantics. A valid response with a nonzero Content-Length and no body
  incorrectly failed as truncated. Response parsing now uses the actual method
  token. A real socket regression in `tests/WebHttpClientMethods.test.ts` covers
  enum HEAD, custom HEAD, lowercase custom head, and GET, preserving case sensitivity.

## Fixed HTTP client status-line validation (2026-10-15)

- The response parser skipped two bytes after the first status-line CR without
  requiring LF, and accepted control bytes in the reason phrase. It could accept
  `HTTP/1.1 200 OK` followed by CR and an arbitrary byte as a valid status line.
  It now requires CRLF and validates reason phrase octets before allocating the
  response. Tabs, printable bytes and high octets remain accepted.
  `tests/WebHttpClientStatus.test.ts` reproduces the malformed ending and bare LF,
  then checks all 256 reason-phrase byte values using explicit input lengths.

## Fixed media negotiation parameter mismatch (2026-10-15)

- Accept parameters increased the specificity score even when the offered media
  type did not match the range. A matching parameter could turn the unmatched
  score of -1 into 0 and accept an unrelated representation. Parameter specificity
  now increases only for matching ranges. Regression coverage exercises unrelated
  types, subtypes, wildcards, multiple parameters, fallback weights and best-offer
  selection in `tests/WebNegotiation.test.ts`.

## Fixed quoted media parameter matching (2026-10-15)

- Accept matching compared raw parameter syntax, so quoted values did not match
  equivalent tokens, and escaped quotes could confuse semicolon scanning. The
  middleware now decodes and validates quoted pairs on both sides, preserves
  charset case-insensitivity and other parameter case sensitivity, and respects
  escaped delimiters while scanning. Malformed quoted values are rejected.
  `tests/WebNegotiation.test.ts` covers quoted/token equivalence, escaped quotes
  and semicolons, comma-containing values, empty strings and malformed quotes.

## Fixed conditional ETag list validation (2026-10-15)

- Entity-tag matching returned immediately after a matching quoted tag, before
  validating its suffix and remaining list. Malformed values such as `"v1"garbage`
  could satisfy If-Match or produce a 304. Matching now validates the entire list,
  rejects control bytes in opaque tags, and permits wildcard only as the sole
  nonempty item. `tests/WebRepresentation.test.ts` covers malformed suffixes,
  invalid later elements, wildcard mixtures and valid weak/strong comparisons.

## Fixed byte range unit case handling (2026-10-15)

- Range parsing recognized only lowercase `bytes`, ignoring otherwise valid
  mixed-case range units. The unit comparison is now case-insensitive while
  retaining exact unit-name and range-syntax checks. A regression enumerates
  all 32 case variants of `bytes` in `tests/WebRepresentation.test.ts`.

## Fixed zero-column database snapshot rows (2026-10-15)

- Tables accept zero columns and empty value arrays, but their saved `ROW id`
  records contain no value separator. Loading silently ignored those records,
  losing rows and resetting subsequent IDs. Loading now parses the row ID even
  when no values follow it, while retaining the row-width check.
  `tests/WebDatabaseSnapshots.test.ts` verifies row counts, IDs and the next insert
  after a save/load round-trip.

## Fixed route extraction after literal asterisks (2026-10-15)

- Route matching treats only a terminal asterisk as a wildcard, but parameter
  extraction stopped at every asterisk. A matching `/files*/:id` route therefore
  lost its id parameter. Extraction now uses the same terminal-wildcard rule.
  `tests/WebRoutingPatterns.test.ts` covers literal-star paths, subsequent
  parameters and a literal-star route ending in a real wildcard.

## Fixed aliased database update replacements (2026-10-15)

- A multi-row update could borrow its replacement string from a row being
  replaced. After updating the first row, the engine freed that source string
  and read it again for subsequent rows, producing corrupted values and a
  use-after-free. The engine now retains an owned replacement before changing
  rows and frees it after execution. `tests/WebDatabaseUpdate.test.ts` reproduces
  a replacement borrowed from the first row of a four-row update.

## Fixed VS Code extension typecheck with older TypeScript (2026-10-15)

- The CI-safe suite reached the extension typecheck after 583 integration tests
  passed, then failed with TS18048 in LLVMAddressSanitizer.ts. TypeScript 4.9
  marks matchAll result.index optional, whereas the runtime always provides it.
  The sanitizer signature parser now asserts that guaranteed field, preserving
  behavior and compatibility with the extension's existing compiler version.
  Validation uses the real extension compile:test and LLVM sanitizer unit tests.

## Fixed aliased database mutation predicates (2026-10-15)

- Update and delete evaluated predicates while destroying row storage. If a
  predicate string borrowed that storage, later evaluations read freed memory
  and skipped matching rows. Both commands now select row indexes before any
  mutation; deletes remove those indexes in reverse order. Predicate processing
  failures release temporary indexes before propagation. Regression coverage in
  `tests/WebDatabaseUpdate.test.ts` checks affected-row borrowed predicates for
  both update and delete.

## Fixed HTTP client URL scheme case handling (2026-10-15)

- The HTTP URL parser recognized only lowercase schemes, rejecting valid `HTTP`
  and mixed-case `HTTPS` URLs before connecting. Scheme detection now compares
  ASCII case-insensitively without normalizing hosts, paths or queries. Tests in
  `tests/WebHttpClientUrl.test.ts` enumerate case variants, preserve TLS selection
  and explicit ports, and retain rejection of unsupported/lookalike schemes.

## Fixed authentication cookie header preservation (2026-10-15)

- Authentication replaced the entire Set-Cookie collection when issuing or
  expiring its session cookie, discarding unrelated application cookies. The
  helper now appends an independent Set-Cookie field. A regression in
  `tests/WebAuthCrypto.test.ts` checks unrelated cookies, Secure attributes and
  subsequent session expiry without losing earlier fields.

## Fixed interrupted HTTP server writes (2026-10-15)

- A plain HTTP send interrupted before transferring bytes was treated as a
  permanent output failure. Server writes now retry EINTR without advancing the
  offset, while retaining failure for zero-byte writes and other errors.
  `tests/WebSocketWrites.test.ts` injects EINTR, partial transfers, EPIPE and zero
  writes using a local linker shim and checks the exact transferred bytes.

## Fixed interrupted HTTP client socket operations (2026-10-15)

- Plain HTTP treated EINTR from send or read as a failed request, unlike its TLS
  transport. Both paths now retry interruptions without extending the original
  deadline or advancing offsets. TLS errors retain their separate handling.
  `tests/WebHttpClientSocketIO.test.ts` uses a real loopback server and linker
  shims to reproduce interrupted writes and reads, including short sends.

## Fixed request-line CRLF validation (2026-10-15)

- Request parsing found the first CR and skipped two bytes without checking LF.
  Complete messages with an arbitrary byte after that CR were accepted. The
  parser now validates the request-line CRLF before allocating fields. The byte
  sweep in `tests/WebRequestLineFraming.test.ts` checks all 256 successors and
  preserves HTTP/1.0 empty-header requests and incomplete-input reporting.

## Fixed template generator string ownership (2026-10-15)

- The template CLI leaked its default strings and copied arguments on early
  returns and successful generation, plus temporary literal fragments passed
  into escapeString. The CLI now destroys replaced values, retains owned input
  and default-output copies, and defers cleanup of arguments and fragments.
  `tests/WebTemplateOwnership.test.ts` checks sanitizer-clean usage errors,
  nested templates, default in-place output and explicit output/extension options.

## Fixed template CLI argument and input errors (2026-10-15)

- Missing option values and unknown/extra arguments were silently ignored; a
  trailing `-o` unexpectedly generated files into the input directory. A missing
  or nondirectory input also returned success because traversal used quiet
  directory listing; output mkdir/write errors were also ignored. The CLI now
  validates all arguments before traversal, uses checked listing, checks output
  operations and reports generation errors with status 1. Regression tests
  check failure codes and absence of unexpected files in the input directory.

## Fixed template filename suffix replacement (2026-10-15)

- Template names used global string replacement for the `.bte` suffix. A valid
  filename such as `part.bte.name.bte` therefore changed interior text in both
  its output path and component name. Generation now removes/replaces only the
  final suffix. Tests cover default and custom extensions plus option ordering.

## Fixed growing CI-safe suite step timeouts (2026-10-15)

- The entire discovered unit suite ran in one process under a 20-minute step
  budget. A local run reached only 208 files before timing out, with no failing
  tests reported. Unit discovery now creates sequential batches of at most 100
  files, each retaining the existing timeout and failure handling. Tests verify
  deterministic coverage, no omissions/duplicates and final partial batches.
  Workflow contract checks aggregate all unit batches when checking coverage.

## Fixed template interpolation delimiter scanning (2026-10-15)

- Interpolations stopped at the first `}}`, including markers inside quoted
  BPL strings or at the end of an adjacent nested expression brace. Valid
  templates generated invalid BPL. Scanning now tracks quotes, quoted escapes
  and nested braces before accepting the closing marker. The generation/render
  regression in `tests/WebTemplateInterpolation.test.ts` covers escaped quotes,
  raw output, match expressions with adjacent closing braces, and nested BPL
  backtick strings/interpolation. Temporary scanner state is released on return.

## Fixed compiler interpolation temporary ownership (2026-10-16)

- Backtick interpolation lowers to repeated owning `String` concatenations.
  Destroying the final value does not release the initial empty String or
  intermediate concatenation/conversion allocations. Even
  `local s: String = `literal`; s.destroy();` leaks the initial byte.
  The template delimiter regression exposed this under AddressSanitizer.
  Lowering now builds an expression-valued scope with deferred cleanup for the
  accumulator and compiler-created conversions, transferring only the final
  buffer to the caller. User String operands remain borrowed; ordinary addition
  keeps its ownership contract. O0/O3 leak-detecting sanitizer tests cover nested
  interpolation, empty/literal strings, pointers, ordering, repeated evaluation
  and conversion exceptions. The template consumer is sanitized again.

## Fixed process application exit codes (2026-10-16)

- `execStatus`, `execSilent`, `execShell` and `execOutput` exposed encoded
  POSIX wait statuses (for example, exit 3 became 768). They now decode normal
  exits, report signal termination as 128 + signal, and preserve -1 for errors.
  `tests/StdlibProcessStatus.test.ts` checks all four APIs at O0/O3, including
  output retention and a terminated child shell. Audit S3.

## Fixed switch return-path analysis (2026-10-16)

- Switches ignored unmatched input paths and their default branch. A reachable
  break followed by a return was also counted as returning. Nonvoid functions
  could therefore reach a synthetic zero return or undefined behavior. Return
  analysis now tracks normal completion, return/throw, break, continue and
  fallthrough separately, consuming transfers at their owning loop or switch.
  Regressions cover default handling, unreachable returns, conditional/nested
  breaks and explicit fallthrough, with O0/O3 execution checks. Audit C4.

## Fixed unchecked generic expression arguments (2026-10-16)

- Explicit generic arguments on variables were silently accepted. Struct
  expression instantiations also bypassed argument count and type resolution,
  producing invalid LLVM instead of a source diagnostic. Meta types now use
  normal type resolution; unsupported targets and bound-method arity mismatches
  report a located compiler error. Regression tests preserve explicit generic
  function references and bound methods. Audit C1.

## Fixed process sleep overflow and ignored errors (2026-10-16)

- `sleep` multiplied milliseconds in signed 32-bit arithmetic and called
  `usleep` without checking its result. Waits over about 35 minutes overflowed;
  interruptions shortened waits. It now widens before scaling and uses the
  existing native sleep helper, which resumes interrupted waits. Negative input
  and native failures throw. A linker shim verifies large durations without
  waiting, at O0/O3; native helper tests cover EINTR. Audit stdlib low sleep item.

## Fixed duplicate JSON field ownership (2026-10-16)

- Repeated object fields overwrote earlier strings, arrays and nested objects
  without releasing them. Parsing now frees and zeroes a field before replacing
  its value, preserving last-occurrence semantics and safe partial-error cleanup.
  Sanitizer tests at O0/O3 cover nested/pointer fields, dynamic string arrays,
  shorter fixed arrays, null replacements and invalid later values. Audit S2.

## Open: parsed nested Array method dispatch (2026-10-16)

- A parsed struct field `values: Array<string>` is readable through its fields,
  but `record.values.len()` crashes reading address 0x20. A local sanitizer
  reproduction using the pre-duplicate-field-fix JSON source also crashes.
  A root `Array<int>` len call succeeds. Investigate metadata initialization
  and nested receiver dispatch before claiming parsed arrays support ordinary
  container methods. Reproductions are saved in the ignored local audit folder.
- Parsing a root `Array<string>` also produced `Expected number` for a string
  element; generic reflection/substitution needs separate investigation.

## Fixed nominal type identity across modules (2026-10-16)

- Distinct structs with the same bare name were compatible even when their
  layouts differed. The audit reproduction passed `check` and could reach LLVM
  with the wrong layout. Compatibility and exact matching now compare recorded
  declaration source identity; inheritance traversal carries that identity too.
  Tests cover values, pointers, assignment, field initialization, unrelated
  same-named ancestors, valid inheritance and reimporting the same declaration.
  Audit C3.

## Fixed generic field declaration context (2026-10-16)

- Resolved field types were retained only for private aliases. Accessing a
  generic container field from another module tried to resolve its private
  container declaration in the caller, rejecting valid methods unless callers
  imported internal dependencies. Struct checking now retains every resolved
  field type, and generic member access uses it before applying substitutions.
  Cross-module private generic fields and the Map bucket regression cover this.

## Fixed arena reset block reuse (2026-10-16)

- Reset cleared every retained block, but allocation checked only current and
  mapped a new block instead of visiting its retained successors. Dedicated
  large allocations also always mapped anew after reset. Allocation now searches
  the retained chain before mapping. Sanitizer tests at O0/O3 assert identical
  pointers across 100 reset cycles for multi-block and large-allocation cases.
  Audit S7.

## Fixed dev --no-run option handling (2026-10-16)

- Commander stores `--no-run` as `run: false`, while dev checked only `noRun`,
  so a compile-only invocation executed the program. Dev now respects Commander's
  flag and retains support for explicit legacy noRun options. A real CLI test
  waits for watcher readiness and verifies execution with/without the flag.
  Audit T3.

## Fixed strided and pointer Map hash distribution (2026-10-16)

- Default numeric hashing used raw key bits, causing strided keys to share one
  power-of-two bucket. Pointer keys all used a constant hash. Default hashing
  now mixes all 64 bits and hashes pointer addresses, retaining float zero/NaN
  equality rules and user-supplied callback behavior. O0/O3 sanitizer regressions
  check distribution and lookups before/after growth. Compound keys retain the
  equality-safe constant fallback rather than hashing padding bytes. Audit S1.

## Removed exported standard library placeholders (2026-10-16)

- `Thread`, `Sync` and `Iter` presented usable-looking APIs whose methods only
  threw integer 999. Those placeholder declarations are removed; importing them
  now fails during compilation. Implemented collection iterator interfaces are
  unchanged. Documentation and generated declarations reflect the absence of
  thread/synchronization/adaptor APIs. Tests check all three rejected imports.
  Audit S8.

## Fixed module cache invalidation for compiler changes (2026-10-16)

- Native cache keys omitted compiler identity, DWARF and tree-shaking options.
  Cached builds now fingerprint compiler sources and grammar in development, or
  the running standalone binary, and include both missing options. Private
  dependency changes still use interface-based invalidation. Tests exercise
  changed compiler identities and real cached builds with tree-shaking changes.
  Audit C11. Full-IR keys were rejected because they unnecessarily invalidated
  importers after private dependency changes.

## Fixed DWARF locations on generated runtime calls (2026-10-16)

- Function prologue stack checks emitted calls without debug locations. LLVM
  warned and discarded the entire debug graph. Emission now falls back to the
  current function declaration for generated instructions, restores that state
  across nested function generation, and preserves existing explicit debug
  attachments. O0/O3 tests verify LLVM without debug warnings and confirm native
  clang preserves compile-unit/subprogram metadata, including defer callbacks.
  Audit C6.

## Fixed callable alias storage in resolved generic fields (2026-10-16)

- Retaining generic field metadata exposed a backend representation limit:
  Array<Callback> layout tried to build a pointer to an eagerly expanded Func
  type, which has no BasicType pointer wrapper. The web-server example failed
  compilation despite passing check. Storage/layout/default-initialization
  walks now preserve the original generic alias syntax while keeping resolved
  nongeneric/private alias metadata. O0/O3 sanitizer regression invokes a
  callback retrieved from an Array field; the web demo smoke is also rerun.

## Fixed return diagnostic cascades after invalid statements (2026-10-16)

- Precise switch/control-transfer analysis exposed an extra missing-return
  diagnostic after illegal break/continue/fallthrough statements. Function body
  errors now suppress derivative return-path analysis; warnings still permit
  genuine missing-return errors. Tests preserve the primary diagnostics and
  warning-plus-missing-return behavior. This repairs the JSON contract regression
  found by the full CI-safe run, and addresses part of audit C12.

## Fixed parsed flag replacement aliasing (2026-10-16)

- Passing a stored flag value back to ParsedArgs.setFlag freed its input before
  copying it. AddressSanitizer confirmed a heap-use-after-free. Replacement now
  copies first, then releases the previous value. O0/O3 sanitizer tests cover
  the complete stored String and a borrowed suffix. The parse-loop leaks and
  configuration gaps from audit S5 remain separate work.

## Fixed recursive method ownership during emission (2026-10-16)

- Method emission temporarily changed declaration names to linker names. A
  recursive call could no longer find its own override and fell back to an
  inherited method. Command.destroy therefore called the empty Type.destroy
  on subcommands, leaking their fields. Generate named copies without mutating
  declarations, including deferred/generic/enum emission; restore generic maps
  in finally blocks. O0/O3 tests cover recursive overriding methods/destructors
  and sanitizer-clean recursive command cleanup.

## Fixed argument parser temporary ownership (2026-10-16)

- parse leaked every copied argv token, temporary flag value and anonymous
  key/value clones passed to the copying setter. It now defers token/value
  cleanup within their scopes and passes borrowed flag names/values for the
  setter to copy. O0/O3 leak-detecting sanitizer tests cover repeated parsing,
  aliases, replacements, subcommands, positionals and diagnostic paths. This
  addresses S5 ownership; defaults/required/action/terminator behavior remains.

## Fixed development watcher recovery after native failures (2026-10-16)

- Native compile/link failures and nonzero application exits called process.exit
  even in watch mode. Dev now throws those failures through its existing recovery
  handler and keeps watching. An actual CLI regression starts with exit code 7,
  edits to an unresolved native symbol, then corrects the source and verifies
  successful execution in the same watcher. Ordinary run exit codes are unchanged.
  This addresses audit T4.

## Fixed function-checking scope recovery (2026-10-16)

- Missing-return and invalid variadic-signature errors could escape before
  restoring function scope and return type. With diagnostic collection enabled,
  parameters from that failed function were then visible to later declarations.
  Function checking now restores its entry scope and return type in finally,
  including failures before the body is checked. Regressions confirm the later
  function correctly reports its undefined identifier after both failure paths.
  This addresses another concrete recovery issue from audit C12.

## Fixed right-padding field widths (2026-10-16)

- Fmt.printPaddedRight appended width spaces after the text rather than filling
  a field of that width. It now uses printf's left-aligned minimum field width
  and treats negative widths as zero. O0/O3 tests cover shorter/longer/empty
  strings, UTF-8 byte widths, zero, and INT_MIN without enormous padding.

## Fixed UTF-8 bulk decoding dropping following bytes (2026-10-16)

- Confirmed: toCodepoints on E2 41 42 43 returns U+FFFD and C, discarding A/B.
  It advances by the lead byte's nominal length even when decoding rejects the
  sequence. Recovery must consume one byte per malformed byte and preserve valid
  encoded U+FFFD. The correction passes O0/O3 sanitizer tests for invalid leads,
  continuations, truncated tails, following ASCII and valid U+FFFD/emoji.

## Fixed wide integer literal signedness and overflow (2026-10-16)

- Confirmed: 18446744073709551615 / 3 used signed division and returned zero;
  values beyond u64 were accepted and truncated. Literal inference now selects
  u64 above LONG_MAX, rejects values beyond U64_MAX with the existing integer
  overflow diagnostic code, and preserves directly negated LONG_MIN literals as
  signed. O0/O3 arithmetic and rejection regressions pass, including grouped
  minimum negation and the existing overflow diagnostic code.

## Fixed rational constructor sign normalization outside long range (2026-10-16)

- Confirmed: Rational.new(1,LONG_MIN) claimed validity with a negative
  denominator; new(LONG_MIN,-1) silently retained a negative numerator. After
  reducing common factors, reject an unrepresentable positive denominator or
  numerator with the existing 0/0 invalid sentinel. Representable reduced
  LONG_MIN cases remain supported. O0/O3 sign-boundary and existing rational
  identity, denominator, gcd and power regressions pass.

## Fixed logger colors in redirected output (2026-10-16)

- Confirmed with a piped child process: stdout.isTTY is undefined, so the previous
  strict-false test enabled colors in logs redirected to files or pipes. Require
  an explicit true TTY signal. Child-process regressions cover real pipes,
  explicit false/true terminal flags, and NO_COLOR overriding terminal color.

## Fixed formatting demo width after padding correction (2026-10-16)

- The full integration run found the stdlib_fmt example still requested width 3
  while expecting `ok` plus three spaces after the minimum-total-width correction.
  Request width 5 to match its left-padding example and preserve the expected
  five-character output. The actual example integration test passes again.

## Fixed integer spelling bypasses of initializer overflow checks (2026-10-16)

- Confirmed: `local value:u8=3_00` compiled although the equivalent `300` is
  rejected. Constant extraction passed the spelling directly to BigInt and did
  not unwrap groups, so alternate spellings bypassed range diagnostics. Normalize
  digit separators and unwrap Group nodes before extracting integer constants.
  Narrow unsigned/signed boundaries and grouped negation pass O0/O3 regressions;
  all 25 focused mixed-width, literal and diagnostic tests pass.

## Fixed literal overflow in implicit conversion contexts (2026-10-16)

- Confirmed: `return 300` in a u8 frame, assigning 300 to u8, passing 300 to a
  u8 parameter/callback/generic frame, and a u8 struct field accept truncation
  despite rejecting the same value in a local initializer. Share the scalar
  constant range diagnostic across these destinations and enum payloads. Explicit
  casts retain intentional truncation; compound arithmetic's left-type rule is
  separate. All 30 focused enum/variadic/conversion tests, 15 runtime/ABI tests,
  typecheck and lint pass (audit C9 follow-up).

## Fixed aggregate and conditional literal range-check bypasses (2026-10-16)

- Tuple initializers/assignments/returns/arguments and conditional expression
  branches could hide an out-of-range integer literal from the scalar destination
  check. Arrays whose first element was typed u8 likewise accepted a later 300.
  Recursively check tuple/array literal elements and both conditional branches
  against their destination element types. Explicit element casts remain valid.
  Arrays inferred entirely as int still require the existing type compatibility;
  contextual array typing (audit C14) is separate. All 44 focused tests pass,
  including O0/O3 valid boundaries, explicit casts, tuple and web compiler tests.
  The existing char-array test now casts its intentional 255-to-char truncation.

## Fixed match result constant range-check bypasses (2026-10-16)

- Confirmed eight variants: inline/block/conditional/caught/nested yields,
  assignment and argument matches, and tuple-valued match results could hide an
  out-of-range literal. Record value-producing block return expressions during
  checking and recursively validate them, plus inline arms, against the final
  destination. Independent lambda returns keep their own return type. Weak-map
  metadata avoids adding analysis bookkeeping to serialized syntax trees.
  All 34 focused O0/O3, diagnostic, aggregate, lambda and try/return tests pass;
  typecheck and lint pass.

## Fixed lambda error scope and return-context leaks (2026-10-16)

- Confirmed: a lambda with an inferred first parameter but a later parameter
  lacking an inferable type leaves its scope active; a following reference to
  that parameter incorrectly resolves. Throwing body checks also escape before
  restoring scope and return type. Wrap the whole lambda check, including
  signature inference, in context restoration for scope, return type, control
  depths, defer state and match context. Diagnostic recovery and fail-fast
  regressions pass, along with 26 focused tests, typecheck and lint (C12 follow-up).

## Fixed invalid match guard scope leaks (2026-10-16)

- Confirmed: after an integer-valued guard error, a pattern binding from the
  rejected arm incorrectly resolved in following statements. Match checking left
  its arm scope active when an error interrupted the normal exit path. Restore
  the incoming scope in finally around the entire match check. The regression
  requires both the primary guard error and the subsequent undefined-symbol
  diagnostic. All 21 focused recovery/match tests, typecheck and lint pass.
  This is a C12 follow-up; other recovery issues remain open.

## Fixed local audit files leaking into release archives (2026-10-16)

- Preparing v0.1.0 found npm pack included docs/audits despite the repository's
  gitignore rule: explicitly including docs in package.json bypassed that
  exclusion. The existing release allowlist accepted all docs and missed the
  leak. Add a nested docs/.npmignore exclusion and an actual npm-pack regression
  that retains public docs while excluding local findings and reproductions.
  The release smoke allowlist now rejects docs/audits independently as well.
  All 73 packaging/workflow tests pass; the rebuilt archive has zero audit files
  and all 16 manifest checksums verify. No affected archive was published.

## Fixed stale integer constant test assertion blocking CI (2026-10-16)

- CI run 38932160293 failed because the TypeUtils decimal fast-path test searched
  for the exact source text `BigInt(raw)`, which changed when numeric separator
  normalization was added. Reproduced locally; decimal rejection itself still
  worked. Keep checking that the decimal guard precedes the BigInt call without
  assuming its argument expression, and cover separated integer and decimal
  inputs explicitly. All 385 tests in the failed 89-file CI batch and all 47
  focused integer tests pass locally; typecheck and lint pass.

## Callable and destructuring constant range bypasses (2026-10-16)

- Confirmed callable structs, generic callable structs and typed tuple
  destructuring accepted 300 into u8 without BPL_INTEGER_LITERAL_OVERFLOW.
  Validate selected callable parameter types after generic substitution and
  recursively construct the destructuring destination tuple for the shared
  range checker. Nested tuples and conditional tuple expressions are covered.

## Fixed generic callable operator code generation (2026-10-16)

- A valid Item<u8> with __call__(this:*Item<T>,x:T) passes checking but
  emits an unresolved generic method name and an i32 argument instead of u8.
  Clang rejects the undefined function. Found while testing conversion fixes;
  fixed by routing callable operators through ordinary method lowering and
  specializing the checker return type. O0/O3 LLVM-verified tests cover generic
  narrow arguments/returns, pointer receivers, void returns and one evaluation
  of a receiver expression. Existing operator and integer range suites pass.

## Fixed invalid initializer diagnostic cascades (2026-10-16)

- A typed local with a failed initializer was absent from its scope, causing
  false undefined-symbol diagnostics on following uses. During error collection,
  preserve the validated declared type and suppress unused diagnostics for the
  rejected binding. Never replace an existing declaration or invent an unknown
  type. All 258 typechecker tests and 102 CLI JSON/recovery tests pass; typecheck
  and lint pass. Other recovery paths still require review.

## Fixed ignored argument parser configuration and token boundaries (2026-10-16)

- Defaults, required positional arguments and selected command actions were
  stored but unused. Missing flag values consumed subsequent options; unknown
  options went to stdout; -- and negative operands were not honored. Apply
  defaults, validate required arguments, count errors, skip actions after errors
  and retain the successful action exit code. Default actions are initialized.
  Reject negative getArg indexes. Tests cover aliases, empty/default overrides,
  subcommands, error paths and O0/O3 ASan/UBSan cleanup: 11 tests pass.

## Checked rational overflow follow-up (2026-10-16)

- Following maintainer input, replace historical wrapping for unrepresentable
  rational arithmetic with the existing invalid 0/0 sentinel. Exact unsigned
  wide intermediates preserve cancellation in addition/subtraction; unsigned
  cross-cancellation and final bounds checks cover multiplication/division,
  including LONG_MIN. Negation/absolute value reject unrepresentable magnitudes.
  A BigInt oracle checks representable and overflowing reduced results.

## Fixed clean deleting unrelated build outputs (2026-10-16)

- Confirmed clean treated generic build/dist paths and any .ll/.o/.out/main
  file as disposable. Preserve build/dist containers, require a regular sibling
  .bpl source for candidate outputs, and retain tracked-file and symlink
  protection. Only the reserved .bpl-cache namespace is removed wholesale.
  Keep standalone-file projects supported rather than require bpl.json.
  All 17 cleanup-focused CLI tests pass, including preview/deletion agreement,
  unrelated files, symlinked sources, tracked files and failed git probes.

## Fixed ignored root dependency manifest drift (2026-10-16)

- An existing lock caused newly added dependencies to be ignored and --locked
  accepted missing/incompatible root requirements. Verify root dependencies and
  development dependencies against lock versions and archive sources; normal
  installation reconciles added/changed requirements. Local uninstall also
  removes dependency entries from bpl.json, preserving other manifest metadata.
  Restoration content integrity and full graph conflict resolution remain
  separate P2/P3 follow-ups.

## Fixed unchecked package restoration content (2026-10-16)

- Project restoration accepted changed archives and rewrote the locked content
  hash. Record archive SHA-256 in new lock entries and validate it before
  extraction. Validate extracted version and package tree hash before replacing
  installed contents, including legacy locks without an archive digest. Use
  locked transitive sources during restoration and reject incompatible locked
  version requirements before replacing their parent package. Explicit --update
  accepts intentional content changes. Portable/full-file tree hashes, immutable
  archive snapshots and whole-graph transaction/resolution remain P3/P4/P6/P8.

## Fixed failed project updates erasing the previous lock (2026-10-16)

- --update (also used by bpl lock) eagerly wrote an empty lock and could leave
  it empty/partial after installation failed. Stage lock updates in memory,
  commit once installation succeeds and discard pending state on every failure.
  Preserve existing path validation and atomic-write permissions. Sort lock keys
  using codepoint order and append a newline. All 283 package/CLI tests pass.
  Package-directory rollback remains a separate P8 issue.

## Parser action exception cleanup follow-up (2026-10-16)

- A configured action that throws bypassed ownership transfer of ParsedArgs and
  leaked 4,260 bytes over ten calls under ASan. Hold ownership behind a runtime
  defer until parse returns successfully; on success clear the guard pointer.
  Callback exceptions must preserve their original value. Sanitizer validation
  is running for normal and exceptional parser paths.

## Open: automatic destructors across throwing callees (2026-10-16)

- The same parser reproduction still leaked when guarded solely by an
  @[auto_destroy] local: destructors are emitted on direct throw statements,
  but a throw in a callee unwinds past the caller without that static cleanup.
  Runtime defer runs across frames and is used for parser ownership. General
  automatic-destructor unwinding across function calls needs a compiler fix.

## Versioned portable package tree hashes (2026-10-16)

- Legacy hashes sorted native paths using localeCompare and omitted unexported
  native sources/objects/assets. New and repaired lock entries explicitly select
  sha256-tree-v2: normalize relative paths with /, sort by codepoint order and
  hash regular files plus symlink identities without following links. Exclude
  reserved package/cache/VCS directory namespaces. Content digests have fixed
  lengths to avoid ambiguous concatenation. Old lock entries keep their legacy
  algorithm rather than silently invalidating released locks.

## Shared dependency version conflict follow-up (2026-10-16)

- Root requirements could be overwritten by a later transitive installation.
  Local cached-version selection now intersects root and installed dependents'
  constraints, and candidate manifests are checked before a conflicting shared
  package is replaced. Compatible intersections work in both tested installation
  orders; incompatible requirements fail with a registered JSON error code.
  Recognize versioned archive pins and verify transitive lock requirements.
  Full graph planning/rollback and identity constraints for arbitrarily renamed
  archives remain follow-ups; resolution is still incremental.

## Audit CI contract follow-up (2026-10-16)

- The successful clean JSON smoke fixture still expected an unrelated object file
  to be deleted. Give its generated object a sibling BPL source so the smoke test
  exercises the documented ownership check.
- The new dependency conflict JSON code was absent from CI triage mappings. Map
  it to the focused dependency conflict suite; inventory checks cover registration.

## Clean partial failure reporting (2026-10-16)

- Confirmed CodeRabbit's cleanup findings: a source lstat error or artifact removal
  failure silently skipped the rest of a directory. Cleanup now handles failures
  per path, preserves artifacts whose ownership cannot be checked, continues other
  work and returns nonzero with BPL_CLEAN_FAILED and failed paths. Successful
  entries/counts exclude failed removals; reserved cache removal follows the same
  behavior. A child-process regression injects deterministic permission failures.

## Manifest drift and stale transitive lock graphs (2026-10-16)

- Confirmed CodeRabbit's report: changing a parent archive could still apply its
  old locked child source/hash, reject a valid new requirement or reinstall an
  obsolete child independently. Reconciliation now computes affected closures,
  preserves shared pins reachable from unaffected packages, resolves changed
  roots against the retained lock subset, and prunes obsolete private children.
  New/repaired lock entries record dependency names; legacy entries use installed
  manifests and fail before mutation with explicit update/restore guidance when
  graph metadata is unavailable. Lock changes are staged until success.
- Installed directories remain incremental, not a whole-graph rollback; that
  existing transaction limitation is still open.

### Reconciliation order for roots also referenced transitively

- An unchanged package could resolve a changed root back through the old cache
  before that root's new local archive was selected. Resolve changed roots first,
  then pass the reconciled lock entries to later restores. Regression cases cover
  a root archive absent from cache, with installed modules present and missing.

## Same-stem extensionless cleanup (2026-10-16)

- Confirmed CodeRabbit's outside-diff finding: an extensionless wrapper/data file
  was deleted solely because a same-stem BPL source existed. Preserve all
  extensionless files; reliable compiler provenance is not currently recorded,
  and checking executable magic or a familiar filename cannot prove ownership.
  Known compiled executables require explicit removal. Document the limitation
  and extend the ownership regression to preserve same-stem extensionless files.

## Removed manifest roots surviving restoration (2026-10-16)

- Confirmed CodeRabbit's report: deleting a declared dependency did not trigger
  reconciliation and --locked could accept its stale lock entry. Project installs
  now record manifestRoots, verification detects removed roots, and restoration
  prunes their obsolete private closures even without added/changed requirements.
  Shared dependencies and separately installed packages are retained. Legacy
  locks cannot distinguish removed roots from explicit installs; document how to
  establish root history or explicitly update instead of guessing and deleting.
  Regressions cover installed/missing modules, shared/private children, removing
  the last declared root, --locked failure without mutation and direct installs.

## Edge-case tests discarded checker diagnostics (2026-10-16)

- Local and GitHub CI confirmed that the nullptr assignment test depended on
  a secondary backend unresolved-binding error. Its helper discarded collected
  type errors, so improved diagnostic recovery allowed invalid input to reach
  codegen in that test. Use the shared compileToLLVM helper, which rejects checker
  diagnostics first, and assert the primary assignment message. This exposed ten
  outdated positive fixtures: intentionally unused bindings now use underscores,
  the unsigned maximum uses ulong, and returning a local address is rejected.
  Activate the previously assertion-free zero-array and pointer-to-array cases.
  All 57 edge-case tests pass without suppressing diagnostics.

## Rand low-bit repetition (audit S4, 2026-10-16)

- The old generator returned raw low LCG state bits: nextBool strictly alternated
  and fillBytes repeated every 256 bytes. Replace the output generator with PCG32
  XSH-RR using the existing 64-bit state field and fixed stream 54. Seed performs
  the standard warm-up; sequences intentionally differ from earlier versions.
- Regression checks failed on the old implementation and pass at O0/O3 against
  PCG's published seed-42 vector. A separate BigInt model checks fractions, signed
  ranges, full-width seeds, rejection sampling and Gaussian zero resampling.
  Deterministic tests cover the old boolean and byte cycles across multiple seeds.
  Weighted-choice rejection still preserves generator state after seed warm-up.
  This remains a deterministic non-cryptographic generator; API and struct fields
  are unchanged and no extra runtime dependency is added.

### Explicit uninstall and recorded manifest roots

- Keep manifestRoots synchronized when uninstall removes a declared root. Without
  this, the new removal check could report stale manifest history immediately
  after a successful uninstall. Verification now passes after uninstalling each
  dependency in the manifest-drift regression.

## Transitive installs overwrote a root archive source (2026-10-16)

- A root installed from a local archive could be reinstalled through a later
  root's transitive dependency using a cache source. The overwritten lock source
  then failed manifest verification immediately after a successful install.
  Pass already selected lock entries into subsequent root dependency installs,
  preserving the selected archive source and integrity. Root-removal regressions
  now also cover a removed root that remains needed transitively, with installed
  modules present and missing.

## Missing user documentation for new JSON codes (2026-10-16)

- Full local and GitHub CI found that BPL_CLEAN_FAILED and
  BPL_PACKAGE_DEPENDENCY_VERSION_CONFLICT were registered but absent from the
  user-facing command guides. Document the conditions, failure status, cleanup
  errors/count behavior and package resolution/rollback limits. The Markdown
  error-code inventory verifies that documentation stays aligned with exports.

## Pack verification ignored the manifest entry alias

- A package declaring only `entry: "src/api.bpl"` was verified against the missing
  default index.bpl and packed successfully even when api.bpl contained type
  errors. Match package resolution's precedence: main, then entry, then index.bpl.
- Windows-style separators in main/entry also skipped verification on Unix.
  Normalize both separators consistently with package resolution.
- Compilation failures in pack --json exited before writing any JSON. Route
  these failures through the shared JSON error path, preserving the compiler's
  diagnostic code. Tests reject invalid main/entry sources, accept a valid entry
  despite an invalid unused index.bpl, retain main precedence, and preserve an
  existing archive on a subsequent verification failure.
- This fixes the entry-verification portion of audit P5. Archive reproducibility,
  metadata inclusion and other packing gaps are separate outstanding work.


## Implicit method/operator addresses bypassed const bindings (audit C10)

- A const struct could call or bind a pointer-receiver method and mutate its
  stored value even though explicitly taking its address was rejected. Apply the
  same const-address restriction during instance method selection, operator
  receiver resolution and implicit operator pointer arguments. Preserve value
  receivers and mutable pointer receivers, including safe overload selection.
  Tests cover direct/bound/generic/nested methods, callable/index/binary operators
  and const right-hand operator arguments. Native O0/O3 checks cover value copies.
  Mixed value/pointer receiver overloads also shared a vtable key and could call
  the wrong receiver ABI. Distinguish value receiver keys and retain the checker
  selection when codegen guesses the other receiver mode.

## Bound value-receiver methods used the wrong ABI (fixed in follow-up)

- Independently reproduced on PR3's baseline and the C10 worktree: binding
  `frame read(this: Counter) ret int {return this.value;}` as a Lambda returns
  garbage, while the direct call returns the expected value. generateBoundMethod
  bitcasts a function taking an aggregate receiver to a function taking i8* and
  passes the receiver address as the aggregate. Repro saved locally for follow-up;
  this is separate from the const-address checker fix and needs an adapter.

### Bound value receiver ABI resolution

- Replace the invalid function bitcast with a typed adapter that loads the
  receiver value from the captured context and forwards its copy. Preserve
  narrow-argument/return ABI extensions and scalar, void and aggregate results.
  No additional allocation is needed. Recognize bound methods on call-result
  receivers before aggregate field extraction, so those receivers evaluate once.
  Variadic value-receiver binding now fails explicitly instead of emitting an
  adapter that cannot forward the variadic arguments. Native O0/O3 and LLVM
  verification cover const/mutable values, receiver changes, temporary values,
  narrow parameters/results, enums and large aggregate results. Check receiver
  pointers at binding before the adapter can dereference them; null binding
  raises the normal catchable NullAccessError rather than crashing.

### Virtual value receiver layout

- Virtual calls passed a base receiver copy into a derived method with a larger
  value receiver, so derived fields were read using the wrong aggregate ABI.
  Share the value-receiver adapter with vtable entries and pass the original
  object address. The selected concrete implementation loads its own complete
  layout and receives a copy. A wide derived-field regression checks polymorphic
  calls through base pointers and verifies receiver mutations stay local.

## Const operator rejection used unrelated diagnostics (PR #4 review)

- Operators rejected for implicit addresses of const receivers/arguments reported
  generic not-callable/not-indexable/type errors. Retain that rejection only for
  otherwise compatible candidates, try all safe overloads and synthesized
  comparisons, then report BPL_ADDRESS_OF_CONSTANT at the operator expression if
  none succeeds. Regressions assert the exact code for call/index/binary/unary
  paths and const pointer arguments, preserve safe overloads and comparison
  synthesis, and retain ordinary diagnostics for unrelated argument mismatches.
- CI's inherited-vtable shape test still expected direct value-method pointers.
  Update it to verify adapters and their concrete-layout calls, and use the
  shared compile helper so checker diagnostics cannot be silently ignored.

## Rejected const overload blocked built-in pointer arithmetic (PR #4 review)

- A struct pointer plus/minus a const integer was rejected when the struct also
  declared an operator taking an integer pointer. After rejecting that unsafe
  overload, try built-in pointer arithmetic before reporting the const-address
  diagnostic. O0/O3 native and LLVM-verified regressions exercise addition and
  subtraction over a two-element struct array and check the resulting addresses.


## Failed loop analysis leaked scope and loop depth (audit C12)

- A non-boolean loop condition left the initializer variable visible after the
  loop and made subsequent break/continue statements appear legal outside a
  loop. Fail-fast errors in initialization, condition, step, body and unused
  variable reporting also left the checker in a nested scope with extra depth.
- Restore the incoming symbol scope and loop depth in finally around the whole
  loop checker, preserving normal checks and nested-loop context. Regressions
  check the original error plus correct later undefined-symbol and control-flow
  diagnostics, and exact state restoration for each failure stage.


## Excessive syntax nesting escaped as an unlocated host exception (audit C13)

- 3,000 nested parentheses overflowed Peggy's call stack, while a 20,000-term
  addition parsed successfully but overflowed recursive type analysis. Neither
  produced a structured compiler diagnostic. Validate raw AST nesting iteratively
  before recursive passes, limiting it to 512 AST nodes per path. Convert parser
  stack exhaustion into BPL_SOURCE_COMPLEXITY_LIMIT, including the syntax-error
  retry path. Other parser exceptions retain their original behavior.
- AST depth failures point at the offending parsed node. If Peggy exhausts its
  stack before producing an AST, only the source file is known and the diagnostic
  uses line 1, column 1. Parser capacity may be lower than the AST limit. Tests
  cover check/build JSON failures, native O0/O3 moderate nesting and long chains,
  LLVM verification, and wide shallow syntax that must remain accepted.

## Package archives omitted explicitly declared non-.bpl entry points (audit P5)

- A verified package declaring entry: "src/api.x" reported pack success but its
  archive contained only helper.bpl and bpl.json, making the installed package
  unusable. Include the selected main/entry source regardless of suffix, using
  main precedence and the same package-relative path normalization as exports.
- Validate explicit entry points as existing regular files within the package
  root before archive replacement, including direct PackageManager.pack callers.
  Preserve existing export diagnostics through a shared source-file validator.

## Package archives dropped README and license files (audit P5)

- Packing copied source files and explicit bin/exports but omitted standard
  root README and legal files. Include regular root README, LICENSE/LICENCE,
  COPYING and NOTICE files, case-insensitively, with optional md/txt/rst/markdown
  suffixes. Skip automatically discovered links and directories. Unrelated
  assets and dotfiles remain outside this automatic selection.
- Round-trip tests verify exact installed metadata contents and confirm private
  files, linked metadata and metadata directories are not automatically added.
  Source presence remains required; documentation alone does not form a package.

## Legacy listing/provenance hashes omitted selected non-.bpl entries (PR #7 review)

- CodeRabbit found that adding an explicit source to the archive did not add it
  to legacy package hash selection. Changing installed .x or extensionless entry
  code could leave list/provenance hashes unchanged. Include the selected entry
  with the existing path, regular-file and real-path checks. Keep automatic
  metadata outside legacy hashing; portable v2 lock hashes still cover all files.
- Historical legacy hashes that omitted an existing non-.bpl entry now fail
  closed with a hash mismatch. An explicit install --update migrates these pins
  to the existing portable v2 format. Ordinary .bpl legacy coverage is unchanged.
  Tests check listings, provenance, metadata exclusion, external-link boundaries,
  unchanged legacy lock bytes on verification failure, and explicit migration.

## Unchanged packages produced different archive bytes (audit P5)

- Two packs of identical package contents produce different archive SHA256s
  because temporary staging timestamps, filesystem order and ownership enter
  tar headers. BSD tar also embeds the current time in its gzip header.
- Confirmed with a regression that packs identical trees in opposite creation
  order, with different source timestamps and umasks, across a clock boundary.
  The fix normalizes only private staging metadata, writes an explicit sorted
  NUL-delimited member list and suppresses variable ownership/compression
  metadata for GNU/BSD tar. Source metadata is preserved; executable bits remain
  meaningful. GNU-format archives retain long paths without PAX clock fields.
- Ignore ambient TAR_OPTIONS/GZIP during creation so they cannot silently add
  exclusions or change compression headers. BPL_TAR/TAR selection is unchanged.
  Reproducibility is scoped to the same tar/compression toolchain, included
  content, paths and executable bits; provenance timestamps remain informational.

## Declared integer array element types were ignored for literals (audit C14)

- A literal [1,2] was inferred as i32[2] even when its destination was u8[2],
  rejecting valid local initializers, assignments, returns and function calls.
- Plan contextual conversions for newly created integer array literals, checking
  dimensions and each element before applying aggregate annotations. Existing
  array storage is never reinterpreted. Preserve leaf expression types so the
  existing array generator emits the appropriate element casts. Narrowing a
  nonconstant element is not added by this conversion; literal range errors
  retain BPL_INTEGER_LITERAL_OVERFLOW at known destinations.
- Overload probes do not mutate candidate arguments; existing exact/widening
  matches remain preferred. Apply conversions only after selecting a signature.
  Cover aliases, nested arrays, slices, grouped/conditional arrays, fields,
  functions, methods, function pointers, lambdas and enum tuple payloads. Empty
  arrays and arrays nested in tuple/match result contexts are separate cases;
  this fix does not claim a general contextual inference system.

## Implicit array-to-view returns exposed a completed stack frame

- A frame returning int[] from [1,2] passed checking, but the backend spilled
  the fixed array to the callee's stack and returned a pointer into that spill.
  AddressSanitizer confirms stack-use-after-return at O0 on staging 8d35afd1,
  independently of the contextual-array changes. Implicit pointer returns use
  the same temporary-storage lowering.
- Reject direct fixed-array-to-slice/pointer return conversions with
  BPL_RETURN_ARRAY_VIEW_ESCAPES. Fixed-array value returns and existing borrowed
  slice/pointer returns remain supported. Tests cover literals, locals, by-value
  parameters, groups, conditionals, aliases, and newly contextualized literals.
  This is a targeted lowering boundary check; it is not a full lifetime analysis
  of view aliases, explicit casts or aggregate-contained borrows.


## Failed block and catch checking left the checker in an inner scope

- Fail-fast block checking exited before restoring its enclosing scope when a
  statement failed, an unused variable was reported, or an unreachable statement
  was diagnosed. Catch clauses also retained their parameter scope on failure.
- Both paths now restore the exact incoming scope in `finally`. Blocks checked
  without creating a scope continue to use the caller's bindings.
- Six regression cases failed before the fix; focused tests also cover normal
  catch binding visibility and collection of multiple diagnostics.


## Failed conditional checking retained branch scopes

- Checking a then branch (including its type-guard narrowing scope) or a single
  statement else branch could throw before leaving the branch's scope. Later
  diagnostic collection could consequently run in an unintended inner scope.
- Restore the exact incoming scope with `finally` around each branch scope.
  Four fail-fast conditional regressions failed before this correction.


## Catch annotations skipped type validation

- Typed catches bound their annotation without checking whether its type existed
  or resolving generic arguments. Unknown catch types and incorrect generic
  argument counts consequently passed the checker.
- Apply the existing known-type and type-resolution checks before binding the
  caught value. Valid primitive, alias and generic catch types remain accepted.
- Three regression cases failed before the fix; catch scope restoration still
  applies when annotation validation fails.
## Explicit casts bypassed the array-view return diagnostic

- Explicit casts of a fixed array to a slice/pointer passed return checking,
  including casts inside aggregate literals. Using cast<i32[]>([11,12]) in a
  slice-returning function reproduced AddressSanitizer stack-use-after-return
  at O0 on staging bfbaf0c9. The cast creates a callee stack spill.
- Return checking now uses BPL_RETURN_ARRAY_VIEW_ESCAPES for these explicit
  conversions too, including groups, conditionals and aggregate literal fields.
  Enum tuple constructors retain arguments and are checked as aggregates.
  This does not add general lifetime/provenance analysis for local view aliases.
- The backend used the raw cast target instead of the checker's resolved target:
  cast<int[]>(array) failed with Unsupported cast where cast<i32[]>(array) worked.
  It also omitted fixed-array-to-pointer casts accepted by the checker. Use the
  checked cast type and existing array-to-pointer spill lowering. Native O0/O3
  tests cover primitive spellings, aliases, literal/local arrays, byte views,
  safe immediate consumption, and existing caller-owned view passthroughs.


## Returned calls and match results bypassed explicit array-view checks

- CodeRabbit found that borrow(cast<i32[]>([11,12])) can return its temporary
  argument, while match expression arms and block yields can also carry casts
  past the initial guard. All three forms reproduce stack-use-after-return
  under AddressSanitizer at O0 on 2a227519.
- Return traversal now checks match expression values and recorded block yields.
  For calls with view-capable results, it conservatively checks cast arguments;
  the callee may return borrowed argument storage. Scalar-only results, including
  fixed arrays and generic value-only structs, remain supported. Nested tuple,
  struct and enum result types are inspected for potential borrowed storage.
- No interprocedural ownership proof or tracking of local view aliases is added.
  Calls returning independent storage can still be rejected because the
  compiler cannot prove this property. Positive native tests retain scalar
  consumers, copied aggregate
  results, caller-owned match results and temporary views consumed in-frame.


## Match block yield types lost block-local alias resolution

- A match arm defining `type View=int[]` and yielding `cast<View>([1,2])`
  was compared against a sibling `int[]` arm after its scope ended, producing
  a false incompatible-arms error. Collect resolved yield types while the
  declaring scope is live; inspect cast results using their checked types.
- Native O0/O3 controls consume such a match value within its frame. Returning
  that value directly instead reports BPL_RETURN_ARRAY_VIEW_ESCAPES.


## Projections and method receivers hid returned array-view casts

- CodeRabbit found unchecked Member/Index result objects and method receivers.
  Indexing a slice array literal and returning a view through a temporary value
  receiver both reproduce stack-use-after-return under AddressSanitizer at O0
  on 8421d6a9. Self-review also confirmed pointer arithmetic on a cast-created
  array pointer exposes the completed frame. Direct temporary struct-field
  projection instead hit an existing backend lvalue error, not a native escape.
- Return traversal now follows view-capable projections, callees/receivers and
  other value-producing operators. Scalar reads remain allowed. Constant literal
  projections inspect only the selected value, preserving caller-owned borrows
  when unrelated temporary views are discarded. Native O0/O3 controls cover
  selected caller-owned slices, numeric indexing, scalar methods and pointer reads.
- General alias/provenance tracking and unsupported temporary-aggregate address
  generation remain outside this change.


## Unknown component types passed compound annotation validation

- The shared known-type check returned immediately for tuples, function types
  and lambda types. Unknown tuple elements and callable return/parameter types
  therefore passed in local declarations, catch annotations and struct fields.
- Traverse tuple elements and callable result/parameter types recursively, then
  apply the existing named-type checks at each component. Generic-parameter
  recognition and alias resolution policy are unchanged.
- Eighteen regression cases failed before this correction; positive controls
  preserve known aliases, nested generic types and generic parameter annotations.


## Failed destructuring declarations caused cascading diagnostics

- Recovery retained a simple typed variable after an invalid initializer, but
  skipped destructured targets. Later uses then reported false undefined-symbol
  errors. A partially checked tuple also produced unused-variable noise for its
  already-bound targets.
- During diagnostic collection, retain valid explicitly annotated targets and
  mark bindings belonging to the failed declaration as used. Preserve unrelated
  existing bindings, skip unknown/missing target types and leave fail-fast mode
  unchanged. Four initial regressions failed before the correction.


## Value symbols were accepted as type annotations

- Known-type validation treated any resolved symbol as a valid type, including
  local/global variables, function parameters and functions. Short uppercase
  value names also bypassed validation through the generic-name heuristic.
- Accept resolved structs, enums, specs and type aliases (including actual
  generic parameters); reject resolved value/module symbols with the existing
  BPL_TYPE_NOT_FOUND diagnostic category. Preserve generic-name fallback only
  when no symbol is resolved, without changing that existing language policy.
- Six source regressions failed before the fix across simple, nested, field
  and catch annotations. Positive controls preserve actual type declarations.


## Undeclared short type names bypassed annotation validation

- The known-type helper accepted any unresolved single uppercase letter,
  optionally followed by a digit, as a generic parameter. Undeclared T/A/X1
  consequently passed local, field, catch, callable and generic-argument checks.
- Remove that spelling heuristic and require an actual type symbol. Generic
  parameters are already registered as type symbols in their declaration scope;
  declared short struct/alias names remain valid. Existing BPL_TYPE_NOT_FOUND
  diagnostics now identify undeclared names before code generation.
- Fifteen regression cases failed before this fix; positive controls preserve
  declared generic parameters and short type declarations.


## Function and explicit lambda signatures skipped known-type validation

- Function/method parameters and return types, plus explicit lambda signatures,
  were resolved without checking whether their named types existed. Unknown
  types could survive in unused parameters or in a return type whose body throws.
- Validate signatures after registering generic parameters, before binding value
  parameters. Lambda checks likewise run before entering the parameter scope;
  context-inferred lambda types retain their existing path.
- Eight regression cases failed before the correction, including nested callable
  types and undeclared short names. External ABI declarations are outside this
  ordinary-language checking change.


## Failed struct and enum checks exposed generic parameter scopes

- A failed field or method-signature check exited struct/enum checking before
  restoring the enclosing scope. Later declarations could then use generic
  parameters from the failed type as though those parameters were in scope.
- Guard both type-body entry points with `finally` and restore the exact
  incoming scope on success or failure. Function-body recovery already applies
  the same rule inside methods.
- Three collection-mode regressions failed before the correction, covering a
  struct field, a struct method and an enum method.

## Enum payload annotations skipped known-type validation

- Tuple and named-field enum payloads resolved their types without checking
  whether the names denoted declared types. Unknown names, including nested
  callable parameters, survived declaration checking without BPL_TYPE_NOT_FOUND.
- Validate both payload forms before resolution while the enum's generic
  parameters are in scope. Declared generic parameters and aliases stay valid.
- Eight negative regressions failed before the fix; two positive controls
  preserve generic payloads and nested callable types. Found during PR review.

## Known-type checks lost previously resolved namespace identity

- Signature resolution can replace a qualified nominal name such as Types.Token
  with Token while recording its declaration. Subsequent known-type validation
  searched only the bare name and incorrectly rejected valid namespace imports.
- Honor recorded struct/enum/spec declarations using the same guarded helper as
  type resolution. A declaration for a different name or an enum variant does
  not bypass name validation. Generic arguments are still validated recursively.
- The transitive module-cache regression exposed this during CI; focused controls
  cover all three nominal declaration kinds and mismatched names.

## Return completeness ignored compound types and void pointers

- Named functions only checked return completeness for basic types whose names
  were not void. Tuple/callable returns and void pointers could fall through;
  an alias to plain void incorrectly required a return value.
- Resolve the declared return type before value parameters enter scope, and
  exempt only plain void. Keep primary body errors from causing return cascades.
- Five regression cases failed before the fix; throw-only bodies, aliases to
  compound values and primary-error controls cover the existing behavior.

## Nonvoid lambdas lacked return completeness checks

- Lambdas could promise a value through an explicit or contextual signature
  yet fall through or return only on some branches. Their bodies were type
  checked without the named-function return-flow check.
- Apply the existing return-flow analysis to nonvoid lambdas, exempt plain
  void and preserve primary body errors without a missing-return cascade.
- Eleven regressions failed before the fix, covering scalar, tuple, callable
  and void-pointer returns, contextual signatures and partial branching.

## Unconditional loops falsely failed return completeness

- Return analysis always allowed loops to finish, rejecting nonvoid functions
  that diverged in an unconditional loop. Applying the same analysis to lambdas
  would also reject their valid diverging bodies (audit C15).
- Treat conditionless and literal-true loops without reachable breaks as
  diverging; nested loop/switch breaks remain local to those constructs. A
  reachable break or a conditional loop still requires a subsequent return.
- Twelve checking cases and a native compilation control failed before the
  correction; ten exit-path controls preserve missing-return diagnostics.

## Value parameters changed the meaning of named signature aliases

- Function signature names were validated before parameter binding, but their
  types were resolved one at a time as parameters entered scope. A parameter
  named Number could hide the alias Number for later parameters or the return
  type, incorrectly rejecting valid signatures and returns.
- Resolve all parameter and return types in the declaration scope before binding
  value parameters. Use those resolved types for body checking and variadic count
  validation, preserving aliases and nominal declaration identity.
- Five checking cases and one native O0/O3 fixture failed before the correction,
  including scalar, tuple, callback and plain-void aliases.

## Value parameters also hid aliases in lambda signatures

- Explicit lambda parameter and return types were resolved after entering the
  parameter scope. Earlier value parameters could hide aliases in later types,
  producing false return mismatches or false missing-return diagnostics.
- Resolve explicit and contextual signature types in the enclosing scope before
  binding lambda parameters, while retaining existing context inference and
  scope restoration on failures.
- Six checking cases and one native O0/O3 fixture failed before the fix, covering
  aliases to scalar, tuple, callback and plain-void types plus mixed inference.

## Type alias bodies skipped known-type validation

- Alias declarations resolved their bodies without checking whether named types
  existed. Undeclared short names and unknown types nested in tuples or callable
  signatures could survive declaration checking without BPL_TYPE_NOT_FOUND.
- Validate alias bodies with their declared generic parameters in a temporary
  scope, then restore the exact incoming scope before existing resolution.
  Forward aliases and actual type declarations retain their existing behavior.
- Ten negative cases failed before the fix; generic, forward-alias and native
  O0/O3 controls preserve valid alias consumers.

## Type aliases accepted duplicate generic parameter names

- Alias parameter lists could repeat a name, allowing later substitutions to
  overwrite earlier arguments instead of rejecting the ambiguous declaration.
- Reject repeated names with BPL_SYMBOL_ALREADY_DEFINED while validating the
  alias. Restore the incoming scope after duplicate failures in both checking
  modes; distinct names and reuse in other aliases remain valid.
- Five regressions failed before the correction, covering adjacent and separated
  duplicates, subsequent declaration recovery and fail-fast scope restoration.

## Spec method signatures skipped known-type validation

- Unused specs accepted undefined parameter and return types, including short
  undeclared names and names nested in tuples, callbacks and generic arguments.
- Validate signatures in temporary scopes containing the spec and method generic
  parameters. Restore the exact incoming scope on success and failure before
  existing resolution; method parameters cannot escape into sibling signatures.
- Twenty-seven regression cases failed before the correction. Controls retain
  Self, forward declarations and declared generic parameters.

## Specs and methods accepted duplicate generic parameters

- Specs and their methods accepted repeated generic parameter names. Reject
  duplicates per parameter list with BPL_SYMBOL_ALREADY_DEFINED; reuse in
  separate signatures and case-sensitive names remain valid.
- Seven regressions failed before the correction. Scope restoration is tested
  under diagnostic collection and fail-fast checking.

## Spec inheritance accepted undefined generic arguments

- A declared parent spec can be instantiated with an undefined type argument
  in another spec's inheritance list. Reproduced with unused declarations:
  spec Parent<T>{} spec Broken:Parent<MissingType>{} frame main(){}
- Validate inherited arguments with the child's generic parameters in scope,
  preserving existing parent-name diagnostics and scope restoration.
- Thirteen negative and recovery cases failed before the fix; declared child
  parameters, forward types and existing parent-name diagnostics remain valid.

## Spec validation could hide the primary inheritance diagnostic

- The new spec validation initially checked generic arguments before inherited
  spec names, so MissingParent<MissingType> reported the argument instead of
  the undefined parent. CodeRabbit identified this ordering regression in PR #19.
- Preserve the existing parent-name, non-spec and self-extension checks before
  validating inherited arguments or method signatures. Three regression cases
  protect these primary diagnostics when an argument is also undefined.

## Spec inheritance silently accepted non-spec type shapes

- Tuple, function and lambda parent types bypassed identity checks because only
  BasicType parents were checked. CodeRabbit identified this outside-diff issue
  in PR #19. Independent tests also found pointer and array wrappers around a
  named spec accepted as parents. All nine invalid declarations were accepted.
- Reject non-BasicType parents and BasicType pointer/array wrappers at the
  inheritance boundary. Named specs, generic arguments and multiple parents
  remain valid; invalid shapes report a source-located compiler diagnostic.

## Parser backtracking duplicated trailing comments

- Direct parsing collected the same comment repeatedly when grammar alternatives
  revisited a trailing struct field. The CLI formatter uses direct parsing, so
  comments multiplied on every formatting pass (audit T2).
- Deduplicate collected comments by source position and text, retaining identical
  comments at distinct positions. Cover line, block and nested block comments,
  formatting idempotence, and parity with lexer-provided comments.

## Formatter moved comments out of their source containers

- Parameter-list and array-literal comments move out of their original container
  into the function body. Struct field trailing comments move onto later lines.
- Source-aware formatting now aligns code tokens and places comments at their
  original lexical boundaries, with continuation indentation and aligned closing
  delimiters for comment-bearing lists. Preserve trailing comments, section
  spacing and multiline artwork; keep interpolation comments inside their token.
- Thirty-four placement regressions failed against the prior formatter. The
  repository corpus also exposed two pre-existing idempotence failures in
  lib/string_builder.bpl and packages/bpl-db/src/storage.bpl; both now pass.
- Refuse comment formatting for detached ASTs without original source instead of
  guessing positions; callers can supply source explicitly. Parser results retain
  weakly held provenance, without adding source text to serialized ASTs.

## Token-assisted parsing dropped comments inside interpolation expressions

- The lexer treats an interpolated string as one literal and excludes its text
  from comment scanning. Parser.parse replaced grammar comments with lexer
  comments, losing actual comments inside interpolation expressions.
- Merge grammar comments absent from the lexer list and return that merged list;
  cover strings with and without additional outer comments and distinguish
  literal hash characters from actual interpolation-expression comments.

## Lexer comment extraction mishandled nested comments and CR line endings

- The grammar supports nested block comments, but the lexer comment scan stopped
  at the first inner closing marker. It returned a truncated block and could
  misclassify the outer closing marker and following code as another comment.
- Line-comment extraction retained CR in CRLF files and consumed following lines
  in CR-only files. Track block depth and all supported line endings, preserving
  exact source comment bounds and positions.

## CR-only files retain LF-based source line numbers (open)

- The existing grammar parser and generic token positions count LF as a line
  break, so source following a lone CR can retain the preceding line number.
  Comment scanning now stops at CR without consuming following code, but a
  consistent whole-frontend source-location correction remains separate work.

## Format stdout added a second final newline

- Formatter output already ended in one newline, but the CLI printed it through
  console.log, adding another. Redirected stdout differed from --write output.
- Write the formatted text directly to stdout; cover plain, comment-bearing and
  CRLF input and check that redirected output equals the written file.

## Comment-aware tokenization used different Unicode column units

- GenericParser.advance counted Unicode code points while the generated parser
  and token offsets use UTF-16 units. On the multiline-literal advance path,
  tokens after an astral character had incorrect columns. Single-line fast
  paths already used UTF-16 lengths.
- Formatter source mapping relies on these coordinates. Advance through UTF-16
  units consistently; cover plain and interpolated
  strings, literal hash characters, actual comments and multiline literals.

## Formatter example bypassed canonical C declarations

- The new formatter regression example redeclared printf directly, violating the
  repository example declaration check. Import printf from std/c.bpl instead.
- Covered by ExampleExterns.test.ts and the formatter native/corpus checks.

## Formatted build output diverged from the format command

- Both frontend and full-runner formatted emits appended an extra stdout newline.
  They also need to honor project formatter preferences consistently.
- Write formatted text directly and share project configuration discovery. Three
  CLI regressions cover explicit build, default invocation and advanced build.

## Editor formatting rejected unsaved documents before error handling

- The formatting handler converted every document URI with fileURLToPath outside
  its try block. Untitled and other virtual documents therefore threw before the
  formatter could run. Only file URIs now trigger path conversion/config discovery;
  virtual buffers format directly, with errors handled by the existing boundary.
- The shared document formatter also honors project style or editor indentation
  preferences; regression cases cover unsaved buffers and unsaved file edits.

## VS Code activation changed global format-on-save for every language

- Activation wrote editor.formatOnSave=true globally, even when the user had
  disabled it. Replace persistent settings writes with a BPL-only save hook.
  Explicit native editor settings take precedence; enabled native formatting
  runs once through VS Code rather than through the convenience hook.
- Register an untitled-buffer formatter separately from the file-only server so
  formatting unsaved documents is reachable without exposing filesystem-only
  language-server handlers to non-file URIs.

## BPL save hook formatted during delayed autosaves

- CodeRabbit identified that the convenience save hook ran for AfterDelay saves,
  while native VS Code save formatting skips that reason. An activation regression
  expected zero formatting calls but received one. Skip AfterDelay; retain manual
  and focus-change saves and explicit native settings precedence.

## Compiler container context omitted the formatter schema

- The image copied bpl-format.schema.json, but its Dockerfile-specific context
  allowlist excluded the new root file, so BuildKit failed before compilation.
- Include the schema in docker/Dockerfile.dockerignore and verify the actual
  compiler image build, keeping the otherwise narrow build context.

## Formatter container test had inconsistent timeout allowances

- CodeRabbit noted that five sequential Docker invocations each allowed 60 seconds
  inside a test with a 60-second overall deadline. No slow-run failure was
  reproduced locally, but those limits could make the smoke test unreliable.
- Bound each process to 30 seconds and allow 240 seconds for the complete test.

## Formatter emitted invalid syntax for bare imports

- Formatting import "./module.bpl" produced import * from "./module.bpl", which
  the grammar does not accept. Preserve the supported bare-import syntax when
  importing all exported symbols without a namespace.
- Both plain and comment-bearing round trips fail before the fix.

## Formatter dropped const qualifiers from extern parameters

- Extern parameter printing duplicated a reduced name/type formatter and omitted
  Parameter.isConst. Both plain and comment-bearing AST round trips fail before
  the fix. Reuse the declaration parameter formatter so qualifiers are retained.

## Import path escaping corrupted literals and displaced adjacent comments

- Decoded import paths were printed inside quotes without escaping. Quotes,
  backslashes and newline escapes could produce invalid or changed source. When
  normalization changed the raw path token, a preceding comment could move after
  the path. Twenty parser/formatter regressions fail before the fix.
- Quote paths using supported BPL escapes (JSON backspace/form-feed forms need
  Unicode equivalents) and align ordinary string tokens by decoded value. Cover
  named/bare imports, Unicode/surrogates, controls, literal escapes and comments.

## Generic-list comments did not receive continuation layout

- Comment-bearing generic parameter and type/call argument lists were excluded
  from container layout. Subsequent arguments and closing brackets remained at
  statement indentation, unlike other multiline lists. Four layout goldens fail
  before the fix, including nested closers next to an assignment.
- Recognize canonical generic angle brackets separately from spaced comparisons;
  expose boundaries inside combined closing-bracket lexer tokens. Preserve shift
  and comparison text and verify meaning and repeated-formatting stability.

## Watch mode missed atomic saves, new sources and external imports

- Watching file inodes missed subsequent editor saves that replaced the source by
  rename. A CLI regression observes the second program but never the third after
  two atomic saves. Directory watches must survive source inode replacement.
- Four CLI regressions fail before the fix: repeated atomic entry replacement,
  creating a missing import, and changing external .bpl/.x modules. Watch source
  directories, resolve transitive imports and rescan after changes.
- Synchronous compilation/execution still blocks event handling while a program
  runs; subprocess concurrency is a separate outstanding issue.

## Recreated source directories retained obsolete watch handles

- CodeRabbit identified that directory watchers were keyed only by path. Replacing
  an entry/dependency directory preserved a handle on its former inode. Both new
  regressions fail before the fix even after an explicit refresh.
- Compare canonical bigint device/inode identities during refresh and recreate
  changed handles. Store identity with its handle so error/close cleanup cannot
  leave stale identity entries. Source snapshots use bigint IDs and nanosecond
  timestamps as well.

## Watch mode could not recover after its entry directory disappeared

- Once the entry directory was absent across a refresh, no live watcher remained
  to observe restoration. A new regression fails after restoring the directory
  and editing its source.
- Observe the nearest existing parent while a source directory is missing, then
  return to source-directory watches after restoration. Do not recursively scan
  unrelated ancestor trees. Treat file-valued path components as missing dirs.


## Missing-entry fallback rebuilt for unrelated ancestor source files

- CodeRabbit identified that extension-only relevance forced a rebuild for an
  unrelated .bpl/.x file in a fallback ancestor, even though rescanning collected
  no changed source. Both filesystem-event regressions fail before the fix.
- Let those events request discovery without forcing compilation. A source
  snapshot change, a collected source or relevant manifest still triggers the
  rebuild. Entry restoration and new-source discovery remain observable.

## Formatter combined unary signs into increment/decrement

- Formatting - -value and + +value removed their separating whitespace and
  changed the AST to decrement/increment. A sign before prefix --/++ was also
  regrouped. Preserve a space when a single unary sign precedes the same sign.
- Four regressions failed before the fix; controls cover other unary operators.
  Native checks compare original and formatted behavior at O0 and O3.

## Formatter emitted invalid interpolated literal escapes

- Escaped backticks became raw delimiters. Some control characters were written
  literally; combined with another escape they triggered the detailed parser and
  made previously valid strings fail parsing. Adjacent comments could also make
  token alignment fail before source-preserving literal replacement.
- Fourteen round-trip cases failed before the fix. Encode literal text through
  JSON string escaping, then escape backticks and interpolation starts. Keep
  expression parts unchanged and verify comment/no-comment idempotence.


## Symlinked project roots duplicated source watch identities

- CodeRabbit identified that root sources used an unresolved absolute path while
  imports used real paths. A symlinked project tracked the same source twice and
  reported an alias path for an edited dependency. Two regressions reproduce it.
- Canonicalize existing watch paths consistently, preserving absolute fallbacks
  for missing files and canonicalizing their nearest existing parent. Canonical
  temporary fixtures also work when the platform temporary directory is a link.


## Initial dev compilation missed edits made before watch registration

- CodeRabbit identified that the initial build/run completed before watching
  sources. A deterministic CLI regression edits source while a compile-driver
  gate pauses the first native build; no subsequent rebuild occurs before fixing.
- Register and refresh source watches before the first compilation so queued
  changes compare against the source baseline used for that build.


## Retargeting a project directory link left watches on the old project

- CodeRabbit identified that canonical source paths dropped observation of the
  alias itself. Replacing a project link changed no watched target directory; a
  regression receives no rebuild callback before the fix.
- Also watch parents of symlink path components, without recursively scanning
  those ancestors. Retain canonical source identities and refresh after retargets.


## Initial-build watcher regression used a non-executable Windows driver

- CodeRabbit identified that the test's .cmd wrapper cannot be launched as the
  compiler driver with shell execution disabled on Windows.
- Build the finite test driver as a standalone Bun executable on every platform,
  keeping shell-free execution and exercising the same launch boundary locally.


## A linked entry changed the project scan root to its external target

- CodeRabbit found that canonicalizing the file before choosing its parent
  scanned the target directory instead of the supplied project directory. A
  regression misses a local sibling and includes an unrelated target sibling.
- Canonicalize the supplied entry parent for scanning and the entry file itself
  for source identity. Continue observing link parents and resolved dependencies.


## Failed source watchers required another event to recover

- CodeRabbit noted a residual availability risk: a directory handle error or
  initial watch creation failure left no handle able to observe the next change.
  Two real-handle/temporary-failure regressions fail before the fix.
- Retry discovery/watch registration after one second without requiring a file
  event. Coalesce recovery timers, retry creation failures, and cancel pending
  recovery when the session closes or a manual refresh restores every handle.


## Watch recovery missed changes made while monitoring was unavailable

- Restoring a failed handle replaced the source baseline without reporting edits
  made during the gap. A finite regression edits before the retry and receives no
  callback before the correction.
- Compare the old and refreshed source snapshots during recovery and report a
  changed file, allowing dev mode to rebuild the current source immediately.


## Persistent watch registration failures flooded logs and rescanned every second

- CodeRabbit found that recovery retried persistent failures at a fixed one-second
  interval and reported the same directory repeatedly. A finite timer/log
  regression fails before the fix.
- Back off retries from one second to a 30-second cap. Report each directory once
  until it recovers, reset the delay after successful recovery, and continue to
  cancel timers on close. Drop obsolete directory failure records during refresh.


## Unresolved package and standard-library imports did not recover in watch mode

- CodeRabbit identified that missing bare packages and explicit std/ imports
  discarded their search paths. Three filesystem regressions fail before the fix:
  a new local package, a workspace package, and an external BPL_HOME library module.
- Let the resolver report candidates from its actual failed search, including
  configured package/global/extra roots. Watch their nearest existing directories
  without scanning ancestors. Successful resolutions keep their existing behavior.


## Asynchronous watch-handle failures restarted the retry loop too early

- CodeRabbit identified that a handle returned successfully then errored on the
  next turn cleared the failure history. Repeated asynchronous errors therefore
  retried every second and repeated their log message. A regression fails before
  the fix.
- Preserve backoff/error deduplication across newly created handles. Treat observed
  activity or a handle lasting at least 30 seconds as a fresh healthy episode.
  Ignore late errors from replaced handles and retain cancellation on close.
## Malformed string escapes consumed partial hexadecimal prefixes

- Both quoted-string decoders used parseInt without checking every digit. Invalid
  escapes such as \x1g and \u12g4 became control characters and discarded suffixes;
  a following escape could also be partly consumed. Ten lexer/parser regressions
  fail before the fix.
- Require exactly two/four hex digits before decoding. Malformed and incomplete
  escapes retain their literal spelling, matching the existing fallback contract.


## Character escape decoding discarded extra literal characters

- The character decoder returned the first escaped character and ignored the rest,
  accepting literals such as '\nABC' and '\x41' despite the one-character rule.
  Seven rejection regressions fail before the fix; ordinary 'ab' already failed.
- Require an escaped literal to contain exactly the backslash and one escape
  character before decoding. Existing supported escapes and legacy single unknown
  escapes retain their values; hexadecimal character escapes remain unsupported.


## Formatter removed enum implemented-spec lists

- Enum formatting omitted EnumDecl.implements entirely. Both plain and commented
  implemented-spec lists disappeared, changing the parsed declaration; three
  formatter round-trip regressions fail before the fix.
- Emit the existing type list after the enum name/generic parameters, preserving
  implemented contracts and their surrounding comments without new syntax.


## Multiline declaration headers introduced body spacing on repeated formatting

- Struct/spec/enum printers measured the first body member's gap from the start
  of the declaration, including multiline header comments. A subsequent format
  inserted an unwanted blank body line. Twenty-four configured regressions fail
  before the fix.
- Use the source opening-brace line for that initial gap. Locate it with lexer
  tokens so braces in comments do not count, and reuse lazily collected tokens.


## Comment-free declaration headers lost source brace spacing

- CodeRabbit identified that original source was retained only for programs with
  comments. Brace-on-next-line structs/specs/enums therefore acquired an unwanted
  blank body line. Four focused regressions fail before the correction.
- Retain source provenance in the existing weak map for every parsed program and
  use it for declaration layout, including comment-free files. The source remains
  outside AST serialization/traversal and is released with its program.
## Spaced comparisons were parsed as generic applications (audit C2)

- Postfix parsing consumed trivia before `<`, so comparison arguments such as
  consume(a < b, c > (d)) became a generic call instead of two comparisons.
  Twelve focused cases fail before the fix, including native compilation and
  the newly required rejection of spaced generic declarations/literals.
- Per the maintainer's syntax decision, require an adjacent generic `<` across
  declarations, references, calls and literals. Preserve whitespace/comments
  inside brackets and ordinary trivia before other postfix operators. Update
  both grammar and generated fast paths, and compare the optimized postfix
  scanner against the original Peggy production.


## Callable types retained spaced angle openers after adjacency tightening

- CodeRabbit identified FunctionType and LambdaType still accepting trivia
  before `<`, inconsistent with the chosen generic type syntax. Eight rejection
  cases reproduce this for whitespace, newlines and comments.
- Require the opening bracket to touch Func/Lambda as well; valid callable
  type forms and spaces inside their brackets remain supported.


## Diagnostics exposed internal boolean/string spellings (audit C18)

- Assignment, return and overload diagnostics printed i1 and *i8 where the
  language guide uses bool and string. Three focused regressions fail before
  the fix.
- Use a dedicated diagnostic type printer that preserves compound structure,
  qualifiers and dimensions. Keep canonical strings unchanged for signature
  identity and runtime type IDs.


## Missing generic arguments were reported as wrong value argument counts (C18)

- Calling identity(1) when only identity<T>(value:T) exists reported a value
  argument-count mismatch despite the matching value arity. One diagnostic
  regression fails before the fix.
- Track generic counts among candidates whose value arity matches, and report
  BPL_GENERIC_ARITY_MISMATCH when their explicit type-argument counts differ.
  Keep inference disabled and retain normal value/type mismatch diagnostics.


## Circular dependency diagnostics pointed at nonexistent line zero (audit C18)

- Module graph cycle detection reported the revisited module at 0:0 rather than
  the import completing the cycle. Both self-import and two-module location
  regressions fail before the fix.
- Retain source locations for dependency edges and carry the incoming edge
  through graph sorting. Report the closing import location, with a 1:1 fallback
  only for synthetic graphs without source import metadata.


## Diagnostic string aliases hid explicit byte pointer types

- CodeRabbit identified that the diagnostic printer rendered every explicit i8
  pointer as string, hiding the distinction in source spelling from a resolved
  string alias. Two new pointer regression tests fail before the correction.
- Inspect existing string-alias provenance, including alias-target chains, before
  using string spelling for resolved i8 pointers. Preserve explicit pointers and
  guard metadata traversal against cycles; canonical identity remains untouched.


## Diagnostic type formatting exposed undefined for runtime-only types

- CodeRabbit found that internal module types fall outside the parsed type union.
  The diagnostic formatter left their name unassigned and printed undefined.
- A regression reproduces the fallback failure. Use unknown for unsupported
  kinds while preserving existing qualifier and array-dimension formatting.


## JSON build validation matrix exceeded the default test timeout

- The full CI-safe run reproduced a 7.5-second timeout in a test that launches
  thirteen compiler processes sequentially under Bun's five-second default.
- Give that existing integration matrix a bounded 30-second test budget; keep
  all expected JSON error codes and stdout/stderr assertions unchanged.


## Diagnostic types erased pointer-to-array grouping

- CodeRabbit found that `(*int)[4]` and `*int[4]` printed identically, hiding
  distinct checked array/pointer shapes. Three checked-metadata cases fail against
  the original printer; a real assignment control covers address-of-array types.
- Keep parentheses for pointer-to-array nodes and avoid collapsing their pointer
  into a string alias. Canonical type keys and runtime type IDs remain untouched.


## Raw char pointer diagnostics were renamed to string

- CodeRabbit noted that the display helper changed explicit *char/**char nodes
  to string/*string even without string-alias provenance. Two raw-type regression
  cases fail before the fix.
- Restrict the string spelling to checked i8 types with string alias metadata;
  preserve raw char pointer spellings and checked pointer-to-array grouping.
## Dev execution blocked source watching and left programs running on shutdown

- Watch mode ran programs synchronously before registering source watches. A
  long-running app blocked reloads indefinitely, with and without module caching.
  Terminating dev also left the app running. Three CLI regressions fail before
  the fix.
- Register watches before the initial build, run the app as an owned async child,
  serialize restarts and await the old child before rebuilding. Stop it on session
  close/SIGINT/SIGTERM, preserving run timeouts and compilation error recovery.
  Compilation itself still runs synchronously during each individual rebuild.


## Long dev run timeouts expired immediately through JavaScript timer limits

- During asynchronous runner validation, a valid BPL_RUN_TIMEOUT_MS of 2147483648
  was clamped to one millisecond by the JavaScript timer API. A normal short-lived
  program was terminated immediately; a focused regression reproduces this.
- Schedule bounded timer segments using monotonic elapsed time, preserving the
  existing positive-safe-integer environment contract. Clear the active segment
  when the program finishes or the dev session stops.


## Repeated shutdown signals could interrupt dev child cleanup

- CodeRabbit identified that signal handlers were removed before awaiting child
  termination. A second signal could exit dev while its child was still stopping.
- Keep both handlers until cleanup finishes, removing them in finally. A gated
  runner-stop regression fails before the fix and checks handler retention,
  coalesced close requests and eventual listener cleanup without sending signals.


## Watch runner readiness could read an empty PID file

- CodeRabbit identified a test race between file creation and writing the child
  PID. A deterministic delayed-write fixture reproduces it: Number("") became
  zero, invalidating the later process-exit assertion.
- Wait for a positive safe integer PID before continuing with shutdown checks.


## Watch execution passed WebAssembly output to the native process runner

- CodeRabbit found that the new asynchronous runner received .wasm output as
  though it were a host executable. Four cached/uncached output-selection
  regressions fail before the fix.
- Keep WebAssembly builds out of native watch execution and warn once when run
  was requested. Watch compilation remains available; a WebAssembly runtime must
  execute the module separately. Native execution paths remain selected normally.


## CR-only source locations and newline characters in diagnostic snippets

- CR-only source files were accepted as whitespace but their tokens, AST nodes,
  comments and syntax errors stayed on the preceding line. This also caused
  formatter comment placement to use incorrect source offsets. Mixed newlines
  inside multiline literals had the same issue.
- Count LF, CRLF and standalone CR consistently across both lexer paths,
  parser AST/error locations and formatter source offsets. CRLF counts once;
  source text, literal payloads and UTF-16 offsets remain unchanged.
- Split diagnostic source snippets on all three newline forms for both cached
  and disk-backed sources, removing CRLF carriage returns from displayed lines.
- Absolute-position, formatter round-trip, syntax-error and source-snippet
  regressions are in `tests/SourceLineEndings.test.ts`.


## CR-only documentation lost sections and parameter help

- After source coordinates were corrected, documentation block comments attached
  to declarations in CR-only files, but DocParser still recognized only LF/CRLF.
  Section headers remained inside the description, and parameter help was lost.
- Split standalone CR as well. Direct section/parameter regressions and generated
  Markdown equivalence tests across all three newline forms cover the fix.


## CR-only comment spacing lost blank lines

- CodeRabbit found that both blank-line checks beside comments required LF, so
  CR-only sources lost their section spacing. Two regressions reproduce this.
- Recognize logical LF/CRLF/CR separators before and after comments, preserve
  at most one blank line, and guard against treating a single CRLF as two breaks.
  Tests cover one, two and three separators, exact output and idempotence.


## Empty cached source displayed stale diagnostic snippets

- DiagnosticFormatter treated an empty cached source as a cache miss and read
  old source from disk. An emptied editor buffer could therefore show obsolete
  text in terminal and JSON diagnostics, disagreeing with CompilerError output.
- Distinguish undefined (no cached document) from the valid empty string. A
  regression covers disk fallback before caching, authoritative empty content,
  and text, structured-object and JSON output.


## Lexer EOF positions ignored trailing source text

- EOF was computed from the last token's start and lexeme length, so trailing
  whitespace/comments and multiline literals produced incorrect end positions.
  Whitespace-only input incorrectly reported 1:1. Eleven boundary cases fail.
- Return the final scanner coordinates from both GenericParser paths and use
  them for EOF, without rescanning or changing preceding tokens. Regressions
  cover LF/CRLF/CR, comment-only input, multiline literals and UTF-16 columns.
