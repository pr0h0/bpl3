# Native runtime behavior and footprint

Measured 2026-09-16 on Linux x86-64 with Bun 1.4.2 and Clang 21.1.8,
using the source compiler and the default release runtime object. These are
small executable-size probes, not throughput, startup-time, or peak-memory
benchmarks. The default runtime build uses `-O2 -g`.

## Measured O3 executables

All byte counts below are bytes, not rounded kilobytes. The stripped column
uses the system `strip` command. ELF `text` includes code and read-only data;
file sizes also reflect ELF headers, debug information, symbols, and alignment.

| Program | Unstripped file | Stripped file | ELF text | Initialized data | BSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| BPL, return zero | 15,656 | 14,312 | 1,177 | 536 | 8 |
| C, return zero | 15,696 | 14,352 | 1,183 | 520 | 8 |
| BPL, hello world | 15,856 | 14,464 | 1,268 | 592 | 8 |
| C, hello world | 15,896 | 14,504 | 1,278 | 576 | 8 |
| BPL, one local integer | 49,072 | 14,616 | 6,254 | 720 | 72 |
| BPL, checked division | 49,224 | 14,616 | 7,066 | 720 | 72 |
| BPL, caught integer throw and defer | 49,192 | 14,624 | 7,343 | 728 | 72 |

The empty and hello-world BPL executables contain no `__bpl_`, `defer_top`,
or `exception_top` symbols. Their IR does not require the native runtime object.
The other probes retain stack checks and runtime support. The local-only main
still gets a stack check: the current main-function exemption is conservative.

The small difference between stripped file sizes does **not** mean checks cost
only that many bytes: the ELF text column shows several kilobytes of additional
code/read-only data, while segment alignment can hide this in the file-size
difference. Runtime debug information also accounts for much of the unstripped
file-size increase. Sizes vary with platform, toolchain, options, and program.

## What is removed, and what remains

- Native runtime linking is conditional on generated IR references.
- Linux compilation uses function/data sections and linker section collection
  (`--gc-sections`). Unused library functions are not all copied into every app.
- Linking the runtime retains its signal-handler constructor and the diagnostic
  routines reachable from it. That is a remaining footprint cost even for
  programs using only a small part of the runtime.
- The native Linux linker flags currently retain `libm.so.6` as a dynamic
  dependency even for hello world. The comparable C build only needs libc.
  These measurements therefore do not establish minimal startup dependencies.
- Functions with try/catch conservatively use volatile loads/stores to preserve
  local changes across `setjmp`/`longjmp`. This has an optimization cost.
- Runtime stack-trace arrays allocate lazily when frame metadata is first pushed;
  they are not eagerly allocated just because the object is linked. Their
  configured capacity is 10,000 frames: 200,000 bytes on this host for the name,
  file, and line arrays, excluding allocator overhead.

## Reproduction

Build with `bun index.ts build program.bpl -O3 -o program`. Inspect with
`nm program`, `size program`, and `readelf -d program`. Copy the executable and
run `strip` on the copy for the stripped measurement. The C comparison used
`clang -O3 -ffunction-sections -fdata-sections -Wl,--gc-sections
-Wl,--no-export-dynamic program.c -o program`.

The BPL probes were:

```bpl
# Empty
frame main() ret int { return 0; }
```

```bpl
# Hello world
import printf from "std/c.bpl";
frame main() ret int { printf("hello\n"); return 0; }
```

```bpl
# Local integer
frame main() ret int { local value:int=42; return value-42; }
```

```bpl
# Checked division; run without additional arguments
frame divide(value:int, divisor:int) ret int { return value / divisor; }
frame main(argc:int, _argv:**char) ret int { return divide(42,argc)-42; }
```

```bpl
# Caught throw and defer; the defer captures count by value
frame fail() { throw 7; }
frame main() ret int {
    local count:int=0;
    try { defer { count=1; } fail(); }
    catch(value:int) { if(value!=7)return 1; count=count+1; }
    return count-1;
}
```

The C probes were `int main(void) {return 0;}` and the same main calling
`printf("hello\n")` before returning zero, with `<stdio.h>` included.

Every BPL probe executed successfully at O0 and O3. A separate 14-test run
covered explicit bool conversions, null checks, checked runtime failures,
exception-local preservation, repeated unwinding, loop stack storage, and
zero-cost LLVM shapes. The size probe exposed BUG-349 (renamed main parameters),
which was fixed and covered by O0/O3 execution with LLVM verification.
