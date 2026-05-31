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
