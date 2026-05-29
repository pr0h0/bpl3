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

Use `bpl bindgen` to generate BPL `extern` declarations from simple C header
function prototypes:

```c
int puts(const char *s);
double pow(double base, double exp);
int printf(const char *fmt, ...);
```

```bash
bpl bindgen math_and_stdio.h -o c_bindings.bpl
```

The generated BPL is intentionally conservative:

```bpl
extern puts(s: string) ret int;
extern pow(base: double, exp: double) ret double;
extern printf(fmt: string, ...) ret int;
```

Review generated pointer and platform-sized integer mappings before publishing
bindings for a library. Complex C constructs such as macros, inline functions,
and layout-sensitive structs still need manual wrappers.
