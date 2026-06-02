# Changelog

All notable changes to the BPL compiler project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

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
