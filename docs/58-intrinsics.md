# Compiler Intrinsics

BPL provides a set of compiler intrinsics that map directly to low-level LLVM instructions. These intrinsics allow you to perform hardware-optimized operations, provide hints to the optimizer, and interact with the CPU at a lower level than standard language constructs allow.

## Table of Contents

- [Bit Manipulation](#bit-manipulation)
- [Branch Prediction Hints](#branch-prediction-hints)
- [Memory Prefetching](#memory-prefetching)
- [Debugging Traps](#debugging-traps)

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
    local bits = x.popCount();
    # Result: 3 (10110 has three 1s)

    # Leading Zeros (for 32-bit int)
    local lz = x.leadingZeros();
    # Result: 27 (32 total bits - 5 used bits)

    # Byte Swap (Endianness)
    local val: uint = 0x12345678;
    local swapped = val.byteSwap();
    # Result: 0x78563412
}
```

### Benefits

1.  **Performance**: These operations are often single-cycle instructions on modern CPUs.
2.  **Readability**: `x.popCount()` is clearer than the equivalent bit-twiddling algorithm (e.g., `x = x - ((x >> 1) & 0x55555555); ...`).
3.  **Correctness**: Eliminates bugs common in manual bit manipulation logic.

## Branch Prediction Hints

You can provide hints to the compiler's branch predictor about which path of a conditional is more likely to be taken. This allows the compiler to optimize the instruction layout for the "hot" path, reducing pipeline stalls and improving cache locality.

To use these, import them from `std/intrinsics.bpl`.

### Syntax

```bpl
import [likely], [unlikely] from "std/intrinsics.bpl";

extern likely(cond: bool) ret bool;
extern unlikely(cond: bool) ret bool;
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
import [prefetch] from "std/intrinsics.bpl";

extern prefetch(ptr: *void, rw: int, locality: int);
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
import [trap], [debugtrap] from "std/intrinsics.bpl";

extern trap();
extern debugtrap();
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
