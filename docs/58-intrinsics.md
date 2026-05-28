# Compiler Intrinsics

BPL provides a set of compiler intrinsics that map directly to low-level LLVM instructions. These intrinsics allow you to perform hardware-optimized operations, provide hints to the optimizer, and interact with the CPU at a lower level than standard language constructs allow.

## Table of Contents

- [Math Intrinsics](#math-intrinsics)
- [Bit Manipulation](#bit-manipulation)
- [Memory Intrinsics](#memory-intrinsics)
- [Stack and Frame Intrinsics](#stack-and-frame-intrinsics)
- [Branch Prediction Hints](#branch-prediction-hints)
- [Memory Prefetching](#memory-prefetching)
- [Debugging Traps](#debugging-traps)

## Math Intrinsics

BPL provides direct access to LLVM's floating-point intrinsics for high-performance mathematical operations. These are available in `std/intrinsics.bpl` and are used by the `Math` struct in `std/math.bpl`.

### Available Functions

These functions operate on `float` (f64) values.

| Function         | Description                     | LLVM Intrinsic       |
| ---------------- | ------------------------------- | -------------------- |
| `sqrt(x)`        | Square root                     | `@llvm.sqrt.f64`     |
| `sin(x)`         | Sine                            | `@llvm.sin.f64`      |
| `cos(x)`         | Cosine                          | `@llvm.cos.f64`      |
| `pow(x, y)`      | Power ($x^y$)                   | `@llvm.pow.f64`      |
| `exp(x)`         | Exponential ($e^x$)             | `@llvm.exp.f64`      |
| `log(x)`         | Natural logarithm               | `@llvm.log.f64`      |
| `floor(x)`       | Floor                           | `@llvm.floor.f64`    |
| `ceil(x)`        | Ceiling                         | `@llvm.ceil.f64`     |
| `round(x)`       | Round to nearest integer        | `@llvm.round.f64`    |
| `fabs(x)`        | Absolute value                  | `@llvm.fabs.f64`     |
| `minnum(x, y)`   | Minimum value (ignoring NaN)    | `@llvm.minnum.f64`   |
| `maxnum(x, y)`   | Maximum value (ignoring NaN)    | `@llvm.maxnum.f64`   |
| `copysign(x, y)` | Copy sign from y to x           | `@llvm.copysign.f64` |
| `fma(a, b, c)`   | Fused Multiply-Add (a \* b + c) | `@llvm.fma.f64`      |

### Example

```bpl
import [Math] from "std/math.bpl";

frame calculate(x: float) ret float {
    return Math.sqrtFloat(x * x + 10.0);
}
```

## Bit Manipulation

BPL's primitive integer types (`int`, `long`, `uint`, `ulong`) expose built-in methods for efficient bit-level operations. These compile directly to hardware instructions (like `POPCNT`, `LZCNT`, `BSWAP` on x86), offering significant performance improvements over manual implementations.

### Available Methods

These methods are available on `int`, `long`, `uint`, and `ulong` types.

| Method            | Description                                                                  | LLVM Intrinsic    |
| ----------------- | ---------------------------------------------------------------------------- | ----------------- |
| `popCount()`      | Counts the number of set bits (1s) in the value (Hamming weight).            | `llvm.ctpop`      |
| `leadingZeros()`  | Counts the number of leading zeros starting from the most significant bit.   | `llvm.ctlz`       |
| `trailingZeros()` | Counts the number of trailing zeros starting from the least significant bit. | `llvm.cttz`       |
| `byteSwap()`      | Reverses the byte order of the value (useful for endianness conversion).     | `llvm.bswap`      |
| `reverseBits()`   | Reverses the bits of the value.                                              | `llvm.bitreverse` |

### Examples

```bpl
frame main() {
    local x: int = 0b10110; # 22

    # Population Count
    local bits: int = x.popCount();
    # Result: 3 (10110 has three 1s)

    # Leading Zeros (for 32-bit int)
    local lz: int = x.leadingZeros();
    # Result: 27 (32 total bits - 5 used bits)

    # Byte Swap (Endianness)
    local val: uint = 0x12345678;
    local swapped: uint = val.byteSwap();
    # Result: 0x78563412
}
```

## Memory Intrinsics

BPL exposes optimized memory operations that map to `llvm.memcpy`, `llvm.memmove`, and `llvm.memset`. These are often optimized by the backend into efficient SIMD instructions or library calls.

### Available Functions

Import these from `std/intrinsics.bpl`.

| Function  | Signature                                              | Description                                                                    |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `memcpy`  | `(dest: *void, src: *void, len: long, volatile: bool)` | Copy memory from source to destination. Undefined behavior if regions overlap. |
| `memmove` | `(dest: *void, src: *void, len: long, volatile: bool)` | Move memory from source to destination. Handles overlapping regions correctly. |
| `memset`  | `(dest: *void, val: u8, len: long, volatile: bool)`    | Set `len` bytes of memory at `dest` to `val`.                                  |

### Example

```bpl
import memcpy, memset from "std/intrinsics.bpl";
extern malloc(size: long) ret *void;

frame main() {
    local buf: *void = malloc(1024);

    # Zero out memory
    memset(buf, cast<u8>(0), 1024, false);

    # Copy data
    local src: *void = malloc(1024);
    memcpy(buf, src, 1024, false);
}
```

## Stack and Frame Intrinsics

These intrinsics provide low-level access to the call stack and frame pointers. They are useful for implementing debuggers, garbage collectors, or custom stack management.

| Function        | Signature                | Description                                                              | LLVM Intrinsic        |
| --------------- | ------------------------ | ------------------------------------------------------------------------ | --------------------- |
| `frameaddress`  | `(level: int) ret *void` | Returns the frame pointer of the current function (level 0) or callers.  | `@llvm.frameaddress`  |
| `returnaddress` | `(level: int) ret *void` | Returns the return address of the current function (level 0) or callers. | `@llvm.returnaddress` |
| `stacksave`     | `() ret *void`           | Returns the current stack pointer.                                       | `@llvm.stacksave`     |
| `stackrestore`  | `(ptr: *void) ret void`  | Restores the stack pointer to a saved value.                             | `@llvm.stackrestore`  |

## Branch Prediction Hints

You can provide hints to the compiler's branch predictor about which path of a conditional is more likely to be taken. This allows the compiler to optimize the instruction layout for the "hot" path, reducing pipeline stalls and improving cache locality.

To use these, import them from `std/intrinsics.bpl`.

### Syntax

```bpl
import likely, unlikely from "std/intrinsics.bpl";
```

### Examples

```bpl
frame process_data(ptr: *int) {
    # Hint that the pointer is usually NOT null
    if (likely(ptr != nullptr)) {
        # Fast path: Compiler optimizes for this block being executed
        do_work(ptr);
    } else {
        # Cold path: Moved out of the main instruction stream
        handle_error();
    }
}

frame check_status(code: int) {
    # Hint that the error condition is rare
    if (unlikely(code != 0)) {
        log_crash();
    }
}
```

### When to Use

- **Error Handling**: Use `unlikely()` for error checks that almost never happen.
- **Fast Paths**: Use `likely()` for the common case in tight loops.
- **Note**: Misusing these hints (marking a 50/50 branch as likely) can actually degrade performance. Only use them when you are confident about the runtime behavior.

## Memory Prefetching

The `prefetch` intrinsic allows you to hint to the CPU that a specific memory address will be accessed soon. This can trigger the CPU to load the data into the cache before your program actually needs it, hiding memory latency.

### Syntax

```bpl
import prefetch from "std/intrinsics.bpl";
```

- **`ptr`**: The address to prefetch.
- **`rw`**: `0` for read access, `1` for write access.
- **`locality`**: Temporal locality level (0-3).
  - `3`: Extremely local (keep in cache).
  - `2`: Very local.
  - `1`: Low locality.
  - `0`: No locality (data will be used once and discarded, e.g., streaming).

### Example

```bpl
frame sum_array(arr: int[], size: int) ret int {
    local sum: int = 0;
    local i: int = 0;

    loop (i < size) {
        # Prefetch data 16 elements ahead
        # rw=0 (read), locality=3 (keep in cache)
        if (i + 16 < size) {
            prefetch(&arr[i + 16], 0, 3);
        }

        sum = sum + arr[i];
        i = i + 1;
    }
    return sum;
}
```

## Debugging Traps

BPL provides intrinsics to intentionally stop program execution, which is useful for implementing assertions, panic handlers, or debugging breakpoints.

### Syntax

```bpl
import trap, debugtrap from "std/intrinsics.bpl";
```

### `trap()`

- **Behavior**: Aborts execution immediately and abnormally.
- **LLVM**: Emits `llvm.trap` (e.g., `ud2` on x86).
- **Use Case**: Implementing `panic()` or unreachable code paths where the program cannot safely continue.

### `debugtrap()`

- **Behavior**: Causes a breakpoint exception, transferring control to an attached debugger. If no debugger is attached, the behavior is OS-dependent (often ignored or crashes).
- **LLVM**: Emits `llvm.debugtrap` (e.g., `int3` on x86).
- **Use Case**: Hardcoding breakpoints in your code for debugging sessions.

```bpl
frame assert(cond: bool) {
    if (!cond) {
        # Break into debugger if attached
        debugtrap();
        # Then crash
        trap();
    }
}
```
