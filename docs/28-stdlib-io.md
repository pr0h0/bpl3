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

| Function                                      | Description                                     |
| --------------------------------------------- | ----------------------------------------------- |
| `IO.read(format: string, ptr: *void) ret int` | Formatted read (wrapper around C scanf)         |
| `IO.readLine(buf: string) ret int`            | Unbounded legacy read; avoid for external input |

## Bounded input example

`IO.readLine` calls the unbounded C `gets` function and has no capacity argument.
It can overflow its destination; it also does not handle EOF robustly. Use a
bounded native read or a width-limited formatted token read instead. `IO.read`
returns the native `scanf` result: check the assignment count before using input.

```bpl
import [IO] from "std/io.bpl";

frame main() ret int {
    local buf: char[100];
    IO.print("Enter one word: ");
    if (IO.read("%99s", cast<*void>(&buf[0])) != 1) { return 1; }
    IO.printString(cast<string>(&buf[0]));
    return 0;
}
```

This reads a whitespace-delimited token, not an entire line. Keep format strings
trusted and match each conversion to the destination type and buffer size.
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
