# Compiler data layout

Runtime `sizeof`, reflected struct/array sizes, and reflected enum sizes use LLVM
`getelementptr` constant expressions. Compiler-side enum storage calculations and
DWARF sizes/offsets use the lowered LLVM representation and the selected target's
data layout. Aliases and generic arguments are resolved before these calculations.

Array alignment is its element alignment, independent of element count. Structs
and tuples align each field and include tail padding. Structs with virtual methods
also include the hidden vtable pointer. Pointer widths and scalar ABI alignment
follow the target; for example, wasm32 pointers occupy four bytes, while its long
and double fields still require eight-byte alignment.

An enum stores an i32 tag and, when needed, a payload array aligned for its largest
variant alignment. Each variant's fields use natural offsets, with storage large
enough for the largest variant including padding. A unit-only enum stores just
the tag. This layout is a compiler implementation detail, not a stable C union ABI.
The September 2026 correction changes some enum sizes and offsets: rebuild object
files and native code that exchanges enum values together.

`tests/LLVMTypeLayout.test.ts` compares the shared layout calculator with Clang C
sizes, alignments, and offsets for every target family accepted by code generation.
These are cross-target compilation checks; they do not execute programs on those
operating systems. Native aggregate regressions additionally compile, verify LLVM,
and execute at O0 and O3. DWARF tests cover padding, vtables, arrays, and 32-bit
pointer descriptions.
