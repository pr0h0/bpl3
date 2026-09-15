# BPL compared with C, Rust, Go, and Zig

Audit date: 2026-09-15. Implementation baseline: `d78c1f6a`.

## Assessment

BPL is a substantial experimental systems language with broad implemented syntax
and useful tooling. Its feature breadth is ahead of its semantic, runtime, and
platform guarantees. It is suitable for controlled projects whose maintainers can
debug compiler/runtime issues. This audit does not establish production readiness
for critical services, arbitrary C libraries, or concurrent applications.

The largest gap is dependable behavior across feature combinations. More syntax
would not fix the newly reproduced allocator and C ABI failures. A focused,
predictable language can be competitive without matching every feature of Rust,
Go, or Zig.

These are engineering judgments, not measured maturity scores or adoption
statistics. The README calls BPL beta; that label is not a compatibility promise.

## Scope and evidence

Reviewed the language specification, grammar, selected typechecking and LLVM
lowering paths, runtime state, allocators and library interfaces, package tooling,
editor documentation, CI workflows, benchmark infrastructure, and existing tests.
The repository contains 64 `.bpl` library modules, including declared stubs.

Fresh probes used the rebuilt BPL CLI and Clang 21 on Linux x86-64 at O0/O3.
The allocator probes did not write through the incorrectly returned allocations.
The C ABI probe linked a separately compiled C object. Both sides' LLVM signatures
were inspected. A large decimal-literal precision probe passed; no defect is
claimed for that case.

Fresh lint and TypeScript checks passed. The focused run of Markdown,
stdlib-reference, language-specification, existing FFI, signed-overflow, and
expression-guard tests passed 110 tests across six files. The new failing
behaviors are additional audit probes, not cases those passing tests cover.

The immediately preceding implementation batch passed 3,536 unit tests, 572
integration/playground tests, and 236 extension tests in the CI-safe runner, with
16 opt-in Docker skips. Those are prior results for this implementation baseline,
not a new full-suite run for this audit. See the
[preceding validation report](2026-09-15-paths-and-defer.md).

