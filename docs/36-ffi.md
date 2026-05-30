# Foreign Function Interface (FFI)

BPL can call functions written in C and other languages that support the C ABI.

## Declaring External Functions

Use the `extern` keyword.

```bpl
extern printf(fmt: string, ...) ret int;
extern malloc(size: long) ret *void;
```

## Linking

When compiling, you must link against the libraries containing the external functions.

```bash
bpl build main.bpl -l m
```

## Generating Bindings

Use `bpl bindgen` to generate BPL declarations from C headers. It supports
simple function prototypes, numeric/string/char `#define` constants, primitive
and pointer typedefs, multiple declarators in typedefs and struct fields, plain
structs, fixed-size struct arrays, C array parameters, and enums:

```c
#define ANSWER 42
#define FEATURE_BITS 0b1010u
#define FILE_MODE 0755
#define DEFAULT_MARK 'x'
typedef unsigned int bpl_size;
typedef unsigned long bpl_word, *bpl_word_ptr;
typedef const char *bpl_cstr;
typedef void *bpl_handle;
typedef struct Point { int x; double y; } Point;
typedef struct Buffer { unsigned char bytes[16]; } Buffer;
typedef struct PackedFields { int x, y; char *label, marker; } PackedFields;
typedef enum Color { COLOR_RED = 1, COLOR_BLUE = 2 } Color;
int puts(const char *s);
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
global const FEATURE_BITS: uint = 0b1010;
global const FILE_MODE: int = 0o755;
global const DEFAULT_MARK: char = 'x';
type bpl_size = uint;
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
syntax so generated bindings preserve C numeric semantics.

Review generated pointer, enum-value, and platform-sized integer mappings before
publishing bindings for a library. Complex macros, inline functions, function
pointer callback parameters or fields, packed layouts, bitfields, nested
anonymous structs/unions, and ABI-sensitive structs still need manual wrappers
or a future libclang-backed binding pass.
