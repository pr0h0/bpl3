# Standard Library and Built-ins

BPL comes with a set of built-in functions and a standard library implemented in BPL itself.

## Built-in Functions

These functions are available in every BPL program without any imports.

### `print(value: *u8)`
Prints a string to the standard output (stdout).
- **Arguments**: `value` - A pointer to a null-terminated string.
- **Returns**: `void`

```bpl
call print("Hello, World!\n");
```

### `exit(status: u64)`
Terminates the program with the specified exit code.
- **Arguments**: `status` - The exit code (0 for success).
- **Returns**: `void`

```bpl
call exit(1);
```

### `exec(command: *u8)`
Executes a shell command and returns the output.
- **Arguments**: `command` - The shell command to execute.
- **Returns**: `*u8` - A pointer to the output string (allocated on heap).

```bpl
local output: *u8 = call exec("ls -la");
call print(output);
```

### `str_len(str: *u8)`
Calculates the length of a null-terminated string.
- **Arguments**: `str` - The string.
- **Returns**: `u64` - The length of the string.

```bpl
local len: u64 = call str_len("Hello");
```

## Standard Library (`lib/`)

The standard library provides additional functionality. You can import these modules into your program.

### `utils.x`
Common utility functions.

- `print_u64(n: u64)`: Print an unsigned 64-bit integer.
- `println_u64(n: u64)`: Print `u64` with a newline.
- `print_i64(n: i64)`: Print a signed 64-bit integer.
- `println_i64(n: i64)`: Print `i64` with a newline.
- `print_str(s: *u8)`: Alias for `printf("%s", s)`.
- `println_str(s: *u8)`: Print string with newline.
- `print_char(c: u8)`: Print a single character.
- `println()`: Print a newline.

### `string.x`
String manipulation functions.

- `strlen(str: *u8) ret u64`: Get string length.
- `strcpy(dest: *u8, src: *u8)`: Copy string.
- `strcat(dest: *u8, src: *u8)`: Concatenate strings.
- `strcmp(s1: *u8, s2: *u8) ret i32`: Compare strings.
- `streq(s1: *u8, s2: *u8) ret u8`: Check if strings are equal (returns 1 if true).
- `is_digit(c: u8) ret u8`: Check if char is a digit.
- `is_alpha(c: u8) ret u8`: Check if char is a letter.
- `to_upper(str: *u8)`: Convert string to uppercase in-place.
- `to_lower(str: *u8)`: Convert string to lowercase in-place.
- `atoi(str: *u8) ret i64`: Convert string to integer.

### `math.x`
Mathematical functions.

- `min_u64(a: u64, b: u64) ret u64`: Returns the smaller of two numbers.
- `max_u64(a: u64, b: u64) ret u64`: Returns the larger of two numbers.
- `clamp_u64(val: u64, min: u64, max: u64) ret u64`: Clamps a value between a minimum and maximum.
- `pow_u64(base: u64, exp: u64) ret u64`: Calculates base raised to the power of exp.
- `abs_i64(n: i64) ret i64`: Returns the absolute value of a signed integer.
- `gcd(a: u64, b: u64) ret u64`: Calculates the greatest common divisor.
- `lcm(a: u64, b: u64) ret u64`: Calculates the least common multiple.

### `array.x`
Array utilities.

- `array_fill_u64(arr: *u64, len: u64, val: u64)`: Fills an array with a specific value.
- `array_copy_u64(dest: *u64, src: *u64, len: u64)`: Copies elements from source to destination array.
- `array_reverse_u64(arr: *u64, len: u64)`: Reverses an array in-place.
- `array_find_u64(arr: *u64, len: u64, val: u64) ret i64`: Finds the index of a value in an array (returns -1 if not found).
- `array_sum_u64(arr: *u64, len: u64) ret u64`: Calculates the sum of all elements in an array.

## Interfacing with C

You can import functions from the C standard library (libc) or other object files.

```bpl
import printf, scanf from "libc";
import malloc, free from "libc";

frame main() ret u8 {
    call printf("Number: %d\n", 42);
    
    local ptr: *u8 = call malloc(100);
    call free(ptr);
    return 0;
}
```
