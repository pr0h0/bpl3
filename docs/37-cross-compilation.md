# Cross-Compilation

`--target` selects a target triple for code generation and Clang. It does not
supply a foreign platform's linker, headers, system libraries, or BPL runtime.
The target must also be supported by the installed toolchain and by the BPL
features and library modules your program uses.

## Inspect target-specific IR

```bash
bpl build main.bpl --target aarch64-unknown-linux-gnu --emit llvm -o main.ll
```

Emitting IR is useful for inspection; it is not evidence that a foreign-target
executable will link or run. Instructions such as x86 inline assembly and
library assumptions such as Linux directory layouts are target-specific.

## Link an executable

With an appropriate cross-toolchain and sysroot already installed:

```bash
bpl build main.bpl --target aarch64-unknown-linux-gnu --sysroot /opt/sysroots/aarch64
```

`/opt/sysroots/aarch64` is an example path, not a directory provided by BPL.
Additional Clang flags can be passed through `--clang-flag`. Runtime support
objects must match the target; host-built runtime archives cannot be used as
foreign-target archives. Run the result on the target system or in a suitable
emulator; `bpl run` does not configure emulation.

## Tested scope

The [configured CI workflow](../.github/workflows/compiler-correctness.yml)
exercises native correctness on Linux and macOS. Its Windows job tests compiler
components rather than native execution. Target triples such as
`x86_64-pc-windows-gnu` are toolchain inputs, not promises of complete standard
library or runtime support on that platform.

The runtime build script currently builds on Linux and macOS. The macOS script
builds a universal x86-64/arm64 runtime object. Cross-compilation to other targets
may require additional runtime work, beyond choosing a triple and sysroot.

## WebAssembly

WebAssembly uses a separate linking/runtime contract. See
[WebAssembly output](39-compiler-options.md#webassembly-output) for standalone
and hosted modes, host imports, linker selection, supported features, and
limitations. A native executable and a hosted Wasm module do not have the same
I/O or process environment.
