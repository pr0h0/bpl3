# Standard Library: I/O

The `IO` struct provides input/output utilities for printing and reading input.

## Import

```bpl
import [IO] from "std/io.bpl";
```

## Printing Functions

| Function                                     | Description                               |
| -------------------------------------------- | ----------------------------------------- |
| `IO.print(s: string)`                        | Print string without newline              |
| `IO.printString(s: string)`                  | Print string with newline                 |
| `IO.printString(s: String)`                  | Print String object with newline          |
| `IO.printInt(n: int)`                        | Print integer without newline             |
| `IO.printIntLn(n: int)`                      | Print integer with newline                |
| `IO.printFloat(f: float)`                    | Print float without newline               |
| `IO.printFloatLn(f: float)`                  | Print float with newline                  |
| `IO.printBool(b: bool)`                      | Print bool without newline                |
| `IO.printBoolLn(b: bool)`                    | Print bool with newline                   |
| `IO.log(msg: string)`                        | Alias for printString                     |
| `IO.printf(format: string, a0: int) ret int` | Formatted print (wrapper around C printf) |

## Reading Functions

| Function                                                     | Description                             |
| ------------------------------------------------------------ | --------------------------------------- |
| `IO.read(format: string, ptr: *void) ret int`                | Formatted read (wrapper around C scanf) |
| `IO.readLine(buf: string, capacity: int) ret LineReadResult` | Bounded line input with explicit status |

## Bounded input example

`IO.readLine` requires the allocated buffer capacity, including space for the NUL
terminator. It replaces the unsafe one-argument API. Import `LineReadResult` from
`std/io.bpl` or `std` and handle its variants:

- `Line(n)`: a complete line or final unterminated line; `n` stored bytes.
- `Truncated(n)`: the prefix fit, and the remainder was consumed through LF/EOF.
- `EndOfFile`: EOF before any bytes of a new line.
- `Error`: a native stream error; do not treat the buffer as a complete line.
- `InvalidBuffer`: null buffer or nonpositive capacity; no input consumed.

Valid buffers are always NUL-terminated, including on EOF/error. LF is removed;
other bytes (including CR and embedded NUL) are preserved and counted. A capacity
of one stores only the terminator. The caller must pass the actual buffer size.
The native runtime provides this API on supported Linux/macOS hosts.

```bpl
import [IO], [LineReadResult] from "std/io.bpl";

frame main() ret int {
    local buf: char[100];
    match (IO.readLine(cast<string>(&buf[0]), 100)) {
        LineReadResult.Line(n) => IO.printString(cast<string>(&buf[0])),
        LineReadResult.Truncated(n) => IO.log("Line too long"),
        LineReadResult.EndOfFile => IO.log("End of input"),
        _ => IO.log("Input error"),
    };
    return 0;
}
```

`IO.read` returns the native `scanf` assignment count. Keep format strings trusted
and match each conversion to the destination type and buffer size.
`IO.printf` accepts one integer argument; use the native variadic `printf` for
other argument lists.

## Low-level I/O

For more control, you can use C's printf directly:

```bpl
import [printf], [scanf] from "std/c.bpl";

frame main() {
    printf("Hello, %s! You are %d years old.\n", "World", 25);

    local age: int = 0;
    printf("Enter age: ");
    scanf("%d", &age);
}
```
