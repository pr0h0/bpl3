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

BPL module `export` declarations do **not** create a stable C export name or
convert a BPL function's aggregate calling convention into the C ABI. Use a
small C adapter with scalar/pointer signatures for a foreign-facing library.
The executable fixtures in `tests/fixtures/interop` show this approach:

1. Compile `library.bpl` with the TypeScript `Compiler` API, setting
   `resolveImports: true`, `requireEntryPoint: false`, and the desired
   `optimizationLevel`. Save the returned `output` as LLVM IR.
2. Compile that IR and `bridge.c` with clang using `-shared -fPIC`, linking the
   runtime files returned by `resolveNativeRuntimeFiles({ irPath })` and `-lm`.
3. Foreign callers use the declarations in `bridge.h`. The adapter refers to
   BPL's generated function names, so rebuild and verify it when those names
   or signatures change.

The CLI can also build the library directly, without a `main` function:

```bash
bpl build library.bpl --shared --object bridge.c -O3 -o libexample.so
```

`--shared` supplies position-independent shared-library flags and keeps library
functions reachable to foreign callers. It requires an explicit output path;
`--cache`, `--emit`, execution/watch modes, and WebAssembly targets cannot be
combined with it. Ordinary executable builds still require `main`.
`tools/test_interop.ts` uses this CLI path. Stable C exports still require the
adapter described above. Do not directly declare a by-value BPL struct
function as a C function; outbound extern lowering does not apply in reverse.
Pass pointers to plain C-compatible structs through the adapter instead.

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
bun tools/test_interop.ts
```

To add Go and Rust without installing their compilers on the host:

```bash
docker pull golang:1-bookworm
docker pull rust:1-bookworm
bun tools/test_interop.ts --docker
```

Containers have networking disabled during compilation and execution, mount
fixtures read-only, and write into a temporary work directory as the invoking
user. The directory is removed after the test; downloaded Docker images remain.
The Docker option deliberately selects these images for reproducible toolchain
isolation. It is separate from the default CI-safe suite.

The matrix checks `-O0` and `-O3`, 64-bit integer values, `f32`, signed 16-bit
values and booleans on outbound calls, small and large by-value outbound
structs, pointer-based inbound structs, and callbacks in both directions.
`tests/InteropNative.test.ts` runs the host subset in the normal test suite when
its Linux x86-64 toolchains are available. Cross-target ABI declaration tests
remain in `tests/CAbiLowering.test.ts`; native execution on Linux does not
establish runtime compatibility on Windows, macOS, or other architectures.
