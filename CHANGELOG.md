# Changelog

All notable changes to the BPL compiler project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Generated Parser Type-Check Lookahead Scanner** -
  the Peggy parser post-processor now replaces `is` / `as` expression-tail
  tuple parsing with a direct, diagnostic-aware operator scanner and
  allocation-free folding loop. Keyword boundaries, comments, chained
  type checks, malformed-tail diagnostics, AST shape, and emitted LLVM remain
  stable. Against the pre-change parser, a 51-round isolated 5k parse
  comparison preserved the AST hash while improving median parse time from
  ~176.37ms to ~167.94ms. A same-load 51-round compiler comparison preserved
  token and IR signatures, improving parse median by ~4.26% and full
  compilation by ~2.10% after clean-control normalization. The follow-up CPU
  profile removes `peg$parseK_is` and `peg$parseK_as` from sampled hot rows.
  Reproduce with
  `bun test tests/Parser.test.ts tests/ParserExtended.test.ts tests/TypeNarrowing.test.ts tests/ComplexTypeNarrowing.test.ts tests/TypeCheckerTypeQueryDiagnostics.test.ts`
  and
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 51 --warmups 5 --json`.
- **Focused On-Demand Check Engine** -
  real `check` actions now load focused lexer, parser, and type-checker modules
  instead of the full compiler barrel, while command registration and no-input
  validation remain on lightweight deferred paths. Existing check help,
  no-input, successful, `--no-prelude`, missing-input, diagnostic, text, JSON,
  stderr, and exit-status behavior remain stable. In an alternating 101-round
  comparison against `b297feee`, normalized median startup improved by ~12.0%
  to ~13.9% for successful and diagnostic check actions and ~18.3% for
  missing-input JSON; help and no-input paths stayed within ~2.1% normalized
  process noise. A refreshed same-load 31-round 5k compiler comparison
  preserved token and IR signatures, with codegen at -2.82% and full
  compilation within +0.20%. Reproduce the loading and behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **Focused On-Demand Lint Engine** -
  real `lint` actions now load a focused parser/linter engine instead of the
  full compiler barrel, while command registration and no-input validation
  remain on lightweight deferred paths. Existing lint error-code exports and
  controlled help, no-input, successful, missing-input, diagnostic, text,
  JSON, stderr, and exit-status behavior remain stable. In an alternating
  101-round comparison against `d1c679a5`, normalized median startup improved
  by ~1.2% for `lint --help`, ~29.2% to ~30.5% for successful and diagnostic
  lint actions, and ~37.4% for missing-input JSON; no-input JSON improved
  ~0.8%, while no-input text improved ~2.7% raw. A fresh 21-round 5k compiler
  comparison preserved token and IR signatures with codegen at -7.85% and
  full compilation at +0.19%. Reproduce the loading and behavior contracts
  with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **Focused On-Demand Format Engine** -
  the `format` command now keeps filesystem, logging, JSON-reporting, and
  formatting dependencies out of command registration, then loads a focused
  parser/formatter engine only after validation succeeds. Real format actions
  no longer evaluate the full compiler barrel, while existing format
  error-code exports and controlled help, validation, JSON check, stdout,
  write, stderr, exit-status, and rewritten-file behavior remain stable. In an
  alternating 101-round comparison against `9240c423`, normalized median
  startup improved by ~2.9% for `format --help`, ~31.0% for a successful JSON
  format check, and ~32.4% for stdout formatting; validation-only paths stayed
  within ~2.0%. A fresh 21-round 5k compiler comparison preserved token and IR
  signatures with codegen at -5.82% and full compilation at -3.63%. Reproduce
  the loading and behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **Concurrent On-Demand Lint Actions** -
  the `lint` command now keeps filesystem, diagnostics, logging, and JSON
  dependencies out of help startup, then loads them concurrently with the
  already-required compiler barrel for real lint actions. Existing lint
  error-code exports remain available from `cli/commands/lint.ts`, and
  controlled help, text, JSON, parser diagnostics, validation, stderr, and exit
  behavior remain byte-for-byte stable. In a 201-round selected-help
  comparison against `fe6f15a0`, normalized `lint --help` median startup
  improved by ~6.8% while root help stayed within +1.7% raw. In an alternating
  101-round action comparison, successful, missing-input, and diagnostic lint
  actions improved by ~2.2% to ~3.3% raw, while no-input error paths stayed
  within +1.4% raw. A fresh 21-round 5k compiler comparison preserved token and
  IR signatures; clean-control normalization put codegen at -0.06% and full
  compilation at +0.08%. Reproduce the loading and behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **Concurrent On-Demand Check Actions** -
  the `check` command now registers help and option metadata through a
  lightweight registrar, then loads analysis dependencies on demand while
  starting the already-required compiler import concurrently for real check
  actions. Existing check error-code exports remain available from
  `cli/commands/check.ts`, and controlled help, text, JSON, color, timing,
  validation, stderr, and exit behavior remain stable. In an alternating
  101-round comparison against `32ffc9fa`, normalized median startup improved
  by ~7.7% for `check --help`, ~3.3% for root help, ~3.3% for a successful text
  check, ~1.0% for a successful JSON check, and ~1.8% for missing-input JSON;
  no-input error paths stayed within +1.0%. A fresh 21-round 5k compiler
  comparison preserved token and IR signatures with full compilation at
  -1.05%. Reproduce the loading and behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **On-Demand New Project Scaffolding** -
  the `new` command now registers help and option metadata through a
  lightweight registrar, then loads filesystem, manifest, logging,
  JSON-reporting, and output-safety dependencies only when project creation
  executes. Existing new-project error-code exports remain available from
  `cli/commands/new.ts`, and controlled help, JSON, stderr, exit codes, and
  generated app and library files remain byte-for-byte stable. In an
  alternating 101-round comparison against `1e130816`, `new --help` median
  startup improved from ~49.31ms to ~44.23ms (~10.3% raw, ~4.7% after
  normalizing against version control drift); root help improved ~7.7% raw,
  while invalid-name JSON execution stayed effectively flat after
  normalization. A direct 5k compiler comparison preserved token and IR
  signatures with full compilation at -4.42%. Reproduce the loading and
  behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **On-Demand Bindgen Parser** -
  the `bindgen` command now registers help and option metadata through a
  lightweight registrar, then loads its C header parser, output safety,
  logging, and JSON-reporting dependencies only when generation executes.
  Existing bindgen error-code exports remain available from
  `cli/commands/bindgen.ts`, and controlled help, successful JSON, and
  validation-error JSON outputs remain byte-for-byte stable. In an alternating
  101-round comparison against `fb1a4e83`, `bindgen --help` median startup
  improved from ~51.09ms to ~48.07ms (~5.9%); root help and version stayed
  within +0.6% control noise, while a tiny successful bindgen JSON action moved
  +2.9% raw. A direct 5k compiler comparison preserved token and IR signatures
  with full compilation at -1.76%. Reproduce the loading and behavior
  contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/JsonContracts.test.ts tests/JsonErrorCodeLists.test.ts tests/MarkdownDocs.test.ts`.
- **On-Demand Clean Actions** -
  the `clean` command now registers help and option metadata through a
  lightweight registrar, then loads filesystem traversal, git probing,
  path-safety, logging, and JSON-reporting dependencies only when cleanup
  executes. Existing clean error-code exports remain available from
  `cli/commands/clean.ts`, and controlled help and dry-run JSON outputs remain
  byte-for-byte stable. In an alternating 101-round comparison against
  `907bcdb3`, `clean --help` median startup improved from ~49.01ms to ~46.99ms
  (~4.1%), while dry-run JSON and version startup stayed within +0.3% control
  noise. A direct 5k compiler comparison preserved token and IR signatures
  with full compilation at -1.11%. Reproduce the loading and behavior
  contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/JsonContracts.test.ts tests/MarkdownDocs.test.ts`.
- **On-Demand Doctor Diagnostics** -
  the `doctor` command now registers its help and option metadata through a
  lightweight registrar, then loads filesystem, process, LLVM, sanitizer,
  package, and wasm diagnostics only when a doctor action executes. Existing
  error-code exports remain available from `cli/commands/doctor.ts`, and
  same-environment unknown-scope, package, sanitizer, and full doctor JSON
  outputs remain byte-for-byte stable. In an alternating 101-round comparison
  against `0bb23c53`, `doctor --help` median startup improved from ~52.83ms to
  ~46.96ms (~11.1% raw, ~3.0% after normalizing against version control
  drift), while root help stayed flat after normalization because registrars
  load in parallel. A direct 5k compiler comparison preserved token and IR
  signatures with full compilation at -2.01%. Reproduce the loading and
  behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/PackageManagerCLI.test.ts`.
- **On-Demand Documentation Generator** -
  the `docs` command now loads its parser-backed documentation generator only
  when documentation generation executes, keeping root and selected-command
  help off that action-only module graph. In an alternating 51-round comparison
  against `f12a8a8b`, root help median startup improved from ~70.50ms to
  ~56.84ms (~19.4% raw, ~10.7% after normalizing against version control
  drift), while `docs --help` improved from ~59.53ms to ~45.43ms (~23.7% raw,
  ~15.5% normalized). Version, help, and JSON output hashes matched;
  successful documentation generation improved by ~4.0% raw; and a direct 5k
  compiler comparison preserved token and IR signatures. Reproduce the
  behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/DocumentationGenerator.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts`.
- **Direct Root-Help Registrar Loading** -
  root CLI help now loads the existing ordered subcommand registrar groups
  directly instead of evaluating the public command barrel and its unused
  legacy compile registrar. Root help output and command ordering remain
  byte-for-byte stable. In an alternating 51-round comparison against
  `d7baf288`, root help median startup improved from ~104.14ms to ~67.19ms
  (~35.5% raw, ~30.7% after normalizing against version control drift).
  Selected help, JSON, and version output hashes matched, and a direct 5k
  compiler control preserved token and IR signatures with full compilation at
  +0.20%. Reproduce the behavior contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/CompletionTargets.test.ts`.
- **On-Demand Package Manager Actions** -
  package command registration now imports a lightweight package contracts
  module and loads the full package manager only when an action executes.
  Existing package-manager exports retain the same error-class identity and
  public type surface. In an alternating 41-round comparison against
  `1f61ef3c`, package help medians improved by ~6.9% to ~10.8%, while the
  missing-manifest `pack --json` action improved by ~1.5%. `list --json` was
  effectively flat after normalizing its +2.2% raw delta against +2.0% version
  control drift. Reproduce with
  `bun test tests/CLIStartup.test.ts tests/PackageManagerCLI.test.ts tests/PackageManager.test.ts tests/PackageJsonFailureContracts.test.ts`.
- **Focused Package Command Registration** -
  package command help and validation paths now import the focused package
  manager module directly instead of evaluating the broad compiler barrel.
  `pack` loads the compiler only when an existing entrypoint needs integrity
  verification. In an alternating 41-round comparison against `400183e4`,
  package help medians improved by ~38.5% to ~41.2%, `list --json` by ~42.0%,
  and the missing-manifest `pack --json` validation path by ~39.1%. Version
  startup stayed within +0.7% control noise. Reproduce the loading and behavior
  contracts with
  `bun test tests/CLIStartup.test.ts tests/PackageManagerCLI.test.ts tests/PackageJsonFailureContracts.test.ts tests/CLIJsonParseability.test.ts`.
- **Lazy Selected-Command Action Dependencies** -
  `build`, `run`, `dev`, `check`, `format`, `lint`, `doctor`, and
  `completion` now register their help and option metadata without eagerly
  evaluating compiler, watcher, package-manager, or broad compiler-barrel
  dependencies used only by command actions. The shared CLI diagnostic
  formatter also imports its focused compiler module directly. In an
  alternating 41-round comparison against `3bd334a7`, selected help medians
  improved by ~50.3% to ~53.6%, no-input `check`/`lint` JSON diagnostics by
  ~49.0% to ~50.2%, unknown-scope doctor JSON by ~49.1%, and completion
  execution by ~53.7%. Root help stayed flat at -0.4%; real tiny check and AST
  build actions improved by ~1.7% and ~3.8%. Reproduce the contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/CompletionTargets.test.ts`.
- **Lazy CLI Command Registration** -
  the root entrypoint now loads only the requested subcommand group and delays
  the compilation runner until a source compile actually starts. Root help
  still loads the complete command inventory, while version and no-input JSON
  paths avoid compiler and command-module evaluation. In an alternating
  fresh-process comparison against `0bfaa90a`, median version startup improved by
  ~59.1%, no-input JSON startup by ~58.6%, and AST frontend compilation by
  ~8.4%; root help stayed within ~2.0% process noise. A 5k direct-compiler
  control preserved token and IR signatures with full-phase normalized drift
  at +1.83%. Reproduce the command contracts with
  `bun test tests/CLIStartup.test.ts tests/CLI.test.ts tests/CLIJsonParseability.test.ts tests/CompletionTargets.test.ts`.
- **On-Demand Implicit Error Prelude** -
  normal modules still receive the implicit `Error` declaration from
  `std/errors.bpl` when their source mentions `Error`, while sources that
  cannot reference it now skip parsing and type-checking the error module.
  Combined with runtime-free native `main` stack-hook elision, a 31-process
  default tiny-build sample moved from ~0.22s to ~0.19s median (~13.6%
  faster), and the executable shrank from 28,680 to 15,664 bytes. DWARF,
  wasm, recursive, calling, and checked-runtime-failure paths retain stack
  hooks. Reproduce with
  `bun test tests/Parser.test.ts tests/ModuleResolver.test.ts tests/CodeGen_StackOverflow.test.ts tests/CompilerRuntimeFailureSemantics.test.ts`
  and repeated
  `bun index.ts --eval 'frame main() ret int { return 0; }' --emit llvm --quiet`.
- **Direct Native Stack-Limit Global Access** -
  optimized native IR now declares the runtime-owned `__bpl_stack_limit`
  global as `dso_local`, allowing LLVM to lower recursive stack probes to a
  direct RIP-relative comparison instead of reserving a register for a GOT
  lookup. Stack-overflow checks and BPL runtime failure behavior remain intact,
  and declaration pruning now recognizes qualified external globals. A 31-run
  `fibonacci_recursive` sample moved BPL median runtime from ~331.09ms to
  ~277.91ms and reduced the BPL/C gap from ~21.2% to ~1.5%. Reproduce with
  `bun test tests/CodeGen_StackOverflow.test.ts tests/CodeGenerator.test.ts tests/CompilerRuntimeFailureSemantics.test.ts`
  and
  `bun benchmark/run_benchmark.ts --language bpl,c --runs 31 --warmups 5 fibonacci_recursive`.
- **Basic-Block Redundant Null-Check Elimination** -
  codegen now remembers pointer values proven non-null by `__bpl_check_null`
  within the current generated basic block, so repeated member/index accesses
  to the same pointer keep the first checked runtime failure path but skip
  duplicate checks until a branch, label, call, or direct assignment can
  invalidate the proof. The hot `emit` path stays free of pointer-proof
  bookkeeping; boundary scans run only when a later null check asks whether an
  existing proof is still valid. A 15-run `binary_tree` sample moved BPL median
  runtime to ~45.96ms versus the saved pre-change ~62.70ms baseline, with the
  BPL/C ratio down to ~1.31x. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "omits repeated null checks|pointer-proof boundary"`
  and
  `bun benchmark/run_benchmark.ts --language bpl,c --runs 15 --warmups 2 --json binary_tree`.
- **Terminating Null-Guard Proofs** -
  codegen now treats `if (ptr == nullptr) return`-style guards as a non-null
  proof for later member/index accesses that can only be reached from the
  non-null branch. The proof is source-expression based and still expires at
  assignments, calls, branches, and labels, preserving checked null-access
  failures where control flow or aliasing can invalidate the fact. On top of
  same-block null-check elimination, raw `binary_tree` IR now emits 6
  `__bpl_check_null` calls instead of 9. A final 15-run sample recorded
  ~57.07ms BPL versus ~47.57ms C, improving the saved post-nullcheck BPL/C
  ratio from ~1.31x to ~1.20x. Reproduce the guard with
  `bun test tests/CodeGenerator.test.ts -t "uses terminating nullptr guards"`
  and the runtime sample with
  `bun benchmark/run_benchmark.ts --runs 15 --warmups 3 --language bpl,c --json binary_tree`.
- **Branch-Safe Null-Proof Propagation** -
  `if` codegen now snapshots valid source-expression non-null proofs at branch
  boundaries, reapplies them inside branch labels, and keeps only proofs shared
  by every fallthrough predecessor at the merge. This lets early null guards
  suppress redundant member checks across ordinary branch labels while avoiding
  leaks from nested guards or branches that assign/call before merging. In
  `binary_tree`, raw `__bpl_check_null` references dropped from 6 to 4 after
  the terminating-guard optimization. A same-load 15-run comparison against a
  clean `7f0ea02` worktree moved `binary_tree` BPL median from ~39.28ms to
  ~37.38ms and ratio from ~1.12x to ~1.04x. Reproduce the branch contracts
  with
  `bun test tests/CodeGenerator.test.ts -t "branch labels without calls|nested null guard"`
  and the same-load 5k compile gate with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 15 --warmups 3 --compare /tmp/bpl3-guard-baseline-sameload-5k.json --gate-phases codegen,full --max-phase-regression 5 --max-full-regression 5 --json`.
- **Empty Null-Proof Branch Fast Path** -
  `if` codegen now uses a shared empty proof list and skips branch-proof
  snapshot/intersection bookkeeping when no source-expression pointer facts are
  active. This preserves the branch-safe null-proof optimization while keeping
  pointer-free sources off the per-`if` allocation path. A 15-round 5k phase
  comparison against the branch-proof baseline preserved token/IR signatures,
  improved codegen median by ~2.89%, and kept full median within the gate at
  +0.81%. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "empty branch proof propagation|branch labels without calls|nested null guard"`
  and
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 15 --warmups 3 --compare /tmp/bpl3-branchproof-sameload-5k-compare.json --gate-phases codegen,full --max-phase-regression 5 --max-full-regression 5 --json`.
- **Malloc Allocator Facts in LLVM IR** -
  compatible `malloc` extern declarations and the implicit C prelude now emit
  LLVM allocator facts as `noalias` plus `allocsize(0)`, while similarly named
  user externs such as `malloc_extra` stay plain. This gives LLVM the same
  high-level allocation facts it expects from C headers without changing call
  signatures or BPL source semantics. A same-load `vector_dot_product` sample
  moved BPL median from ~58.21ms to ~57.54ms; C variance moved the ratio from
  ~1.01x to ~1.02x, so the retained evidence is the BPL median improvement,
  green IR contracts, and a 15-round 5k phase gate with matching token/IR
  signatures, codegen -5.75%, and full -5.26%. Reproduce the IR guard with
  `bun test tests/CodeGenerator.test.ts -t "implicit C prelude|allocator facts|prefix-like symbols"`
  and the 5k gate with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 15 --warmups 3 --compare /tmp/bpl3-emptyproof-5k-compare.json --gate-phases codegen,full --max-phase-regression 5 --max-full-regression 5 --json`.
- **Nonzero Divisor Proofs for Checked Division** -
  codegen now remembers grouped identifier divisors that have passed a
  generated divide-by-zero guard, so repeated `/ denom` and `% denom` pairs
  keep one checked BPL failure path instead of emitting duplicate zero checks.
  The proof stays scoped to the generated basic block, is invalidated by
  assignment/control-flow/call boundaries, and is re-established after the
  compiler-generated signed `INT_MIN / -1` overflow guard's ok label so
  overflow checks remain intact. In `constant_numerator_division`, raw IR
  dropped from 3427 bytes / 96 lines / 2 zero-check calls to 3186 bytes / 90
  lines / 1 zero-check call while preserving both overflow checks. A same-load
  20-run sample moved BPL median from ~17.60ms to ~17.23ms, and a 31-round 5k
  phase gate preserved token/IR signatures with codegen +2.08% and full
  +2.91%, both under the 5% gate. Reproduce the IR guard with
  `bun test tests/CodeGen_DivZero.test.ts -t "nonzero divisor|overflow guards"`
  and the compile gate with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-divproof-overflow-baseline-5k-31.json --gate-phases codegen,full --max-phase-regression 5 --max-full-regression 5 --json`.
- **Grouped LLVM Reference Scans** -
  final IR pruning now collects `@symbol` references and `%struct.*`
  references in separate direct scanner loops instead of interleaving both
  searches. This keeps the scanner allocation-free while avoiding redundant
  cross-probe comparisons in the pruning path. On the actual 5k generated IR,
  an isolated scanner probe moved from ~10.94ms to ~10.40ms median. A
  31-round 5k phase gate preserved token/IR signatures, with codegen +0.11%
  and full +2.50% under the 5% gate. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "grouped direct LLVM reference|prefix-like symbols|runtime helper declarations"`
  and
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-5k-profile-after-ef8c69c.json --gate-phases codegen,full --max-phase-regression 5 --max-full-regression 5 --json`.
- **Allocation-Free Parser Function Declaration Helpers** -
  the Peggy grammar helper for `FunctionDecl` now returns the AST node directly
  instead of allocating a temporary `node` binding in every function declaration
  parse action. A focused parser source contract keeps the checked-in generated
  parser on the direct-return path, and a 15-round 5k phase comparison
  preserved token count, token signature, and LLVM IR hash while moving median
  parse time from ~246.92ms to ~239.22ms and full median from ~542.59ms to
  ~530.10ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "function declaration helpers allocation-free|checked-in generated Peggy parser|simple function declaration"`
  and the phase gate with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 15 --warmups 3 --compare /tmp/bpl3-post-hash-5k-baseline.json --gate-phases parse,full --max-phase-regression 2 --max-full-regression 2 --json`.
- **Identifier-First Primary Parser Dispatch** -
  `Primary` parsing now tries `StructLiteral` and `IdentifierExpr` before
  bool/null/string literal fallbacks, while preserving keyword literal behavior
  through the existing reserved-keyword guard. This keeps identifier-heavy 5k
  synthetic programs off several failed literal branches per expression. A
  source-order contract pins both grammar and generated parser order, and a
  15-round 5k phase comparison preserved token count, token signature, and LLVM
  IR hash while moving median parse time from ~249.84ms to ~219.58ms and full
  median from ~568.76ms to ~525.44ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "identifier-heavy primary parsing|checked-in generated Peggy parser"`
  and the phase gate with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 15 --warmups 3 --compare /tmp/bpl3-post-function-helper-5k-baseline.json --gate-phases parse,full --max-phase-regression 2 --max-full-regression 2 --json`.
- **Chunked Compile Benchmark Token Hashing** -
  `benchmark/measure_compilation.ts` now exposes and uses
  `hashTokensForBenchmark`, which batches token-signature input into chunks
  before calling `Hash.update`. This preserves the exact existing token
  signature contract while making repeated 5k phase gates cheaper: local 5k
  token hashing moved from ~544.30ms median with the old per-field update loop
  to ~28.32ms median with identical digest
  `0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`.
  Reproduce the behavior guard with `bun test tests/BenchmarkRunner.test.ts`
  and the 5k signature comparison with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 3 --warmups 1 --compare /tmp/bpl3-5k-profile-restored.json --json`.
