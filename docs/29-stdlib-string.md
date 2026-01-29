# Standard Library: String Utilities

The `String` struct provides a managed string type with automatic memory management.

## Import

```bpl
import [String] from "std/string.bpl";
```

## Creation

```bpl
local s: String = String.new("Hello, World!");
defer s.destroy();  # Clean up when scope exits
```

## Core Methods

| Method                                | Description                |
| ------------------------------------- | -------------------------- |
| `String.new(text: string) ret String` | Create from string literal |
| `s.destroy()`                         | Free memory                |
| `s.toString() ret string`             | Get underlying C string    |
| `s.clone() ret String`                | Create a deep copy         |
| `s.isEmpty() ret bool`                | Check if empty             |
| `s.assign(text: string)`              | Replace content            |

## String Operations

| Method                                         | Description                             |
| ---------------------------------------------- | --------------------------------------- |
| `s.includes(substr: string) ret bool`          | Check if contains substring             |
| `s.indexOf(substr: string) ret int`            | Find first occurrence (-1 if not found) |
| `s.lastIndexOf(substr: string) ret int`        | Find last occurrence                    |
| `s.startsWith(prefix: string) ret bool`        | Check prefix                            |
| `s.endsWith(suffix: string) ret bool`          | Check suffix                            |
| `s.substring(start: int, end: int) ret String` | Extract substring                       |
| `s.charAt(index: int) ret char`                | Get character at index                  |

## Transformation

| Method                                                | Description                        |
| ----------------------------------------------------- | ---------------------------------- |
| `s.toUpper() ret String`                              | Convert to uppercase               |
| `s.toLower() ret String`                              | Convert to lowercase               |
| `s.trim() ret String`                                 | Remove leading/trailing whitespace |
| `s.trimLeft() ret String`                             | Remove leading whitespace          |
| `s.trimRight() ret String`                            | Remove trailing whitespace         |
| `s.replace(old: string, new: string) ret String`      | Replace all occurrences            |
| `s.replaceFirst(old: string, new: string) ret String` | Replace first occurrence           |
| `s.reverse() ret String`                              | Reverse the string                 |
| `s.repeat(count: int) ret String`                     | Repeat string n times              |
| `s.padLeft(width: int, pad: char) ret String`         | Pad on left                        |
| `s.padRight(width: int, pad: char) ret String`        | Pad on right                       |

## Splitting & Joining

| Method                                                     | Description               |
| ---------------------------------------------------------- | ------------------------- |
| `s.split(delimiter: string) ret Array<String>`             | Split into array          |
| `String.join(arr: *Array<String>, sep: string) ret String` | Join array with separator |

## Conversion

| Method                                                    | Description               |
| --------------------------------------------------------- | ------------------------- |
| `String.fromInt(val: long) ret String`                    | Convert integer to string |
| `String.fromFloat(val: float, precision: int) ret String` | Convert float to string   |
| `String.fromBool(val: bool) ret String`                   | Convert bool to string    |
| `s.toInt() ret int`                                       | Parse as integer          |
| `s.toFloat() ret float`                                   | Parse as float            |
| `s.toBool() ret bool`                                     | Parse as boolean          |

## Operator Overloading

```bpl
local a: String = String.new("Hello");
local b: String = String.new(" World");

# Concatenation with +
local c: String = a + b;           # "Hello World"
local d: String = a + "!";         # "Hello!" (with literal)

# Comparison
if (a == b) { ... }
if (a < b) { ... }   # Lexicographic comparison
```

## Example

```bpl
import [String] from "std/string.bpl";

extern printf(fmt: string, ...);

frame main() {
    local greeting: String = String.new("  Hello, World!  ");
    defer greeting.destroy();

    # Trim whitespace
    local trimmed: String = greeting.trim();
    defer trimmed.destroy();
    printf("Trimmed: '%s'\n", trimmed.toString());

    # Check contents
    if (trimmed.includes("World")) {
        printf("Contains 'World'\n");
    }

    # Transform
    local upper: String = trimmed.toUpper();
    defer upper.destroy();
    printf("Upper: %s\n", upper.toString());

    # Replace
    local replaced: String = trimmed.replace("World", "BPL");
    defer replaced.destroy();
    printf("Replaced: %s\n", replaced.toString());
}
```

## C String Functions

For low-level operations, you can use C functions:

```bpl
extern strlen(s: string) ret int;
extern strcpy(dest: *char, src: string) ret *char;
extern strcat(dest: *char, src: string) ret *char;
extern strcmp(s1: string, s2: string) ret int;
```
