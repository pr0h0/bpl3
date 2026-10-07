# Foreign Function Interface (FFI)

BPL can call functions written in C and other languages that support the C ABI.

## Supported ABI boundary

Extern parameters and results may be:

- scalars, raw pointers, and `string`;
- enums without payloads, passed as a C `int`;
- C-compatible structs, passed and returned by value.

A struct is C-compatible when it has at least one field, every field is a
scalar, pointer, `string`, payload-free enum, fixed array of those, or another
C-compatible struct, and it has no methods, specs, parent struct, child
structs, or generic parameters. Methods and inheritance add a hidden vtable
pointer, so such structs have no C equivalent.

The compiler lowers by-value structs to the target's C calling convention
(x86-64 System V, Windows x64, AArch64 AAPCS and Apple arm64, i386 System V,
and WebAssembly): small structs travel in registers, larger ones through
caller-owned copies and hidden result pointers. `tests/CAbiLowering.test.ts`
checks the lowered declarations against clang for every supported target.

```bpl
struct Vec3 {
    x: double,
    y: double,
    z: double,
}

extern scale(v: Vec3, k: double) ret Vec3;
```

The following are rejected with `BPL_EXTERN_ABI_UNSUPPORTED`:

- tuples, slices, fixed arrays, and Lambda values in extern signatures (pass a
  pointer instead);
- enums with payloads, and structs that are not C-compatible;
- aggregates in callback (`Func`) signatures and in variadic extern
  declarations, which cannot be adapted by a wrapper.

Direct variadic calls such as `printf` accept `String`, passed as its data
pointer, and payload-free enums, passed as their `i32` tag. Other aggregate
variadic arguments are rejected.

## Declaring External Functions

Use the `extern` keyword.

```bpl
extern printf(fmt: string, ...) ret int;
extern malloc(size: long) ret *void;
```

### One symbol, one signature

Only one `strlen` reaches the linker, so every module in a program has to
describe it the same way. Two modules declaring the same external function
with different types is rejected with `BPL_EXTERN_SIGNATURE_CONFLICT`,
because a call made through the second declaration would not match the
function the first one names.

The comparison is on the C types, not on how they were spelled. `*void`,
`string` and `*char` are one pointer type, and `long`, `ulong` and `u64` are
one integer type, so these two modules agree:

```bpl
# reader.bpl
extern strlen(s: string) ret long;

# writer.bpl
extern strlen(s: *char) ret u64;
```

For scalar and pointer returns, leaving the return type off allows this module
to ignore the result, so `extern printf(fmt: string, ...);` and
`extern printf(fmt: string, ...) ret int;` can appear in different modules of
the same program. A difference in the width or class of the return type, or
in the parameters, is an error. Aggregate returns cannot be omitted this way:
the C ABI may require a hidden result pointer. These checks also apply when
taking an extern function address for an indirect call.

The simplest way to stay consistent is to import the declaration instead of
repeating it: `import printf, malloc from "std/c.bpl";`.

## Linking

When compiling, you must link against the libraries containing the external functions.

```bash
bpl build main.bpl -l m
```

## Generating Bindings

Use `bpl bindgen` to generate BPL declarations from C headers. It supports
simple function prototypes, numeric/string/char `#define` constants, primitive
and pointer typedefs, multiple declarators in typedefs and struct fields, plain
structs, fixed-size struct arrays, pointer-return functions, C array
parameters, line-continuation splicing, and enums:

```c
#define ANSWER 42
#define SCIENTIFIC_DOUBLE 1e-3
#define CONTINUED_COUNT \
  64u
#define FEATURE_BITS 0b1010u
#define FILE_MODE 0755
#define DEFAULT_MARK 'x'
typedef unsigned int bpl_size;
typedef unsigned \
  long continued_word;
typedef unsigned long bpl_word, *bpl_word_ptr;
typedef const char *bpl_cstr;
typedef void *bpl_handle;
typedef struct Point { int x; double y; } Point;
typedef struct Buffer { unsigned char bytes[16]; } Buffer;
typedef struct PackedFields { int x, y; char *label, marker; } PackedFields;
typedef enum Color { COLOR_RED = 1, COLOR_BLUE = 2 } Color;
int puts(const char *s);
void *malloc(size_t size);
double pow(double base, double exp);
void fill(int values[], unsigned long count);
void fill_matrix(int matrix[2][3]);
int printf(const char *fmt, ...);
```

```bash
bpl bindgen math_and_stdio.h -o c_bindings.bpl
```

The generated BPL is intentionally conservative:

```bpl
global const ANSWER: int = 42;
global const SCIENTIFIC_DOUBLE: double = 1e-3;
global const CONTINUED_COUNT: uint = 64;
global const FEATURE_BITS: uint = 0b1010;
global const FILE_MODE: int = 0o755;
global const DEFAULT_MARK: char = 'x';
type bpl_size = uint;
type continued_word = ulong;
type bpl_word = ulong;
type bpl_word_ptr = *ulong;
type bpl_cstr = string;
type bpl_handle = *void;

struct Point {
    x: int,
    y: double,
}

struct Buffer {
    bytes: u8[16],
}

struct PackedFields {
    x: int,
    y: int,
    label: string,
    marker: char,
}

enum Color {
    COLOR_RED,
    COLOR_BLUE,
}

extern puts(s: string) ret int;
extern malloc(size: ulong) ret *void;
extern pow(base: double, exp: double) ret double;
extern fill(values: *int, count: ulong) ret void;
extern fill_matrix(matrix: *int[3]) ret void;
extern printf(fmt: string, ...) ret int;
```

For function parameters, C array declarations such as `int values[]` or
`const int values[4]` are emitted as pointers because the C ABI receives them as
pointers. Multidimensional parameter arrays decay at the outer dimension, so
`int matrix[2][3]` becomes `*int[3]`. Fixed arrays inside structs stay fixed
arrays. Legacy C octal constants such as `0755` are normalized to BPL `0o755`
syntax, binary constants keep `0b` syntax, and exponent-only floating constants
such as `1e-3` are emitted as `double` so generated bindings preserve C numeric
semantics.

Review generated pointer, enum-value, and platform-sized integer mappings before
publishing bindings for a library. Complex macros, inline functions, function
pointer callback parameters or fields, packed layouts, bitfields, and nested
anonymous structs/unions still need manual wrappers or a future libclang-backed
binding pass.

## Calling BPL from other languages

Mark a non-generic free function with `@[c_export]` to publish its source name
as a C-linkable symbol. Calls inside BPL retain the normal implementation name.
BPL module `export` declarations still control BPL imports independently.

```bpl
@[c_export]
frame add(a: long, b: long) ret long {
    return a + b;
}
```

Build the library and a C/C++ header in one command:

```bash
bpl build library.bpl --shared --header library.h -O3 -o libexample.so
```

A C or C++ caller includes `library.h` and links against `libexample.so`.
Python can load it with `ctypes.CDLL`, declare two `ctypes.c_int64` arguments
and a `ctypes.c_int64` result, and call `library.add(20, 22)`. Go and Rust use
the same C ABI entry point; no handwritten forwarding adapter is needed.
The generated header includes `extern "C"` guards for C++ callers. Header
generation rejects export names that collide with C/C++ keywords or the
standard integer types and macros it includes, such as `concept`, `int32_t`,
and `INT64_C`. Rename such functions before requesting a header.

`--shared` supplies position-independent shared-library flags, does not require
`main`, and retains functions for foreign callers. It requires `-o`; `--cache`,
`--emit`, execution/watch modes, and WebAssembly targets cannot be combined
with it. Ordinary executable builds still require `main`. `--header` requires
`--shared`; its output must differ from the source, library, and LLVM paths.
JSON build success reports include the header path when requested.

C exports accept scalars, raw pointers, and scalar/pointer `Func` callbacks,
including returned function pointers. Aggregate values, `Lambda` closures,
methods, and generic functions are rejected with `BPL_C_EXPORT_UNSUPPORTED`.
Names must be unique across modules and cannot collide with other linker
symbols (`BPL_C_EXPORT_CONFLICT`). `main` and `__bpl_` names are reserved.
Exported functions also remain reachable in executable builds; cached objects
emit their public symbols only in the owning module. Optimized C entry points
initialize required stack guards even when there is no BPL `main`.

The header generator spells integer widths explicitly and emits opaque struct
pointer declarations, not struct layouts. Generic specializations receive distinct
opaque tags: a `Box<int>` handle is not a `Box<double>` handle. Equivalent type
aliases use the same tag. Use the generated declarations rather than hardcoding
compiler-generated tag names. Prefer creation/access/destruction
functions for opaque handles. If foreign code constructs a struct directly,
it must separately agree on the exact C-compatible layout. Inbound by-value
struct exports are not supported; outbound extern by-value structs still use
the target C ABI lowering described above.

`tests/helpers/runInterop.ts` builds and tests these direct exports. Advanced clients
can still use the TypeScript `Compiler` API with `resolveImports: true` and
`requireEntryPoint: false`, then link its IR with the native runtime.

### Fixed-size array pointers

Array aliases can describe fixed-size C buffers without passing arrays by value:

```bpl
type Row = int[2];
type Grid = Row[3];
extern sum_grid(values: *Grid) ret int;
@[c_export] frame update_row(values: *Row) ret *Row {
    values[1] = 42;
    return values;
}
```

`*Grid` corresponds to C `int32_t (*)[3][2]`; `*Row` corresponds to
`int32_t (*)[2]`. Generated headers preserve these dimensions, including returned
pointers, pointer chains, and instantiated generic array aliases. In C, pass
`&array` for a pointer to the whole array. In BPL, indexing the innermost array
pointer accesses its elements directly, as `values[1]` does above.