- **Iterative Symbol Resolution** -
  `SymbolTable.resolve` now walks parent scopes iteratively instead of
  recursing through `parent.resolve`, preserving symbol usage tracking while
  removing recursive hot-path calls from type checking. A 15-round 5k phase
  compare preserved token count, token signature, and LLVM IR hash while moving
  median typecheck time from ~108.40ms to ~102.60ms and full median from
  ~533.78ms to ~529.00ms. Reproduce the guard with
  `bun test tests/SymbolTable.test.ts` and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 15 --warmups 3 --compare /tmp/bpl3-5k-profile-restored.json --gate-phases typecheck,full --max-phase-regression 2 --max-full-regression 2 --json`.
- **Lazy Module Primitive Wrapper Loading** -
  module resolution now loads `std/primitives.bpl` only when a loaded module
  actually mentions primitive wrapper types such as `Int`, while explicit
  imports and wrapper-using modules keep the existing behavior. This keeps
  `std/c.bpl`-only programs on a much smaller IR path: local hello-world native
  build output dropped from ~372.8KB LLVM IR / 32.8KB binary / ~0.60s elapsed
  to ~27.7KB LLVM IR / 28.7KB binary / ~0.28s elapsed. Default executable
  builds also enable the existing top-level function tree shaker outside
  explicit LLVM/debug/DWARF/cache modes. Reproduce the guards with
  `bun test tests/ModuleResolver.test.ts tests/ImportIdempotency.test.ts tests/ModuleCacheKey.test.ts`
  and
  `bun test tests/CLI.test.ts -t "tree-shake default executable|tree-shake optimized executable|inherited optimization"`.
- **Compile Phase Benchmark Comparison Gate** -
  `benchmark/measure_compilation.ts --mode phases` now accepts `--compare`,
  `--max-phase-regression`, and `--max-full-regression` so local performance
  candidates can be checked against a saved phase JSON with token count,
  token-signature, and LLVM IR hash validation before accepting timing deltas.
  The comparison output reports median deltas for `lex`, `parse`, `typecheck`,
  `codegen`, and `full`, and exits non-zero on signature drift or configured
  regression-threshold failures. Reproduce the guard with
  `bun test tests/BenchmarkRunner.test.ts`.
- **Phase-Scoped Compile Benchmark Gates** -
  `benchmark/measure_compilation.ts --mode phases --compare` now accepts
  `--gate-phases` to apply regression thresholds only to selected phases while
  still reporting every phase delta and always validating token count, token
  signature, and LLVM IR hash. This lets codegen-only candidates gate
  `codegen,full` without failing on unrelated lex/parse noise. Reproduce the
  guard with `bun test tests/BenchmarkRunner.test.ts`.
- **Reusable Wrapped Compile Benchmark Baselines** -
  `benchmark/measure_compilation.ts --mode phases --compare` can now read both
  raw phase-result JSON and the wrapped `{ result, comparison }` JSON emitted by
  previous comparison runs, so follow-up benchmark gates no longer need manual
  `.result` extraction. Reproduce the guard with
  `bun test tests/BenchmarkRunner.test.ts -t "raw and wrapped"`.
- **Playground Execute-Only Native Tree Shaking** -
  artifact-free playground native runs now pass
  `treeShakeTopLevelFunctions` through the compiler so browser Run Code avoids
  lowering and linking dead top-level functions when it only needs to execute
  the result. Playground artifact requests still keep the conservative full IR
  path for inspection. Reproduce the guard with
  `bun test tests/PlaygroundCompileContract.test.ts -t "caches artifact-free native binaries"`.
- **Comment-Free Parser Attachment Fast Path** -
  `Parser.parse` now skips `attachComments` entirely when the source has no BPL
  comment marker, while retaining the existing documentation-comment path for
  sources with `#`. Against `e530278`, a 31-round 5k phase compare preserved
  token count, token signature, and LLVM IR hash while improving median parse
  time from ~253.96ms to ~242.62ms and full median from ~537.33ms to
  ~533.25ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "comment-free parser passes|precomputed comment-marker|syntax diagnostics"`
  and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-e530278-phases.json --max-phase-regression 3 --max-full-regression 2 --json`.
- **Codegen Top-Level Indexing Pass Fusion** -
  `CodeGenerator.generate` now indexes structs, enums, specs, and type aliases
  in one pre-layout pass and emits spec opaque declarations from that pass,
  removing two redundant full-program scans before layout generation. Against
  `752c417`, a 31-round 5k phase compare preserved token count, token
  signature, and LLVM IR hash while improving median codegen time from
  ~139.88ms to ~136.38ms and full median from ~525.44ms to ~521.28ms.
  Reproduce the guard with
  `bun test tests/CodeGenerator.test.ts -t "top-level codegen declarations"`
  and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-752c417-phases.json --max-phase-regression 3 --max-full-regression 2 --json`.
- **Lazy Codegen Block Scope Snapshots** -
  `StatementGenerator.generateBlock` now allocates block declaration tracking
  and saved local-state maps only when a block declares variables, preserving
  the same scoped shadowing restore semantics while avoiding avoidable
  declaration-free block allocations. Against `d87d8a0`, a passing 31-round 5k
  phase compare preserved token count, token signature, and LLVM IR hash while
  improving median codegen time from ~136.70ms to ~135.05ms and full median
  from ~523.85ms to ~510.02ms. Reproduce the guard with
  `bun test tests/CodeGenerator.test.ts -t "block scope snapshots"` and the
  phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-d87d8a0-phases.json --max-phase-regression 3 --max-full-regression 2 --json`.
- **Lazy Move-Return Auto-Destroy Tracking** -
  function code generation now leaves `movedAutoDestroyAddresses` unallocated
  until a move-return path records an address, while auto-destroy cleanup checks
  the set only when it exists. Against `207d37e`, a 31-round 5k phase compare
  gated on `codegen,full` preserved token count, token signature, and LLVM IR
  hash while moving median codegen from ~135.77ms to ~135.66ms and full median
  from ~540.90ms to ~538.36ms. Reproduce the guard with
  `bun test tests/RAIIAutoDestroy.test.ts tests/FunctionAttributes.test.ts tests/CodeGenerator.test.ts tests/ZeroCostLLVM.test.ts tests/GoldenLLVMShapes.test.ts`
  and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-207d37e-phases.json --gate-phases codegen,full --max-phase-regression 3 --max-full-regression 2 --json`.
- **Cached Direct Struct Member Lookups** -
  `TypeCheckerBase` now caches direct struct field and method lookups per
  `StructDecl`, avoiding repeated linear `members` scans for struct literals
  and member access while preserving inherited lookup and generic substitution
  behavior. Against `51475fa`, a 31-round 5k phase compare gated on
  `typecheck,full` preserved token count, token signature, and LLVM IR hash
  while improving median typecheck time from ~105.10ms to ~101.07ms and full
  median from ~546.83ms to ~527.81ms. Reproduce the behavior guards with
  `bun test tests/TypeChecker.test.ts tests/TypeCheckerStructLiteralDiagnostics.test.ts tests/TypeCheckerMemberAccessMisuse.test.ts tests/StructEquality.test.ts tests/BugFix_StructLiteral.test.ts tests/Struct.runtime.test.ts`
  and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-51475fa-phases.json --gate-phases typecheck,full --max-phase-regression 3 --max-full-regression 2 --json`.
- **No-State Failed-Import Cleanup Fast Path** -
  `TypeCheckerBase.clearFailedImportSymbolsForProgram` now returns immediately
  when no failed-import recovery state exists, avoiding a full top-level
  statement scan on fresh checkers while preserving cleanup behavior when a
  checker is reused after an import failure. Against the cached-struct baseline,
  a 31-round 5k phase compare gated on `typecheck,full` preserved token count,
  token signature, and LLVM IR hash while improving median typecheck time from
  ~101.07ms to ~99.87ms and full median from ~527.81ms to ~515.49ms. Reproduce
  the guard with
  `bun test tests/TypeChecker.test.ts -t "failed-import cleanup scans|clear failed import recovery"`
  and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-cached-struct-member-result.json --gate-phases typecheck,full --max-phase-regression 3 --max-full-regression 2 --json`.
- **Playground No-Import Native Compile Fast Path** -
  artifact-free playground native requests now skip full module resolution when
  the submitted source does not contain an `import` keyword, while import-using
  requests and artifact/debug requests keep the conservative module-resolution
  path. A local hello-world compiler-only probe moved median compile time from
  ~71.62ms with module resolution to ~3.28ms without it. Reproduce the guards
  with `bun test tests/PlaygroundCompileContract.test.ts`.
- **Generated Parser Statement Keyword Char Checks** -
  `optimizeGeneratedStatementStartKeywordScanning` now emits direct char-code
  checks for statement-start keyword lookahead instead of routing each
  first-character bucket through a generic `input.startsWith(keyword)` helper.
  Two same-baseline 31-round 5k phase compares against `c676672` preserved
  token count, token signature, and LLVM IR hash; parse median improved from
  ~255.01ms to ~251.35ms in the first sample and ~254.06ms in the confirmation
  sample, with full median moving from ~552.61ms to ~554.19ms and then
  ~549.12ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "statement-start keyword|keyword boundary|checked-in generated Peggy parser"`
  and the phase compare with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-post-c676672-phases.json --json`.
- **Generated Parser Location Line-Membership Fast Path** -
  `optimizeGeneratedBplLocationLines` now emits direct line-membership checks
  in `peg$findBplLineIndex` and `peg$computeBplLocation` instead of a generated
  `peg$isBplPosInLine` helper call on the parser location path. Against
  `69019ba`, a 101-round 5k phase benchmark preserved token count, token
  signature, and LLVM IR hash while improving median parse time from ~242.11ms
  to ~236.67ms and full median from ~525.88ms to ~519.74ms. Reproduce the
  guard with
  `bun test tests/Parser.test.ts -t "BPL AST locations on the generated line-start fast path"`
  and the phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Resolved Nominal Type Reuse Fast Path** - `TypeCheckerBase.resolveType`
  now reuses already-resolved non-generic struct, enum, and spec `BasicType`
  nodes before implicit primitive imports and scope lookup, while excluding
  aliases, variable/parameter metadata, generic arguments, generic
  declarations, and mismatched declaration names. Against detached `e601b81`,
  a 101-round 5k phase benchmark preserved token count, token signature, and
  LLVM IR hash while improving median typecheck time from ~109.77ms to
  ~100.99ms and full median from ~534.38ms to ~527.94ms. Reproduce the guard
  with
  `bun test tests/TypeChecker.test.ts -t "already-resolved nominal"` and the
  phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Builtin Operand Operator-Overload Fast Path** - `ExpressionChecker` now
  skips operator-overload resolver calls for known builtin operand types that
  cannot define overload methods, while preserving user-defined overloads and
  the existing swapped-right `>` lookup. Against detached `9a032ba`, a
  101-round 5k phase benchmark preserved token count, token signature, and
  LLVM IR hash while improving median typecheck time from ~117.15ms to
  ~115.52ms and full median from ~554.19ms to ~549.86ms. Reproduce the guards
  with `bun test tests/TypeChecker.test.ts -t "builtin operand"` and
  `bun test tests/OperatorOverloadingUser.test.ts -t "Builtin-left"`.
- **Generated Parser Comment-Marker Fast Path** - `Parser` now computes the
  BPL comment-marker state once and passes it through `parseWithPeggy` so the
  generated trivia skipper can skip its own full-source `#` scan on
  comment-free parser passes. Against `ed9dd2a`, a 101-round isolated 5k
  parse-only probe preserved statement count and AST hash while improving
  median parse time from ~255.26ms to ~238.36ms. A matched phase benchmark
  preserved token signature and LLVM IR hash and improved full median from
  ~561.36ms to ~555.80ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "precomputed comment-marker"` and the
  phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Identifier Keyword Classifier Fast Path** - `GenericParser` now classifies
  identifier-like tokens through a direct first-character switch instead of a
  keyword `Set` lookup, preserving `true`/`false` and `null`/`nullptr` literal
  handling while keeping keyword coverage aligned with `GrammarLexer`. Against
  `e41aad6`, a 101-round isolated 5k lex probe preserved token count and
  signature while improving median lex time from ~42.33ms to ~39.70ms. A
  matched phase benchmark preserved token signature and LLVM IR hash and
  improved phase lex median from ~42.33ms to ~41.13ms; full median remained
  noisy because untouched parse/typecheck/codegen medians varied in the same
  window. Reproduce the guard with
  `bun test tests/Lexer.test.ts -t "keyword"` and the phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Punctuator Lexer Direct Dispatch Fast Path** - `GenericParser` now lexes
  punctuators through a direct first-character char-code switch instead of a
  grouped `Map` lookup and candidate `startsWith` loop, and removes the unused
  punctuator table from module initialization. Against `fbf8fea`, a matched 5k
  phase benchmark preserved the token signature and LLVM IR hash while full
  median improved from ~573.00ms to ~542.83ms; the phase lex median was noisy
  at ~44.40ms to ~45.28ms. A same-window 201-round isolated lex probe preserved
  token count and signature while improving median lex time from ~44.13ms to
  ~39.74ms. Reproduce the guard with
  `bun test tests/Lexer.test.ts -t "punctuator lexing"` and the phase benchmark
  with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Function-Local Codegen State Swap Fast Path** - Function code generation
  now swaps in fresh local-state collections for each function body and restores
  the previous collection references in `finally`, instead of cloning the
  current local maps and sets before clearing them. This keeps re-entrant
  function generation state isolated, restores state across early returns, and
  avoids per-function copies on nested or populated local state. Against
  `b7966bf`, the matched 5k phase benchmark preserved the token signature and
  LLVM IR hash while codegen median improved from ~155.97ms to ~152.98ms; full
  median was effectively flat/noisy at ~597.88ms to ~600.20ms. A same-window
  isolated 101-round codegen probe preserved the IR hash and improved median
  codegen time from ~133.24ms to ~128.50ms. Reproduce the guard with
  `bun test tests/CodeGenerator.test.ts -t "function-local codegen state"` and
  the phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Identifier Scanner Predicate Inline Fast Path** - Generated parser
  identifier scanning now inlines the identifier-continuation predicate instead
  of calling the identifier-start helper for every scanned character. Against
  `5110961`, a matched 5k phase benchmark preserved the token signature and
  LLVM IR hash while parse median improved from ~258.57ms to ~253.28ms and
  full median improved from ~581.17ms to ~562.78ms. An isolated 101-round
  parse-only probe preserved the AST hash and improved median parse time from
  ~254.25ms to ~241.85ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "identifier and reserved-keyword"` and the
  phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Parser Operator Token Start-Position Fast Path** - Generated parser
  operator scanners now carry the operator start offset and build binary and
  prefix operator tokens from that offset, avoiding full `location()` objects
  when only token line and column are needed. Against `e184b1b`, a matched 5k
  phase benchmark kept the token signature and LLVM IR hash unchanged while
  parse median improved from ~306.06ms to ~289.16ms and full median improved
  from ~707.87ms to ~688.14ms. An isolated 101-round parse-only probe improved
  median parse time from ~327.05ms to ~322.97ms. Reproduce the guard with
  `bun test tests/Parser.test.ts -t "binary expression tail"` and the phase
  benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Function Header Codegen Allocation Fast Path** - Function code generation
  now builds LLVM parameter lists with a single loop and only extracts method
  basenames when generating struct methods that can be `init`. This removes
  avoidable `map(...).join(...)` and `split("_")` allocations from large
  top-level function batches while preserving emitted IR. Against `ab4d50e`, a
  matched 5k phase benchmark kept the token signature and LLVM IR hash
  unchanged while codegen median improved from ~197.42ms to ~190.52ms; an
  isolated codegen-only probe improved from ~197.76ms to ~167.93ms with the
  same IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce the guard with
  `bun test tests/CodeGenerator.test.ts -t "function header generation"` and
  the phase benchmark with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 21 --warmups 5 --json`.
- **Comment-Free Lexer Direct Token Emission** - `lexWithGrammar` now routes
  comment-free sources through `GenericParser.parseWithTokenEmitter`, emitting
  frontend `Token` objects directly instead of allocating generic `TokenNode`
  objects and immediately converting them. Comment-bearing sources keep the
  range-preserving token-node path for comment extraction. On a matched 5k
  synthetic compile comparison against `3245525`, lex median improved from
  ~70.62ms to ~57.22ms and full phase median improved from ~707.25ms to
  ~687.59ms with unchanged token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`) and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with `bun test tests/Lexer.test.ts` and
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 21 --warmups 5 --json`.
- **Codegen LLVM Reference Boundary Lookup** - Final codegen pruning now checks
  LLVM symbol and struct references with direct `indexOf` boundary scans instead
  of cached regular-expression tests. This keeps the same generated IR while
  reducing repeated runtime-declaration pruning overhead on large outputs. On a
  same-machine 5k synthetic compile comparison against `48345ca`, codegen median
  improved from ~209.91ms to ~206.32ms and full phase median improved from
  ~755.15ms to ~751.12ms with unchanged IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "uses direct LLVM reference boundary scans|prunes unused internal runtime helper declarations|keeps Type vtable metadata|keeps internal runtime helper declarations|keeps internal runtime state declarations|keeps implicit C prelude declarations"`
  and `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 7 --warmups 2 --json`.
- **Parser Declaration Dispatch Fast Path** - The Peggy grammar now tries
  concrete declaration and statement forms before the expression-statement
  fallback, avoiding repeated negative expression dispatch for function-heavy
  sources. On the 5k synthetic compile benchmark, phase median improved from
  ~755.58ms to ~736.72ms and parser median improved from ~347.33ms to
  ~331.48ms. Reproduce with `bun test tests/Parser.test.ts` and
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 7 --warmups 2 --json`.
- **Lazy Runtime Stack-Frame Storage** - Native runtime support now allocates
  optional named BPL stack-frame metadata lazily instead of reserving three
  `BPL_MAX_STACK_DEPTH` arrays in every executable. A hello-world native build
  dropped from 200,048 bytes of BSS to 64 bytes while preserving normal output
  and stack-trace runtime integration coverage. Reproduce with
  `bun test tests/RuntimeBuildScript.test.ts tests/BinaryRunner.test.ts` and
  `bun test tests/Integration.test.ts -t "stack_trace_error|stack_trace_uncaught|test_zero_comprehensive"`.
- **Module Resolution Parser Fast Path** - Module resolution and import
  loading now parse source directly instead of running the separate grammar
  lexer before Peggy parsing. Peggy still preserves doc comments, import
  diagnostics, and module dependency ordering, but playground-style
  `resolveImports` compilation avoids the duplicate tokenization pass. A 5k
  synthetic module-resolution compile improved from a ~967.27ms median at
  `3bdcdde` to ~866.72ms after this change. Reproduce with
  `bun test tests/ModuleResolver.test.ts tests/ImportHandler.test.ts`.
- **Playground Native Binary Rerun Cache** - Artifact-free playground
  `/compile` requests now cache the linked native binary for unchanged source
  code and rerun that binary with each request's current stdin and argv. This
  preserves Run Code response shape while avoiding repeated LLVM/native links
  when users rerun the same example. On the current-checkout hello-world
  playground backend probe, repeated native runs improved from a ~326ms median
  baseline to ~4.95ms after the first cached build. Reproduce with
  `bun test tests/PlaygroundCompileContract.test.ts -t "cached native binaries"`.
- **Playground Hosted Wasm Response Cache** - Playground `/wasm` requests now
  cache successful hosted-wasm responses for unchanged source, BPL home, and
  resolved wasm linker, returning immutable response copies on warm hits without
  rerunning the compiler or linker. The same work normalizes `WASM_LD=wasm-ld`
  to a clang-safe resolved linker path, fixing browsers and local playground
  runs on clang versions that reject `-fuse-ld=wasm-ld`. On the browser wasm
  showcase probe, fixed-baseline repeated builds were ~660.65ms median, while a
  cached run produced one ~602.83ms cold build followed by 9.63-12.12ms warm
  hits. Reproduce with
  `bun test tests/BinaryRunner.test.ts tests/PlaygroundWasmResponseCache.test.ts tests/PlaygroundWasmToolchain.test.ts`
  and `bun run test:wasm`.
- **Compile Phase Benchmark Final-Round Hashing** - The in-process compile
  phase benchmark now computes `tokenSignature` and `irHash` only on the final
  measured round instead of recomputing and overwriting them after every
  measured round. Reported token count, signature, IR hash, and phase timing
  schema are unchanged, but 5k profiling runs spend much less time in benchmark
  hashing. A 5-round/1-warmup sample improved wall time from ~8.14s to ~5.76s,
  and CPU profile `update` self-time dropped from ~35.7% to ~9.5%, making
  compiler-owned hotspots easier to see. Reproduce with
  `bun test tests/BenchmarkRunner.test.ts -t "final measured round"`.
- **Identifier Token Conversion Fast Path** - `convertTokenNodeToToken` now
  trusts the grammar-backed lexer's `Identifier` invariant and skips a
  defensive `keywordMap` lookup for identifier token nodes. Keywords, booleans,
  and null literals continue through their dedicated token-node branches. On a
  matched 5k synthetic compile probe after the preallocated grammar token
  conversion, lex median improved from ~97.28ms to ~70.64ms and full
  in-process compile median improved from ~763.38ms to ~725.65ms while
  preserving the same 265,230 tokens, token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/Lexer.test.ts -t "aligned with GrammarLexer keyword tokens|defensive keyword lookup|should tokenize 'enum' keyword|should tokenize 'as' keyword|should tokenize 'this' keyword"`.
- **Preallocated Grammar Token Conversion** - `lexWithGrammar` now converts
  grammar token nodes through a preallocated indexed loop instead of
  `tokens.map(...)`, avoiding callback overhead on large token streams. On the
  matched 5k synthetic compile probe after the parser location fast path, lex
  median improved from ~91.32ms to ~86.86ms and full in-process compile median
  improved from ~739.95ms to ~727.31ms while preserving the same 265,230 tokens,
  token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/Lexer.test.ts -t "preallocated loop|comment-free lexing|should tokenize 'frame' keyword|should skip single-line comments"`.
- **Optimized Native Stack Overflow Probes** - O3 native codegen now
  initializes a stack-limit pointer in `main` and emits a cheap stack probe in
  checked functions instead of calling the runtime enter/exit helpers or
  updating global stack depth on every recursive call. O0, O2, DWARF, and wasm
  builds keep depth-tracking paths for debug-oriented behavior. Local
  BPL-vs-C samples improved `fibonacci_recursive` from ~1505ms median to
  ~620-675ms median and `binary_tree` from ~79ms median to ~50-57ms median while
  `tests/CompilerRuntimeFailureSemantics.test.ts` still verifies O3 stack
  overflow routes through the BPL `STACK OVERFLOW` error. Reproduce with
  `bun test tests/CodeGen_StackOverflow.test.ts tests/CodeGenerator.test.ts tests/CompilerRuntimeFailureSemantics.test.ts`
  and `bun benchmark/run_benchmark.ts --language bpl,c --runs 5 --warmups 2 fibonacci_recursive binary_tree`.
- **Generic Lexer Identifier Scanner** - The grammar-backed lexer now scans
  identifiers with a manual ASCII fast path instead of routing every identifier
  through a sticky regex match and per-character token advance. On a matched
  5k synthetic `lexWithGrammar` probe against the parent commit, tokenization
  median improved from ~53.75ms to ~44.20ms while preserving the same 180,056
  tokens and token signature
  (`0b8c49ae14d139a930c47165d8605d20a7d986e4ea3a267ffb6e31329848a6b7`).
  Reproduce with
  `bun test tests/Lexer.test.ts tests/Parser.test.ts tests/ParserExtended.test.ts`.
- **Generic Parser No-Comment Whitespace Fast Path** - The grammar-backed lexer
  now records whether the source contains `#` once and routes comment-free
  files through a whitespace-only scanner that updates positions directly. On a
  matched 5k synthetic compile probe, lex median improved from ~119.11ms to
  ~93.98ms and full in-process compile median improved from ~782.61ms to
  ~756.89ms while preserving the same 265,230 tokens, token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/Lexer.test.ts -t "GenericParser comment-free whitespace|skip single-line comments|skip multi-line comments|comment-free lexing"`.
- **Parser Comment Attachment Fast Path** - Parser comment attachment now skips
  token comment filtering and AST comment attachment work for sources without a
  `#` marker. On a matched 5k synthetic compile probe after the lexer
  whitespace fast path, parse median improved from ~347.10ms to ~330.13ms and
  full in-process compile median improved from ~769.07ms to ~714.75ms while
  preserving the same 265,230 tokens, token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/Parser.test.ts -t "comment-free parser passes|syntax diagnostics|simple function declaration|struct declaration"`.
- **Methodless Operator-Overload Fast Path** - Type checking now skips operator
  overload member resolution for plain structs with no methods and no
  inheritance, and for enums with no methods. On a matched 5k synthetic compile
  probe, typecheck median improved from ~125.05ms to ~121.05ms and full
  in-process compile median improved from ~768.01ms to ~751.49ms while
  preserving the same 265,230 tokens, token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/TypeChecker.test.ts -t "methodless structs"`.
