# BPL3 implementation status and backlog

Reviewed against source and regression tests on 2026-10-25. This is the canonical
feature-status list; [PLAN.md](PLAN.md) describes priorities rather than repeating
this inventory. Checked items describe implemented behavior, not a guarantee that
all related enhancements or platform support are complete.

## Implemented compiler and language features

- [x] LLVM IR generation, native compilation through Clang, optimization levels,
      target triples, and function attributes.
- [x] Peggy parser with source locations and multiple-error recovery when
      `collectAllErrors` is enabled (`tests/ParserRecovery.test.ts`).
- [x] Declaration hoisting, explicit local types, aliases, type compatibility,
      casts, integer literal range checks, and missing-return analysis.
- [x] Same-scope redeclaration errors, outer-scope shadowing warnings, unused
      variable diagnostics with `_` suppression, and unreachable-code checking.
- [x] Structs, inheritance, methods with explicit `this`, constructors,
      explicit destructors, and implicit initialization through an instance `new`.
      Automatic ownership and destructor insertion are not implemented.
- [x] Generic functions, structs, enums, constraints, monomorphization, and
      generic-aware operator overload resolution. Inference is context-dependent;
      examples should retain explicit local types and generic arguments.
- [x] Specs/interfaces, function overloads, operator overloads, tuples, arrays,
      and pointer operations.
- [x] Imports/exports, namespace imports, module resolution, cached compilation,
      and linking. True frontend generation of independent per-module IR remains
      separate from the implemented bounded backend compilation job pool.
- [x] Enums with unit/tuple/struct variants, payloads, equality, methods, guards,
      exhaustiveness diagnostics, and `match<Type>` checks.
- [x] Nested enum tuple-variant and tuple patterns
      (`tests/NestedEnumPatternMatching.test.ts`, `tests/NestedTupleMatch.test.ts`).
      Struct-variant pattern fields currently use simple bindings.
- [x] `is`/`as` expressions and direct branch narrowing for supported type checks.
      User-defined `ret value is Type` guard syntax is not implemented.
- [x] `loop`, C-style loops, switch, block scope, const checking, try/catch/throw,
      and scope-bound LIFO `defer` cleanup.
- [x] Closures/lambdas with captures and bound methods. `Func` is a raw function
      pointer; `Lambda` carries a function and capture context.
- [x] Homogeneous `...T` variadics packed as `T*` plus count, and heterogeneous
      `...Any` arguments.
- [x] Backtick string interpolation with `${expression}`, lowered to `String`
      operations; see [the interpolation guide](../54-string-interpolation.md).
- [x] Inline assembly flavors `intel`, `att`, `llvm`, and `raw`, including operand
      interpolation, explicit LLVM constraints, clobbers, and flavor-specific emission.
      LLVM/Clang validate assembly content; BPL does not provide a full assembler.
- [x] Reflection metadata through `typeof`, `TypeInfo`, `FieldInfo`, and
      `MethodInfo` (`lib/reflection.bpl`, `tests/TypeReflection.test.ts`).
- [x] DWARF debug metadata, source locations, type descriptors, and variable
      declarations through `DebugInfoGenerator` and the `--dwarf`/`--debug` options.

## Implemented tools and runtime

- [x] CLI build/run/check, AST/LLVM output, eval/stdin, formatter, linter,
      documentation generation, shell completions, and toolchain doctor.
- [x] Source-span diagnostics and in-memory source previews for eval/stdin;
      JSON diagnostics for supported analysis and tooling commands.
- [x] `bpl dev`/watch mode with debounce and compilation-error recovery.
      Directory watchers discover new `.bpl`/`.x` modules/subdirectories, follow
      transitive imports outside the entry tree, and survive atomic replacement.
      Missing imports and watch failures retry; long-running programs run
      asynchronously and stop before rebuilds. Unrelated dependency and hidden
      directory trees are excluded from recursive entry-tree discovery.
- [x] VS Code language server: completion, hover, definitions, references,
      rename, implementation lookup, auto-import and other quick fixes, formatting,
      semantic tokens, inlay hints, symbols, and hierarchy providers.
      Missing-return diagnostics do not offer an invalid bare-return edit.
- [x] Runtime checks for supported null access, bounds, division failures, and
      stack overflow, with native error reporting and stack traces on supported
      platforms. Raw pointers still require manual lifetime/bounds management.
- [x] Native runtime builds on Linux/macOS and Windows compiler-component smoke
      tests. WSL remains the documented Windows native-build workflow.
- [x] WebAssembly MVP: wasm32 layout/codegen, direct `.wasm` output with a wasm
      linker, object fallback without one, hosted/freestanding runtime shims, and
      browser playground integration. WASI and broader host APIs remain follow-ups.
- [x] C binding generator for supported prototypes, common primitive/pointer and
      variadic mappings, constants, primitive typedefs, plain structs, and enums.
      Complex macros, bitfields, packed layouts, and complete ABI metadata need
      more capable header parsing.
