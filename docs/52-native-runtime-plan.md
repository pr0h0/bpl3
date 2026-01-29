# Plan: Native Runtime & Platform Independence

> **Status Update (January 2026)**: Phase 0 (Enhanced Error Handling) has been completed.
> See [docs/66-runtime-library.md](66-runtime-library.md) for the current runtime documentation.

## Current Implementation

Before pursuing full `libc` independence, we've implemented a robust runtime error handling system:

- **`lib/runtime.ll`**: Core LLVM IR runtime for exception handling, defer, try/catch
- **`lib/runtime_support.c`**: C support library for signal handlers, stack traces, formatted errors
- **`lib/build_runtime.sh`**: Build script for the C support library

This hybrid approach provides excellent error diagnostics while maintaining compatibility with existing code.

---

## 1. Executive Summary

The goal is to remove the dependency on `libc` (C Standard Library) and implement a native BPL runtime. This will allow BPL to run directly on the Linux kernel (and eventually other OSs) via system calls. The architecture will be modular to support dynamic addition of new platforms (OS) and architectures (CPU).

## 2. Current Dependencies Analysis

Based on a scan of `lib/` and `examples/`, the following C functions are currently used and must be replaced:

| Category    | Functions                              | Replacement Strategy                                    |
| :---------- | :------------------------------------- | :------------------------------------------------------ |
| **Memory**  | `malloc`, `free`                       | Implement `mmap`-based allocator in BPL.                |
| **I/O**     | `printf`, `fprintf`                    | Implement type-safe `fmt` module using `write` syscall. |
| **String**  | `strlen`, `strcpy`, `strcmp`, `strcat` | Implement in pure BPL (or optimized ASM).               |
| **Raw Mem** | `memcpy`, `memset`, `memcmp`           | Implement in pure BPL (or optimized ASM).               |
| **Process** | `exit`, `__bpl_argc`, `__bpl_argv_get` | Implement `_start` entry point in ASM.                  |

## 3. Proposed Directory Structure

To support platform and architecture independence, we will restructure `lib/` to separate generic code from system-specific code.

```text
lib/
├── core/                  # Platform-agnostic implementations
│   ├── memory.bpl         # malloc/free logic (calls sys.mmap)
│   ├── io.bpl             # Generic Reader/Writer interfaces
│   ├── string.bpl         # strlen, memcpy, etc.
│   └── start.bpl          # Generic runtime initialization
├── sys/                   # System Interface Layer
│   ├── linux/
│   │   ├── x86_64/
│   │   │   ├── syscalls.s      # ASM wrappers (syscall0..6)
│   │   │   ├── constants.bpl   # SYS_WRITE=1, SYS_EXIT=60
│   │   │   └── types.bpl       # Struct layouts (stat, etc.)
│   │   └── arm64/              # Future support
│   │       └── ...
│   └── macos/                  # Future support
│       └── ...
└── std.bpl                # Re-exports core modules
```

## 4. Implementation Steps

### Phase 1: The Syscall Interface

We need a unified way to invoke kernel functions.

1.  **Create `lib/sys/linux/x86_64/syscalls.s`**:
    - Define `syscall0` through `syscall6` following the Linux x86_64 calling convention (`rax`=sys, args=`rdi`,`rsi`,`rdx`,`r10`,`r8`,`r9`).
    - Define `_start` entry point.
2.  **Create `lib/sys/linux/x86_64/constants.bpl`**:
    - Export constants for syscall numbers (e.g., `const SYS_WRITE: i64 = 1;`).

### Phase 2: The Entry Point (`_start`)

The `_start` symbol is the true entry point of the program, not `main`.

1.  **Assembly Bootstrap**:
    - `_start` pops `argc` and `argv` from the stack.
    - Calls a BPL function `runtime_init(argc, argv)`.
    - Calls the user's `main()`.
    - Calls `sys_exit` with the return value.
2.  **Runtime Init**:
    - Store `argc` and `argv` in global variables accessible via `std::args`.

### Phase 3: Memory Management

Replace `malloc` with a native allocator.

1.  **`lib/core/memory.bpl`**:
    - Implement a simple "Bump Allocator" or "Free List" allocator backed by `mmap` (Syscall 9).
    - Export `malloc(size)` and `free(ptr)`.
    - Implement `memcpy` and `memset` loops in BPL.

### Phase 4: I/O & Formatting

Replace `printf`.

1.  **`lib/core/io.bpl`**:
    - Implement `print_str(s: string)` using `SYS_WRITE` (Syscall 1) to file descriptor 1 (stdout).
2.  **`lib/core/fmt.bpl`**:
    - Implement a formatter that converts integers/floats to string buffers.
    - Re-implement `printf` logic: parse format string -> call specific formatters -> buffer output -> flush to stdout.

### Phase 5: Compiler & Build System Updates

The compiler currently injects C declarations. This must stop.

1.  **Modify `compiler/backend/CodeGenerator.ts`**:
    - Remove `this.emitDeclaration("declare ... @malloc ...")`.
    - Remove automatic injection of `printf`.
2.  **Update Build Script (`cmp.sh` / `bpl-wrapper.sh`)**:
    - **Detect Host**: Add logic to detect OS (`uname -s`) and Arch (`uname -m`).
    - **Select Files**: Based on host, include `lib/sys/linux/x86_64/*.s` and `*.bpl`.
    - **Linker Flags**: Add `-nostdlib` to prevent linking `libc`.
    - **Assemble**: Run `as` on the selected assembly files before linking.

## 5. Extensibility Guide

### Adding a New Architecture (e.g., ARM64)

1.  Create `lib/sys/linux/arm64/`.
2.  Implement `syscalls.s` using ARM64 calling conventions (`x0`..`x7` registers, `svc` instruction).
3.  Create `constants.bpl` with ARM64-specific syscall numbers.
4.  Update build script to select this folder when `uname -m` returns `aarch64`.

### Adding a New OS (e.g., macOS)

1.  Create `lib/sys/macos/x86_64/`.
2.  Implement `syscalls.s` (macOS syscalls often have a class offset).
3.  Create `constants.bpl` (macOS syscall numbers differ significantly from Linux).
4.  Update build script to handle `Darwin`.

## 6. Migration Checklist

- [ ] Create `lib/sys` directory structure.
- [ ] Write `syscalls.s` for Linux x86_64.
- [ ] Write `constants.bpl` for Linux x86_64.
- [ ] Implement `memory.bpl` (malloc/free).
- [ ] Implement `string.bpl` (memcpy/strlen).
- [ ] Implement `io.bpl` (print/write).
- [ ] Update `CodeGenerator.ts` to remove injected externs.
- [ ] Update `cmp.sh` to assemble and link native objects.
- [ ] Verify `hello-world` example runs without `libc`.