- **Generated Binary Expression Fold Fast Path** - The BPL grammar now folds
  binary expression and `is`/`as` parser tails through explicit loops instead of
  generated `tail.reduce` callback actions. On a matched 5k synthetic compile
  probe, parse median improved from ~327.63ms to ~321.22ms and full in-process
  compile median improved from ~735.00ms to ~716.75ms while preserving the same
  265,230 tokens, token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/Parser.test.ts -t "binary expression folding"`.
- **Reusable Compile Phase Benchmark** - `benchmark/measure_compilation.ts` is
  now import-safe and supports `--mode phases` for in-process lex, parse,
  typecheck, codegen, and full compile timing on the synthetic 5k compile
  fixture. JSON output includes `tokenSignature` and `irHash` so performance
  experiments can verify behavior preservation without relying on temporary
  probes. Reproduce with
  `bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json`.
- **Direct Parser Location Fast Path** - The BPL grammar now passes normalized
  `SourceLocation` objects directly through hot AST constructors instead of
  calling the identity `makeLoc` helper around already-normalized locations.
  On a matched 5k synthetic compile probe against the parent commit, parse
  median improved from ~350.40ms to ~327.17ms and full in-process compile
  median improved from ~757.65ms to ~748.47ms while preserving the same
  265,230 tokens, token signature
  (`0900c2024fca2824345874aadd6b27e0a9805c61fdf67ad1dd5e6699cf0caf93`), and
  LLVM IR hash
  (`c579f6868c8d3de52eab8f7fae86e30480adac92db1747f069c4bd8fc8d9b9cd`).
  Reproduce with
  `bun test tests/Parser.test.ts -t "normalized parser locations"`.
- **Generated No-Comment Trivia Fast Path** - The checked-in Peggy parser now
  records whether the input contains `#` once and skips comment-branch checks in
  `peg$parse_` for comment-free files. On the direct 5k compile probe, parse
  median improved from ~230.19ms to ~218.01ms and total median from ~506.91ms
  to ~488.22ms while preserving the same 120,043-line LLVM IR
  (`3494f8c270b2562b7a0365cf7b148a58f2e583600bf37a2683dbd189a560e486`).
  Reproduce with `bun test tests/Parser.test.ts -t "trivia skipping"`.
- **Factored Postfix Trivia Parsing** - The BPL grammar now factors the leading
  postfix-tail trivia parse once before dispatching to call, index, member,
  generic, and postfix-unary alternatives. On a matched 5k parse-only probe,
  median improved from ~184.73ms to ~175.82ms and average from ~202.24ms to
  ~183.74ms while preserving the same 5,002 top-level statements. The full
  compile split preserved identical LLVM IR
  (`65606e11ff5aaf2b92b95b9021a27f68c05546dead03407a16d59704694b99ed`).
  Reproduce with
  `bun test tests/Parser.test.ts -t "postfix tail trivia|checked-in generated Peggy parser"`.
- **Primitive-Only Struct Default Fast Path** - Codegen now caches whether a
  by-value struct needs generated default initialization and returns `undef`
  immediately for primitive-only structs, while still preserving vtable pointer
  insertion and enum-field zero initialization. On a matched 5k typed-AST
  codegen probe, median improved from ~133.86ms to ~127.44ms and average from
  ~134.35ms to ~128.97ms while preserving identical 135,029-line LLVM IR
  (`418485e59754bb5bd879f85d43d448216b3bf486ba2a419a92c30cb9c9f08ad0`).
  Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "primitive-only struct defaults|preserves required struct default"`.
- **No-Trim LLVM Terminator Detection** - Codegen block finalization now checks
  generated LLVM terminator lines with a leading-whitespace scan instead of
  allocating through `trim()` for every block. On the post-struct-default 5k
  typed-AST codegen probe, median improved from ~135.22ms to ~125.36ms and
  average from ~134.14ms to ~127.43ms while preserving identical 135,029-line
  LLVM IR
  (`418485e59754bb5bd879f85d43d448216b3bf486ba2a419a92c30cb9c9f08ad0`).
  Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "terminators without trimming"`.
- **Direct Struct Member Address Fast Path** - Codegen now bypasses full type
  string resolution for common non-pointer, non-generic, non-alias struct
  member accesses when the struct layout is already known. On the post
  terminator-scan 5k typed-AST codegen probe, median improved from ~127.62ms to
  ~124.07ms and average from ~128.74ms to ~124.35ms while preserving identical
  135,029-line LLVM IR
  (`418485e59754bb5bd879f85d43d448216b3bf486ba2a419a92c30cb9c9f08ad0`).
  Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "simple struct member address"`.
- **Generated Trivia Whitespace Fast Path** - The checked-in Peggy parser
  postprocessor now inlines whitespace char-code checks inside the manual trivia
  skipper instead of calling a helper on every whitespace probe. On the same 5k
  synthetic parse-only benchmark after expression-operator scanner work, timing
  improved from ~230.43ms average / ~227.28ms median to ~224.35ms average /
  ~223.28ms median, with emitted LLVM IR still byte-for-byte identical
  (`2f422150139e7093ee35af1a509904b841e4c419882387b989d2fe39c3017f0f`).
- **Generated Expression Operator Scanners** - The checked-in Peggy parser
  postprocessor now rewrites fixed expression operator helpers (`||`, `&&`,
  bitwise, equality, relational, shift, additive, multiplicative, and unary
  operators) into direct char-code scanners that preserve the generated action
  and expectation IDs. On the 5k benchmark-shaped synthetic source, parse-only
  timing improved from ~249.22ms average / ~246.41ms median to ~216.61ms
  average / ~214.55ms median, while emitted LLVM IR stayed byte-for-byte
  identical (`7aae97112c1cc61ae8d7eba8a9b0ab58ec4fa6333a33ce1f9c51022fb7f73192`).
  Reproduce with `bun test tests/Parser.test.ts -t "expression-operator parsing|checked-in generated Peggy parser"`.
- **Builtin Alias Clone Fast Path** - Simple builtin aliases such as `int` and
  `uint` now avoid object-spread cloning in the common parsed type path during
  type resolution, while preserving the metadata-copy fallback for enriched
  type nodes. In an alias-heavy 5k-function local probe, the typecheck segment
  improved from ~52.00ms average / ~53.74ms median to ~48.37ms average /
  ~47.84ms median, with byte-for-byte identical emitted LLVM IR
  (`9f6e0a741f27421d075bd576d5ea660b32366e8d354c95cff94773c848e6c100`).
  Reproduce with `bun test tests/TypeChecker.test.ts -t "simple builtin alias"`.
- **Checked Integer Division Fast Paths** - Integer division and modulo now
  skip unreachable runtime division-by-zero branches when the divisor is a
  known nonzero constant, and skip signed `INT_MIN / -1` overflow branches when
  either the constant divisor is not `-1` or a constant numerator cannot be the
  signed minimum value. This removes cold error blocks from hot arithmetic
  loops without weakening dynamic divisor checks. On the `noinline_calls`
  benchmark, local BPL O3 median improved from a noisy ~309.8ms sample to
  ~194.5ms in a five-run sample, close to C O3 at ~188.0ms. The new
  `constant_numerator_division` benchmark tracks dynamic divisors whose
  constant numerator cannot overflow. Reproduce with
  `bun test tests/CodeGen_DivZero.test.ts -t "constant|numerator"` and
  `bun benchmark/run_benchmark.ts --language bpl,c --runs 5 --warmups 1 noinline_calls constant_numerator_division`.
- **Generated IR Runtime Declaration Pruning** - Code generation now removes
  unused namespaced BPL runtime helper declarations plus unreferenced internal
  runtime state globals, helper struct declarations, and unused built-in
  primitive metadata from final LLVM IR while keeping helpers/state/type
  metadata that generated bodies actually reference. A simple
  `frame main() ret int { return 0; }` sample dropped from 2,503 bytes and 11
  internal `__bpl` helper declarations to 282 bytes with only used stack-frame
  helper declarations retained and pruned declaration blank runs compacted.
  Main argc/argv runtime globals and stores are now retained only when
  generated IR calls `__bpl_argc` or `__bpl_argv_get`, and dead `stack_ok`
  branch labels are no longer emitted after stack overflow branching moved into
  runtime hooks.
  Reproduce with `bun test tests/CodeGenerator.test.ts -t "runtime helper declarations"`.
- **Runtime Arg Store Pruning Fast Path** - Code generation now records direct
  `__bpl_argc` and `__bpl_argv_get` calls during call lowering so final
  argc/argv store pruning no longer joins or scans the full generated body. On
  the 5k synthetic fixture, local `pruneUnusedRuntimeArgStores` samples dropped
  from a previous ~21.5ms joined-body sample and a rejected ~29ms line-scan
  sample to ~9-10.8ms, with the call-lowering hook adding under ~1.1ms across
  5,001 direct calls. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "runtime arg helper"`.
- **Runtime Arg Store Index Pruning** - Main argc/argv setup stores now record
  their output indices at the emission site, so final pruning removes the two
  optional stores directly instead of filtering the full generated output. In a
  post-`dfbf754` 5k full-compiler profile, `pruneUnusedRuntimeArgStores`
  accounted for ~57.4ms total with the hot line compare at ~50.7ms; after the
  index-splice path, the same profile query no longer reported that method in
  the hot sections. Emitted 5k IR stayed byte-for-byte identical at 2,987,498
  bytes, and isolated warm codegen averaged ~157.45ms. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "runtime arg helper"`.
- **Codegen Runtime Pruning Body Reuse** - Final runtime declaration pruning
  now reuses one joined generated body string across internal runtime and
  builtin primitive metadata pruning instead of joining the 5k-function output
  twice before final IR assembly. In isolated 5k in-process compiler samples,
  warm codegen average improved from ~208.54ms to ~194.50ms while preserving
  emitted IR size. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "generated body string|runtime arg helper|runtime helper declarations|builtin"`.
- **Codegen Compacted Body Final Assembly Reuse** - Generated output blank-line
  compaction now runs before constructing the shared `generatedBody` string, so
  final IR assembly can reuse that compacted body instead of joining the full
  output array again. The 5k synthetic fixture stayed byte-for-byte identical
  at 2,987,498 bytes; local isolated codegen samples improved from the prior
  ~157.45ms warm average to ~153.74ms warm average / ~150.10ms warm median,
  and a full-compiler profile sample showed native `join` self time at ~94.3ms
  versus the previous ~142.6ms sample. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "generated body string|final IR section assembly|runtime arg helper|runtime helper declarations|builtin"`.
- **Codegen LLVM Reference Regex Cache** - Runtime declaration pruning now
  reuses per-generator compiled LLVM symbol and struct reference patterns
  instead of constructing a fresh `RegExp` for every pruning lookup. A matched
  5k synthetic fixture stayed byte-for-byte identical at 2,987,498 bytes; local
  isolated codegen samples moved from ~146.55ms warm average / ~146.75ms median
  before the cache to ~143.85ms warm average / ~138.86ms median after it.
  Matched profile samples still show the unavoidable regex match work, but the
  hot reference methods now route through cached patterns. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "compiled LLVM reference regexes|generated body string|runtime helper declarations|builtin"`.
- **Lexer Comment-Free Fast Path** - `lexWithGrammar` now skips the comment
  extraction scan and comment-position resort when the source contains no `#`
  marker. The comment path remains unchanged for real line/block comments and
  strings containing `#` still take the conservative scan path. On the 5k
  synthetic fixture, emitted LLVM stayed byte-for-byte identical at 2,987,498
  bytes; matched full-pipeline samples improved from ~741.46ms warm average /
  ~731.48ms median to ~726.28ms warm average / ~715.70ms median, and the
  comment-free profile no longer reports `extractComments` as a hot row.
  Reproduce with
  `bun test tests/Lexer.test.ts -t "comment-free lexing|single-line comments|multi-line comments|nested comments"`.
- **Lexer Punctuator First-Character Dispatch** - The generic lexer now groups
  punctuator candidates by first character while preserving the existing
  overlapping-token order. This avoids scanning every punctuator for each
  punctuation token. The 5k fixture stayed byte-for-byte identical at 2,987,498
  bytes; matched full-pipeline samples improved from ~726.28ms warm average /
  ~715.70ms median to ~700.80ms warm average / ~669.87ms median, and
  `matchPunctuator` dropped out of the profile top 10. Reproduce with
  `bun test tests/Lexer.test.ts -t "first-character candidate|distinguish between similar operators"`.
- **Lexer Token Regex Fast Path** - Generic lexer string, character, number,
  and identifier matching now reuses module-level sticky regexes and guards
  each hot regex with a cheap first-character check. This avoids regex work for
  token kinds that cannot start at the current byte while keeping ASCII token
  rules unchanged. The same-command 5k CLI LLVM emit stayed byte-for-byte
  identical at 2,987,639 bytes / 90,032 lines. Focused lex-only samples on the
  5k source improved from ~100.08ms warm average / ~95.32ms median to ~57.41ms
  warm average / ~53.14ms median for the same 180,056-token stream, and the
  Bun CPU profile no longer reports `execAt` or literal/identifier matchers as
  relevant lexer rows. Reproduce with
  `bun test tests/Lexer.test.ts -t "module-level token regexes|first character before execAt"`.
- **Lexer Number Prefix Dispatch** - Generic lexer number matching now selects
  the hex, binary, octal, or decimal sticky regex from the current prefix
  instead of trying every numeric pattern for every digit-start token. Malformed
  prefixed literals still fall back to the previous decimal-token behavior, so
  cases such as `0b1021` continue tokenizing as `0b10` followed by `21`. The
  5k in-process LLVM output stayed byte-for-byte identical at 2,987,498 bytes /
  90,030 lines. Focused lex-only samples improved from ~54.83ms warm average /
  ~53.96ms median to ~52.32ms warm average / ~50.54ms median for the same
  180,057-token stream. Reproduce with
  `bun test tests/Lexer.test.ts -t "numeric regex matching|invalid number format"`.
- **Generated Parser Number Scanner** - The Peggy parser post-processor now
  replaces the generated `NumberToken` state machine with a direct scanner for
  decimal, hex, binary, and octal tokens. The checked-in parser remains
  regenerated from `grammar/bpl.peggy`, malformed-prefix fallback behavior is
  preserved, and the 5k in-process LLVM output stayed byte-for-byte identical
  at 2,987,498 bytes / 90,030 lines. Focused parse samples were noisy but
  the matched post-fix rerun moved from ~299.12ms warm average / ~295.29ms
  median to ~288.49ms warm average / ~284.42ms median, while the final
  in-process profile removed `peg$parseNumberToken` from the sampled hot rows
  and showed the direct decimal scanner rows instead. Reproduce with
  `bun test tests/Parser.test.ts -t "number-token parsing|number-token trivia boundary|checked-in generated Peggy parser"`.
- **Generated Parser Numeric Conversion Fast Path** - Numeric literal AST
  construction now parses common decimal and prefixed integer values directly
  instead of allocating a cleaned string and running regex prefix checks for
  every `NumberLiteral`. Decimal floats, unsafe-size decimal integers, malformed
  internal raw strings, and current trivia-boundary cases still fall back to the
  old `Number(...)` / `Number.parseInt(...)` behavior. The Peggy grammar now
  spells uppercase `0X` / `0B` / `0O` prefixes explicitly to match the lexer
  and generated scanner behavior. The 5k in-process LLVM output stayed
  byte-for-byte identical at 2,987,498 bytes / 90,031 lines. Matched parse
  samples moved from ~302.65ms warm average / ~298.71ms median to ~283.74ms
  warm average / ~282.44ms median, and the final profile reduced the sampled
  `parseNumber` rows from about ~43.93ms / ~18.83ms to about ~18.66ms /
  ~6.22ms. Reproduce with
  `bun test tests/Parser.test.ts -t "number literal conversion|number-token trivia boundary|checked-in generated Peggy parser"`.
- **Generated Parser Statement Lookahead Scanner** - Expression-statement
  lookahead now checks statement-start keywords with a first-character direct
  scanner and char-code `IdBoundary` test instead of walking the generated
  Peggy alternative chain for `global`, `local`, `return`, and other statement
  starters. The 5k in-process LLVM output stayed byte-for-byte identical at
  2,987,498 bytes / 90,031 lines. Matched parse samples moved from ~291.60ms
  warm average / ~278.23ms median to ~264.65ms warm average / ~266.04ms
  median, and the final parser profile showed only the direct
  `peg$scanBplStatementStartKeyword` row around ~7.53ms instead of the prior
  generated `peg$parseStatementStartKeyword` row around ~53.66ms. Reproduce
  with `bun test tests/Parser.test.ts -t "statement-start keyword|keyword boundary|checked-in generated Peggy parser"`.
- **Generated Parser Assignment Operator Scanner** - The Peggy parser
  post-processor now replaces the generated `AssignmentOperator` alternative
  chain with a direct char-code scanner while preserving generated action and
  expectation ids for locations and syntax diagnostics. A 5k source dominated
  by failed assignment-operator lookahead moved from ~129.33ms warm average /
  ~129.97ms median to ~126.55ms warm average / ~125.04ms median; a 5k
  assignment-heavy success-path source was effectively neutral at ~611.73ms /
  ~607.90ms baseline versus ~614.66ms / ~607.32ms after the direct-return
  scanner. The supported-assignment 5k LLVM output stayed byte-for-byte
  identical at 4,344,252 bytes / 155,014 lines. Reproduce with
  `bun test tests/Parser.test.ts -t "assignment-operator|checked-in generated Peggy parser"`.
- **Generated Parser Identifier Token Action Fast Path** - The `Identifier`
  grammar action now returns only the intermediate `name` field instead of
  computing a token location and allocating unused `start` / `end` wrappers for
  every identifier. AST identifier expressions and declarations still compute
  their own source locations. On the post-assignment 5k profile source,
  parse-only samples moved from ~372.25ms warm average / ~367.04ms median to
  ~327.99ms warm average / ~323.10ms median. The same 5k LLVM output stayed
  byte-for-byte identical at 4,040,154 bytes / 160,015 lines. Reproduce with
  `bun test tests/Parser.test.ts -t "identifier token actions|checked-in generated Peggy parser"`.
- **TypeChecker Simple Builtin Resolver Fast Path** - Basic type resolution now
  handles canonical builtins and user-facing primitive aliases with one
  pre-scope helper instead of separate canonical-set and alias-helper calls.
  On the post-identifier 5k profile source, the typecheck segment moved from
  ~115.85ms warm average / ~115.61ms median to ~110.98ms warm average /
  ~111.18ms median while total parse+check time stayed effectively neutral.
  The same 5k LLVM output stayed byte-for-byte identical at 4,040,154 bytes /
  160,015 lines. Reproduce with
  `bun test tests/TypeChecker.test.ts -t "canonical primitive|simple builtin aliases"`.
- **Codegen Final IR Assembly Fast Path** - Final LLVM IR result assembly now
  appends trimmed non-empty sections directly instead of allocating a mapped
  and filtered section array before the final join. On the 5k synthetic
  fixture, emitted IR stayed byte-for-byte identical at 2,987,498 bytes, while
  isolated warm codegen average improved from the prior ~194.50ms baseline to
  ~168.60ms. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "final IR section assembly|generated body string|runtime arg helper|runtime helper declarations|builtin"`.
- **Codegen Struct Field-List Cache** - Code generation now reuses field-list
  lookups for simple non-generic POD structs instead of rebuilding the same
  arrays for repeated local default-value generation. On the 5k synthetic
  fixture, targeted codegen profiling showed `generateDefaultValue` drop from
  roughly ~46.24ms to ~29.96ms total while keeping emitted IR byte-for-byte
  stable. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "reuses simple struct field lists"`.
- **Generated IR Blank-Line Compaction Fast Path** - Final IR assembly now
  compacts generated blank lines using exact empty-string checks instead of
  trimming every emitted line. The 5k synthetic fixture emits exact empty blank
  lines and no whitespace-only blank lines; local `compactBlankLines` samples
  dropped from roughly ~13-16ms to ~2.5-6.3ms. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "blank-line compaction"`.
- **Default Function Attribute Group Fast Path** - Code generation now caches
  the default LLVM function attribute group id and returns it directly for
  unannotated functions instead of rebuilding and registering the same default
  attribute array for every emitted function. On the 5k synthetic fixture,
  selected-method profile samples for `getFunctionAttributeGroupId` dropped
  from roughly ~7.5-14.4ms to ~0.6-1.0ms. Reproduce with
  `bun test tests/FunctionAttributes.test.ts -t "cached default attribute"`.
- **Compiler-Side Top-Level IR Tree Shaking** - Optimized executable builds now
  omit unreachable ordinary top-level free functions before writing LLVM IR,
  while explicit `--emit llvm`, cached module builds, DWARF/debug builds,
  exports, struct/enum methods, globals, and top-level inline assembly stay
  conservative. On the 5k synthetic fixture, local O3 generated IR dropped from
  3,244,884 bytes and 5,002 functions to 3,854 bytes and 3 functions, with
  compile/link wall time dropping from ~6.25s to ~2.69s. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "tree-shakes"` and
  `bun test tests/CLI.test.ts -t "tree-shake optimized executable IR"`.
- **Generated Parser Flat Action Locations** - The checked-in Peggy parser now
  post-processes action-side `location()` calls to return BPL `SourceLocation`
  objects directly while preserving structured Peggy locations for syntax
  errors. On the 5k synthetic compile fixture, local O3 parsing dropped from
  ~1.72s to ~1.51s and total compile/link wall time from ~6.69s to ~6.09s.
  The generated helper path now also assumes those BPL-shaped locations during
  normal AST construction, reuses one parser file path value, and drops legacy
  Peggy-location compatibility branches from hot helper calls. On the current
  5k synthetic fixture, default LLVM emission parsing dropped from 1,829.55ms
  to 1,646.64ms and wall time from 4.60s to 4.27s; `build --time` wall time
  dropped from 4.63s to 4.43s.
  Reproduce with `bun test tests/Parser.test.ts` and `bpl --time` on the 5k
  synthetic benchmark.
- **Generated Parser Literal-Match Fast Path** - Peggy parser post-processing
  now rewrites fixed literal probes from allocating `substr` comparisons to
  allocation-free `startsWith` checks at `peg$currPos`, and the generated
  location helper now reuses the parser file-path constant while `makeLoc`
  stays a direct BPL `SourceLocation` pass-through. On the 5k synthetic
  fixture, parse-only samples moved from ~1.66-1.90s to ~1.04-1.29s, and
  normal `--time --emit llvm` parsing sampled at ~1.22-1.38s versus the
  earlier ~1.65s baseline. Reproduce with `bun test tests/Parser.test.ts -t
  "generated parser"` and `bpl --time --emit llvm` on the 5k synthetic
  benchmark.
- **Generated Parser Trivia Scanner** - The generated `_` rule now uses a
  manual whitespace/comment scanner instead of building arrays through Peggy's
  `Whitespace / Comment` productions. It preserves line comments, nested
  `/# #/` block comments, and documentation comment capture while avoiding
  repeated failed comment parses at every whitespace boundary. On the 5k
  synthetic fixture, parse-only samples improved from the post-literal
  ~1.04-1.29s range to ~0.72-1.08s, and normal `--time --emit llvm` parsing
  sampled at ~644ms. Reproduce with
  `bun test tests/Parser.test.ts tests/CompilerFrontendFastPath.test.ts` and
  `bpl --time --emit llvm` on the 5k synthetic benchmark.
- **Generated Parser Failure/Location Fast Paths** - Valid Peggy parses now
  skip detailed expected-token collection and retry once with full collection
  only when syntax parsing actually fails, preserving rich diagnostics without
  charging successful compiles for error-message arrays. BPL AST source
  locations now use a generated line-start table with a last-line cache instead
  of Peggy's generic position-detail object cache, while structured Peggy
  syntax-error locations stay on the original helper. On the 5k synthetic
  fixture, parse-only samples improved from the post-trivia baseline average
  of ~874ms to ~708ms, and normal `--time --emit llvm` parsing sampled at
  ~788ms versus the same-run ~899ms baseline. Reproduce with
  `bun test tests/Parser.test.ts` and `bpl --time --emit llvm` on the 5k
  synthetic benchmark.