- [x] Fuzz generation, saved artifacts/replay/promotion, differential O0/O3 checks,
      correctness corpora, sanitizer checks, LLVM verification, and benchmarks.
- [x] Release smoke/manifest checks, packed CLI coverage, CI suite planning,
      pinned local Prettier with `format`/`format:check`, and baseline test logging
      that preserves failure status. The baseline script requires Bash.

## Implemented libraries and packages

- [x] `Option<T>`/`Result<T,E>` and typed runtime error structs.
- [x] Strings/builders, formatting, filesystem/path helpers, argument parsing,
      date/time/duration, JSON parsing/serialization, random/numeric helpers, and
      stable FNV-1a/checksum hashing, and SHA-256 (`lib/sha256.bpl`).
- [x] Collections including arrays, maps, sets, linked lists, deques, queues,
      stacks, priority queues, and collection iteration specs.
- [x] Base64 and Hex codecs in `lib/base64.bpl`/`lib/hex.bpl`, UTF-8 helpers,
      and CSV parsing/writing in the bundled `bpl-csv` package.
- [x] Environment access through `Env`; shell-free `run`/`runWith` (argv,
      separate stdout/stderr, stdin, process-group timeouts), quoted shell
      execution, trusted-text shell execution, and sleep through
      `lib/process.bpl`. There is no streaming/interactive child I/O, signal
      API or Windows support.
- [x] Basic `Log.debug/info/warn/error` methods through standard IO.
      Configurable filtering, structured formatters, and output targets remain open.
- [x] Explicit arena/page/pool/stack allocators in `lib/memory/`, including arena
      reset/reuse (`tests/StdlibArenaReset.test.ts`). Allocation remains manual;
      compiler-enforced regions and ownership are not implemented.
- [x] Bundled web packages: HTTP parser/server framework, synchronous HTTP/HTTPS
      client, optional TLS, middleware, validation, rate limiting, authentication,
      database/SQLite, templates, and CSV; see [packages/README.md](../../packages/README.md).
      The socket stack targets Linux IPv4. Broader networking and portability
      remain open; see each package's limits before deployment.
- [x] Local package init/pack/install/list, manifest validation, cache checks,
      binary links, `bpl.lock`, exact restore, and `install --locked` verification.
      Cache-based version constraints are supported; full dependency graph
      planning/rollback and a remote package registry remain open. See
      [the package management guide](../25-package-management.md).

## Remaining work

Priority numbers are relative (lower is more urgent). Ongoing maintenance and
regression work is prioritized in [PLAN.md](PLAN.md).

### Near-term reliability

- [ ] [2] Generate independent per-module IR in the frontend to use the existing
      backend parallel compilation pool end to end.
- [ ] [2] Plan package dependency graphs before mutation and provide rollback
      across package replacements; retain root/transitive version constraints.
- [ ] [2] Expand required-linker wasm execution and host API/platform coverage.
- [ ] [3] Improve binding generation for complex C headers and ABI layouts.
- [ ] [4] Extend nested patterns beyond the currently supported forms, including
      recursive struct-variant field patterns; assess qualified-pattern support.

### Developer experience

Concrete defects are tracked in [BUGS.md](BUGS.md) (BUG-423 onward).

- [ ] [3] Prebuilt per-platform `bpl` binaries (Linux/macOS, x64/arm64) attached
      to releases, with a one-line installer, so users need no Bun or checkout.
- [ ] [4] Generate shell completions from the command definitions instead of
      maintaining Bash/Zsh scripts by hand.
- [ ] [5] More linter rules beyond naming (unused imports, shadowing, suspicious
      casts); make `_private` helpers in `lib/` pass the naming rule.

### Language and library extensions

- [ ] [4] Automatic resource management, ownership/moves, automatic destructor
      insertion, and smart pointers.
- [ ] [6] Default/named function arguments and explicit member visibility rules
      beyond the existing module import/export mechanism.
- [ ] [7] Remote package registry/publishing and richer dependency resolution.
- [ ] [7] Configurable/structured logging, broader portable networking and OS
      APIs, cryptographic hashes beyond SHA-256, secure entropy, regex, arbitrary-precision arithmetic,
      and compression/archiving.
- [ ] [8] Async/await and native threading/synchronization. `lib/thread.bpl` and
      `lib/sync.bpl` explicitly export no implementation; FFI interop is separate.
- [ ] [8] Null-safe navigation/coalescing, BPL middle-end optimizations,
      compile-time function evaluation, and source-level code coverage.
- [ ] [8] Compiler-enforced region lifetimes beyond the existing manual arenas.
- [ ] [9] Interactive REPL, macros, extension methods, generators, and pipeline
      operator syntax.
- [ ] [9] Complete the self-hosting compiler. Reader/scanner and supporting types
      exist in `src/`; the parser is a scaffold whose `parse()` returns `nullptr`.
      See [the self-hosting plan](../../src/SELF_HOSTING_ROADMAP.md) for that project's
      phase breakdown. Other IDE integrations and broader C++ interop also remain
      extensions beyond the current VS Code tooling and C binding generator.