Arrays passed by value and arrays of pointers remain unsupported at the function
boundary; a pointer to an array of pointers is supported. BPL slices carry length
metadata and are not C arrays. Header generation rejects slice storage; use a
raw element pointer and a separate length for variable-sized buffers.

### Type and ownership rules

| BPL boundary type | C boundary type | Notes |
| --- | --- | --- |
| `int` / `uint` | `int32_t` / `uint32_t` | Use fixed widths in bindings |
| `long` / `ulong` | `int64_t` / `uint64_t` | C `long` is not 64-bit on every target |
| `f32` | `float` | 32-bit floating point |
| `float` / `double` | `double` | 64-bit floating point |
| `bool` | C `_Bool`, C++ `bool` | Use the declared boolean ABI |
| `string` | NUL-terminated byte pointer | No ownership transfer is implied |
| `*T` | Pointer to matching layout | Caller keeps storage alive |
| `Func<R>(...)` | C function pointer | Scalar/pointer signatures only |

Arrays and slices of `Func` values cannot cross the C ABI by value, including
inside another callback signature or through generic type aliases. They are not
interchangeable with one C function pointer. Within BPL, fixed callback arrays
can be initialized with literals such as `[inc, dec]`, indexed, and passed to
BPL functions as fixed arrays; generic callback aliases are supported too.

A `Func` value already represents a C function pointer. Adding `*` to a
callable or tuple alias is currently unsupported and reports
`BPL_TYPE_ALIAS_POINTER_UNSUPPORTED`, including through generic aliases. For
an output callback slot, use a struct containing a `Func` field and pass a
pointer to that struct; the C side must agree on the field layout.

A `Lambda` carries a BPL closure context and cannot replace a C function
pointer. Python `ctypes` callbacks and Bun `JSCallback` objects must remain
alive for every native call that can use them. The fixtures use synchronous
callbacks and release callback resources afterward.

Catch errors before returning across the foreign boundary. Do not unwind C++
exceptions, Rust panics, Go panics, or BPL exceptions through another language's
frames. The native runtime currently keeps exception/defer/stack-limit state
in process-global storage; these tests do not establish thread-safe embedding
or support for arbitrary foreign-thread callbacks.

### Language-specific adapters

- **C:** use fixed-width types and the C-compatible struct layout.
- **C++:** expose providers with `extern "C"`; wrap classes, templates, and
  exceptions behind that interface.
- **Rust:** expose `extern "C"` functions and use `#[repr(C)]` for structs.
  The checked fixture uses Rust edition 2021 and `#[no_mangle]`. Keep Rust-owned
  values alive while BPL borrows their pointers.
- **Go:** use cgo and `//export` with `-buildmode=c-shared` for providers.
  Callback invocation needs a small C helper. Respect cgo pointer/lifetime
  rules; Go's native calling convention is not the C ABI.
- **Python:** use `ctypes.CDLL`, explicit `argtypes`/`restype`, and `CFUNCTYPE`
  callbacks. This tests Python calling BPL and BPL calling back into Python,
  not embedding a Python interpreter in a standalone BPL executable.
- **JavaScript:** the native fixture uses Bun's `bun:ffi`, with `BigInt` for
  64-bit integers. It is not a Node.js native-addon test; Node needs a separate
  addon or an appropriate WebAssembly integration.

## Executable interoperability matrix

Run the Linux x86-64 host checks with installed clang/clang++, Python, and Bun:

```bash
bun tests/helpers/runInterop.ts
```

To add Go and Rust without installing their compilers on the host:

```bash
docker pull golang:1-bookworm
docker pull rust:1-bookworm
bun tests/helpers/runInterop.ts --docker
```

Containers have networking disabled during compilation and execution, mount
fixtures read-only, and write into a temporary work directory as the invoking
user. The directory is removed after the test; downloaded Docker images remain.
The Docker option deliberately selects these images for reproducible toolchain
isolation. It is separate from the default CI-safe suite.

The matrix checks `-O0` and `-O3`, 64-bit integer values, `f32`, signed 16-bit
values and booleans on outbound calls, small and large by-value outbound
structs, pointer-based inbound structs, and callbacks in both directions.
Every host also passes a nested row-pointer buffer to BPL and checks reads and
mutations. The Go fixture uses a small cgo helper with C-owned buffer storage;
Python, Bun, and Rust keep their buffer owners alive across the native call.
`tests/InteropNative.test.ts` runs the host subset in the normal test suite when
its Linux x86-64 toolchains are available. Cross-target ABI declaration tests
remain in `tests/CAbiLowering.test.ts`; native execution on Linux does not
establish runtime compatibility on Windows, macOS, or other architectures.