- **Generated Parser Identifier Scanner** - The generated parser now replaces
  Peggy's identifier array-building loop and long `KeywordReserved`
  alternative chain with a direct ASCII identifier scanner plus an exact
  reserved-word set matching the grammar. Hot `Identifier` parses scan once,
  reject reserved names from the scanned token, and leave `IdentToken`
  available for qualified-name contexts. This preserves boundary behavior such
  as allowing `framex`, `defer`, and `void` as identifiers while rejecting
  reserved `Self` and `frame`. On the 5k synthetic fixture, parse-only samples
  improved from the post-location baseline average of ~909ms to ~568ms, normal
  `--time --emit llvm` parsing sampled as low as ~593ms versus the same-run
  ~798ms baseline, and the checked-in generated parser shrank by roughly 1k
  lines. Reproduce with `bun test tests/Parser.test.ts` and
  `bpl --time --emit llvm` on the 5k synthetic benchmark.
- **Generated Parser Empty Trivia Reuse** - The generated `_` trivia scanner
  now returns one shared empty result instead of allocating a fresh empty array
  for every whitespace/comment skip. Comment token capture and documentation
  extraction remain unchanged. On the 5k synthetic fixture, parse-only samples
  improved from the post-identifier baseline average of ~566ms to ~505ms,
  while normal `--time --emit llvm` parsing stayed in the same band at
  627.15ms versus 631.30ms baseline. Reproduce with
  `bun test tests/Parser.test.ts tests/CompilerFrontendFastPath.test.ts` and
  `bpl --time --emit llvm` on the 5k synthetic benchmark.
- **No-Import Module Detection Fast Path** - Single-file compilation now skips
  the expensive grammar lexer pass used only to detect imports when the source
  has no standalone `import` keyword. On the current 5k no-import synthetic
  fixture, the hidden import-detection lex pass measured ~195.50ms, and default
  LLVM emission wall time dropped from 4.27s to 3.91s. Reproduce with
  `bun test tests/CompilationRunner.test.ts` and `bpl --time` on the 5k
  synthetic benchmark.
- **Canonical Primitive Type Resolution Fast Path** - The type checker now
  returns already-canonical built-in basic types such as `i32` before symbol
  lookup and alias handling, while aliases such as `int` still canonicalize
  through the existing resolver. On the 5k synthetic type-check profile,
  instrumented `resolveType` time dropped from ~182.49ms to ~160.83ms and total
  checker time from ~333.22ms to ~318.92ms. Reproduce with
  `bun test tests/TypeChecker.test.ts -t "canonical primitive"`.
- **Simple Builtin Alias Resolution Fast Path** - The type checker now
  canonicalizes simple reserved builtin aliases such as `int`, `bool`, and
  `char` before scope lookup while preserving array-size validation and generic
  alias handling. On the 5k synthetic type-check profile, the hot `int` alias
  bucket dropped from roughly ~102.78ms to ~27.35ms and total instrumented
  checker time dropped from ~354.29ms to ~247.97ms. Reproduce with
  `bun test tests/TypeChecker.test.ts -t "simple builtin aliases"`.
- **Lazy Primitive Wrapper Prelude Loading** - The type checker now defers the
  implicit `std/primitives.bpl` wrapper import until a program actually names a
  wrapper type such as `Int` or calls a primitive wrapper method such as
  `42.toString()`. Programs that only use builtin aliases like `int` still get
  canonical primitive types without paying to parse and check wrapper methods,
  while wrapper use continues to load the prelude on demand. On the 5k
  synthetic type-check profile, the eager primitive import path previously
  accounted for roughly ~164.54ms of `checkImport` self time; after the lazy
  path, local samples type-checked in 244.34ms and 212.47ms with only
  `errors.bpl` and `intrinsics.bpl` loaded. Reproduce with
  `bun test tests/TypeChecker.test.ts -t "primitive wrapper"`.
- **Native Binary Tree Shaking Defaults** - Linux native builds now compile
  generated/runtime objects with `-ffunction-sections -fdata-sections`, link
  with `-Wl,--gc-sections`, and avoid `-rdynamic` by default so unused BPL
  functions are not kept as exported dynamic symbols. Pass
  `--clang-flag -rdynamic` to opt back into full native executable symbol
  visibility for stack-trace debugging. Reproduce with
  `bun test tests/Linker.test.ts tests/ModuleCache.test.ts`.
- **Compiler Throughput Fast Path** - The CLI now imports a checked-in Peggy
  parser instead of regenerating `grammar/bpl.peggy` per process, skips the
  separate token grammar pass unless emitting tokens, and links native builds
  through a cached `runtime.ll` object when clang can precompile it. Fresh local
  samples reduced hello-world compile wall time to ~0.82s and the 5k synthetic
  benchmark to ~4.37s. Reproduce with
  `bun test tests/Parser.test.ts tests/CompilerFrontendFastPath.test.ts tests/BinaryRunner.test.ts` and
  `bun benchmark/measure_compilation.ts`.
- **Stdlib C Extern Alias Cleanup** - Non-FFI examples that used pointer-typed
  `printf` aliases now import the canonical declaration from `std/c.bpl`.
  `tests/ExampleExterns.test.ts` also rejects `printf(fmt: *i8|*char, ...)`
  redeclarations outside FFI demos so new examples keep common C declarations
  centralized. Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "bug_106_escape_analysis|bug_107_codegen_missing_functions|variadic_homogeneous|collections/linked_list_example|collections/priority_queue_example|collections/queue_example"`.
- **Hosted Wasm Stdlib C Imports** - Hosted wasm examples now import
  `dprintf` and `putchar` from `std/c.bpl` instead of redeclaring those C
  output symbols locally. The example extern inventory rejects those
  redeclarations outside FFI demos, while hosted wasm argument hooks remain
  explicit runtime externs. Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "wasm_hosted_io|wasm_hosted_printf|wasm_hosted_transform" tests/WasmRuntime.test.ts -t "wasm_hosted_io|wasm_hosted_printf|wasm_hosted_transform"`.
- **Stdlib C Memory/String Imports** - Native and wasm memory examples now
  import `memcpy`, `memmove`, `memset`, `strlen`, `strncmp`, and `atoi` from
  `std/c.bpl` instead of redeclaring local aliases with alternate parameter
  names or `int` sizes. The extern inventory now catches those redeclarations
  outside FFI demos. Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "implicit_ctor|null_mem_test|wasm_memory_intrinsics|wasm_memory_strings" tests/WasmRuntime.test.ts -t "wasm_memory_intrinsics|wasm_memory_strings"`.
- **Stdlib C `sprintf` Imports** - bpl_db, tiki, and http_server example code
  now import string-buffer `sprintf` from `std/c.bpl` instead of redeclaring
  matching local externs. The example extern inventory rejects those aliases
  outside FFI demos. Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "bpl_db" && bun index.ts check examples/http_server/main.bpl examples/tiki/src/utils.bpl`.
- **Stdlib C `malloc` Alias Imports** - Integration-covered enum, match,
  operator-overloading, and systems examples no longer redeclare
  `malloc(size: ulong) ret *void`. Used declarations now import `malloc` from
  `std/c.bpl` with `long` allocation sizes, and unused declarations were
  removed. Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "enum_recursive$|enum_recursive_debug|enum_recursive_minimal|enum_guards_and_typematch|match_complex|operator_overloading_simple|operator_overloading_generic|language_showcase_systems"`.
- **Stdlib C `uint` Malloc Imports** - `constructor_destructor` and
  `null_handling` now import `malloc` from `std/c.bpl` instead of redeclaring
  `malloc(size: uint) ret string`, with explicit casts at allocation sites.
  Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "constructor_destructor|null_handling"`.
- **Stdlib C `free` Alias Imports** - bpl_db storage,
  `constructor_destructor`, and `generics_array_struct` now import `free` from
  `std/c.bpl` instead of redeclaring `free(ptr: string)`, with explicit
  `*void` casts at free sites. Reproduce with
  `bun test tests/ExampleExterns.test.ts tests/Integration.test.ts -t "bpl_db|constructor_destructor|generics_array_struct"`.
- **Debug IR CLI Output Path** - `bpl` and `bpl build` now accept
  `--debug-ir-path <file>` to write a diagnostic copy of generated LLVM IR
  without relying on `BPL_DEBUG_IR`. JSON-mode path-safety failures stay
  parseable on stdout and promote stable `BPL_CODEGEN_DEBUG_IR_*` diagnostics
  to top-level `errorCode` values. Reproduce with
  `bun test tests/CLIJsonParseability.test.ts -t "debug IR path diagnostics"`.
- **Debug IR Empty Path Diagnostics** - Explicit empty debug IR destinations
  from `--debug-ir-path`, `debugIrPath`, or `BPL_DEBUG_IR` now fail with
  `BPL_CODEGEN_DEBUG_IR_PATH_EMPTY` instead of silently disabling diagnostic IR
  output. `debugIrPath: false`, `BPL_DEBUG_IR=0`, and `BPL_DEBUG_IR=false`
  remain intentional disable paths. Reproduce with
  `bun test tests/CodeGenerator.test.ts -t "empty debug IR" tests/CLIJsonParseability.test.ts -t "empty debug IR path diagnostics"`.
- **Run/Dev Debug IR Parity** - `bpl run` and `bpl dev` now advertise
  `--debug-ir-path <file>` directly, matching `bpl` and `bpl build`. `bpl run`
  writes the requested diagnostic LLVM IR file while still executing the
  program. Reproduce with
  `bun test tests/CLI.test.ts -t "key subcommand help|run subcommand write diagnostic debug IR"`.
- **Package Version SemVer Validation** - Package manifests, lock entries,
  global versioned package directories, cache archive discovery, dependency
  version selectors, JSON schema validation, and package-cache
  `--package-version` filters now reject zero-padded semantic version segments
  such as `01.0.0`, keeping package resolution and cache lookup from
  normalizing invalid versions differently across subsystems. Reproduce with
  `bun test tests/PackageManager.test.ts tests/PackageResolver.test.ts tests/PackageManifestSchema.test.ts tests/PackageManagerCLI.test.ts tests/PackageJsonFailureContracts.test.ts -t "semantic versions|manifest identity fields are malformed|leading-zero semantic version|leading-zero global|invalid package-cache version filters|package-cache version filter"`.
- **Exact Package SemVer Comparison** - Package resolver global versioned
  directories, package-cache archive ordering, and dependency version ranges
  now compare semantic version segments with exact integer precision, avoiding
  JavaScript `Number` rounding for large segments such as
  `9007199254740993.0.0`. Reproduce with
  `bun test tests/PackageResolver.test.ts tests/PackageManager.test.ts -t "large global versioned|large dependency semver range"`.
- **Package Dependency Source Validation** - Package manifests now reject
  malformed dependency source strings such as `01.0.0`, `^01.0.0`, `>01.0.0`,
  and `>=1.0` before install, lockfile commands, or package import resolution
  can fall back to the newest cached package or accept an invalid installed
  package. The checked-in package manifest schema and resolver now mirror the
  same dependency source shapes for package names, exact versions, valid
  selectors, `latest`, `*`, and archive paths. Reproduce with
  `bun test tests/PackageManager.test.ts tests/PackageResolver.test.ts tests/PackageManifestSchema.test.ts -t "malformed dependency version selectors|object-map key and value|object maps with malformed values|valid package manifest dependency source"`.
- **Package Lock JSON Alias** - `bpl lock` now re-resolves `bpl.json`
  dependency selectors through the existing `bpl install --update` lockfile
  path, and `bpl lock --json` emits the same `package-install` payload with
  `update: true`. Malformed dependency sources now fail before `bpl_modules/`
  or `bpl.lock` are created by install/update/lock JSON commands. Reproduce
  with
  `bun test tests/PackageJsonFailureContracts.test.ts -t "malformed dependency source codes"`.
- **Package Install Manifest Preflight** - Default project installs now validate
  `bpl.json` before restoring packages from a non-empty `bpl.lock`, so malformed
  dependency sources cannot be hidden by stale lockfile entries. Reproduce with
  `bun test tests/PackageJsonFailureContracts.test.ts -t "before restoring non-empty lockfiles"`.
- **Package Install JSON Actions** - Successful project install JSON reports now
  include the existing project action details for `noop`, `installed`,
  `restored`, and `repaired` modes, instead of only reporting locked
  verification details. Reproduce with
  `bun test tests/CLIJsonParseability.test.ts tests/PackageManagerCLI.test.ts -t "package install JSON success stdout parseable|repair lockfiles from installed packages"`.
- **Package Cache Repair Revalidation** - `bpl package-cache repair` now
  extracts and validates archives with verified provenance before reporting
  them as `unchanged`, so older cached archives with manifests that fail current
  dependency source validation surface as `invalid-archive` issues instead of
  being trusted. Reproduce with
  `bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts -t "revalidate verified cached archives|valid verified cached archives|invalid verified cached manifest dependencies"`.
- **Shared Package Dependency Source Validation** - Package manager and package
  resolver dependency source checks now use the same shared package-name,
  semantic-version, selector, and archive-source helper to prevent drift between
  install-time and import-time manifest validation. Reproduce with
  `bun test tests/PackageDependencySource.test.ts tests/PackageManager.test.ts tests/PackageResolver.test.ts tests/PackageManifestSchema.test.ts -t "Package dependency source validation|malformed dependency version selectors|object maps with malformed values|valid package manifest dependency source|object-map key and value"`.
- **Package Exports Validation** - `bpl pack`, archive install,
  package-cache verification/repair, lockfile verification/repair,
  `bpl doctor packages`, `bpl list`, and `bpl list --tree` now validate every
  package manifest `exports` entry before publishing, replacing, recording,
  diagnosing, listing, or trusting a package. Package doctor validates both the
  current project package and installed packages.
  Missing exported files, exported directories, and symlinked exported paths
  are rejected with package diagnostics where archives can carry them, while
  valid exported `.bpl` and `.x` files are included in the packed archive and
  package hash surface.
- **Passive Package Bin Validation** - `bpl doctor packages`, `bpl list`, and
  `bpl list --tree` now validate package manifest `bin` targets while
  diagnosing or listing package health, so missing binary files, binary
  directories, and symlinked binary targets surface as `invalid-project-package`,
  `invalid-installed-package`, or `invalid bin` problems before pack/install
  paths are exercised. Reproduce with
  `bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts -t "invalid .* bin files"`.
- **Package Cache Bin Validation** - package-cache verify also validates
  manifest `bin` entries from extracted cached archives, and reports each
  invalid cached `bin` target as an `invalid-archive` issue in text and JSON
  flows. `package-cache repair refuses to regenerate provenance` for archives
  whose `bin` target files are missing, directories, or symlinks, matching
  package publish/install safety checks. Directory `bin` targets are covered
  through package-cache bin validation; symlinked binary archive members are
  covered through archive safety during package-cache verify and before
  provenance repair. Reproduce with
  `bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts -t "cached package.*bin files|symlinked cached package bin|package cache repair.*bin files|cached package bin files in verify"`.
- **CI Triage Package Cache Bin Repros** - `bun run ci:triage` now maps
  package-cache `invalid-archive` and cached `bin` archive failures to the
  focused package-cache CLI/API regression tests, including symlinked cached
  binary archive members.
- **Release Smoke Package Cache Bin JSON** - packed npm release smoke now
  builds cached archives with invalid `bin` targets and verifies
  `bpl package-cache verify --json` and `bpl package-cache repair --json`
  return parseable `invalid-archive` issues. The verify smoke keeps its
  provenance sidecar, while repair confirms it does not write one for a
  rejected archive.
- **CI Triage Packed Package Cache Bin Smoke** - `bun run ci:triage` now maps
  the packed package-cache bin invalid-archive release-smoke label to the
  focused ReleaseSmoke, release metadata, and package-cache bin regression
  commands instead of only the broad release-smoke helper list.
- **Package Lock Bin Validation** - lockfile verification validates installed
  package `bin` entries before trusting a lock entry, and `bpl install
  --repair-lock` now refuses to record an invalid installed package bin target.
  `bpl install --locked --json` and `bpl install --repair-lock --json` surface
  the invalid installed package bin as an `invalid-manifest` issue with stable
  lock verification metadata. Directory and symlinked installed package bin
  targets are explicitly covered by API regression tests. Reproduce with
  `bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts -t "installed package bin files during locked verification|installed package bin files when repairing lockfiles|installed package bin files during lockfile repair"`.
- **Package Lock Verification JSON Metadata** - `bpl install --locked --json`
  and `bpl install --repair-lock --json` compact verification issues now
  include verifier metadata such as `path`, `source`, expected/actual names,
  versions, hashes, `dependencyOf`, and `requestedSource` when available, so
  automation can diagnose lock drift without parsing formatted diagnostics.
- **Package Lock Verification Checked Counts** - lockfile verification now
  includes untracked `bpl_modules/` roots in `packagesChecked`, so API and
  `bpl install --locked --json` reports count every local package root inspected
  for lock drift instead of only entries already present in `bpl.lock`.
- **Package Lock Verification Drift Deduplication** - transitive dependency
  roots referenced from locked package manifests are no longer also reported as
  untracked `bpl_modules/` roots when they are invalid, so `issuesFound` and
  `packagesChecked` stay aligned with the dependency-drift diagnostic.
- **Package Lock Verification Duplicate Guard** - `bpl install --locked` now
  rejects duplicate installed package identities when an extra `bpl_modules/`
  directory declares the same manifest name as a locked package, or when
  multiple untracked directories declare the same package identity. JSON
  failures use `duplicate-installed-package` with deterministic `paths`
  metadata instead of repeated untracked-package entries.
- **Package Resolver Exports Allowlist** - Package import resolution now treats
  an installed package manifest's optional `exports` array as a subpath
  allowlist. Exported source files still support extensionless and directory
  `index.bpl`/`index.x` fallback imports, packages without `exports` keep the
  previous permissive subpath behavior, and hidden subpaths now report the
  stable `BPL_PACKAGE_SUBPATH_NOT_EXPORTED` diagnostic code.
- **Package Resolver Exported Candidate Filtering** - extensionless package
  subpath imports now restrict fallback probing to the source files listed by
  `exports`, so an unexported `.bpl` file or `index.bpl` cannot shadow an
  exported `.x` or `index.x` candidate.
- **Package Resolver Entrypoint Safety Parity** - package subpath imports now
  reject unsafe manifest `main` or legacy `entry` values before resolving
  exported subpaths, so a package with an invalid entrypoint cannot partially
  resolve through a safe-looking subpath.
- **Package Resolver Legacy Entry Safety Parity** - installed package manifests
  now reject unsafe legacy `entry` metadata even when a safe `main` field is
  present, matching package-manager manifest validation for every package
  import shape.
- **Package Resolver Manifest Diagnostic Ordering** - package import validation
  now reports `main` and legacy `entry` manifest failures before later
  `exports`, collection metadata, dependency, script, or `bin` field failures,
  matching the package manager's manifest validation order.
- **CI Triage Package Manifest Parity Repros** - `bun run ci:triage` now maps
  package resolver legacy-entry and manifest diagnostic-ordering regressions to
  `bun test tests/PackageResolver.test.ts -t "legacy entry|metadata failures before later manifest fields"`.
- **CLI JSON Legacy Entry Parity Coverage** - JSON-mode package import
  diagnostics now have end-to-end coverage for unsafe legacy `entry` metadata
  when `main` is safe, keeping `BPL_PACKAGE_ENTRYPOINT_UNSAFE` stable above the
  direct resolver tests.
- **CI Triage Exported Package Candidate Repros** - `bun run ci:triage` now
  maps exported package subpath fallback regressions to
  `bun test tests/PackageResolver.test.ts -t "exported candidates"`.
- **Package Resolver Exports Validation** - Package import resolution now
  rejects installed package manifests whose optional `exports` field is not an
  array of safe package-relative paths, matching PackageManager manifest loading
  before the resolver uses the package entrypoint.
- **Package Resolver Object Map Validation** - Package import resolution now
  rejects installed package manifests whose `dependencies`, `devDependencies`,
  `scripts`, or `bin` maps have malformed shapes, keys, or non-empty string
  values, matching PackageManager manifest loading before the resolver uses the
  package entrypoint.
- **Package Resolver Collection Metadata Validation** - Package import
  resolution now rejects installed package manifests whose optional `keywords`
  or `repository` metadata has malformed shapes, including repository metadata
  whose `type` is not `git`, matching PackageManager manifest loading before
  the resolver uses the package entrypoint.
- **Package Resolver Metadata Validation** - Package import resolution now
  rejects installed package manifests whose optional string metadata fields
  (`$schema`, `description`, `author`, or `license`) are present with non-string
  values, matching PackageManager manifest loading before the resolver uses the
  package entrypoint.
- **Generated Package Manifest Schema URI** - `bpl init` and `bpl new` now
  write the canonical `bpl-package.schema.json` `$schema` URI into generated
  manifests, and PackageManager manifest loading validates `$schema` as a
  string when present. Schema tests now validate tracked package manifests and
  generated init/new manifests against the checked-in package schema.
- **Package Manifest Schema Runtime Alignment** - `bpl-package.schema.json`
  now mirrors PackageManager validation for `main`, `entry`, `exports`,
  dependency maps, script maps, and `bin` command/path maps so editors and CI
  schema checks reject the same unsafe paths, blank map values, and invalid map
  keys that runtime manifest loading already rejects.
- **Package Manifest Repository Schema Parity** - `bpl-package.schema.json`
  now requires both `repository.type` and `repository.url` whenever repository
  metadata is present, and PackageManager/package resolver runtime validation
  now requires `repository.type` to be `git`, matching the schema before
  install, pack, or import resolution.
- **Packed Package Manifest Schema** - npm package payloads now include
  `bpl-package.schema.json`, and release smoke checks require it, so installed
  packages ship the same manifest schema referenced by generated `bpl.json`
  files and documentation.
- **Packed Package Manifest JSON Error-Code Smoke** - packed npm release smoke
  now table-drives the non-symlink package manifest validation cases through
  installed `bpl install --json`, covering missing, directory, malformed JSON,
  non-object, metadata, entrypoint, export, keyword, repository, dependency,
  script, and bin manifest failures with their stable `BPL_PACKAGE_MANIFEST_*`
  codes.
- **CI Triage Packed Package Manifest Smoke Repros** - `bun run ci:triage`
  now maps packed package manifest validation release-smoke labels and payload
  failures to the focused ReleaseSmoke, ReleaseMetadata, and
  PackageJsonFailureContracts commands before falling back to broad release
  smoke helpers.
- **Release Metadata Manifest Smoke Drift Guard** - ReleaseMetadata now derives
  the packed package manifest validation smoke expectations from
  `PACKAGE_MANIFEST_JSON_ERROR_CODES`, excluding only the symlink case that
  remains covered by unit JSON contracts because release-smoke symlink creation
  is OS-sensitive.
- **Package Manifest Null Map Validation** - `bpl install --json` and
  PackageManager manifest loading now reject `null` `dependencies`,
  `devDependencies`, `scripts`, and `bin` fields with the existing stable
  `BPL_PACKAGE_MANIFEST_*_INVALID` error codes instead of treating them as
  absent object maps.
- **Duplicate Symbol Diagnostic Code** - Duplicate top-level non-function
  declarations now fail before symbol-table overwrite with
  `BPL_SYMBOL_ALREADY_DEFINED` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. Duplicate
  same-signature function overloads, duplicate function parameters, and
  duplicate generic parameters now use the same stable code. Duplicate struct
  fields and duplicate enum variants are covered by the same code in compiler
  errors and CLI JSON diagnostics.
- **Recursive Type-Cycle Diagnostic Code** - Recursive struct field cycles,
  recursive enum variant cycles, self-inheritance, and circular inheritance now
  report `BPL_TYPE_RECURSION_CYCLE` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry.
- **Generic Arity Diagnostic Code** - Generic type and type-alias
  argument-count mismatches now report `BPL_GENERIC_ARITY_MISMATCH` in compiler
  errors, `bpl check --json`, `bpl build --json`, and the public CLI JSON
  error-code registry.