Official external sources were consulted on the audit date. C is compared as a
standardized language plus established toolchains; it is not one compiler or
package manager. Zig's versioned reference used here is 0.16.0, linked from its
[download page](https://ziglang.org/download/). Rust and Go references are their
current official references. No cross-language performance benchmark was run.

## Implemented BPL strengths

- Static typing, fixed-width integers, generics with monomorphization and
  constraints, overloads, specs, structs, and inheritance.
- Tagged enums, pattern matching, tuples, slices, closures, operator overloading,
  reflection, and intrinsics.
- Exceptions, block-scoped defer, and opt-in `auto_destroy` cleanup. These do not
  constitute general ownership or lifetime checking.
- LLVM code generation, optimization through the native toolchain, debug-info
  support, inline assembly, and native/Wasm compilation paths.
- A CLI with checking, formatting, diagnostics, package archives/locks/cache
  operations, incremental compilation support, and release helpers.
- A VS Code language server, extensive example programs, generated stdlib
  declarations, documentation compilation, fuzzing and regression infrastructure.

Relevant evidence: [specification](../../LANGUAGE_SPEC.md),
[compiler options](../39-compiler-options.md),
[packages](../25-package-management.md), [editor](../49-vscode-extension.md),
[documentation validation](../documentation-validation.md), and
[CI configuration](../../.github/workflows/compiler-correctness.yml).

## Comparison by dimension

| Dimension | BPL today | C | Rust | Go | Zig |
| --- | --- | --- | --- | --- | --- |
| Generic abstraction | Generics, specs, overloads, tagged enums | Macros and generic selection; no comparable parametric generic type system | Generics, traits, lifetimes, tagged enums | Generics and interfaces | Compile-time parameters and type construction |
| Memory model for users | Raw pointers and manual ownership; selected runtime checks and opt-in cleanup | Manual lifetime management | Ownership/borrowing checked in safe code | Garbage collection | Manual ownership, explicit allocators, safety checks |
| Error handling | Throw/catch, defer, library Result/Option | Return values and library conventions | Result/Option and panic | Error values and panic/recover | Error unions/sets, optionals, defer/errdefer |
| Concurrency | Thread/Sync stubs; shared runtime state | Atomics/threads, with implementation/platform qualifications | Threads and synchronization integrated with the type system | Goroutines, channels, synchronization, memory model | Atomics and runtime/library concurrency facilities |
| C interoperation | Scalars/pointers work in tested cases; aggregate-by-value defect confirmed | Native ecosystem ABI | Explicit foreign ABI interfaces | cgo | C import/toolchain integration |
| Tooling | Broad local CLI and LSP; archive/cache package resolution | Mature, diverse compiler/build/debug tools | Cargo and coordinated compiler/docs/tooling releases | Integrated build/test/module/diagnostic tools | Integrated compiler/build/test/cross-target tools |
| Specification/stability | Partial contract; no comparable demonstrated compatibility regime | ISO standard and defect process | Detailed versioned reference and editions | Detailed specification, memory model, Go 1 compatibility policy | Detailed versioned reference; pre-1.0 evolution |

This table describes design and available facilities, not equivalent depth of
implementation. Bounds checks do not prevent dangling pointers or double frees.
C and Zig do not provide Rust-style ownership guarantees; Rust's unsafe semantics
also have explicitly acknowledged areas without a complete formal model.
[Rust undefined behavior reference](https://doc.rust-lang.org/reference/behavior-considered-undefined.html).

C's current published standard is C23, adopted in 2024. Its important advantages
are a defined standard and established implementation contracts, rather than a
larger list of language constructs. Clang documents optimization, target, debug,
and code-generation facilities; these are compiler features, not promises made
by the C standard. [WG14](https://open-std.org/jtc1/sc22/wg14/),
[Clang manual](https://clang.llvm.org/docs/UsersManual.html).

Rust's ownership system addresses a class of bugs BPL leaves to the programmer.
Traits and lifetimes provide deeper static contracts than having generic syntax
alone. Cargo manages dependencies and builds; editions let programs opt into
language changes. Its reference separates language behavior from compiler and
library documentation. [Ownership](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html),
[generics and lifetimes](https://doc.rust-lang.org/book/ch10-00-generics.html),
[Cargo](https://doc.rust-lang.org/cargo/),
[editions](https://doc.rust-lang.org/edition-guide/editions/),
[reference organization](https://doc.rust-lang.org/reference/).

Go offers a coherent application-development baseline: garbage collection,
concurrency, modules, diagnostics, and a compatibility policy. Its ordinary error
handling uses values; panic/recover should not be presented as BPL-style typed
throw/catch. BPL has constructs Go deliberately omits, but that does not establish
an advantage for building services. [Specification](https://go.dev/ref/spec),
[error conventions](https://go.dev/doc/effective_go#errors),
[memory model](https://go.dev/ref/mem),
[compatibility](https://go.dev/doc/go1compat),
[diagnostics](https://go.dev/doc/diagnostics).

Zig is a useful comparison for a manual-memory systems language. Explicit
allocator parameters, compile-time execution, optional pointers, error handling,
test facilities, and build modes make low-level obligations more visible.
Its integrated cross-compilation support is substantially broader than accepting
a target triple and requiring users to supply the remaining toolchain.
Its pre-1.0 status should not be confused with Rust/Go-style stability.
[Zig overview](https://ziglang.org/learn/overview/),
[versioned language reference](https://ziglang.org/documentation/0.16.0/).

## Newly confirmed findings

All four entries are recorded as open in [BUGS.md](../../BUGS.md). This audit
records findings and recommendations; it does not change compiler/library behavior.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| BUG-323, P1: C aggregate argument ABI | C `sum_pair({7,11})` called from BPL returns 7 instead of 18, at O0/O3 | Matching struct field layout is insufficient for C interoperation |
| BUG-320, P1: allocator size overflow | Arena/Stack `alloc(UINT64_MAX)` returns the same non-null pointer as the next `alloc(8)` | A successful allocation can represent much less storage than requested and overlap subsequent allocations |
| BUG-321, P2: page alignment contract | `PageAllocator.alloc(16)` has address modulo 4096 equal to 8 | Callers cannot rely on documented page alignment |
| BUG-322, P2: specification/docs contradictions | POD layout, shift rules, and unsupported comparison ratings | Readers cannot consistently distinguish guarantees from examples or aspirations |

For BUG-323, Clang emits `sum_pair(i64)` while BPL emits
`sum_pair(%struct.Pair)` for the two-i32 struct. This is a calling-convention
classification problem, not an LLVM verifier failure. The next step is
target-specific argument/result lowering with actual C fixtures. Unsupported
aggregate signatures should receive a diagnostic until implemented. Pointer-based
C wrappers are the immediate workaround.

For BUG-320, eight-byte rounding wraps the request to zero. The allocator family
also contains unchecked header/page arithmetic and fixed Linux mmap constants.
Those additional paths need dedicated tests; the reproduced claim is specifically
the arena/stack request above. Huge requests should fail without mutating state.

## Language specification gaps

The [current specification](../../LANGUAGE_SPEC.md) is a useful syntax overview
with a developing semantic core. It is not yet a sufficiently complete normative
contract for an independent implementation. Its ABI section describes LLVM
representations but does not fully specify external calling conventions.

Examples of drift:

- It says all structs inherit Type, while method-free POD structs avoid that
  hidden layout. The probe `struct Plain { x: int, }` has size 4 on this host.
- The [operator guide](../06-operators.md) describes invalid shift counts as
  undefined, while constant counts are diagnosed and dynamic counts are masked.
- [The specification guide](../44-language-spec.md) calls the document formal.
- The README comparison uses performance/compilation-speed symbols without a
  supporting comparison methodology and groups Go panic/recover with exceptions.

Prioritize explicit rules for evaluation order, integer overflow and conversion,
initialization, value copying versus ownership transfer, temporary/slice/capture
lifetimes, destructor/exception interactions, aliasing, pointer validity, and
undefined versus diagnosed behavior. Add rules for generic constraints and
overload resolution, match coverage, module initialization, and ABI boundaries.
Thread semantics must be defined before threading is advertised as supported.

Give normative rules stable identifiers and connect each to positive, negative,
and execution tests. Existing `LanguageSpecDocs.test.ts` checks selected text,
not semantic conformance. Extend executable documentation discovery to the root
specification with explicitly classified fragments and rejected examples.

## Compiler and runtime priorities

1. **Establish the supported C ABI boundary.** Cover scalar extensions, aggregate
   arguments/returns, callbacks, and variadics using separately compiled C/BPL
   fixtures. Test both directions on each supported platform. LLVM verification
   cannot establish that a foreign declaration matches the actual ABI.
2. **Define ownership before adding implicit cleanup.** Specify copying,
   borrowing, transfer, and closure disposal. `auto_destroy` handles selected
   exits; it does not stop two shallow copies from referring to one allocation.
   General capturing lambdas allocate contexts; their lifecycle needs an explicit
   design beyond the recently fixed compiler-generated defer callbacks.
3. **Make safety behavior systematic.** Centralize checked size arithmetic and
   allocation-failure handling. Add lifetime/escape diagnostics for tractable
   cases and expose sanitizer/testing workflows to BPL application authors.
4. **Develop a typed lowering representation incrementally.** Existing conversion
   classification is a start. Move ABI calls, temporaries, cleanup, and control-flow
   decisions out of ad hoc LLVM string construction. This should be staged around
   proven failures, not a wholesale rewrite justified only by file size.
5. **Publish platform support tiers.** Separate IR generation, successful linking,
   native execution, and supported library modules. CI configures Linux/macOS
   native checks and Windows compiler-component tests. A target triple alone is
   not runtime support. [Current cross-compilation scope](../37-cross-compilation.md).
6. **Treat concurrency as runtime work.** Thread/Sync methods currently throw 999.
   Generated exception/defer state is global, and native stack-trace arrays are
   shared. A pthread wrapper would not make that runtime safe for concurrent BPL
   execution. Address per-thread state, synchronization/atomics, error propagation,
   and race testing before exposing threads.

## Standard library and developer experience

The recent path, filesystem, binary, and time work improves real functionality.
The next priority should be consistent guarantees across collections, strings,
allocators, and error paths. Core containers still allocate directly with malloc;
the existing Allocator spec is not a library-wide allocation policy.

Recommended library sequence:

1. Checked allocator arithmetic, alignment, failure atomicity, and platform wrappers.
2. Explicit owned/borrowed contracts and allocator-aware container variants.
3. Reader/Writer abstractions, buffered I/O, and consistent typed formatting.
4. A coherent iterator API; distinguish the `Iter` stub from implemented
   container iterators and collection methods.
5. Socket primitives with timeouts and portable error handling, followed by higher
   level protocols where justified. Use established TLS/crypto libraries through
   a verified FFI rather than creating cryptographic implementations to fill a list.
6. Threading only after the runtime prerequisites above.

The package manager already has archives, selectors, lockfiles, cache verification,
and repair operations. The missing ecosystem is not solved by recreating those.
Next steps are a compiler-version requirement, reproducible release artifacts,
compatibility tests, package discovery/distribution, and a small set of maintained
real applications. Add a first-class BPL project test workflow comparable in
convenience to the existing check/build/run commands.

Documentation breadth is a strength. Depth and navigation need attention: one
authoritative reference, a separate tutorial, per-module contracts with ownership,
errors and platform support, versioned pages, and a clear distinction between
implemented, experimental, stub, and historical material. The generated reference
currently guarantees declarations, not behavior. Do not equate a compiled example
with validated output, leak freedom, or a specification rule.

## Ordered milestones

| Milestone | Deliverable | Acceptance evidence |
| --- | --- | --- |
| 1: dependable core | Fix BUG-320/321/323 and reconcile BUG-322 | Boundary and fault-injection tests; C ABI fixtures; corrected executable docs; lint/typecheck/CI |
| 2: specified v0.x contract | Normative semantic rules, ownership policy, platform tiers, compatibility policy | Rule-to-test matrix; migration notes; old-program compatibility corpus |
| 3: usable systems library | Allocator-aware ownership, buffered I/O, iterator completion, checked formatting | Leak/failure tests; real file-processing and data-structure applications |
| 4: wider deployment | Tested targets, reproducible toolchain distribution, package discovery, concurrency foundations | Native target CI; clean-machine install/build tests; race-focused tests |
| 5: measured optimization | Cross-language and compile-time benchmark expansion | Pinned toolchains/hardware, equivalent output and safety settings, cold/warm builds, memory and binary-size results |

No reliable calendar estimate follows from this audit. Full borrow checking,
Go-style concurrency, or Zig-style comptime are separate major design projects.
Self-hosting and removing libc are not prerequisites for a dependable BPL release.
The realistic near-term aim is a trustworthy manual-memory language for a defined
set of targets and workloads, with strong C interoperability and modern abstractions.

## Reproductions

Allocator probe; expected huge allocations to fail and documented page alignment
to hold. Current O0/O3 output is `1 1`, `1 1`, then `8`:

```bpl
import [ArenaAllocator] from "std/memory/arena_allocator.bpl";
import [StackAllocator] from "std/memory/stack_allocator.bpl";
import [PageAllocator] from "std/memory/page_allocator.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
    local max: ulong = cast<ulong>(0xffffffffffffffff);
    local arena: ArenaAllocator;
    arena.init(4096);
    local huge: *void = arena.alloc(max);
    local small: *void = arena.alloc(8);
    printf("%d %d\n", huge != nullptr, huge == small);
    arena.destroy();
    local stack: StackAllocator;
    stack.init(4096);
    local shuge: *void = stack.alloc(max);
    local ssmall: *void = stack.alloc(8);
    printf("%d %d\n", shuge != nullptr, shuge == ssmall);
    stack.destroy();
    local page: PageAllocator;
    local ptr: *void = page.alloc(16);
    printf("%lu\n", cast<ulong>(ptr) % cast<ulong>(4096));
    page.free(ptr);
    return 0;
}
```

C ABI probe, saved as `ffi.c`:

```c
struct Pair { int x; int y; };
int sum_pair(struct Pair p) { return p.x + p.y; }
```

Corresponding `ffi.bpl`:

```bpl
struct Pair { x: int, y: int, }
extern sum_pair(p: Pair) ret int;
extern printf(fmt: string, ...);
frame main() ret int {
    local p: Pair = Pair { x: 7, y: 11 };
    printf("sum=%d\n", sum_pair(p));
    return 0;
}
```

```sh
clang -c ffi.c -o ffi.o
bpl build ffi.bpl -O 0 --object ffi.o -o ffi-0
./ffi-0
bpl build ffi.bpl -O 3 --object ffi.o -o ffi-3
./ffi-3
```

Both executables print `sum=7`; the intended C result is `sum=18`.
