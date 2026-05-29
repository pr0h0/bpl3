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
simple function prototypes, numeric `#define` constants, primitive typedefs,
plain structs, and enums:

```c
#define ANSWER 42
typedef unsigned int bpl_size;
typedef struct Point { int x; double y; } Point;
typedef enum Color { COLOR_RED = 1, COLOR_BLUE = 2 } Color;
int puts(const char *s);
double pow(double base, double exp);
int printf(const char *fmt, ...);
```

```bash
bpl bindgen math_and_stdio.h -o c_bindings.bpl
```

The generated BPL is intentionally conservative:

```bpl
global const ANSWER: int = 42;
type bpl_size = uint;

struct Point {
    x: int,
    y: double,
}

enum Color {
    COLOR_RED,
    COLOR_BLUE,
}

extern puts(s: string) ret int;
extern pow(base: double, exp: double) ret double;
extern printf(fmt: string, ...) ret int;
```

Review generated pointer, enum-value, and platform-sized integer mappings before
publishing bindings for a library. Complex macros, inline functions, packed
layouts, bitfields, and ABI-sensitive structs still need manual wrappers or a
future libclang-backed binding pass.