- **Undefined Type Diagnostic Code** - Unresolved type names in variable
  declarations and struct fields now report `BPL_TYPE_NOT_FOUND` in compiler
  errors, `bpl check --json`, `bpl build --json`, and the public CLI JSON
  error-code registry.
- **Undefined Symbol Diagnostic Code** - Unresolved value identifiers and
  missing callee identifiers now report `BPL_SYMBOL_NOT_FOUND` in compiler
  errors, `bpl check --json`, `bpl build --json`, and the public CLI JSON
  error-code registry while preserving existing did-you-mean hints.
- **Invalid Bare Void Diagnostic Code** - Bare `void` in value-bearing type
  positions now reports `BPL_VOID_TYPE_INVALID` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. The diagnostic covers variable declarations, parameters, struct
  fields, and generic type arguments while keeping `ret void` and `*void`
  valid.
- **Built-In Type Redefinition Diagnostic Code** - Type aliases, structs,
  enums, and specs named after reserved primitive types now report
  `BPL_BUILTIN_TYPE_REDEFINITION` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. The guard
  stays narrow enough for standard-library wrapper structs such as `Long`.
- **Invalid Fixed Array Size Diagnostic Code** - Zero-sized fixed arrays now
  report `BPL_ARRAY_SIZE_INVALID` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. Dynamic
  slices such as `int[]` and positive fixed arrays remain valid.
- **Return Type Mismatch Diagnostic Code** - Mismatched return expressions and
  `return;` in non-void functions now report `BPL_RETURN_TYPE_MISMATCH` in
  compiler errors, `bpl check --json`, `bpl build --json`, and the public CLI
  JSON error-code registry. Valid returns remain valid; integer literal returns
  that fit the declared type remain valid.
- **Assignment Type Mismatch Diagnostic Code** - Direct assignment statements
  with incompatible value types now report `BPL_ASSIGNMENT_TYPE_MISMATCH` in
  compiler errors, `bpl check --json`, `bpl build --json`, and the public CLI
  JSON error-code registry. The update is scoped: variable initializer
  mismatches keep the legacy `E001` code for compatibility.
- **Condition Type Mismatch Diagnostic Code** - Non-boolean `if`, `loop`, and
  ternary conditions now report `BPL_CONDITION_TYPE_MISMATCH` in compiler
  errors, `bpl check --json`, `bpl build --json`, and the public CLI JSON
  error-code registry. Valid boolean conditions remain accepted.
- **Ternary Branch Type Mismatch Diagnostic Code** - Ternary expressions with
  incompatible branch types now report `BPL_TERNARY_BRANCH_TYPE_MISMATCH` in
  compiler errors, `bpl check --json`, `bpl build --json`, and the public CLI
  JSON error-code registry. Compatible branch types remain accepted.
- **Switch Mismatch Diagnostic Codes** - Invalid switch value types now report
  `BPL_SWITCH_VALUE_TYPE_MISMATCH`, and incompatible case pattern types now
  report `BPL_SWITCH_CASE_TYPE_MISMATCH`, in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid integer and string switches remain accepted.
- **Stale Package Lock CI Triage** - `bun run ci:triage` now maps
  `stale-lock-entry` and `lockVerificationKind: "missing-package"` package
  doctor failures to focused stale lock repro commands:
  `bun test tests/PackageManagerCLI.test.ts -t "stale lock entries"`,
  `bun test tests/PackageManager.test.ts -t "stale lock entries"`, and
  `bun index.ts doctor packages --json`.
- **Untracked Package Lock Verification** - `bpl install --locked` and
  `bpl doctor packages --json` now report `untracked-package` when a valid
  installed package is importable from `bpl_modules` but missing from
  `bpl.lock`, and `invalid-manifest` when an untracked package directory has
  invalid package metadata. Unsafe untracked package roots now report
  `invalid-package-root` instead of being skipped. CI triage maps the
  `untracked-package` lock verification kind to focused repro commands:
  `bun test tests/PackageManagerCLI.test.ts -t "lock verification drift"`,
  `bun test tests/PackageManager.test.ts -t "missing from bpl.lock"`, and
  `bun index.ts doctor packages --json`.
- **Duplicate Package CI Triage** - `bun run ci:triage` now maps
  `duplicate-installed-package` and `BPL_PACKAGE_DUPLICATE_INSTALLED` failures
  to duplicate locked-package and duplicate untracked-package repro patterns in
  both package manager CLI and API tests.
- **Package Doctor Duplicate Paths** - `bpl doctor packages --json` duplicate
  installed package issues now preserve the legacy joined `path` string and
  include a `paths` array with every conflicting installed directory, matching
  the package list JSON duplicate payload.
- **Package Doctor Lock Duplicate Paths** - doctor lock verification duplicate
  issues now preserve the verifier `paths` array alongside
  `lockVerificationKind: "duplicate-installed-package"`, so tooling does not
  need to split the compatibility `path` string.
- **Package Doctor Duplicate Deduplication** - `bpl doctor packages --json`
  now emits one duplicate installed-package issue per conflicting path set when
  lock verification and installed-package scanning find the same duplicate,
  preserving the lock-verification issue and its stable code metadata.
- **Package Doctor Cache Provenance Paths** - `bpl doctor packages --json`
  package-cache warning issues now include `provenancePath` when a missing,
  malformed, or unsafe provenance sidecar is involved, matching the nested
  package-cache verification issue payload.
- **Package Doctor Cache Identity** - `bpl doctor packages --json`
  package-cache warning issues now include `packageName` and `version`, so
  automation can group cache provenance warnings without parsing messages or
  repair hints.
- **Package Lock Repair Duplicate Paths** - `bpl install --repair-lock --json`
  duplicate installed package verification failures now include a `paths` array
  with every conflicting installed directory.
- **Package Lock Repair Duplicate Guard** - `bpl install --repair-lock` now
  refuses duplicate installed package names before rewriting `bpl.lock`.
  JSON-mode failures use `BPL_PACKAGE_LOCK_VERIFY_FAILED` with
  `action: "verification-failed"` and
  `issueKinds: ["duplicate-installed-package"]`, matching the existing locked
  verification contract.
- **Package Tree Duplicate Diagnostics** - `bpl list --tree` now rejects
  duplicate installed package names before selecting tree roots, and
  `bpl list --tree --json` reports
  `errorCode: "BPL_PACKAGE_DUPLICATE_INSTALLED"` with `issuesFound`,
  `issueKinds`, and compact `duplicate-installed-package` issue entries.
- **Package List Duplicate Diagnostics** - `bpl list --json` now rejects
  duplicate installed package names with the same
  `BPL_PACKAGE_DUPLICATE_INSTALLED`, `issuesFound`, `issueKinds`, and compact
  `duplicate-installed-package` issue payload used by tree listing. Duplicate
  issue payloads now retain the compatibility `path` string and include a
  `paths` array with every conflicting installed directory in deterministic
  order.
- **Package List JSON Code Inventory** - Package list and tree JSON failure
  codes now have an exported `PACKAGE_LIST_JSON_ERROR_CODES` inventory covering
  package search-directory validation failures and
  `BPL_PACKAGE_DUPLICATE_INSTALLED`. The same codes are available through the
  public `CLI_JSON_ERROR_CODE_LISTS` `package-list` entry. The inventory is
  guarded by
  `bun test tests/PackageJsonFailureContracts.test.ts -t "error-code lists"`.
- **Call-Site Mismatch Diagnostic Codes** - Non-callable targets now report
  `BPL_CALL_TARGET_NOT_CALLABLE`, function and first-class callable argument
  count and type mismatches now report `BPL_CALL_ARGUMENT_COUNT_MISMATCH` and
  `BPL_CALL_ARGUMENT_TYPE_MISMATCH`, and enum variant constructor argument
  count and type mismatches now report
  `BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH` and
  `BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid function, lambda, callable object, and enum variant calls
  remain accepted.
- **Control-Flow Misuse Diagnostic Codes** - `break` outside loops/switches,
  `continue` outside loops, `fallthrough` outside switches, and returning a
  value from a defer block now report `BPL_BREAK_OUTSIDE_CONTEXT`,
  `BPL_CONTINUE_OUTSIDE_LOOP`, `BPL_FALLTHROUGH_OUTSIDE_SWITCH`, and
  `BPL_DEFER_RETURN_VALUE_INVALID` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. Valid loop
  `break`, loop `continue`, switch `fallthrough`, and bare `return;` from defer
  blocks remain accepted.
- **Binary Operator Misuse Diagnostic Codes** - Unsupported string
  concatenation, invalid logical/comparison/bitwise/modulo operands,
  incompatible binary/arithmetic operands, void pointer arithmetic, and
  incompatible pointer subtraction now report `BPL_POINTER_ARITHMETIC_VOID`,
  `BPL_POINTER_DIFFERENCE_TYPE_MISMATCH`, `BPL_STRING_CONCAT_UNSUPPORTED`,
  `BPL_LOGICAL_OPERAND_TYPE_MISMATCH`, `BPL_COMPARISON_TYPE_MISMATCH`,
  `BPL_BITWISE_OPERAND_TYPE_MISMATCH`, `BPL_MODULO_OPERAND_TYPE_MISMATCH`,
  `BPL_BINARY_OPERAND_TYPE_MISMATCH`, and
  `BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid numeric, boolean, integer, pointer, and pointer-difference
  operators remain accepted.
- **Unary Operator Misuse Diagnostic Codes** - Invalid dereference targets,
  non-boolean logical-not operands, non-integer bitwise-not operands,
  non-numeric negation operands, and unsupported primitive unary plus now
  report `BPL_DEREFERENCE_TARGET_INVALID`,
  `BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH`,
  `BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH`,
  `BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH`, and
  `BPL_UNARY_PLUS_UNSUPPORTED` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. Valid
  pointer dereference, logical-not, bitwise-not, and numeric negation forms
  remain accepted; primitive unary plus remains rejected as a no-op.
- **Index Expression Misuse Diagnostic Codes** - Array index type mismatches,
  pointer index type mismatches, and indexing non-indexable targets now report
  `BPL_ARRAY_INDEX_TYPE_MISMATCH`, `BPL_POINTER_INDEX_TYPE_MISMATCH`, and
  `BPL_INDEX_TARGET_NOT_INDEXABLE` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. Valid
  array, pointer, alias-pointer, and `__get__` indexing remain accepted.
- **Member Access Misuse Diagnostic Codes** - Missing static members,
  incompatible instance method access, invalid tuple indices, and missing
  concrete-type members now report `BPL_STATIC_MEMBER_NOT_FOUND`,
  `BPL_INSTANCE_METHOD_NOT_COMPATIBLE`, `BPL_TUPLE_INDEX_INVALID`, and
  `BPL_MEMBER_NOT_FOUND` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry. Valid
  field, instance method, static method, tuple, and imported primitive-wrapper
  member access remain accepted.
- **Expression Semantic Guard Diagnostic Codes** - Compile-time
  division/modulo by zero, invalid constant shifts, address-of misuse, array
  literal element mismatches, invalid casts, and `sizeof(void)` now report
  `BPL_DIVISION_BY_ZERO`, `BPL_SHIFT_COUNT_INVALID`,
  `BPL_ADDRESS_OF_CONSTANT`, `BPL_ADDRESS_OF_TARGET_INVALID`,
  `BPL_ARRAY_LITERAL_TYPE_MISMATCH`, `BPL_CAST_INTEGER_TO_STRING`,
  `BPL_CAST_INVALID`, and `BPL_SIZEOF_VOID_INVALID` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid division/modulo, in-range shifts, mutable lvalue address-of,
  homogeneous array literals, allowed casts, and non-void `sizeof` remain
  accepted.
- **Statement Semantic Guard Diagnostic Codes** - Missing local type
  annotations, duplicate local declarations, integer literal overflow, const
  assignment, invalid assignment targets, and invalid tuple destructuring
  targets now report `BPL_VARIABLE_TYPE_ANNOTATION_MISSING`,
  `BPL_VARIABLE_REDECLARATION`, `BPL_INTEGER_LITERAL_OVERFLOW`,
  `BPL_ASSIGNMENT_TARGET_CONSTANT`, `BPL_ASSIGNMENT_TARGET_INVALID`, and
  `BPL_TUPLE_DESTRUCTURE_TARGET_INVALID` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid typed locals, unique declarations, in-range integer literals,
  mutable assignments, valid assignment targets, and valid tuple destructuring
  remain accepted.
- **Struct Literal Diagnostic Codes** - Unknown struct names, generic arity
  mismatches, missing fields, unknown fields, and field type mismatches in
  struct literals now report `BPL_STRUCT_LITERAL_UNKNOWN_STRUCT`,
  `BPL_GENERIC_ARITY_MISMATCH`, `BPL_STRUCT_LITERAL_FIELD_MISSING`,
  `BPL_STRUCT_LITERAL_FIELD_UNKNOWN`, and
  `BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid concrete and generic struct literals remain accepted.
- **Enum Variant Field Diagnostic Codes** - Unknown enum struct variant
  construction fields, unknown enum struct pattern fields, and enum struct
  variant field type mismatches now report `BPL_ENUM_VARIANT_FIELD_UNKNOWN`
  and `BPL_ENUM_VARIANT_FIELD_TYPE_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Valid enum struct variant construction and pattern matching remain
  accepted.
- **Intrinsic Call Diagnostic Codes** - Missing or extra `__type_id`/
  `__type_info` generic type arguments and forbidden value arguments now report
  `BPL_INTRINSIC_GENERIC_ARITY_MISMATCH` and
  `BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. The diagnostics now include usage hints instead of empty hints.
- **Match Exhaustiveness Diagnostic Code** - Missing enum variants and missing
  default cases for non-enum matches now report
  `BPL_MATCH_EXHAUSTIVENESS_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry. Non-enum tuple matches remain accepted when unguarded patterns
  provide provable finite coverage, such as boolean tuple partitions.
- **Tuple Match Pattern Diagnostic Codes** - Tuple patterns used on non-tuple
  values and tuple pattern element-count mismatches now report
  `BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH` and
  `BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH` in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry.
- **Type-Query Diagnostic Codes** - Unresolved `match<T>(value)` enum paths,
  unresolved `match<T>(value)` plain types, and unresolved `expr is T` targets
  now report `BPL_TYPE_QUERY_ENUM_NOT_FOUND` and
  `BPL_TYPE_QUERY_TYPE_NOT_FOUND` in compiler errors, `bpl check --json`,
  `bpl build --json`, and the public CLI JSON error-code registry.
- **Function-Attribute Diagnostic Codes** - Unknown attributes, duplicate
  attributes, conflicting attributes, invalid `noreturn` return types, and
  invalid `auto_destroy` method shapes now report
  `BPL_FUNCTION_ATTRIBUTE_UNKNOWN`, `BPL_FUNCTION_ATTRIBUTE_DUPLICATE`,
  `BPL_FUNCTION_ATTRIBUTE_CONFLICT`,
  `BPL_FUNCTION_ATTRIBUTE_NORETURN_RETURN_TYPE_MISMATCH`, and the
  `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_*` codes in compiler errors,
  `bpl check --json`, `bpl build --json`, and the public CLI JSON error-code
  registry.
- **Missing Export Diagnostic Code** - Named imports that resolve a module but
  request a non-exported symbol now carry `BPL_IMPORT_EXPORT_NOT_FOUND` through
  compiler errors, `bpl check --json`, `bpl build --json`, and the public
  CLI JSON error-code registry. When the imported module's export list is
  known, the diagnostic hint includes sorted available exports.
- **Stdlib Package Collision Docs** - Import and package docs now spell out
  that bare imports matching standard-library module basenames resolve to the
  standard library before package lookup, so packages named like `math` should
  use non-stdlib names such as `math-extra`.
- **CI Triage Offline Fixture Diagnostics** - `bun run ci:triage -- --jobs-json`
  now reports stable usage errors for missing, malformed, and wrong-shape
  offline GitHub jobs fixtures instead of raw filesystem or JSON parser output.
- **Packed CI Triage Jobs JSON Smoke** - `tests/ReleaseHelperSmoke.test.ts`
  now verifies installed-package `ci:triage --jobs-json` diagnostics for
  missing and malformed offline fixture files without running full release
  smoke.
- **Playground CI Triage Text Guard** - Offline `ci:triage --jobs-json` tests
  now assert text output for playground backend/native execution failures lists
  the focused native execution, process runner, playground example, tutorial
  example, and check repro commands.
- **CI-Safe Jobs JSON Discovery Guard** - CI-safe runner tests now assert
  `tests/CiTriage.test.ts` remains in discovered unit-test coverage, and docs
  show the focused offline jobs-json diagnostic command next to `test:ci`
  guidance.
- **CI Triage Repository Validation** - Invalid `bun run ci:triage -- --repo`
  values now fail as usage errors before any GitHub API request, with a stable
  `Expected --repo as owner/name` diagnostic.
- **Packed CI Triage Repo Validation Smoke** - `tests/ReleaseHelperSmoke.test.ts`
  now verifies installed-package `ci:triage --repo bad` reports the same usage
  diagnostic without running full release smoke.
- **CI Triage Usage Output Guard** - Focused `ci:triage` validation tests now
  assert missing option values, unknown options, invalid repositories, and
  offline jobs-json failures keep stdout empty and avoid GitHub API wording.
- **CI Triage Inline Options** - `bun run ci:triage` now accepts
  `--repo=owner/repo`, `--jobs-json=path`, and `--run=id` while rejecting
  malformed flag values such as `--json=true` before any GitHub API request.
- **Packed CI Triage Inline Smoke** - Release helper smoke now exercises the
  installed-package `ci:triage` helper with inline option values and malformed
  inline usage diagnostics.
- **CI Triage Run Locator Validation** - `bun run ci:triage` now reports
  malformed run IDs, malformed URLs, non-GitHub URLs, non-actions URLs, and
  invalid job URL IDs as status-2 usage errors before any GitHub API request.
- **Packed CI Triage Run Locator Smoke** -
  `tests/ReleaseHelperSmoke.test.ts` now verifies installed-package
  `ci:triage` run locator usage diagnostics without running full release smoke.
- **CI-Safe Run Locator Discovery Guard** - CI-safe runner tests now assert
  `tests/CiTriage.test.ts` still contains the run-locator usage diagnostic
  regression while remaining part of discovered CI-safe unit coverage.
- **Release Manifest Usage Diagnostics** - `bun tools/release_manifest.ts`
  now reports unknown options and missing `--out`/`--repo-root` values as
  status-2 usage errors before running release manifest or npm pack work.
- **Release Manifest Inline Options** - `bun tools/release_manifest.ts` now
  accepts `--out=file` and `--repo-root=dir`, while rejecting `--out=`,
  `--repo-root=`, and `--pack-npm=true` before release work starts.
- **Helper CLI Inline Value Docs** - README and release/correctness docs now
  show inline helper option forms and focused tests for malformed inline usage
  diagnostics.
- **CI-Safe Runner Inline Diagnostics** - `bun tools/test_ci.ts` now rejects
  malformed flag values such as `--json=true`, `--list=true`,
  `--dry-run=true`, and `--help=true` as status-2 usage errors before planning
  or running the CI-safe suite.
- **Packed Test CI Helper Smoke** - Release helper smoke now exercises the
  installed-package `test:ci` helper for `--help`, `--list`, `--json`, and
  malformed inline flag values without requiring a source-checkout `tests/`
  directory.
- **CLI Registry Shim Usage Diagnostics** - `bun tools/cli_json_registry_shim.ts`
  now supports `--help`, verifies the `release:cli-registry` package script,
  and rejects malformed inline values such as `--check=true` and
  `--write=true` with stable status-2 diagnostics.
- **Playground Timeout Test Stability** - The native execution timeout test now
  leaves enough scheduling headroom for stdout capture under the broad
  CI-safe suite while still validating the configured timeout message.
- **Global Versioned Package Casing Guard** - Package import resolution now
  rejects global versioned package directories whose package-name prefix only
  differs by filesystem casing, instead of falling back to lower-priority
  package roots.
- **ModuleResolver Package Lookup Injection** - Module resolution can now use
  explicit package-manager directories for deterministic diagnostics in tests
  and embedded compiler hosts while preserving the default CLI package paths.
- **Package Casing CI Triage** - `bun run ci:triage` now maps package import
  casing diagnostics to focused PackageResolver, ModuleResolver, JSON
  diagnostics, and type-check repro commands.
- **Release Manifest Help** - `bun tools/release_manifest.ts --help` now
  prints usage without writing release artifacts or running `npm pack`, and
  tests cover flag-looking values after `--out` and `--repo-root`.
- **CI-Safe Runner Usage Streams** - `bun tools/test_ci.ts` now keeps `--help`
  on stdout while reporting unknown-option usage failures on stderr with empty
  stdout.
- **Release Manifest Payload Guard** - Release metadata tests now explicitly
  assert the `release_manifest` help path stays within the narrow packed-helper
  dependency policy instead of pulling broad compiler sources into the package.
- **Fuzz Repro Usage Validation Hardening** - `bun run fuzz:repro` now rejects
  flag values, empty option values, and mixed positional/`--input` artifact
  paths as status-2 usage errors before artifact discovery, with packed
  release-helper smoke coverage for the same diagnostics.
- **Fuzz Script Wrapper Usage Validation** - Packed `fuzz` script wrappers now
  reject malformed boolean values and empty required option values before
  source-checkout delegation, keeping package-script failures classified as
  usage errors.
- **Release Helper CLI Registry Triage Smoke** - `tests/ReleaseHelperSmoke.test.ts`
  now runs the packed `ci:triage` helper against an offline release registry
  failure fixture and asserts it prints only `bun run release:cli-registry`,
  keeping the focused guidance available without broadening full release smoke.
- **CI-Safe Test Runner** - `bun run test:ci` now delegates to
  `tools/test_ci.ts`, a typed runner that owns runtime-build, integration,
  playground, VS Code extension, generated CLI registry shim, and CI-safe
  unit-test ordering. Use `bun tools/test_ci.ts --list`, `--dry-run`, or
  `--json` to inspect the versioned plan without running the suite; correctness
  corpora, long fuzz, sanitizer runtime, golden LLVM shape, and full release
  smoke suites remain in their dedicated scripts.
- **Bindgen JSON Validation Code List** - `bpl bindgen <header> --json`
  validation codes now expose a shared constant list, and MarkdownDocs checks
  the bindgen JSON documentation contract against that list.
- **Docs JSON Validation Code List** - `bpl docs <file> --json` validation
  codes now expose a shared constant list, and MarkdownDocs checks the
  documentation contract against that list.
- **Format JSON Validation Constants** - `bpl format --check --json` validation
  codes now use exported implementation constants, and MarkdownDocs checks the
  documented format JSON contract against that shared list.
- **Command JSON Validation Drift Guard** - Markdown docs now compare
  command-level JSON validation codes for completion, doctor, wasm linker, and
  sanitizer reports against exported implementation constants instead of relying
  on literal-only documentation checks.
- **Package Resolver Fuzz Seeds** - Added deterministic package import seed
  coverage for empty, `.`, `..`, backslash-separated, symlink-looking, and
  mixed-extension subpath shapes. Focused repro:
  `bun test tests/PackageResolver.test.ts -t "deterministic" && bun test tests/CLIJsonParseability.test.ts -t "seeded package import path"`.
- **Version JSON Contract** - `bpl --version --json` and
  `bpl --json --version` now emit a stable `version` report with
  `schemaVersion`, `check`, `success`, and `version` fields. Focused repro:
  `bun test tests/CLIJsonParseability.test.ts -t "version JSON"`.
- **Hosted Wasm Regression Example** - Added `examples/wasm_hosted_transform`
  to exercise argv, stdout/stderr, stdlib `String`, enum matching, generics, and
  lambda capture through both native integration tests and hosted wasm runtime
  execution.
- **Fuzz Artifact Repro Helper** - Added `bun run fuzz:repro -- <artifact-path>`
  to turn downloaded scheduled fuzz crash artifacts into deterministic local
  replay, minimization, seed rerun, and regression promotion commands.
- **Fuzz Repro Usage Errors** - `bun run fuzz:repro` now reports malformed CLI
  usage such as missing option values with a usage-error exit before artifact
  discovery.
