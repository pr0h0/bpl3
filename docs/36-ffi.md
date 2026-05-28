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