- **Fuzz Repro Unknown Options** - `bun run fuzz:repro` now rejects unknown
  options instead of accepting and ignoring them.
- **Fuzz Helper Usage Errors** - `bun run fuzz:replay`,
  `bun run fuzz:promote`, and `bun fuzz/run_fuzz.ts` now reject malformed CLI
  usage such as unknown options, missing option values, and extra positional
  arguments with usage-error exits before replay, promotion, or campaign work.
- **Packed Fuzz Script Wrappers** - npm package fuzz scripts now route through
  a shipped wrapper that validates malformed usage in packed installs before
  delegating to source-tree fuzz helpers when repository sources are present.
- **Hosted Wasm Printf Formatting** - Hosted WebAssembly `printf`, `fprintf`,
  and `dprintf` now format the documented `%s`, `%d`, `%c`, and `%%` subset, with
  a native-compatible `examples/wasm_hosted_printf` regression and explicit
  coverage for null strings, integer extremes, dangling `%`, and unsupported
  specifiers.
- **Hosted Wasm Import Contract** - Added regression coverage that keeps the
  hosted wasm runtime declarations, browser playground adapter, and wasm runtime
  test host aligned on the required `env.__bpl_host_*` imports.
- **Release Helper Script Coverage** - Release smoke now discovers package
  scripts that call `tools/*.ts`, packs the referenced helper tools, and
  records release-manifest checksums for those helper tools. It also exercises
  the packed `fuzz:repro` helper so script entrypoints do not drift from shipped
  files.
- **Agent Board Workflow Docs** - Documented the BPL Agent Board as the
  credential-free source of truth for active task tracking, criteria, review
  state, and verification evidence.
- **CI Triage Helper** - Added `bun run ci:triage -- <actions-run-url>` to
  summarize failed GitHub Actions jobs and print local reproduction commands
  without requiring GitHub admin access. The helper now also supports offline
  `--help` output for packed-package smoke checks.
- **CI Triage Option Validation** - `bun run ci:triage` now reports missing
  `--repo` and `--run` option values as usage errors before attempting any
  GitHub API request.
- **Playground Helper Source-Only Release Guard** - Release metadata now keeps
  local playground backend helpers such as
  `playground/backend/processRunner.ts`,
  `playground/backend/nativeExecution.ts`, and
  `playground/backend/wasmToolchain.ts` present in source while excluding them
  from packed npm payloads.
- **CI Triage Unknown Options** - `bun run ci:triage` now rejects unknown flags
  and extra positional arguments instead of treating them as malformed run URLs.
- **Release Smoke CI Triage Coverage** - Release smoke now checks the packed
  npm CLI's `ci:triage` usage-error path so helper argument validation stays
  covered after packaging.
- **Packed CI Triage Timeout Contracts** - Release helper smoke now checks that
  packed `ci:triage` JSON keeps package tooling, package IR verification, and
  object symbol timeout repro commands available after npm packaging.
- **Packed CI Triage Sanitizer Contracts** - Release helper smoke now checks
  that packed `ci:triage` JSON keeps sanitizer runtime repro commands available
  after npm packaging.
- **Completion Target Drift Guard** - Shell completion target triples now come
  from a shared list that is compiled to LLVM metadata in tests, so advertised
  target suggestions cannot drift away from CodeGenerator support.
- **Packed Target Validation Smoke** - Release smoke now checks that packed
  `bpl build --json --target mips64-unknown-bpl` preserves
  `BPL_BUILD_UNSUPPORTED_TARGET`, and CI triage maps that code to local build
  validation repro commands.
- **Packed Package Import Diagnostic Smoke** - Release smoke now checks that
  the packed npm CLI preserves package/import JSON diagnostic codes such as
  `BPL_PACKAGE_MANIFEST_MISSING`, with a focused metadata repro command for the
  smoke contract.
- **Package Manifest JSON Codes** - `bpl install --json` now includes stable
  PackageManager manifest-loading `BPL_PACKAGE_MANIFEST_*` `errorCode` values
  for missing, symlinked, non-file, malformed, invalid-shape, and invalid-field
  `bpl.json` failures.
- **Packed Package Manifest JSON Smoke** - Release smoke now checks that the
  packed npm CLI preserves PackageManager manifest `errorCode` values such as
  `BPL_PACKAGE_MANIFEST_MISSING` and `BPL_PACKAGE_MANIFEST_MAIN_INVALID`.
- **Package-cache Validation JSON Codes** - `bpl package-cache clean --json`
  and `bpl package-cache repair --json` now include
  `BPL_PACKAGE_CACHE_VERSION_INVALID` for invalid `--package-version` filters.
- **Packed Package-cache Validation JSON Smoke** - Release smoke now checks
  packed `bpl package-cache clean --json` and `bpl package-cache repair --json`
  invalid-version failures preserve `BPL_PACKAGE_CACHE_VERSION_INVALID`.
- **Doctor Scope JSON Code** - Unknown doctor scopes now include stable
  `BPL_DOCTOR_SCOPE_UNKNOWN` in JSON mode, with a focused repro at
  `bun test tests/CLIJsonParseability.test.ts -t "doctor scope failures"`.
- **Packed Doctor Scope JSON Smoke** - Release smoke now checks packed
  `bpl doctor unknown-scope --json` preserves `BPL_DOCTOR_SCOPE_UNKNOWN`.
- **Package-cache Name Filter JSON Code** - Invalid package filters in
  `bpl package-cache list`, `verify`, `clean`, and `repair` JSON mode now fail
  with `BPL_PACKAGE_CACHE_NAME_INVALID` instead of reporting empty successes.
- **Packed Package-cache Name Filter JSON Smoke** - Release smoke now checks
  packed `bpl package-cache list`, `verify`, `clean`, and `repair` invalid-name
  failures preserve `BPL_PACKAGE_CACHE_NAME_INVALID`.
- **Package Uninstall JSON Contract** - `bpl uninstall <package> --json` and
  `bpl remove <package> --json` now emit `package-uninstall` reports, including
  `BPL_PACKAGE_UNINSTALL_NAME_INVALID` and
  `BPL_PACKAGE_UNINSTALL_NOT_INSTALLED` for stable failure handling.
- **Package Pack JSON Contract** - `bpl pack [dir] --json` now emits
  `package-pack` reports with archive paths on success and PackageManager
  `errorCode` values such as `BPL_PACKAGE_MANIFEST_MISSING` on validation
  failures.
- **Package Init JSON Contract** - `bpl init [name] --json` now emits
  `package-init` reports with manifest paths on success and stable
  `BPL_PACKAGE_INIT_NAME_INVALID` and `BPL_PACKAGE_INIT_MANIFEST_EXISTS`
  `errorCode` values for validation failures.
- **Package Small JSON Validation Code Lists** - Package init, uninstall, and
  package-cache validation codes now expose shared PackageManager constant
  lists, and MarkdownDocs checks those package JSON documentation contracts
  against the lists.
- **Package Manifest JSON Validation Code List** - Package manifest validation
  codes now expose a shared PackageManager constant list, docs cover every
  emitted `BPL_PACKAGE_MANIFEST_*` validation code, and the focused package JSON
  failure contract verifies the list.
- **Package Install/Archive JSON Validation Code Lists** - Package install
  option-conflict and direct archive validation codes now expose shared
  PackageManager constant lists, docs spell out each code, and the focused
  package JSON failure contracts verify list coverage.
- **Package Resolver Diagnostic Code List** - Package import resolver
  diagnostics now expose a shared `BPL_PACKAGE_*` code list, docs cover every
  resolver code, and MarkdownDocs checks representative resolver traces against
  the documented inventory.
- **Package Import DX Parity Smoke** - Package docs, integration, LSP, and
  CI-triage smoke coverage now lock in both explicit source-file package
  imports such as `math-extra/features/direct.bpl` and extensionless
  directory-index imports such as `math-extra/features/increment`. Focused
  repro commands:
  `bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"`,
  `bun test tests/Integration.test.ts -t "package dependency example"`,
  `bun test tests/Integration.test.ts -t "package_transitive_dependency/app"`,
  `bun test tests/CiTriage.test.ts -t "package docs smoke failures"`,
  `bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"`,
  and `bun test vscode-ext/src/test/diagnostics.test.ts vscode-ext/src/test/imports.test.ts`.
- **VS Code Extension Validation** - The extension now has a dedicated
  `npm run compile:test --prefix vscode-ext` guard for strict TypeScript checks
  over `vscode-ext/src/test`, and `npm test --prefix vscode-ext` runs that guard
  before Bun language-server tests. Production extension compilation remains
  covered by `npm run compile --prefix vscode-ext`. VS Code type-check failures
  map to these focused commands in `bun run ci:triage`, including missing
  `vscode-languageserver-textdocument` declarations and implicit-any diagnostics.
- **Module Resolver Diagnostic Code List** - Non-package module and explicit
  standard-library import diagnostics now expose a shared code list, and
  MarkdownDocs checks the docs inventory against the ModuleResolver constants.
- **CLI JSON Error Code Registry** - The CLI API now exports
  `CLI_JSON_ERROR_CODE_LISTS` and `CLI_JSON_ERROR_CODES` for tooling that wants
  a stable inventory of documented JSON and diagnostic codes, with a focused
  guard against empty lists, duplicates, and non-`BPL_*` entries.
- **Package JSON Code List Shape Guard** - PackageManager JSON code lists now
  have a focused failure-contract check for non-empty lists, per-list
  duplicates, and stable `BPL_*` code spelling.
- **CI Triage JSON Code Inventory Guard** - `bun run ci:triage` repro mappings
  are now checked against the exported JSON error-code inventory, covering
  package install option conflicts, direct archive path validation, package
  resolver diagnostics, and wasm linker diagnostics.
- **Release Helper Script Inventory Guard** - Release metadata now derives
  packed helper references from `package.json` scripts, checks that each
  `bun tools/*.ts` helper is included in package files, and reports missing
  helper files with the referencing script name.
- **Packed CI Triage Code-Mapping Smoke** - Packed helper smoke now exercises
  representative `ci:triage` JSON-code mappings for package archive validation
  and wasm linker diagnostics from the installed npm package path.
- **CLI JSON Registry Docs Guard** - MarkdownDocs now checks all codes from
  `CLI_JSON_ERROR_CODE_LISTS` against the tracked Markdown corpus so documented
  JSON/diagnostic code coverage cannot drift from the central registry.
- **CLI JSON Registry Docs Example** - Compiler options docs now include a
  short TypeScript example for consuming `CLI_JSON_ERROR_CODE_LISTS`, and
  MarkdownDocs guards the example text.
- **Packed CLI JSON Registry Export** - The npm package now exposes
  `bpl-v3/cli` as a narrow registry subpath with TypeScript declarations, and
  release smoke verifies the packed import works without shipping broad
  compiler sources.
- **Markdown JSON Code-List Test Helpers** - MarkdownDocs now centralizes
  normalized documentation reads, snippet checks, and JSON code-list coverage
  assertions so future registry guards need less duplicate loop code.
- **CI Triage Registry Group Decisions** - `ci:triage` now exports and tests an
  explicit coverage decision for every `CLI_JSON_ERROR_CODE_LISTS` group, so
  new JSON-code groups must be mapped or intentionally excluded with a reason.
- **Packed Helper Dependency Import Audit** - Release metadata tests now cover
  helper dependency imports with explicit extensions and directory `index`
  specifiers, and missing dependency imports report both importer and dependency.
- **Package Import Docs Smoke Fixtures** - Package docs now identify the
  JSON-mode smoke that checks the workspace/transitive package example and the
  documented invalid `pkg-math/../secret` import diagnostic.
- **Generated CLI JSON Registry Shim** - The packed `bpl-v3/cli` registry shim
  now has a renderer/check command, and tests compare `cli/index.js` plus
  `cli/index.d.ts` against `CLI_JSON_ERROR_CODE_LISTS` so the npm subpath
  cannot drift silently from implementation exports.
- **Packed CLI Registry Type Smoke** - Release helper smoke now compiles a
  TypeScript consumer of `bpl-v3/cli`, checking the packed declarations for
  `CLI_JSON_ERROR_CODE_LISTS`, `CLI_JSON_ERROR_CODES`, and the
  `CliJsonErrorCodeList` type.
- **Package Docs Smoke Inventory** - Package/import documentation smoke
  examples now live in a typed test inventory shared by MarkdownDocs and the
  CLI JSON parseability smoke, keeping the documented success and failure
  examples aligned.
- **Integration Example Artifact Isolation** - Integration example runs now
  pass a temporary `-o` output path to `bpl run`, keeping package dependency
  example binaries and LLVM IR outside the tracked `examples/` tree.
- **Release CLI Registry Sync Gate** - `release:check` now runs
  `bun run release:cli-registry`, which verifies the generated packed
  `bpl-v3/cli` registry shim and declarations before release smoke starts.
- **CLI Registry Consumer Docs** - Public API docs now show both ESM imports
  and CommonJS `require("bpl-v3/cli")` usage, and clarify that the subpath is a
  narrow data registry rather than a compiler-internals API.
- **Integration Artifact Root Isolation** - Integration test output paths now
  include a run-unique temporary root and cleanup guard so concurrent local runs
  do not collide over generated binaries or LLVM IR.
- **Compact MarkdownDocs Failures** - Markdown documentation snippet and code
  helpers now report concise missing-item lists instead of dumping the entire
  Markdown corpus into CI logs.
- **CI Triage Release Registry Mapping** - `ci:triage` now maps
  `release:cli-registry` and stale CLI registry shim failures to the focused
  `bun run release:cli-registry` repro command.
- **Release Registry Triage Docs** - Compiler correctness docs now list
  `bun run release:cli-registry` as the first repro command for stale packed
  CLI registry shim failures before running broader release smoke.
- **Release Manifest Helper Reference Fixture** - Release manifest tests now
  cover script-name helper references in the local fixture, including multiple
  npm scripts pointing at the same packed helper.
- **Project Creation JSON Validation Code List** - `bpl new <name> --json`
  validation codes now expose a shared constant list, and MarkdownDocs checks
  the project creation JSON documentation contract against that list.
- **Project Creation JSON Contract** - `bpl new <name> --json` now emits
  `project-new` reports with scaffold paths on success and stable
  `BPL_NEW_NAME_PATH`, `BPL_NEW_NAME_INVALID`, `BPL_NEW_TEMPLATE_INVALID`,
  `BPL_NEW_PATH_EXISTS_DIRECTORY`, `BPL_NEW_PATH_EXISTS_SYMLINK`, and
  `BPL_NEW_PATH_EXISTS_NOT_DIRECTORY` `errorCode` values for validation
  failures.
- **Format JSON Contract** - `bpl format --check --json` now emits `format`
  reports with per-file formatted/changed status and stable
  `BPL_FORMAT_*` `errorCode` values including
  `BPL_FORMAT_JSON_REQUIRES_CHECK`, `BPL_FORMAT_NO_INPUTS`,
  `BPL_FORMAT_WRITE_CHECK_CONFLICT`, `BPL_FORMAT_INPUT_NOT_FOUND`,
  `BPL_FORMAT_INPUT_NOT_FILE`, `BPL_FORMAT_NOT_FORMATTED`, and
  `BPL_FORMAT_PROCESSING_ERROR`. Focused repro:
  `bun test tests/CLI.test.ts -t "format check results and validation failures as JSON"`.
- **Documentation JSON Contract** - `bpl docs <file> --json` now emits `docs`
  reports with output-file metadata on success and stable `BPL_DOCS_*`
  `errorCode` values, including `BPL_DOCS_INPUT_NOT_FOUND`,
  `BPL_DOCS_INPUT_SYMLINK`, `BPL_DOCS_INPUT_NOT_FILE`,
  `BPL_DOCS_INPUT_PARENT_SYMLINK`, `BPL_DOCS_OUTPUT_SYMLINK`,
  `BPL_DOCS_OUTPUT_DIRECTORY`, `BPL_DOCS_OUTPUT_NOT_FILE`,
  `BPL_DOCS_OUTPUT_PARENT_NOT_FOUND`, `BPL_DOCS_OUTPUT_PARENT_SYMLINK`,
  `BPL_DOCS_OUTPUT_PARENT_NOT_DIRECTORY`, and `BPL_DOCS_FAILED`.
  Focused repro:
  `bun test tests/CLI.test.ts -t "documentation generation success and validation failures as JSON"`.
- **Completion JSON Contract** - `bpl completion [shell] --json` now emits
  `completion` reports with the generated shell script on success and
  `BPL_COMPLETION_SHELL_UNSUPPORTED` for unsupported shells. Focused repro:
  `bun test tests/CLIJsonParseability.test.ts -t "completion JSON"`.
- **Bindgen JSON Contract** - `bpl bindgen <header> --json` now emits
  `bindgen` reports with generated binding text or output-file metadata on
  success and stable `BPL_BINDGEN_*` `errorCode` values, including
  `BPL_BINDGEN_HEADER_NOT_FOUND`, `BPL_BINDGEN_HEADER_SYMLINK`,
  `BPL_BINDGEN_HEADER_NOT_FILE`, `BPL_BINDGEN_HEADER_PARENT_SYMLINK`,
  `BPL_BINDGEN_OUTPUT_SYMLINK`, `BPL_BINDGEN_OUTPUT_DIRECTORY`,
  `BPL_BINDGEN_OUTPUT_NOT_FILE`, `BPL_BINDGEN_OUTPUT_PARENT_NOT_FOUND`,
  `BPL_BINDGEN_OUTPUT_PARENT_SYMLINK`,
  `BPL_BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY`, and `BPL_BINDGEN_FAILED`.
  Focused repro:
  `bun test tests/CLI.test.ts -t "bindgen success and validation failures as JSON"`.
- **Doctor Sanitizer Diagnostics** - `bpl doctor --json` and
  `bpl doctor sanitizer --json` now report optional sanitizer runtime support
  with stable `BPL_SANITIZER_RUNTIME_UNAVAILABLE` guidance for missing
  compiler-rt/libclang_rt support.
- **Sanitizer Timeout Diagnostics** - `SANITIZER_RUNTIME_TEST_TIMEOUT_MS` now
  uses the shared positive-integer timeout diagnostics and appears in `bpl
  doctor --json` timeout reports.
- **Release Smoke Fuzz Repro Coverage** - Release smoke now checks the packed
  npm CLI's `fuzz:repro` usage-error path before artifact discovery.
- **Release Smoke Fuzz Helper Coverage** - Release smoke now checks the packed
  npm CLI's `fuzz`, `fuzz:replay`, and `fuzz:promote` usage-error paths before
  campaign startup, artifact replay, or corpus promotion.
- **Release Smoke Package Lock Safety Coverage** - Release smoke now exercises
  the packed npm CLI against locked installs with symlinked package roots and
  symlinked recorded package sources.
- **Run-Script JSON Errors** - `bpl run-script --json` now reports manifest and
  script validation failures as machine-readable `{ success, error }` JSON while
  preserving human-readable logger output without `--json`.
- **Run-Script JSON Validation Code List** - `bpl run-script --json` and
  `bpl run-script --list --json` validation codes now expose a shared constant
  list, and MarkdownDocs checks the run-script JSON documentation contract
  against that list.
- **Run-Script JSON Validation Codes** - `bpl run-script --json` validation
  failures now include stable `BPL_RUN_SCRIPT_*` `errorCode` values for
  manifest lookup and parsing, script-table validation, and missing named
  scripts while preserving the human-readable `error` text.
- **CI Triage Run-Script Validation Repros** - `bun run ci:triage` now maps
  `BPL_RUN_SCRIPT_*` and run-script validation failure logs to focused
  run-script JSON contract repro commands.
- **Packed Run-Script Validation Smoke** - Release smoke now checks that the
  packed npm CLI preserves `bpl run-script --json` validation `errorCode`
  output such as `BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND`.
- **Check/Lint JSON Input Validation Codes** - `bpl check --json` and
  `bpl lint --json` per-file input validation failures now include stable
  `BPL_CHECK_INPUT_*` and `BPL_LINT_INPUT_*` `errorCode` values for missing,
  symlinked, and non-file source inputs.
- **Check/Lint JSON Validation Code Lists** - `bpl check --json` and
  `bpl lint --json` validation codes now expose shared constant lists, and
  MarkdownDocs checks the source-analysis JSON documentation contract against
  those lists.
- **CI Triage Check/Lint Validation Repros** - `bun run ci:triage` now maps
  `BPL_CHECK_INPUT_*` and `BPL_LINT_INPUT_*` failures to focused source-analysis
  JSON contract repro commands.
- **Packed Check/Lint Validation Smoke** - Release smoke now checks that the
  packed npm CLI preserves `bpl check --json` and `bpl lint --json` input
  validation `errorCode` output such as `BPL_CHECK_INPUT_NOT_FILE` and
  `BPL_LINT_INPUT_SYMLINK`.
- **Check/Lint No-Input JSON Codes** - `bpl check --json` and `bpl lint --json`
  now return stdout JSON failures with `BPL_CHECK_NO_INPUTS` and
  `BPL_LINT_NO_INPUTS` when no source files are provided, while non-JSON mode
  remains a human-readable stderr failure.
- **CI Triage Check/Lint No-Input Repros** - `bun run ci:triage` now maps
  `BPL_CHECK_NO_INPUTS` and `BPL_LINT_NO_INPUTS` logs to focused no-input JSON
  contract repro commands.
- **Packed Check/Lint No-Input Smoke** - Release smoke now checks that the
  packed npm CLI preserves `BPL_CHECK_NO_INPUTS` and `BPL_LINT_NO_INPUTS` for
  no-input `bpl check --json` and `bpl lint --json` failures.
- **Build JSON Validation Coverage** - `bpl build --json` now has explicit
  regression coverage and docs for invalid compiler options, input/output path
  validation, stdout-only failure reports, and no failed artifact leftovers.
- **Build JSON Validation Codes** - `bpl build --json` validation failures now
  include stable `BPL_BUILD_*` `errorCode` values for invalid options, input
  path validation, and output artifact validation while preserving the
  human-readable `error` text.
- **Build/Clean JSON Validation Code Lists** - `bpl build --json` and
  `bpl clean --json` validation codes now expose shared constant lists, and
  MarkdownDocs checks the build and clean JSON documentation contracts against
  those lists.
- **Build No-Input JSON Code Audit** - The root `bpl --json` no-input build
  failure now shares `BPL_BUILD_NO_INPUTS` through the build JSON validation
  code list, and the docs describe that stdout failure alongside runner-level
  build validation failures.
- **CI Triage Build Validation Repros** - `bun run ci:triage` now maps
  `BPL_BUILD_*` and build validation failure logs to focused `bpl build --json`
  JSON contract repro commands.
- **Packed Build Validation Smoke** - Release smoke now checks that the packed
  npm CLI preserves `bpl build --json` validation `errorCode` output such as
  `BPL_BUILD_OUTPUT_PARENT_NOT_FOUND`.
- **Clean JSON Validation Codes** - `bpl clean --json` validation failures now
  include stable `BPL_CLEAN_*` `errorCode` values for symlinked working
  directories and unavailable git tracked-file probes.
- **CI Triage Clean Validation Repros** - `bun run ci:triage` now maps
  `BPL_CLEAN_*` and clean validation failure logs to focused clean JSON repro
  commands.
- **Packed Clean Validation Smoke** - Release smoke now checks that the packed
  npm CLI preserves `bpl clean --json` validation `errorCode` output such as
  `BPL_CLEAN_GIT_TRACKED_UNAVAILABLE`.
- **Package Import Diagnostic Coverage** - CLI and ModuleResolver regression
  tests now cover invalid package import names and malformed imported package
  manifest versions in human-readable, `check --json`, `build --json`, and
  middle-end diagnostic modes.
- **Package Lock Name Verification** - `bpl install --locked` now rejects lock
  entries whose package key does not match the installed package manifest name,
  even when the version and content hash otherwise match.
- **Shared Wasm Toolchain Discovery** - CLI wasm builds, `bpl doctor`, and wasm
  runtime tests now share wasm linker candidate/probe logic, and
  `BPL_REQUIRE_WASM_LD=1` failures list the checked candidates.
- **Wasm Matrix Drift Diagnostics** - The wasm compatibility sweep now reports
  missing dedicated `examples/wasm_*` entries with an actionable matrix-update
  message, and runnable wasm examples must keep expected execution metadata.
- **Playground Wasm Toolchain Alignment** - The playground backend now uses the
  shared wasm linker discovery/error helper instead of a separate hardcoded
  probe, keeping browser wasm diagnostics aligned with CLI builds.
- **Wasm Focused Test Script Coverage** - `bun run test:wasm` now includes the
  shared wasm toolchain and playground linker contract tests in addition to
  runtime execution and compatibility sweep coverage.
- **Workflow Action Contract Coverage** - GitHub Actions tests now scan compiler
  workflows for maintained action major versions, Node 24 JavaScript action
  opt-in, and scheduled fuzz workflow contract-test coverage before long fuzz
  runs.
- **Check JSON Stability** - `bpl check --json` now includes stable
  `schemaVersion: 1` and `check: "check"` metadata alongside the existing
  aggregate totals, timing, per-file diagnostics, and validation errors.
- **Lint JSON Stability** - `bpl lint --json` now includes stable
  `schemaVersion: 1` and `check: "lint"` metadata alongside the existing
  aggregate totals, per-file lint diagnostics, and validation errors.
- **Doctor JSON Failure Coverage** - JSON parseability tests now assert unknown
  doctor scopes return stdout-only `schemaVersion: 1`, `check: "doctor"`,
  `success: false`, and `error` metadata.
- **Run-Script Argument Forwarding Coverage** - Added regression coverage for
  option-looking, empty, quoted, substituted, piped, redirected, ampersand, and
  multiline arguments forwarded through `bpl run-script`.
- **Package Doctor JSON Stability** - `bpl doctor packages --json` now includes
  stable `schemaVersion`, `check`, and `success` top-level fields, with
  regression coverage for lockfile, dependency tree, issue, and package-cache
  provenance warning shapes.
- **Toolchain Doctor JSON Stability** - `bpl doctor --json` now includes stable
  `schemaVersion: 1` and `check: "toolchain"` fields alongside the existing
  `success`, `version`, `platform`, `bplHome`, and `checks` fields. Unknown
  doctor scopes in JSON mode now emit structured `{ success: false, error }`
  output on stdout instead of human logger text on stderr.
- **Package Cache Verify JSON Stability** - `bpl package-cache verify --json`
  now includes stable `schemaVersion: 1`, `check: "package-cache-verify"`, and
  `success` fields, with CLI regressions for missing-provenance issue shapes.
- **Release Smoke Doctor JSON Coverage** - Release smoke now validates packed
  `bpl doctor --json` and `bpl doctor packages --json` schema contracts,
  including isolated package-cache verification for the package doctor path.
- **Release Smoke Doctor Failure Coverage** - Release smoke now validates packed
  `bpl doctor <unknown> --json` failure metadata, including stdout-only
  `schemaVersion`, `check: "doctor"`, `success: false`, and `error` output.
- **Release Smoke Package Cache JSON Coverage** - Release smoke now validates
  packed `bpl package-cache list --json` output with an isolated cache home.
- **Release Smoke Package List JSON Coverage** - Release smoke now validates
  packed `bpl list --json` and `bpl list --tree --json` metadata through the
  installed npm CLI.
- **Release Smoke Package Cache Verify Coverage** - Release smoke now validates
  packed `bpl package-cache verify --json` output with an isolated cache home.
- **Release Smoke Check/Lint JSON Coverage** - Release smoke now validates
  packed `bpl check --json` and `bpl lint --json` contract metadata through the
  installed npm CLI.
- **Release Smoke Run-Script JSON Coverage** - Release smoke now validates
  packed `bpl run-script --list --json` output and confirms listing scripts
  does not execute them.
- **Release Smoke Run-Script Failure Coverage** - Release smoke now validates
  packed `bpl run-script --list --json` failure output from an empty package
  directory, including exit status, empty stderr, and JSON error metadata.
- **CLI JSON Compatibility Policy** - Documented the versioning policy for
  machine-readable CLI JSON, including additive fields, unknown-field handling,
  and `schemaVersion` bumps for breaking shape changes.
- **Run-Script List JSON Stability** - `bpl run-script --list --json` now
  includes stable `schemaVersion: 1`, `check: "run-script-list"`, and
  `success: true` fields alongside the existing `scripts` array.
- **Run-Script JSON Failure Stability** - `bpl run-script --list --json`
  validation failures now include stable `schemaVersion` and
  `check: "run-script-list"` fields alongside `success: false` and `error`.
- **Run-Script Missing Script JSON Coverage** - Added coverage for
  `bpl run-script <missing> --json` returning `schemaVersion: 1`,
  `check: "run-script"`, `success: false`, and `error` without printing the
  human script list.
- **Shared CLI JSON Contract Constants** - CLI and package-manager JSON report
  emitters now share one schema/check helper so package doctor and package-cache
  maintenance reports cannot drift from the documented contract strings.
- **CLI JSON Contract Inventory** - Added a source-level inventory that maps
  documented JSON commands to shared check constants and verifies emitters do
  not call the JSON report helper with duplicated string literals.
- **Package Cache Maintenance JSON Coverage** - Added parseability regression
  coverage for empty `package-cache clean --dry-run --json` and
  `package-cache repair --dry-run --json` reports.
- **Package List Tree JSON Coverage** - Added parseability coverage for
  `bpl list --tree --json` so both package list JSON report variants stay under
  the shared contract guard.
- **Package Resolver Symlink Coverage** - Added direct resolver regressions that
  keep symlinked package manifests, subpath files, and subpath directories from
  satisfying package imports.
- **Package Resolver Import Segment Coverage** - Added direct resolver
  regressions for empty, `.`, and `..` package import path segments, including
  proof that invalid imports return before filesystem search.
- **Package Import Diagnostic Coverage** - Added module resolver regressions so
  package manifest name mismatches and unsafe package entrypoints keep their
  detailed hints after import-resolution error wrapping.
- **Package Import Safety Docs** - Documented tested package import safety
  rules for invalid path segments, manifest-name matching, global versioned
  directories, and symlink rejection.
- **Strict Package Manifest Paths** - Package `main`, `exports`, and `bin`
  manifest paths now reject empty, `.`, and `..` segments instead of
  normalizing ambiguous package-relative paths.
- **CLI Pack Manifest Path Coverage** - Added CLI regressions proving
  `bpl pack` rejects ambiguous package manifest paths before creating archives.
- **Package Resolver Precedence Guard** - Module resolution now treats malformed
  project package metadata as terminal, preventing fallback to unrelated cwd or
  search-path packages with the same import name.
- **Strict Manifest Path Docs** - Documented strict package-relative `main`,
  `exports`, and `bin` path rules for package manifests.
- **Standard Library Import Safety** - Explicit `std/` imports now reject empty,
  `.`, and `..` path segments before resolving against the standard library
  root.
- **CLI Standard Library Import Diagnostics** - Added CLI regressions proving
  unsafe `std/` imports fail during `check` and before build artifacts are
  written.
- **Standard Library Import Safety Docs** - Documented that explicit `std/`
  import paths must be normalized subpaths without empty, `.`, or `..`
  segments.
- **Import Resolver Diagnostic Preservation** - Normal import checking now
  preserves `ModuleResolver` diagnostics instead of replacing malformed
  package metadata errors with generic filesystem fallback failures.
- **Package Import Diagnostic Build Coverage** - Added regressions proving
  malformed package metadata diagnostics stay intact across `check`,
  `build --emit llvm`, and cached builds without writing failed artifacts.
- **Import Diagnostics JSON Coverage** - Added `bpl check --json` regressions
  for unsafe `std/` imports and malformed package metadata, including stable
  report totals and per-file diagnostic locations.
- **Import Diagnostic Policy Docs** - Documented that normal check/build modes
  preserve resolver-specific import diagnostics while frontend-only emit modes
  parse without loading imports.
- **Build JSON Import Diagnostics** - `bpl build --json` failures now include
  structured compiler diagnostics alongside the existing formatted `error`
  field, with coverage for unsafe `std/` imports and malformed package
  metadata.
- **Missing Import Diagnostic Coverage** - Added regressions for missing
  relative imports across `check`, `check --json`, and `build --emit llvm`,
  including resolved-path details and no failed artifacts.
- **JSON Import Diagnostic Docs** - Documented how `bpl check --json` and
  `bpl build --json` report import-resolution diagnostics, including build's
  backward-compatible formatted `error` field plus structured `diagnostics`.
- **Build JSON Type Diagnostic Coverage** - Added regression coverage that
  ordinary `bpl build --json` type-check failures include structured
  diagnostics with source locations and previews while preserving `error`.
- **Virtual Source JSON Diagnostic Coverage** - Added `--eval` and `--stdin`
  JSON-mode build failure coverage for stable `<eval>`/`<stdin>` labels and
  source previews.
- **CLI JSON Contract Docs** - Added a machine-readable JSON contract table for
  check, lint, doctor, package doctor, package-cache verify, run-script, clean,
  and package list/tree commands.
- **Clean JSON Stability** - `bpl clean --json` and
  `bpl clean --dry-run --json` now include stable `schemaVersion: 1`,
  `check: "clean"`, and `success` fields alongside existing `dryRun`, `count`,
  and `entries` fields.
- **Package Cache Maintenance JSON Stability** - `bpl package-cache clean
  --json` and `bpl package-cache repair --json` now include stable
  `schemaVersion: 1`, `check`, and `success` fields alongside existing
  removed/repaired/unchanged/issues payloads.
- **Package Cache List JSON Stability** - `bpl package-cache list --json` now
  includes stable `schemaVersion: 1`, `check: "package-cache-list"`, and
  `success` fields with cached archive data under `entries`.
- **Package List JSON Stability** - `bpl list --json` and
  `bpl list --tree --json` now include stable `schemaVersion: 1`, `check`, and
  `success` fields while preserving existing package summary and dependency
  tree payloads.
- **Build JSON Stability** - `bpl build --json` now emits a stable
  `schemaVersion: 1`, `check: "build"`, `success`, artifact output, and error
  shape on stdout for tooling.
- **CLI JSON Test Helper** - Added a shared test helper for JSON stdout
  parseability assertions used by CLI JSON contract tests.
- **Enhanced Runtime Library** - Comprehensive runtime error handling with beautiful diagnostics:
  - **Signal Handlers**: Automatic installation of handlers for SIGSEGV, SIGFPE, SIGILL, SIGABRT, and SIGBUS
  - **Colored Error Boxes**: Formatted error output with ASCII box drawing and ANSI colors
  - **Stack Traces**: Both native (using `backtrace()` and `dladdr()`) and BPL-level call stack traces
  - **Runtime Error Types**:
    - NULL pointer access with expression and location info
    - Index out of bounds with index/size details
    - Division by zero with function context
    - Stack overflow detection
  - **New Files**:
    - `lib/runtime_support.c` - C runtime support (signal handlers, stack traces, formatting)
    - `lib/build_runtime.sh` - Build script for runtime library
  - **Documentation**: Added `docs/66-runtime-library.md` with complete runtime architecture

- **Strict Switch Semantics** - Improved control flow safety for switch statements:
  - **Explicit Termination**: All `case` and `default` blocks must now strict end with a terminator (`break`, `return`, `throw`, `continue`, or `fallthrough`).
  - **Explicit Fallthrough**: Added `fallthrough` keyword to explicitly transfer control to the next case.
  - **Break in Switch**: Added support for standard `break` statements within switch cases (previously only allowed in loops).
  - **Fixes**: Resolved multiple regressions in legacy tests causing implicit fallthrough or missing termination bugs.
  - **Documentation**: Updated `docs/07-control-flow.md` and `AGENTS.MD` with new strict switch rules.
  - **VS Code Extension**: Updated syntax highlighting and snippets to support `fallthrough`.
  - **Formatter**: Updated code formatter to handle `fallthrough` and indent strict switch cases correctly.

- **Process Execution Module** - Added `std/process.bpl`:
  - Execute commands with `exec(args...)`
  - Get status with `execStatus(args...)`
  - Capture output with `execOutput(args...)` -> `ProcessResult`
  - **Execute raw shell commands** with `execShell(cmd)` for pipes/redirects
  - **Silent execution** with `execSilent(args...)`
  - **Sleep** with `sleep(ms)`
  - Variadic arguments support with automatic space joining and **automatic OS command injection protection**
  - Cross-platform helper module for common system tasks
- **Pattern Matching Enhancements** - Comprehensive pattern matching support:
  - **Primitive Pattern Matching**: Full support for int, i8, i16, i32, i64, u8, u16, u32, u64, float, f32, f64, bool, string, and char types
  - **Tuple Pattern Matching**: Match and destructure tuples of any size (2-element, 3-element, etc.)
  - **Pattern Types**:
    - Literal patterns: `0`, `3.14`, `true`, `"hello"`, `'A'`
    - Identifier patterns: `x`, `n` (binds matched value)
    - Tuple patterns: `(a, b)`, `(0, y)`, `(x, y, z)`
    - Wildcard pattern: `_` (matches anything)
    - Guard clauses: `pattern if condition` (conditional patterns)
  - **Formatter Support**: Updated code formatter to handle all pattern types including PatternTuple
  - **Type Normalization**: Fixed float→double and bool→i1 type handling in LLVM backend
  - **Examples**: Added comprehensive examples in `examples/primitive_patterns/` and `examples/tuple_patterns/`
  - **Test Coverage**: 49 new tests covering all pattern matching features
- **New CLI Commands** - Major CLI restructure for better usability:
  - `bpl run <file> [args...]` - Compile and execute in one command
  - `bpl dev <file> [args...]` - Development mode with watch and auto-run
  - `bpl build <file>` - Explicit compilation command
  - `bpl check <files...>` - Fast type checking without code generation
  - `bpl new <name>` - Project scaffolding with standard structure
  - `bpl clean` - Remove build artifacts and caches
- **New Global Flags**:
  - `-q, --quiet` - Suppress non-error output
  - `-O <level>` - Optimization levels: 0 (default), 1, 2, or 3
  - `--debug` - Alias for --dwarf (debug information)
  - `--time` - Show compilation time statistics
  - `--json` - Output in JSON format (for tooling)
  - `--color/--no-color` - Force/disable colored output
- **Dev Command Options**:
  - `--clear` - Clear screen on each recompile
  - `--no-run` - Compile only without execution
- **Logger System** - Replaced all `console.*` calls with structured Logger:
  - LogLevel enum (DEBUG, INFO, WARN, ERROR, SILENT)
  - Colorized output with context tagging
  - Time profiling with `time()` method
  - Integrated throughout compiler and CLI

### Changed

- **Linter Rule Injection** - `Linter` now accepts optional extra rules in its
  constructor so tests and tooling can exercise visitor coverage without
  mutating private state.
- **Linter Block Traversal** - The linter visitor now matches the typed AST
  `Block` node kind, allowing custom rules to traverse statements inside
  function bodies.
- **Linter Statement Traversal** - Custom linter rules now see expression
  statement children, deferred statements, and C-style loop init/step children
  through normal visitor traversal.
- **Linter Expression Traversal** - Custom linter rules now see nested
  aggregate, operator, type-test, lambda, and match expression children through
  typed visitor paths.
- **Linter Traversal Drift Guard** - Focused tests now pin child-bearing
  linter visitor cases, document intentional non-recursive AST leaves, and keep
  throw/try/switch child traversal covered.
- **Package Resolver Candidate Traces** - Package import diagnostics now keep
  missing explicit `.bpl` and `.x` entrypoint/subpath candidates de-duplicated
  while preserving first-seen ordering.
- **Package Resolver Extension Trace Ordering** - Extensionless package
  entrypoint and subpath failures now list the exact requested path before
  `.bpl` and `.x` fallback candidates.
- **Package Resolver Manifest Entry Validation** - Package import resolution now
  rejects non-string `main` and legacy `entry` manifest fields instead of
  silently falling back to `index.bpl`.
- **Module Resolver Std Imports** - Explicit standard-library imports now treat
  `std\path` the same as `std/path`, including unsafe segment diagnostics.
- **Module Resolver Std Import Hints** - Unsafe standard-library import hints now
  mention both supported explicit forms: `std/<path>` and `std\<path>`.
- **Linter Parameter Traversal** - Function parameter nodes now flow through
  the linter visitor directly instead of being wrapped in synthesized dynamic
  AST objects.
- **MarkdownDocs Snippet Diagnostics** - Remaining docs-wide snippet checks now
  use concise helper diagnostics so a missing snippet reports the missing text
  without dumping whole Markdown files into CI logs.
- **MarkdownDocs Code-List Diagnostics** - Documentation coverage failures for
  CLI JSON code-list registries now report compact `list:code` entries instead
  of generic array diffs.
- **ReleaseMetadata Source Diagnostics** - Release smoke source coverage checks
  now use compact source-snippet diagnostics so missing packed-helper coverage
  does not dump the full helper source in CI logs.
- **CI Triage Release Registry Fixtures** - Offline `ci:triage --jobs-json`
  fixtures now route release CLI registry sync job names to
  `bun run release:cli-registry`.
- **CI Triage No-Match Guidance** - Text `ci:triage` output now explicitly
  marks failed jobs that do not match a focused local repro command, so unknown
  failure patterns are not silently ambiguous.
- **CI Triage Text Output Docs** - Compiler correctness docs now pin the
  `GitHub Actions triage:`, `Failed jobs:`, `failed steps:`, and `local repro:`
  text labels used by the CI triage helper.
- **Integration Job Env Validation** - `BPL_INTEGRATION_JOBS` now accepts only
  positive integers and reports the auto-detected fallback when malformed
  values such as `0`, decimals, or non-numeric strings are provided.
- **CI Triage Integration Concurrency Mapping** - `ci:triage` now maps
  `BPL_INTEGRATION_JOBS` and integration concurrency failures to
  `tests/IntegrationRunner.test.ts`, a bounded `BPL_INTEGRATION_JOBS=4`
  CI-safe repro, and the full CI-safe suite.
- **Path Safety Helper Consolidation** - Fuzz replay, fuzz promotion, fuzz
  artifact repro, crash artifact recording, and release manifest output
  validation now share path-component safety helpers while preserving their
  existing diagnostics.
- **Runtime Asset Diagnostics** - `bpl doctor` now points missing runtime
  support objects at `bun run build:runtime` plus `bpl doctor`, and missing
  runtime IR files at `bpl doctor` plus reinstall/restore guidance.
- **Release Smoke Wasm Coverage** - Release smoke now discovers dedicated
  `examples/wasm_*` fixtures dynamically and requires both `main.bpl` and
  `test_config.json` to be present in the package.
- Updated `lib/process.bpl` to use variadic arguments for all execution functions, improving UX and safety.
- Expanded `std` exports to include `std/process.bpl`.

- **BREAKING**: Removed `--run` flag from main command (use `bpl run` instead)
- **BREAKING**: Removed `--watch` flag from main command (use `bpl dev` instead)
- **BREAKING**: Changed `-g` flag from global to `-d` for DWARF debug info
- Main command now focused on basic compilation (file → LLVM IR)
- Updated all test files (16 files) to use `bpl run` command
- All compilation workflows now use dedicated commands for clarity
- Enhanced `processCode` function signature to include `sourceLabel` parameter
- Improved CLI architecture with better separation of concerns
- **JSON Library**: Refactored `JsonParser.parseString` in `lib/json.bpl` to use flat `else if` chains instead of deep nesting, improving code readability.

### Documentation

- Documented the integration example `test_config.json` schema, including
  canonical `expectedOutput` behavior, supported execution fields, unsupported
  key handling, and focused validation commands.
- Refreshed `TODO.md` and `PLAN.md` so recommended next steps reflect current
  compiler-stability, wasm, package-manager, CI, and documentation priorities
  instead of completed feature work.
- Updated README.md with comprehensive CLI command reference
- Rewrote `docs/39-compiler-options.md` with command-first structure
- Updated `docs/03-quick-start.md` to use `bpl run` command
- Added complete examples for all new commands and flags
- Documented optimization levels, debug options, and cross-compilation
- Added workflow examples for development, production, and CI/CD
- **Pattern Matching Documentation**:
  - Added comprehensive pattern matching section to `docs/07-control-flow.md`
  - Updated `LANGUAGE_SPEC.md` with pattern syntax and examples
  - Updated `AGENTS.MD` with pattern matching reference
  - Added pattern matching examples covering all supported types
- **Runtime Type Operators Documentation**:
  - Updated `docs/06-operators.md` with `is` and `as` operator documentation
  - Updated `docs/56-type-matching.md` with comprehensive struct pointer type checking guide
  - Added examples for runtime type checking and safe downcasting patterns

### Fixed

- **Tree-Shaking Traversal for Nested Calls** - `walkAST` now descends through
  plain syntactic wrapper objects such as struct and enum-struct literal field
  entries while still skipping semantic overload metadata and guarding against
  traversal cycles. Top-level tree shaking also scans generated struct and enum
  method bodies as roots for helper reachability, so wasm artifact builds keep
  functions referenced only inside aggregate literal values or generated method
  bodies. This fixes pruning of `fib(5)` in `examples/wasm_control_flow/main.bpl`
  and `executeRequest` from the hosted HTTP client example. Reproduce with
  `bun test tests/ASTTraversal.test.ts tests/CodeGenerator.test.ts tests/WasmRuntime.test.ts -t "literal field wrapper|semantic overload metadata|top-level helpers called from generated methods|wasm_control_flow"`.
- **Lambda Capture Traversal** - Lambda capture analysis now visits `match`
  expressions, `switch` cases, deferred statements, throws, loop init/step
  expressions, and aggregate literal children so closure contexts include
  locals referenced from those nested forms instead of emitting dangling local
  loads inside generated lambda functions.
- **Lambda Pattern-Binding Captures** - Enum tuple and enum struct pattern
  bindings inside lambda `match` arms now stay arm-local during capture
  analysis. Lambdas no longer build closure contexts from destructured pattern
  names before those locals exist.
- **Lambda Destructuring Captures** - Tuple destructuring declaration targets
  now get per-target binding declarations, allowing lambdas to capture
  destructured locals such as `left` and `right` without treating the parent
  destructuring declaration as a single invalid capture field.
- **Tuple Destructuring Declaration Type Checks** - Explicit types on tuple
  destructuring declaration targets are now checked against their actual tuple
  element types, including nested destructuring targets, and target counts must
  match tuple element counts. Nested destructuring targets are also rejected
  when the corresponding element is not a tuple, avoiding mismatches that could
  reach code generation.
- **Tuple Destructuring Codegen Casts** - Tuple destructuring declarations and
  tuple assignment now cast extracted elements to the declared target type
  before storing them, so compatible integer-width destructuring such as
  `(left: i8, right: i8)` from an `(int, int)` tuple emits valid LLVM IR.
- **Try/Catch Capture Traversal** - Lambda and deferred-block capture analysis
  now visits `try` bodies and `catch` handlers while keeping typed catch
  variables local to the handler, avoiding dangling loads when deferred or
  lambda code references outer locals inside exception-handling blocks.
- **Expression Wrapper Capture Traversal** - Lambda and deferred-block capture
  analysis now visits `is`, `as`, interpolated-string, and generic
  instantiation operands, so outer locals referenced only through those wrappers
  are included in closure contexts.
- **Deferred Match Pattern Shadowing** - Deferred-block capture analysis now
  treats match pattern bindings as arm-local names while scanning guards and
  bodies, avoiding unnecessary captures when a pattern binding shadows an outer
  local.
- **Deferred Local Shadowing** - Deferred-block capture analysis now honors
  local declarations and C-style loop init declarations as scoped shadow names,
  while still capturing outer locals used by their initializers before the new
  local comes into scope.
- **Deferred Nested Lambda Captures** - Deferred-block capture analysis now uses
  nested lambda semantic capture metadata instead of recursively guessing by
  identifier name, avoiding captures caused by locals declared inside the nested
  lambda while preserving real outer captures.
- **Import Idempotency** - Re-importing the same exported declaration into a
  module scope is now idempotent, including repeated `import * as namespace`
  imports of the same module. Explicit `import [Error] from "std/errors.bpl";`
  no longer collides with the compiler's implicit `Error` import, while
  duplicate names from different declarations still report
  `BPL_SYMBOL_ALREADY_DEFINED`.
- **Integration Config Parse Errors** - Malformed example `test_config.json`
  files now report the config file path before the JSON parse detail, and the
  integration harness uses the shared config reader for validation and example
  execution.
- **Typed Integration Config Parsing** - Integration tests now parse
  `test_config.json` through a typed validator with defaults and file-qualified
  diagnostics for invalid `expectedOutput`, `exitCode`, `args`, `env`, `input`,
  `timeout`, and skip fields.
- **Integration Config Schema Guard** - Integration tests now reject unsupported
  `test_config.json` keys with file/key context, and legacy `expected_output`
  fixtures were migrated to `expectedOutput` so example stdout is asserted
  instead of silently skipped.
- **Integration Artifact Uniqueness Guard** - Integration tests now assert every
  discovered example maps to a unique temporary artifact directory, and the guard
  reports the colliding example names if a future nested/flat name conflict is
  introduced.
- **Integration Failure Diagnostics** - Example exit-code mismatches and
  timeouts now include the example name, expected and actual status where
  applicable, command line, stdout, and stderr so CI logs are actionable without
  a local rerun.
- **Import Handler Std Fallback Drift** - The TypeChecker import fallback now
  mirrors `ModuleResolver` for explicit `std/` and `std\` paths, including
  backslash subpaths, unsafe segment rejection, and the shared
  `BPL_IMPORT_STD_PATH_UNSAFE` hint.
- **Integration Artifact Path Collisions** - CI-safe integration tests now add a
  stable source-path fingerprint to temporary artifact directories, so examples
  like `enum_imports/destructuring` and `enum_imports_destructuring` cannot
  race by compiling into the same path during concurrent runs.
- **Import Case-Mismatch Diagnostics** - Module and package import resolution now
  rejects case-only filesystem mismatches before accepting a candidate or
  falling back to lower-priority extensions. Diagnostics include stable codes
  such as `BPL_MODULE_PATH_CASE_MISMATCH`,
  `BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH`, and
  `BPL_PACKAGE_SUBPATH_CASE_MISMATCH`, plus the requested and actual paths.
- **Shared Target Triple Parsing** - `CodeGenerator`, `CompilerDriver`, and
  `BinaryRunner` now use `compiler/common/TargetTriple.ts` for strict
  component-aware target parsing, WebAssembly architecture detection, and hosted
  wasm runtime defaults. This keeps target rejection, compiler-driver selection,
  and runtime-mode selection aligned on one parser. Focused repro:
  `bun test tests/TargetTriple.test.ts tests/CompilerDriver.test.ts tests/BinaryRunner.test.ts tests/CodeGenerator.test.ts -t "target|wasm|triple|CodeGenerator"`.
- **Compiler Driver Wasm Target Detection** - Compiler driver selection now
  treats only `wasm32` and `wasm64` target architectures as WebAssembly, so
  substring-only targets such as `notwasm32-unknown-unknown` do not select
  `BPL_WASM_CC`.
- **Wasm Runtime Mode Component Matching** - Default hosted wasm runtime
  selection now matches target components such as `wasi`, `wasip1`, and
  `emscripten` instead of substrings, so targets like `wasm32-notwasi` remain
  freestanding unless `--wasm-runtime host` is explicit.
- **Compiler API Option Validation Hardening** - `Compiler`, `CodeGenerator`,
  `Linker`, and `ModuleCache` now reject `optimizationLevel` values outside 0-3
  plus invalid `emitType` values and invalid `jobs` counts before code
  generation, linking, cache worker startup, or compiler driver invocation.
  Cached module linking now forwards `-O` to the compiler driver so cached
  builds match non-cache link behavior. Focused repro:
  `bun test tests/CompilerOptions.test.ts tests/CodeGenerator.test.ts tests/Linker.test.ts tests/ModuleCache.test.ts`.
- **Compiler Target Validation Hardening** - `Compiler`, `CodeGenerator`, and
  `bpl build` now reject unsupported target triples before LLVM IR is emitted
  instead of silently using an x86_64 Linux data layout for unknown targets.
  It also rejects empty, whitespace-padded, or empty-component target triples,
  so accepted target strings exactly match the metadata emitted to LLVM and
  forwarded to toolchains. Target family matching is component-aware, so
  substrings such as `notlinux` or `notwasm32` do not accidentally select Linux
  or WebAssembly layouts. JSON-mode build failures report
  `BPL_BUILD_UNSUPPORTED_TARGET`.
  Supported target families: x86_64 Linux, x86_64 macOS, AArch64 Linux,
  AArch64 macOS, i686 Linux, x86_64 Windows, wasm32, wasm64. Focused repro:
  `bun test tests/CodeGenerator.test.ts -t "target" && bun test tests/CLIJsonParseability.test.ts -t "build validation failures"`.
- **Aggregate Addition Type Checking (BUG-148)** - Struct and tuple `+`
  expressions without an overload now fail in type checking instead of
  lowering to invalid LLVM aggregate `add` instructions.
- **Generic and Bool Arithmetic Guard Regression (BUG-149)** - The aggregate
  arithmetic guard now preserves generic parameter arithmetic and canonical
  `bool`/`i1` arithmetic while still rejecting non-overloaded aggregate
  operators before LLVM generation.
- **Package Binary Link Safety (BUG-150)** - Installing package `bin` entries
  now rejects existing non-symlink files in local or global BPL bin directories
  instead of replacing user-owned files with package symlinks.
- **Package Install Target Safety (BUG-151)** - Installing a package now
  rejects existing regular files or symlinks at `bpl_modules/<package>` instead
  of replacing user-owned filesystem entries during package upgrades.
- **Package Uninstall Symlink Safety (BUG-152)** - `bpl uninstall` now rejects
  symlinked package roots in `bpl_modules` instead of treating them as installed
  packages and unlinking the symlink.
- **Package Lock Symlink Safety (BUG-153)** - `bpl install --locked` now rejects
  symlinked or non-directory package roots in `bpl_modules` before manifest
  loading or package hashing can follow them.
- **Package Lock Source Symlink Safety (BUG-154)** - Lock verification now
  treats recorded package source symlinks as unreachable, matching package
  restore/install archive safety checks.
- **Package Lock Transitive Completeness (BUG-155)** - `bpl install --locked`
  now rejects installed transitive dependencies that are missing from
  `bpl.lock` instead of accepting incomplete lockfiles.
- **Package Lock Symlink Path Consistency (BUG-156)** - Broken symlink
  `bpl.lock` paths now produce the same symbolic-link rejection as symlinks
  whose targets still exist, instead of being misreported as missing lockfiles.
- **Package Install Lockfile Symlink Preflight (BUG-157)** - Plain
  `bpl install` now rejects broken symlink `bpl.lock` paths before deciding
  that an otherwise dependency-free project has nothing to install.
- **Package Uninstall Lockfile Symlink Preflight (BUG-158)** - Local
  `bpl uninstall` now rejects symlinked or broken symlink `bpl.lock` paths
  before unlinking binaries or removing installed package files.
- **Package Tree Lockfile Symlink Preflight (BUG-159)** - Dependency-tree
  generation now rejects symlinked or broken symlink `bpl.lock` paths before
  falling back to manifest or installed-package roots.
- **Package Tree Package-Root Symlink Safety (BUG-160)** - Dependency-tree
  generation now reports symlinked `bpl_modules/<package>` roots as invalid
  instead of following them and treating their targets as installed packages.
- **Package Cache Broken Provenance Symlink Cleanup (BUG-161)** -
  `bpl package-cache clean` now removes broken symlink provenance sidecars along
  with cached archives instead of leaving dangling sidecar paths behind.
- **Package Bin Broken Symlink Diagnostics (BUG-162)** - `bpl pack` now reports
  broken symlink `bin` entries as unsupported symlinks instead of as missing
  files.
- **Module Entry Broken Symlink Diagnostics (BUG-163)** - Module resolution now
  reports broken symlink entry files as symbolic links instead of ordinary
  missing files, while valid entry symlinks still normalize to their real path.
- **Module Import Broken Symlink Diagnostics (BUG-164)** - Extension-based
  import resolution now rejects broken symlink candidates before falling back
  to lower-priority extensions, while valid import symlinks still normalize to
  their real module path.
- **Package Uninstall Manifest Symlink Diagnostics (BUG-165)** - `bpl uninstall`
  now classifies broken symlink `bpl.json` manifests with the same
  symbolic-link diagnostic as valid-target manifest symlinks instead of
  reporting the package directory as missing its manifest.
- **Exact Cached Archive Symlink Diagnostics (BUG-167)** - Installing an exact
  cached `.tgz` archive name now uses `lstat`-aware lookup so broken symlink
  cache entries are rejected by archive validation instead of being reported as
  missing packages.
- **File Dependency Archive Symlink Diagnostics (BUG-168)** - `file:` and
  relative archive dependencies now use `lstat`-aware source resolution so
  broken symlink dependency archives are rejected as package archive symlinks
  instead of falling back to package-name lookup.
- **Module Cache Directory Symlink Diagnostics (BUG-169)** - Cached object and
  manifest write preflights now classify `.bpl-cache` parent directories with
  `lstat`, so broken symlink cache directories report symbolic-link diagnostics
  instead of generic non-writable cache errors.
- **Package Cache Candidate Symlink Filtering (BUG-171)** - Package-name and
  semver cache resolution now ignore symlinked `.tgz` cache entries, matching
  `package-cache list` and `package-cache verify`, while exact `.tgz` names
  still report archive symlink diagnostics.
- **Package Import Symlink Fallback Blocking (BUG-172)** - Package entrypoint
  and subpath resolution now stop on symlinked preferred `.bpl` candidates
  instead of silently importing lower-priority `.x` fallbacks.
- **Package Directory Index Symlink Fallback Blocking (BUG-174)** - Package
  directory entrypoint and subpath resolution now also stop on symlinked
  `index.bpl` candidates before considering `index.x`.
- **Package Root Symlink Fallback Blocking (BUG-175)** - Package resolution now
  treats symlinked package roots as terminal metadata failures instead of
  falling through to workspace or global packages with the same import name.
- **Malformed Package Root Fallback Blocking (BUG-176)** - Existing package
  paths that are non-directories or directories missing `bpl.json` now stop
  package resolution instead of falling through to same-name fallback packages.
- **Package Search Directory Symlink Blocking (BUG-180)** - Package resolution
  now rejects symlinked package search directories such as `bpl_modules`,
  workspace `packages`, and configured global package directories before
  probing child package candidates or falling back to lower-priority package
  sources.
- **Package Source Parent Symlink Blocking (BUG-181)** - Nested package
  entrypoint and subpath candidates now reject symlinked parent directories
  inside package roots before reading child files or trying lower-priority
  extension fallbacks.
- **Package Directory Read-Time Symlink Blocking (BUG-182)** - Package listing,
  package-cache listing, and package doctor checks now revalidate package
  search directories with `lstat` before scanning so a post-construction
  symlink swap cannot redirect reads into an external package tree.
- **Global Package Cache Lookup Symlink Blocking (BUG-183)** - Package-name and
  exact cached archive install lookup now revalidate the global package cache
  directory before probing tarballs, rejecting symlinked cache roots and
  reporting missing cache roots as ordinary package misses.
- **Package Install Root Symlink Blocking (BUG-184)** - Direct archive installs
  now revalidate the selected local or global package install root immediately
  before writes, rejecting post-construction symlink swaps while still
  recreating missing real roots.
- **Package Uninstall Root Symlink Blocking (BUG-185)** - Local and global
  package uninstalls now revalidate the selected package root before probing or
  removing package directories, so post-construction symlink swaps cannot
  redirect removals outside the configured package root.
- **Package Binary Unlink Symlink Blocking (BUG-186)** - Package uninstall now
  revalidates local `.bin` and global binary directories before unlinking
  package commands, rejecting symlinked bin-directory swaps while still
  tolerating missing bin directories.
- **Lock Verification Root Symlink Blocking (BUG-187)** - Lock verification now
  revalidates `bpl_modules` before scanning locked package entries, so
  `bpl install --locked` cannot verify external package contents through a
  post-construction package-root symlink swap.
- **Package Archive Parent Symlink Blocking (BUG-188)** - Package archive
  install paths now reject symlinked parent directories before extraction;
  `file:` dependencies get the same guard, and lock verification treats sources
  through symlinked parents as unreachable.
- **Package Manager Directory Parent Symlink Blocking (BUG-189)** -
  Package-manager directory validation now rejects symlinked parent directories
  for existing and newly created package roots, so `package-cache`
  verify/repair/clean and global installs cannot read or write cache archives
  or provenance sidecars through a symlinked cache parent.
- **Module Cache Parent Symlink Blocking (BUG-190)** - Module cache validation
  now rejects symlinked parent directories during construction, cached object
  writes, manifest writes, and cache cleaning; cached object lookups and stats
  ignore objects reached through symlinked parents instead of reusing external
  cache files.
- **Clean Working Directory Symlink Blocking (BUG-191)** - `bpl clean` now
  rejects working directory paths that contain symbolic-link components before
  scanning or removing artifacts, and JSON mode reports the refusal as a
  parseable `success: false` clean report.
- **Shared CLI Output Ancestor Symlink Blocking (BUG-192)** - Shared CLI
  output writes now reject symlinked parent path components before creating
  atomic temp files, preserving final-path and immediate-parent symlink checks
  while preventing format, docs, bindgen, and compile outputs from writing
  through symlinked ancestors.
- **Linker Output Ancestor Symlink Blocking (BUG-193)** - Native linker output
  validation now rejects symlinked parent path components before selecting
  temporary executable paths, revalidates temp outputs before final rename, and
  skips best-effort cleanup through symlinked ancestors.
- **Debug IR Ancestor Symlink Blocking (BUG-194)** - Code generation debug IR
  emission now rejects symlinked parent path components before writing
  diagnostic `.ll` output, preserving existing final-path and immediate-parent
  protections.
- **Module Cache Linked Output Ancestor Symlink Blocking (BUG-195)** -
  `ModuleCache.linkModules` now rejects symlinked parent path components before
  invoking the compiler driver or finalizing cached linked executables.
- **Release Manifest Output Ancestor Symlink Blocking (BUG-196)** - Release
  manifest generation now rejects symlinked output parent path components before
  writing manifest JSON, preserving existing final-output and immediate-parent
  protections.
- **Fuzz Artifact Directory Ancestor Symlink Blocking (BUG-197)** - Compiler
  fuzz crash artifact recording now rejects symlinked crash-directory parent
  path components before creating or writing repro source, minimized source, or
  metadata files.
- **Fuzz Regression Promotion Ancestor Symlink Blocking (BUG-198)** -
  `fuzz:promote` now rejects symlinked corpus-directory parent path components
  before duplicate-name checks, directory creation, or promoted repro writes.
- **Fuzz Promotion Metadata Symlink Blocking (BUG-199)** - `fuzz:promote`
  now rejects symlinked crash metadata paths and symlinked metadata parent
  components before reading metadata or writing `promotedTo` updates.
- **Fuzz Promotion Source Symlink Blocking (BUG-200)** - `fuzz:promote`
  now rejects symlinked source paths and source parent components before reading
  repro source content for corpus promotion.
- **Fuzz Artifact Repro Metadata Symlink Blocking (BUG-201)** -
  `fuzz:repro` metadata discovery now rejects symlinked metadata files and
  symlinked metadata parent components before generating replay or promotion
  commands.
- **Documentation Input Ancestor Symlink Blocking (BUG-202)** - Documentation
  generation now rejects symlinked input parent path components before reading
  source files, while preserving final symlink, non-file, and missing-input
  diagnostics.
- **Bindgen Header Ancestor Symlink Blocking (BUG-203)** - C header binding
  generation now rejects symlinked header parent path components before reading
  input headers, preserving final symlink, broken-symlink, directory, and output
  path protections.
- **Object Parser Input Ancestor Symlink Blocking (BUG-204)** - Object and
  LLVM IR symbol parsing now rejects symlinked input parent path components
  before parsing `.ll`, `.o`, `.obj`, or `.a` files.
- **BPL_HOME Runtime Resource Ancestor Symlink Blocking (BUG-205)** -
  `BPL_HOME`, CLI-injected native runtime objects, linker-added runtime
  resources, and `bpl doctor` runtime checks now reject symlinked parent
  components before grammar or bundled runtime files are read or linked.
- **Run-Script Manifest Ancestor Symlink Blocking (BUG-206)** -
  `bpl run-script` now rejects `bpl.json` paths reached through symlinked
  working-directory parent components before parsing, listing, or executing
  package scripts.
- **Fuzz Replay Output Ancestor Symlink Blocking (BUG-207)** -
  `fuzz:replay --minimize --out` now rejects final output symlinks,
  non-directory output parents, and symlinked output parent components before
  writing minimized repro files.
- **Packed Helper Path Safety Dependency** - The npm package now ships the
  shared path-safety helper required by packed `fuzz:repro` and release helper
  scripts, keeping offline helper usage such as `npm run fuzz:repro -- --help`
  working in installed packages.
- **Packed Helper Package Docs** - Documented packed npm helper scripts
  supported from installed packages, source-only release exclusions such as
  `playground/examples/70-browser-wasm-showcase.json`, local-only playground
  browser wasm helper assets
  `playground/frontend/wasmHostAdapter.js` and
  `playground/frontend/browserWasmRuntime.js`, and the narrow
  `compiler/common/PathSafety.ts` helper dependency kept instead of broad
  compiler sources.
- **Trusted macOS Temp Root Symlinks (BUG-210)** - Shared path-safety checks now
  allow trusted macOS root temp symlinks such as `/var -> /private/var` and
  `/tmp -> /private/tmp`, fixing wasm runtime CI outputs under `os.tmpdir()`
  while still rejecting user-controlled nested symlink ancestors.
- **Global Versioned Package Root Blocking (BUG-216)** - Package imports now
  validate matching global `<package>-X.Y.Z` entries with `lstat` before
  fallback, so symlinked or non-directory higher versions cannot be skipped in
  favor of lower valid package versions.
- **Package Import Manifest Validation**: Package resolution now rejects invalid package import names before searching, rejects malformed package roots whose `bpl.json` `name` or `version` does not satisfy package manifest rules, and rejects versioned global package directories whose manifest `version` does not match the directory version.
- **WebAssembly Linker Selection**: Treat explicit `WASM_LD` settings as authoritative instead of falling back to other linker names on `PATH`, making CI and local wasm linker failure tests deterministic.
- **Unicode String Encoding (BUG-118)**: Fixed LLVM IR generation for strings containing non-ASCII characters. The `escapeString()` function now uses `TextEncoder` to properly compute UTF-8 byte lengths, preventing size mismatches between LLVM IR string constants and their declared array lengths.
- **Runtime Type Checking with `is` Operator (BUG-119)**: Fixed the `is` operator for struct pointer types to perform proper runtime vtable comparison. Previously, `is` only performed compile-time type checking, always returning `true` even for incorrect derived types. Now it correctly checks the actual runtime type via vtable comparison.
- **Safe Downcasting with `as` Operator (BUG-120)**: Fixed the `as` operator for struct pointer types to perform safe runtime downcasting. Previously, `as` would cast any pointer without validation. Now it validates the runtime type via vtable comparison and returns `nullptr` if the types don't match, enabling safe downcast patterns like `local dog: *Dog = animal as *Dog; if (dog != nullptr) { ... }`.
- **VTable Generation for Inherited Structs**: Structs that participate in inheritance hierarchies now properly receive vtables even if they don't define methods. This enables runtime type identification for all polymorphic types.
- **Struct Equality**: Fixed invalid LLVM IR generation (`icmp` on aggregate types) for struct and lambda equality comparisons by implementing member-wise comparison and literal `memcmp` fallback.
- **Pattern Matching Code Generation**:
  - Fixed float literal generation in pattern matching (append `.0` for float types)
  - Fixed type name normalization (float→double, bool→i1) in primitive type detection
  - Fixed register ordering bug in tuple pattern string comparison (strcmpResult before cmpReg)
  - Fixed exit code issues in pattern matching examples (return 0 from main)
- Flag conflicts between main program and subcommands resolved
- Commander.js parent option inheritance issues fixed
- Restored `--eval` and `--stdin` flags for direct code execution
- Type definitions for all new CLI options in `cli/types.ts`
- **Reflection Type Identification**: Fixed a bug where `double` types were incorrectly identified as `void` in `ReflectionGenerator`, ensuring correct `TypeInfo` generation and `Any` construction.
- **Example Projects**: Fixed compilation and runtime issues in multiple existing examples:
  - `json_io_demo`: Added missing test config and fixed imports.
  - `jsonable_test`: Rewrote to use proper `std/json` library and fixed test config.
  - `method_reflection_test`: Fixed standard library imports.
  - `reflection_basic`: Fixed struct layout mismatch by importing `TypeInfo` from `std/reflection.bpl`.
  - `type_match`: Fixed test expectation for double/float types.

### Known Limitations

- See [BUGS.md](BUGS.md) for the current bug ledger. BUG-104 nested tuple pattern matching has since been fixed.

## [Previous Release]

### Added

- **Watch Mode** (`bpl dev` command; formerly the main-command `--watch` flag) for automatic recompilation on file changes
  - Monitors all `.bpl` files in directory tree for changes
  - Automatic recompilation with 100ms debouncing to prevent excessive builds
  - Error recovery: continues watching even after compilation failures
  - Smart filtering: ignores `node_modules`, `.git`, `bpl_modules`, and hidden directories
  - Colorized console output with timestamps and status indicators
  - Runs the program after successful compilation by default; use `--no-run` to only compile
  - See `docs/39-compiler-options.md` for detailed usage guide
- Created `test_config.json` for bug_086_test_simple integration test
  - Tests sizeof operations on type aliases (int, int[10], pointers)
  - Ensures integration test suite has complete coverage

### Fixed

- **BUG-102**: Fixed qualified name resolution for nested generic enums with namespaces (e.g., `std.Option<std.Option<int>>`)
  - Updated `TypeGenerator.resolveType()` to strip namespace prefixes when direct lookup fails
  - Allows using fully qualified enum names in nested generic contexts
  - Fixes compilation errors with enum_chaining_test example
- **BUG-103**: Fixed enum-to-enum casting data payload loss
  - Enhanced `UnaryExpressionGenerator.emitCast()` to copy both discriminant tag and data payload
  - Uses extractvalue/insertvalue for same-size data, memcpy for different sizes
  - Correctly preserves nested enum values during assignment and pattern matching

### Changed

- Updated test suite: **1,342 tests passing** (up from 1,323)
- All integration tests now passing (100% pass rate)
- Enhanced CLI with watch mode support for improved developer experience
- Updated documentation: `docs/39-compiler-options.md`, `docs/03-quick-start.md`, and README.md

## [January 2, 2026]

### Fixed

- Multiple compiler bugs related to enum handling, type resolution, and code generation
- See BUGS.md for complete list of fixed issues (BUG-001 through BUG-103)

### Documentation

- Comprehensive BUGS.md tracking all discovered issues with status and reproduction steps
- Updated README.md with current test counts
- Complete language documentation in docs/ directory (56 documentation files)
- AGENTS.MD with coding assistant instructions for contributors

### Testing

- 1,342 passing tests across 89 test files
- Integration test suite covering all language features
- Unit tests for compiler components (lexer, parser, type checker, code generator)
- Fuzz testing for compiler stability

## Project Overview

**BPL (Best Programming Language)** is a statically-typed, compiled programming language that transpiles to LLVM IR, combining performance and control of systems languages with modern language features.

### Key Features

- LLVM backend with world-class optimization
- Strong static typing with generics and type inference
- Object-oriented with structs, methods, and inheritance
- Module system with package manager
- Exception handling (try/catch)
- Pattern matching and enum types
- Inline assembly support
- Cross-platform compilation
- Built-in code formatter
- VS Code extension with LSP

### Status

The compiler is production-ready with comprehensive test coverage and documentation. Active development continues with new features and optimizations.
