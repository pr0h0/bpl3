import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  CI_TRIAGE_JSON_CODE_GROUP_COVERAGE_DECISIONS,
  compareCheckoutToRun,
  formatTriageJsonReport,
  formatTriageSummary,
  localCommandsForStep,
  parseGitHubRunLocator,
  summarizeWorkflowJobs,
  type GitHubWorkflowJob,
} from "../tools/ci_triage";
import {
  extractTestFileReferencesFromCiTriageSource,
  findMissingTestFileReferences,
  formatMissingTestFileReferenceDiagnostics,
} from "./helpers/testReferenceInventory";
import { CLI_JSON_ERROR_CODE_LISTS } from "../cli/JsonErrorCodes";
import { expectJsonStdoutReport } from "./helpers/cliJson";

const REPO_ROOT = join(import.meta.dir, "..");

describe("CI triage helper", () => {
  test("parses GitHub Actions run and job URLs", () => {
    expect(
      parseGitHubRunLocator(
        "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/78678793489",
      ),
    ).toEqual({
      owner: "pr0h0",
      repo: "bpl3",
      runId: 26695335269,
      jobId: 78678793489,
    });

    expect(parseGitHubRunLocator("26695335269")).toEqual({
      owner: "pr0h0",
      repo: "bpl3",
      runId: 26695335269,
    });
  });

  test("maps known CI steps to local reproduction commands", () => {
    expect(localCommandsForStep("Run CI-safe test suite")).toEqual([
      "bun test tests/TestCiRunner.test.ts",
      "bun tools/test_ci.ts --list",
      "bun run test:ci",
    ]);
    expect(
      localCommandsForStep("Run integration and playground examples"),
    ).toEqual([
      "bun test tests/PlaygroundExampleContracts.test.ts tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
      "bun test tests/PlaygroundExampleContracts.test.ts",
      "bun test tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
    ]);
    expect(localCommandsForStep("Run WebAssembly runtime tests")).toEqual([
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
    ]);
    expect(localCommandsForStep("Run compiler correctness tests")).toEqual([
      "bun run test:correctness",
    ]);
    expect(
      localCommandsForStep("Run deterministic differential compiler fuzz"),
    ).toEqual(["bun run fuzz:differential"]);
  });

  test("keeps ci:triage local command test references resolvable", () => {
    const ciTriageSource = readFileSync(
      join(REPO_ROOT, "tools/ci_triage.ts"),
      "utf8",
    );
    const references =
      extractTestFileReferencesFromCiTriageSource(ciTriageSource);

    expect(references.length).toBeGreaterThan(40);
    expect(references).toContainEqual({
      sourceName: "tools/ci_triage.ts local command mappings",
      file: "tests/PlaygroundBrowserWasmRuntime.test.ts",
    });
    expect(references).toContainEqual({
      sourceName: "tools/ci_triage.ts local command mappings",
      file: "tests/PackageResolver.test.ts",
    });

    const missing = findMissingTestFileReferences(references, REPO_ROOT);
    const diagnostics = formatMissingTestFileReferenceDiagnostics(missing);

    expect(diagnostics).toBe("");
  });

  test("extracts ci:triage references only from local command mappings", () => {
    const references = extractTestFileReferencesFromCiTriageSource(
      [
        'const HELP_TEXT = "bun test tests/IgnoredHelp.test.ts";',
        "const EXCLUSIVE_STEP_REPRO_COMMANDS: Array<[RegExp, string]> = [",
        '  [/focused/i, "bun test tests/IncludedExclusive.test.ts"],',
        "];",
        "const STEP_REPRO_COMMANDS: Array<[RegExp, string]> = [",
        '  [/general/i, "bun test tests/IncludedGeneral.test.ts"],',
        "];",
        "export function formatCiTriageHelp(): string {",
      ].join("\n"),
    );

    expect(references).toEqual([
      {
        sourceName: "tools/ci_triage.ts local command mappings",
        file: "tests/IncludedExclusive.test.ts",
      },
      {
        sourceName: "tools/ci_triage.ts local command mappings",
        file: "tests/IncludedGeneral.test.ts",
      },
    ]);
  });

  test("formats stale ci:triage command references with source context", () => {
    const diagnostics = formatMissingTestFileReferenceDiagnostics([
      {
        sourceName: "tools/ci_triage.ts local command mappings",
        file: "tests/RenamedCiTriageTarget.test.ts",
      },
    ]);

    expect(diagnostics).toBe(
      [
        "Stale test file references:",
        "- tools/ci_triage.ts local command mappings: tests/RenamedCiTriageTarget.test.ts",
      ].join("\n"),
    );
  });

  test("maps CI-safe typed runner failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/TestCiRunner.test.ts",
      "bun tools/test_ci.ts --list",
      "bun run test:ci",
    ];

    expect(localCommandsForStep("CI-safe test runner failed")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("tools/test_ci.ts --list failed")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("Run CI-safe unit tests")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "CI-safe validation failed: Failed step: Run CI-safe unit tests",
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep('check: "test-ci" JSON mismatch')).toEqual(
      expectedCommands,
    );
  });

  test("maps VS Code extension type-check failures to focused repro commands", () => {
    const expectedCommands = [
      "npm run compile:test --prefix vscode-ext",
      "npm test --prefix vscode-ext",
      "bun run check",
    ];

    expect(localCommandsForStep("Run VS Code extension type check")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "vscode-ext/src/test/rename.test.ts(726,12): error TS7006: Parameter 'e' implicitly has an 'any' type.",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Cannot find module 'vscode-languageserver-textdocument' or its corresponding type declarations.",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps wasm linker failure text to focused repro commands", () => {
    const expectedCommands = [
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
    ];

    expect(
      localCommandsForStep("BPL_REQUIRE_WASM_LD=1 requires a wasm linker"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("BPL_WASM_LINKER_UNAVAILABLE")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("wasm-ld is required for compiler correctness CI"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("WASM_LD selected linker failed")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "Skipping wasm runtime execution: no usable standalone wasm linker found.",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "This is an optional prerequisite skip, not a successful wasm execution.",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps release smoke failures to packed helper reproduction commands", () => {
    expect(localCommandsForStep("ReleaseSmoke.test")).toEqual([
      "bun run release:smoke",
      "bun test tests/ReleaseSmoke.test.ts",
      'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      "bun test tests/ReleaseHelperSmoke.test.ts",
      "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --help",
      "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --input --json",
      "cd <packed-bpl-v3-package> && npm run fuzz -- --iterations --crash-dir fuzz/crashes",
      "cd <packed-bpl-v3-package> && npm run fuzz:replay -- --metadata --mode parser",
      "cd <packed-bpl-v3-package> && npm run fuzz:promote -- --metadata --name bug",
      "cd <packed-bpl-v3-package> && npm run ci:triage -- --help",
    ]);
    expect(localCommandsForStep("Run release smoke")).toContain(
      "bun run release:smoke",
    );
  });

  test("maps release package allowlist failures to focused metadata commands", () => {
    const expectedCommands = [
      'bun test tests/ReleaseMetadata.test.ts -t "packed tools payload|playground browser wasm helper assets|package helper script inventory"',
      "bun test tests/ReleaseSmoke.test.ts",
      "bun run release:smoke",
    ];

    expect(
      localCommandsForStep(
        "npm tarball includes paths outside the release allowlist",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("npm tarball includes development-only paths"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("npm tarball includes source-only files"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("Unaccounted packed tools payload"),
    ).toEqual(expectedCommands);
  });

  test("maps release cli-registry failures to the focused sync check", () => {
    const expectedCommands = ["bun run release:cli-registry"];

    expect(localCommandsForStep("Run release:cli-registry")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("CLI registry shim is stale")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("tools/cli_json_registry_shim.ts --check failed"),
    ).toEqual(expectedCommands);
  });

  test("maps package resolver JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/PackageResolver.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "package search directory"',
      'bun test tests/CLIJsonParseability.test.ts -t "global package root failures"',
    ];
    const globalSearchDirectoryCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "global package search directory failures"',
      'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      ...expectedCommands,
    ];
    const searchNotDirectoryCommands = [
      'bun test tests/PackageResolver.test.ts -t "non-directory.*package search directories|rejects non-directory global"',
      'bun test tests/CLIJsonParseability.test.ts -t "package search directory|global package search directory failures"',
      'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
    ];

    expect(localCommandsForStep("PackageResolver.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("CLIJsonParseability.test package search directory"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("global package root failures in JSON-mode check"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "global package search directory failures in JSON-mode check",
      ),
    ).toEqual(globalSearchDirectoryCommands);
    expect(
      localCommandsForStep(
        "check packed npm CLI package global search symlink JSON",
      ),
    ).toEqual(globalSearchDirectoryCommands.slice(0, 2));
    expect(localCommandsForStep("BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY")).toEqual(
      searchNotDirectoryCommands,
    );
    expect(
      localCommandsForStep("package search directory is not a directory"),
    ).toEqual(searchNotDirectoryCommands);
    expect(
      localCommandsForStep(
        "check packed npm CLI package local search non-directory JSON",
      ),
    ).toEqual(searchNotDirectoryCommands);
    expect(
      localCommandsForStep(
        "check packed npm CLI package workspace search non-directory JSON",
      ),
    ).toEqual(searchNotDirectoryCommands);
    expect(
      localCommandsForStep(
        "check packed npm CLI package global search non-directory JSON",
      ),
    ).toEqual(searchNotDirectoryCommands);
    expect(localCommandsForStep("BPL_PACKAGE_IMPORT_INVALID")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_PACKAGE_ENTRYPOINT_SYMLINK")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_PACKAGE_ROOT_SYMLINK")).toEqual(
      expectedCommands,
    );
  });

  test("maps explicit package source-file import diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageResolver.test.ts -t "explicit source-file"',
      'bun test tests/CLIJsonParseability.test.ts -t "package import"',
      "bun run check",
    ];

    expect(
      localCommandsForStep(
        "explicit package source-file imports ending in .bpl or .x do not fall back to directory indexes",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("explicit source file shadowed by directory"),
    ).toEqual(expectedCommands);
  });

  test("maps package import casing diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageResolver.test.ts -t "casing|case-mismatched global versioned"',
      'bun test tests/ModuleResolver.test.ts -t "case-mismatched global versioned|filesystem casing"',
      'bun test tests/CLIJsonParseability.test.ts -t "package search directory|module path diagnostic codes|JSON-mode build failures"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_PACKAGE_ROOT_CASE_MISMATCH",
      "BPL_PACKAGE_SEARCH_DIR_CASE_MISMATCH",
      "BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH",
      "BPL_PACKAGE_SUBPATH_CASE_MISMATCH",
      "package root casing does not match filesystem path",
      "package search directory casing does not match filesystem path",
      "entrypoint casing does not match filesystem",
      "subpath 'features/add' casing does not match filesystem",
      "case-mismatched global versioned package diagnostics",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps package docs smoke failures to focused reproduction commands", () => {
    const packageImportDocsCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"',
    ];
    const packageDocsCommands = [
      'bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"',
    ];

    expect(
      localCommandsForStep(
        "CLIJsonParseability.test keeps package/import docs examples covered by JSON smoke fixtures",
      ),
    ).toEqual(packageImportDocsCommands);
    expect(localCommandsForStep("package/import docs examples")).toEqual(
      packageImportDocsCommands,
    );
    expect(
      localCommandsForStep(
        "MarkdownDocs.test package docs document package/import docs smoke fixtures",
      ),
    ).toEqual(packageDocsCommands);
    expect(
      localCommandsForStep(
        "PACKAGE_DOCS_SMOKE_DOCUMENTATION_SNIPPETS missing package docs snippet",
      ),
    ).toEqual(packageDocsCommands);
  });

  test("maps import resolver failures to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/ModuleResolver.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|import diagnostics|JSON-mode build failures"',
    ];

    expect(localCommandsForStep("ModuleResolver.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "reports import diagnostics in JSON-mode build failures",
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("BPL_MODULE_NOT_FOUND")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_MODULE_PATH_SYMLINK")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_IMPORT_STD_PATH_UNSAFE")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("reports module path diagnostic codes"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("should explain invalid package import subpaths"),
    ).toEqual(expectedCommands);
  });

  test("maps explicit std import diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/ModuleResolver.test.ts -t "missing explicit std"',
      'bun test tests/CLI.test.ts -t "missing explicit std"',
      'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
      'bun test tests/MarkdownDocs.test.ts -t "std namespace isolation"',
    ];

    expect(
      localCommandsForStep(
        "Standard library module not found: std/missing.bpl",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("BPL_MODULE_NOT_FOUND while resolving std/missing"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Explicit std/ and std\\ imports do not fall back to package resolution",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "CLI Tests > should preserve unrelated undefined diagnostics with missing explicit std imports timed out after 5000ms",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps stdlib package-name collision diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/MarkdownDocs.test.ts -t "bare stdlib import precedence"',
      'bun test tests/ModuleResolver.test.ts -t "bare stdlib module names"',
      'bun test tests/CLIJsonParseability.test.ts -t "stdlib package-name collisions"',
      "bun run check",
    ];

    for (const stepName of [
      "reports stdlib package-name collisions in JSON-mode check and build diagnostics",
      "should resolve bare stdlib module names before same-name packages",
      "docs document bare stdlib import precedence over packages",
      "Module 'math' does not export 'packageMath'",
      "package named `math` is shadowed by the built-in `math` module",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps missing imported-export diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/ImportHandler.test.ts -t "stable code|available exports"',
      'bun test tests/CLIJsonParseability.test.ts -t "available exports|stdlib package-name collisions"',
      'bun test tests/MarkdownDocs.test.ts -t "missing imported-export"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_IMPORT_EXPORT_NOT_FOUND",
      "reports a stable code when a named import is not exported",
      "Available exports: alpha, zeta.",
      "docs document missing imported-export diagnostic codes",
      "Module './helper.bpl' does not export 'missing'",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps import idempotency diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/ImportIdempotency.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "repeated namespace imports"',
      'bun test tests/Integration.test.ts -t "stack_trace_error|stack_trace_uncaught|test_zero_comprehensive"',
      "bun test tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
      "bun run check",
    ];

    for (const stepName of [
      "ImportIdempotency.test",
      "import idempotency",
      "allows repeated namespace imports from the same module",
      "accepts repeated namespace imports in JSON-mode check diagnostics",
      "repeated_namespace_import.bpl",
      "error[BPL_SYMBOL_ALREADY_DEFINED][errors.bpl:22:1]: Symbol 'Error' is already defined in this scope",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps duplicate-symbol diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
      'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_SYMBOL_ALREADY_DEFINED",
      "Symbol 'Thing' is already defined in this scope",
      "Rename this struct or remove the earlier type alias declaration.",
      "Function 'pick' with this signature is already defined.",
      "Overloads must have different parameter types.",
      "Duplicate parameter name 'value'",
      "Duplicate generic type parameter 'T'",
      "Duplicate field 'x' in struct 'Point'",
      "Duplicate enum variant 'Red' in enum 'Color'",
      "declared multiple times in function 'pick'",
      "reports duplicate top-level symbols in JSON-mode check and build diagnostics",
      "reports duplicate function signatures in JSON-mode check and build diagnostics",
      "reports duplicate function parameters in JSON-mode check and build diagnostics",
      "reports duplicate generic parameters in JSON-mode check and build diagnostics",
      "reports duplicate struct fields in JSON-mode check and build diagnostics",
      "reports duplicate enum variants in JSON-mode check and build diagnostics",
      "docs document duplicate-symbol diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps recursive type-cycle diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerRecursiveTypes.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "recursive struct field cycles|recursive enum variant cycles"',
      'bun test tests/MarkdownDocs.test.ts -t "recursive type-cycle"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_TYPE_RECURSION_CYCLE",
      "recursive type-cycle",
      "Struct 'Node' has infinite size due to recursive field types",
      "Enum 'Tree' has infinite size due to recursive variant types",
      "Struct 'Loop' cannot inherit from itself",
      "Circular inheritance detected",
      "Recursive cycle detected: Node -> Node",
      "Inheritance cycle: A -> B -> A",
      "reports recursive struct field cycles in JSON-mode check and build diagnostics",
      "reports recursive enum variant cycles in JSON-mode check and build diagnostics",
      "docs document recursive type-cycle diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps generic arity diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerGenericArity.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "generic type arity|generic alias arity"',
      'bun test tests/MarkdownDocs.test.ts -t "generic arity"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_GENERIC_ARITY_MISMATCH",
      "generic arity",
      "Generic type 'Box' expects 1 type arguments, but got 2.",
      "Generic type 'Alias' expects 1 type arguments, but got 2.",
      "Check generic argument count.",
      "reports generic type arity failures in JSON-mode check and build diagnostics",
      "reports generic alias arity failures in JSON-mode check and build diagnostics",
      "docs document generic arity diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps undefined type diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerUndefinedTypes.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "undefined-type"',
      'bun test tests/MarkdownDocs.test.ts -t "undefined type"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_TYPE_NOT_FOUND",
      "Undefined type 'MissingThing'",
      "The type is not defined.",
      "variable undefined-type failures",
      "struct field undefined-type failures",
      "reports variable undefined-type failures in JSON-mode check and build diagnostics",
      "reports struct field undefined-type failures in JSON-mode check and build diagnostics",
      "docs document undefined type diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps undefined symbol diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerUndefinedSymbolDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "undefined symbol"',
      'bun test tests/MarkdownDocs.test.ts -t "undefined symbol"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_SYMBOL_NOT_FOUND",
      "Undefined symbol 'missingValue'",
      "Undefined symbol 'missingCall'",
      "Ensure the variable or function is declared before use.",
      "Did you mean 'totalCount'?",
      "value identifiers and missing callee identifiers",
      "reports undefined symbol failures in JSON-mode check and build diagnostics",
      "docs document undefined symbol diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps invalid void diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerVoidTypes.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "invalid void type"',
      'bun test tests/MarkdownDocs.test.ts -t "invalid void type"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_VOID_TYPE_INVALID",
      "Invalid bare void type failures use `BPL_VOID_TYPE_INVALID`",
      "Variable '_value' cannot be void.",
      "Generic type argument cannot be 'void'.",
      "Use '*void' for void pointers.",
      "reports invalid void type failures in JSON-mode check and build diagnostics",
      "docs document invalid void type diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps builtin type redefinition diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerBuiltinRedefinition.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "builtin type redefinition"',
      'bun test tests/MarkdownDocs.test.ts -t "builtin type redefinition"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_BUILTIN_TYPE_REDEFINITION",
      "Cannot redefine builtin type 'bool'",
      "Builtin type names are reserved.",
      "built-in type redefinition",
      "reports builtin type redefinition failures in JSON-mode check and build diagnostics",
      "docs document builtin type redefinition diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps invalid array size diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerInvalidArraySizes.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "invalid array size"',
      'bun test tests/MarkdownDocs.test.ts -t "invalid fixed array size"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_ARRAY_SIZE_INVALID",
      "Array size must be greater than zero.",
      "Arrays cannot have zero or negative size.",
      "Invalid fixed array size failures use `BPL_ARRAY_SIZE_INVALID`",
      "reports invalid array size failures in JSON-mode check and build diagnostics",
      "docs document invalid fixed array size diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps return type mismatch diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerReturnTypeMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "return type mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "return type mismatch"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_RETURN_TYPE_MISMATCH",
      "Return type mismatch: expected i32, got *i8",
      "Ensure the returned value matches the function's return type.",
      "Return type mismatch failures use `BPL_RETURN_TYPE_MISMATCH`",
      "reports return type mismatch failures in JSON-mode check and build diagnostics",
      "docs document return type mismatch diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps assignment type mismatch diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerAssignmentMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "assignment type mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "assignment type mismatch"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_ASSIGNMENT_TYPE_MISMATCH",
      "Type mismatch in assignment: cannot assign string to i32",
      "The assigned value is not compatible with the target variable's type.",
      "Assignment type mismatch failures use `BPL_ASSIGNMENT_TYPE_MISMATCH`",
      "reports assignment type mismatch failures in JSON-mode check and build diagnostics",
      "docs document assignment type mismatch diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps condition type mismatch diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerConditionMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "condition type mismatch"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_CONDITION_TYPE_MISMATCH",
      "If condition must be boolean, got int",
      "Loop condition must be boolean, got int",
      "Ensure the condition evaluates to a boolean.",
      "Condition type mismatch failures use `BPL_CONDITION_TYPE_MISMATCH`",
      "reports condition type mismatch failures in JSON-mode check and build diagnostics",
      "docs document condition type mismatch diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps ternary condition type mismatch diagnostics to focused reproduction commands", () => {
    expect(
      localCommandsForStep("Ternary condition must be boolean, got int"),
    ).toEqual([
      "bun test tests/TypeCheckerConditionMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "condition type mismatch"',
      "bun run check",
    ]);
  });

  test("maps ternary branch type mismatch diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerTernaryBranchMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "ternary branch type mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "ternary branch mismatch"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_TERNARY_BRANCH_TYPE_MISMATCH",
      "Ternary branches must have compatible types: int vs string",
      "Both branches must return the same type.",
      "Ternary branch type mismatch failures use `BPL_TERNARY_BRANCH_TYPE_MISMATCH`",
      "reports ternary branch type mismatch failures in JSON-mode check and build diagnostics",
      "docs document ternary branch mismatch diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps switch mismatch diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerSwitchMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "switch type mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "switch mismatch"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_SWITCH_VALUE_TYPE_MISMATCH",
      "BPL_SWITCH_CASE_TYPE_MISMATCH",
      "Switch value must be an integer, string or enum type, got double",
      "Case pattern type string not compatible with switch value type i32",
      "Ensure the switch expression evaluates to an integer, string or enum.",
      "Ensure case patterns match the switch value type.",
      "Switch mismatch failures use `BPL_SWITCH_VALUE_TYPE_MISMATCH` and `BPL_SWITCH_CASE_TYPE_MISMATCH`",
      "reports switch type mismatch failures in JSON-mode check and build diagnostics",
      "docs document switch mismatch diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps call-site mismatch diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerCallSiteMismatch.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "call-site mismatch"',
      'bun test tests/MarkdownDocs.test.ts -t "call-site mismatch"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_CALL_TARGET_NOT_CALLABLE",
      "BPL_CALL_ARGUMENT_COUNT_MISMATCH",
      "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      "BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH",
      "BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH",
      "Type 'Box' is not callable",
      "Only functions or types with __call__ operator can be called.",
      "No matching function for call to 'take' with 0 arguments.",
      "No matching function for call to 'take' with provided argument types.",
      "Available overloads:",
      "Enum variant 'Move' expects 2 arguments, but got 1",
      "Usage: Message.Move(",
      "Type mismatch for argument 2 of 'Move': expected i32, got string",
      "Check the variant definition and argument types.",
      "Call-site mismatch failures use `BPL_CALL_TARGET_NOT_CALLABLE`",
      "reports call-site mismatch failures in JSON-mode check and build diagnostics",
      "docs document call-site mismatch diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps control-flow misuse diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerControlFlowMisuse.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "control-flow misuse"',
      'bun test tests/MarkdownDocs.test.ts -t "control-flow misuse"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_BREAK_OUTSIDE_CONTEXT",
      "BPL_CONTINUE_OUTSIDE_LOOP",
      "BPL_FALLTHROUGH_OUTSIDE_SWITCH",
      "BPL_DEFER_RETURN_VALUE_INVALID",
      "'break' statement outside of loop or switch",
      "'continue' statement outside of loop",
      "'fallthrough' statement outside of switch",
      "Return with value not allowed in defer block",
      "Break statements can only be used inside loops or switch statements.",
      "Continue statements can only be used inside loops.",
      "Fallthrough statements can only be used inside switch statements.",
      "Defer blocks must return void.",
      "Control-flow misuse failures use `BPL_BREAK_OUTSIDE_CONTEXT`",
      "reports control-flow misuse failures in JSON-mode check and build diagnostics",
      "docs document control-flow misuse diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps binary operator misuse diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerBinaryOperatorMisuse.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "binary operator misuse"',
      'bun test tests/MarkdownDocs.test.ts -t "binary operator misuse"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_POINTER_ARITHMETIC_VOID",
      "BPL_POINTER_DIFFERENCE_TYPE_MISMATCH",
      "BPL_STRING_CONCAT_UNSUPPORTED",
      "BPL_LOGICAL_OPERAND_TYPE_MISMATCH",
      "BPL_COMPARISON_TYPE_MISMATCH",
      "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
      "BPL_MODULO_OPERAND_TYPE_MISMATCH",
      "BPL_BINARY_OPERAND_TYPE_MISMATCH",
      "BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH",
      "Cannot perform pointer arithmetic on void pointer",
      "Cannot compare pointer difference between",
      "String concatenation with '+' is not supported.",
      "Logical operators require boolean operands",
      "Cannot compare int and string",
      "Bitwise operators require integer operands",
      "Modulo operator requires integer operands",
      "Type mismatch: int and string",
      "Operator '+' cannot be applied to types",
      "Cast to a sized pointer type first",
      "Pointer subtraction requires compatible pointee types.",
      "Use 'string_concat(a, b)' or similar helper functions.",
      "Ensure both operands are boolean expressions.",
      "Operands must be of compatible types.",
      "Ensure both operands are integers.",
      "Ensure operands have compatible types.",
      "Arithmetic operators require numeric types.",
      "Binary operator misuse failures use `BPL_POINTER_ARITHMETIC_VOID`",
      "reports binary operator misuse failures in JSON-mode check and build diagnostics",
      "docs document binary operator misuse diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps unary operator misuse diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerUnaryOperatorMisuse.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "unary operator misuse"',
      'bun test tests/MarkdownDocs.test.ts -t "unary operator misuse"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_DEREFERENCE_TARGET_INVALID",
      "BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH",
      "BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH",
      "BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH",
      "BPL_UNARY_PLUS_UNSUPPORTED",
      "Cannot dereference non-pointer type int",
      "Logical not requires boolean operand",
      "Bitwise not requires integer operand",
      "Unary operator '-' cannot be applied to type 'string'",
      "Unary plus operator '+' is not supported",
      "Dereference requires a pointer type.",
      "Ensure the operand is a boolean expression.",
      "Ensure the operand is an integer.",
      "Negation requires a numeric type.",
      "Simply remove the '+' prefix.",
      "Unary operator misuse failures use `BPL_DEREFERENCE_TARGET_INVALID`",
      "reports unary operator misuse failures in JSON-mode check and build diagnostics",
      "docs document unary operator misuse diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps index expression misuse diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerIndexExpressionMisuse.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "index expression misuse"',
      'bun test tests/MarkdownDocs.test.ts -t "index expression misuse"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_ARRAY_INDEX_TYPE_MISMATCH",
      "BPL_POINTER_INDEX_TYPE_MISMATCH",
      "BPL_INDEX_TARGET_NOT_INDEXABLE",
      "Array index must be an integer, got float",
      "Pointer index must be an integer, got bool",
      "Type 'i32' is not indexable",
      "Ensure the index expression evaluates to an integer.",
      "Only arrays, pointers, or types with __get__ operator can be indexed.",
      "Index expression misuse failures use `BPL_ARRAY_INDEX_TYPE_MISMATCH`",
      "reports index expression misuse failures in JSON-mode check and build diagnostics",
      "docs document index expression misuse diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps member access misuse diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerMemberAccessMisuse.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "member access misuse"',
      'bun test tests/MarkdownDocs.test.ts -t "member access misuse"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_STATIC_MEMBER_NOT_FOUND",
      "BPL_INSTANCE_METHOD_NOT_COMPATIBLE",
      "BPL_TUPLE_INDEX_INVALID",
      "BPL_MEMBER_NOT_FOUND",
      "No static member 'x' found on type 'S'",
      "No compatible instance method 'staticFunc' found on type 'S'",
      "Invalid tuple index '2'",
      "Cannot access member 'y' on type 'S'",
      "Ensure the member is static (does not take 'this').",
      "Static methods must be called on the type, not an instance.",
      "Valid indices are 0-1",
      "Check the type definition for available members.",
      "Member access misuse failures use `BPL_STATIC_MEMBER_NOT_FOUND`",
      "reports member access misuse failures in JSON-mode check and build diagnostics",
      "docs document member access misuse diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps expression semantic guard diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerExpressionSemanticGuards.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "expression semantic guard"',
      'bun test tests/MarkdownDocs.test.ts -t "expression semantic guard"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_DIVISION_BY_ZERO",
      "BPL_SHIFT_COUNT_INVALID",
      "BPL_ADDRESS_OF_CONSTANT",
      "BPL_ADDRESS_OF_TARGET_INVALID",
      "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
      "BPL_CAST_INTEGER_TO_STRING",
      "BPL_CAST_INVALID",
      "BPL_SIZEOF_VOID_INVALID",
      "Division by zero",
      "Negative shift count",
      "Shift count 8 is out of range",
      "Cannot take address of constant expression.",
      "Cannot take address of (int, int)",
      "Array literal has inconsistent element types",
      "Cannot cast integer type 'i32' to 'string'",
      "Cannot cast i32 to Box",
      "Cannot take size of void",
      "Shift counts must be zero or greater.",
      "Address-of requires an lvalue.",
      "All elements in an array literal must have the same type.",
      "This cast is not allowed.",
      "Void type has no size.",
      "Expression semantic guard failures use `BPL_DIVISION_BY_ZERO`",
      "reports expression semantic guard failures in JSON-mode check and build diagnostics",
      "docs document expression semantic guard diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps statement semantic guard diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerStatementSemanticGuards.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "statement semantic guard"',
      'bun test tests/MarkdownDocs.test.ts -t "statement semantic guard"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_VARIABLE_TYPE_ANNOTATION_MISSING",
      "BPL_VARIABLE_REDECLARATION",
      "BPL_INTEGER_LITERAL_OVERFLOW",
      "BPL_ASSIGNMENT_TARGET_CONSTANT",
      "BPL_ASSIGNMENT_TARGET_INVALID",
      "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
      "Missing type annotation for variable 'value'",
      "Variable 'value' is already declared in this scope",
      "Integer overflow: value 128 does not fit in type i8",
      "Cannot assign to constant 'value'",
      "Invalid assignment target",
      "Invalid assignment target in tuple destructuring",
      "Variables must have explicit type annotations.",
      "Cannot redeclare 'value' in the same scope.",
      "Ensure the value is within the range of i8.",
      "Constants cannot be modified.",
      "Left-hand side of assignment must be a variable",
      "Tuple elements in assignment must be valid l-values",
      "Statement semantic guard failures use `BPL_VARIABLE_TYPE_ANNOTATION_MISSING`",
      "reports statement semantic guard failures in JSON-mode check and build diagnostics",
      "docs document statement semantic guard diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps struct literal diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerStructLiteralDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "struct literal diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "struct literal diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_STRUCT_LITERAL_UNKNOWN_STRUCT",
      "BPL_STRUCT_LITERAL_FIELD_MISSING",
      "BPL_STRUCT_LITERAL_FIELD_UNKNOWN",
      "BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH",
      "Unknown struct 'Missing'",
      "Generic type 'Box' expects 1 arguments, but got 2",
      "Missing field 'y' in struct literal for 'Point'",
      "Unknown field 'z' in struct 'Point'",
      "Type mismatch for field 'x': expected i32, got *i8",
      "Ensure the struct is defined.",
      "Provide the correct number of generic arguments.",
      "Field 'y' is required.",
      "Check the struct definition for valid fields.",
      "Field value must match the declared type.",
      "Struct literal semantic failures use `BPL_STRUCT_LITERAL_UNKNOWN_STRUCT`",
      "reports struct literal diagnostics failures in JSON-mode check and build diagnostics",
      "docs document struct literal diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps enum variant field diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerEnumVariantFieldDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "enum variant field diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "enum variant field diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_ENUM_VARIANT_FIELD_UNKNOWN",
      "BPL_ENUM_VARIANT_FIELD_TYPE_MISMATCH",
      "Unknown field 'z' in variant 'MouseMove'",
      "Enum variant field semantic failures use `BPL_ENUM_VARIANT_FIELD_UNKNOWN`",
      "reports enum variant field diagnostics failures in JSON-mode check and build diagnostics",
      "docs document enum variant field diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps intrinsic call diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerIntrinsicCallDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "intrinsic call diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "intrinsic call diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_INTRINSIC_GENERIC_ARITY_MISMATCH",
      "BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH",
      "Intrinsic __type_id requires exactly 1 generic argument",
      "Intrinsic __type_info accepts no arguments",
      "Use __type_id<T>() with exactly one type argument.",
      "Call __type_info<T>() without value arguments.",
      "Intrinsic call semantic failures use `BPL_INTRINSIC_GENERIC_ARITY_MISMATCH`",
      "reports intrinsic call diagnostics failures in JSON-mode check and build diagnostics",
      "docs document intrinsic call diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps match exhaustiveness diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerMatchExhaustivenessDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "match exhaustiveness diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "match exhaustiveness diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
      "Non-exhaustive match: missing variants: Blue",
      "Non-exhaustive match: missing default case (_)",
      "Match expressions must handle all enum variants or include a wildcard (_) pattern.",
      "Type matching requires a default case.",
      "Match exhaustiveness failures use `BPL_MATCH_EXHAUSTIVENESS_MISMATCH`",
      "reports match exhaustiveness diagnostics failures in JSON-mode check and build diagnostics",
      "docs document match exhaustiveness diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps tuple pattern diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerTuplePatternDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "tuple pattern diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "tuple match pattern diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH",
      "BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH",
      "Tuple pattern used on non-tuple type",
      "Tuple pattern has 3 elements, but type has 2",
      "Expected tuple type, got BasicType",
      "Pattern and type must have the same number of elements",
      "Tuple match pattern failures use `BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH`",
      "reports tuple pattern diagnostics failures in JSON-mode check and build diagnostics",
      "docs document tuple match pattern diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps type-query diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerTypeQueryDiagnostics.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "type-query diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "type-query diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_TYPE_QUERY_ENUM_NOT_FOUND",
      "BPL_TYPE_QUERY_TYPE_NOT_FOUND",
      "Cannot find enum 'Missing'",
      "Unknown type 'MissingType'",
      "Unknown type: MissingType",
      "The type 'Missing' in match<Missing.Some> is not a defined enum.",
      "The type 'MissingType' in match<MissingType> is not defined.",
      "The type 'Missing' in 'is' expression is not a defined enum.",
      "Type-query failures use `BPL_TYPE_QUERY_ENUM_NOT_FOUND`",
      "reports type-query diagnostics failures in JSON-mode check and build diagnostics",
      "docs document type-query diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps function-attribute diagnostics to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/TypeCheckerFunctionAttributeDiagnostics.test.ts",
      "bun test tests/FunctionAttributes.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "function-attribute diagnostics"',
      'bun test tests/MarkdownDocs.test.ts -t "function-attribute diagnostic"',
      "bun run check",
    ];

    for (const stepName of [
      "BPL_FUNCTION_ATTRIBUTE_UNKNOWN",
      "BPL_FUNCTION_ATTRIBUTE_DUPLICATE",
      "BPL_FUNCTION_ATTRIBUTE_CONFLICT",
      "BPL_FUNCTION_ATTRIBUTE_NORETURN_RETURN_TYPE_MISMATCH",
      "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_TYPE_MISMATCH",
      "Unknown function attribute 'trace'",
      "Duplicate function attribute 'inline'",
      "Conflicting function attributes: always_inline, noinline",
      "Function attribute 'noreturn' requires a void return type",
      "Function attribute 'auto_destroy' requires receiver type '*Resource'",
      "Function-attribute failures use `BPL_FUNCTION_ATTRIBUTE_UNKNOWN`",
      "reports function-attribute diagnostics failures in JSON-mode check and build diagnostics",
      "docs document function-attribute diagnostic codes",
    ]) {
      expect(localCommandsForStep(stepName), stepName).toEqual(
        expectedCommands,
      );
    }
  });

  test("maps build JSON validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "build validation failures"',
      "bun test tests/CLIJsonParseability.test.ts",
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_BUILD_INVALID_OPTIMIZATION")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_BUILD_OUTPUT_PARENT_NOT_FOUND")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "keeps JSON-mode build validation failures parseable on stdout",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("Output directory not found in build --json"),
    ).toEqual(expectedCommands);
  });

  test("maps root build no-input JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "root build JSON no-input"',
      'bun test tests/CLI.test.ts -t "no-input compile"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_BUILD_NO_INPUTS")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("No input files specified in root build --json"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("keeps root build JSON no-input failures parseable"),
    ).toEqual(expectedCommands);
  });

  test("maps clean JSON validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "clean JSON validation failures"',
      'bun test tests/CLI.test.ts -t "clean"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_CLEAN_WORKDIR_SYMLINK")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_CLEAN_GIT_TRACKED_UNAVAILABLE")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "Clean working directory path contains a symbolic link",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Could not determine git-tracked files; refusing to clean in a git repository.",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps format JSON validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLI.test.ts -t "format check results and validation failures as JSON"',
      'bun test tests/CLI.test.ts -t "format files|check formatting without rewriting files|reject symlinked files when formatting"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_FORMAT_NOT_FORMATTED")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_FORMAT_INPUT_NOT_FOUND")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_FORMAT_JSON_REQUIRES_CHECK")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("File is not formatted in format --check --json"),
    ).toEqual(expectedCommands);
  });

  test("maps atomic-write permission failures to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/CLIUtils.test.ts",
      'bun test tests/CLI.test.ts -t "format files in write mode atomically"',
    ];

    expect(
      localCommandsForStep(
        "CLI utils > preserves file permissions when replacing existing files",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "expected 484 received 448 in writeFileAtomically permission preservation",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "format files in write mode atomically and preserve executable permissions",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps package atomic mode failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageManager.test.ts -t "lockfile permissions|package provenance permissions|package archive permissions|global cache archive permissions"',
      'bun test tests/PackageManagerCLI.test.ts -t "lockfile permissions|package archive permissions|global cache archive permissions"',
      "bun run check",
    ];

    expect(
      localCommandsForStep(
        "PackageManager > should preserve existing global cache archive permissions when replacing",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "expected 416 received 384 in package provenance permissions",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "PackageManagerCLI global cache archive mode preservation failed",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "PackageManager > should preserve existing package archive permissions when rewriting",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "PackageManagerCLI package archive permissions expected 416 received 384",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps executable output mode failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/BinaryRunner.test.ts -t "executable permissions"',
      'bun test tests/Linker.test.ts -t "linked output permissions"',
      'bun test tests/ModuleCache.test.ts -t "linked output permissions"',
      "bun run check",
    ];

    expect(
      localCommandsForStep(
        "BinaryRunner > preserves existing executable permissions when replacing output",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Linker linked output permissions expected 493 received 384",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "ModuleCache cached linked output mode preservation failed",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps module-cache manifest mode failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/ModuleCache.test.ts -t "manifest permissions"',
      "bun run check",
    ];

    expect(
      localCommandsForStep(
        "ModuleCache > preserves existing manifest permissions when rewriting",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "module cache manifest permissions expected 416 received 384",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps debug IR path failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CodeGenerator.test.ts -t "debug IR"',
      "bun run check",
    ];

    expect(
      localCommandsForStep("Debug IR path is a symbolic link"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "CodeGenerator reports missing debug IR parent directories",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Debug IR parent path contains a symbolic link",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps bindgen JSON validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLI.test.ts -t "bindgen success and validation failures as JSON"',
      'bun test tests/CLI.test.ts -t "bindgen"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_BINDGEN_HEADER_NOT_FILE")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_BINDGEN_OUTPUT_DIRECTORY")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_BINDGEN_HEADER_PARENT_SYMLINK")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("Header path is not a file in bindgen --json"),
    ).toEqual(expectedCommands);
  });

  test("maps docs JSON validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLI.test.ts -t "documentation generation success and validation failures as JSON"',
      'bun test tests/CLI.test.ts -t "documentation"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_DOCS_INPUT_NOT_FILE")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_DOCS_OUTPUT_DIRECTORY")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_DOCS_INPUT_PARENT_SYMLINK")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("Documentation input is not a file in docs --json"),
    ).toEqual(expectedCommands);
  });

  test("maps completion JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "completion JSON"',
      'bun test tests/CLI.test.ts -t "shell completions"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_COMPLETION_SHELL_UNSUPPORTED")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("completion JSON contract failure")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("Unsupported shell in bpl completion --json"),
    ).toEqual(expectedCommands);
  });

  test("maps version JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "version JSON"',
      "bun test tests/JsonContracts.test.ts",
      "bun run check",
    ];

    expect(localCommandsForStep("version JSON contract failure")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("bpl --version --json parse failure")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("check: \"version\" mismatch")).toEqual(
      expectedCommands,
    );
  });

  test("maps JSON color-purity failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "forced-color JSON"',
      'bun test tests/CLI.test.ts -t "explicit color flags"',
      "bun run check",
    ];

    expect(
      localCommandsForStep(
        'JSON string at $.error contains ANSI escape sequence "\\u001b[1m"',
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("forced-color JSON contract failure")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("build --json --color emitted colored JSON"),
    ).toEqual(expectedCommands);
  });

  test("maps doctor scope JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "doctor scope failures"',
      "bun test tests/CLIJsonParseability.test.ts",
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_DOCTOR_SCOPE_UNKNOWN")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("Unknown doctor scope 'bad-scope'")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("doctor unknown scope JSON failure")).toEqual(
      expectedCommands,
    );
  });

  test("maps run-script JSON validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "run-script JSON validation failures"',
      'bun test tests/CLI.test.ts -t "run-script"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_RUN_SCRIPT_COMMAND_EMPTY")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "bpl.json parent path contains a symbolic link in run-script --json",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("Script 'missing' not found in bpl.json"),
    ).toEqual(expectedCommands);
  });

  test("maps check and lint JSON input validation failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "check and lint JSON input validation"',
      'bun test tests/CLI.test.ts -t "source analysis|missing files in check JSON"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_CHECK_INPUT_NOT_FOUND")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_CHECK_INPUT_SYMLINK")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_LINT_INPUT_NOT_FILE")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "check and lint JSON input validation failures are missing errorCode",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps check and lint JSON no-input failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "no-input failures"',
      'bun test tests/CLI.test.ts -t "no-input source analysis"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_CHECK_NO_INPUTS")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_LINT_NO_INPUTS")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("check --json No files specified."),
    ).toEqual(expectedCommands);
  });

  test("maps package source-safety JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "entrypoint|subpath|manifest"',
      "bun test tests/PackageResolver.test.ts",
    ];

    expect(
      localCommandsForStep("entrypoint resolves to a symbolic link candidate"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("unsafe entrypoint '../outside.bpl'")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "subpath 'features/add' resolves to a symbolic link candidate",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps package import manifest failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "malformed package manifests|package manifest symlink|missing package manifests"',
      'bun test tests/PackageResolver.test.ts -t "manifest"',
      'bun test tests/ModuleResolver.test.ts -t "manifest"',
      "bun run check",
    ];

    expect(
      localCommandsForStep(
        "BPL_PACKAGE_MANIFEST_PARSE_ERROR in JSON-mode build diagnostics",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "reports malformed package manifests in JSON-mode check and build diagnostics",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("manifest path is a symbolic link"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("missing package manifests")).toEqual(
      expectedCommands,
    );
  });

  test("maps package install JSON contract failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      'bun test tests/PackageManagerCLI.test.ts -t "install command|doctor packages command"',
    ];

    expect(localCommandsForStep("PackageJsonFailureContracts.test")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("package-install JSON failure")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("BPL_LOCKFILE_UNSUPPORTED_VERSION in packages JSON"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("BPL_PACKAGE_INSTALL_LOCKED_UPDATE_CONFLICT"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("BPL_PACKAGE_LOCK_VERIFY_FAILED")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_PACKAGE_ARCHIVE_NOT_FILE")).toEqual(
      expectedCommands,
    );
  });

  test("maps package manifest JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageJsonFailureContracts.test.ts -t "package manifest error codes"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_PACKAGE_MANIFEST_PARSE_ERROR")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_PACKAGE_MANIFEST_NOT_OBJECT")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("PackageManager manifest-loading failure"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("package manifest error codes from install JSON"),
    ).toEqual(expectedCommands);
  });

  test("maps package-cache validation JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache version filter"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_PACKAGE_CACHE_VERSION_INVALID")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("Package-cache validation failures from clean JSON"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("package-cache version filter errorCode regression"),
    ).toEqual(expectedCommands);
  });

  test("maps package-cache name JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache package filter"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_PACKAGE_CACHE_NAME_INVALID")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("package-cache package filter invalid name"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("invalid package-cache package name JSON"),
    ).toEqual(expectedCommands);
  });

  test("maps package uninstall JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageManagerCLI.test.ts -t "uninstall success and failures as JSON"',
      'bun test tests/PackageManagerCLI.test.ts -t "uninstall command"',
      "bun run check",
    ];

    expect(
      localCommandsForStep("BPL_PACKAGE_UNINSTALL_NOT_INSTALLED"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("BPL_PACKAGE_UNINSTALL_NAME_INVALID"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("package-uninstall JSON contract failure"),
    ).toEqual(expectedCommands);
  });

  test("maps package pack JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageManagerCLI.test.ts -t "pack success and failures as JSON"',
      'bun test tests/PackageManagerCLI.test.ts -t "pack command"',
      "bun run check",
    ];

    expect(localCommandsForStep("package-pack JSON contract failure")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("pack JSON report failure")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("BPL_PACKAGE_MANIFEST_MISSING package-pack"),
    ).toEqual(expectedCommands);
  });

  test("maps package init JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/PackageManagerCLI.test.ts -t "init success and failures as JSON"',
      'bun test tests/PackageManagerCLI.test.ts -t "init command"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_PACKAGE_INIT_NAME_INVALID")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_PACKAGE_INIT_MANIFEST_EXISTS")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("package-init JSON contract failure"),
    ).toEqual(expectedCommands);
  });

  test("maps project creation JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLI.test.ts -t "new project success and failures as JSON"',
      'bun test tests/CLI.test.ts -t "scaffold library|reject invalid project names|existing non-directory project paths"',
      "bun run check",
    ];

    expect(localCommandsForStep("BPL_NEW_NAME_INVALID")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_NEW_TEMPLATE_INVALID")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("BPL_NEW_PATH_EXISTS_DIRECTORY")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("project-new JSON contract failure")).toEqual(
      expectedCommands,
    );
  });

  test("maps exported JSON error-code inventory to local repro commands", () => {
    const unmappedCodes: string[] = [];

    for (const { name, codes } of CLI_JSON_ERROR_CODE_LISTS) {
      for (const code of codes) {
        if (localCommandsForStep(code).length === 0) {
          unmappedCodes.push(`${name}:${code}`);
        }
      }
    }

    expect(unmappedCodes).toEqual([]);
  });

  test("records coverage decisions for each exported JSON error-code group", () => {
    const registryGroupNames = CLI_JSON_ERROR_CODE_LISTS.map(
      ({ name }) => name,
    ).sort();
    const decisionGroupNames = CI_TRIAGE_JSON_CODE_GROUP_COVERAGE_DECISIONS.map(
      ({ groupName }) => groupName,
    ).sort();

    expect(decisionGroupNames).toEqual(registryGroupNames);

    const decisionsByGroup = new Map(
      CI_TRIAGE_JSON_CODE_GROUP_COVERAGE_DECISIONS.map((decision) => [
        decision.groupName,
        decision,
      ]),
    );

    for (const { name, codes } of CLI_JSON_ERROR_CODE_LISTS) {
      const decision = decisionsByGroup.get(name);

      expect(decision, `${name} has a triage coverage decision`).toBeDefined();
      expect(decision?.reason.length ?? 0).toBeGreaterThan(20);

      if (decision?.coverage === "mapped") {
        const unmappedCodes = codes.filter(
          (code) => localCommandsForStep(code).length === 0,
        );

        expect(unmappedCodes, `${name} mapped codes`).toEqual([]);
      } else {
        expect(decision?.coverage).toBe("excluded");
      }
    }
  });

  test("maps wasm runtime execution failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/WasmRuntime.test.ts",
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
    ];

    expect(localCommandsForStep("WasmRuntime.test")).toEqual(expectedCommands);
    expect(
      localCommandsForStep("WebAssembly runtime execution should trap"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("routes hosted wasm stdout through host imports"),
    ).toEqual(expectedCommands);
  });

  test("maps playground browser wasm failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/PlaygroundBrowserWasmRuntime.test.ts tests/PlaygroundWasmHostAdapter.test.ts tests/PlaygroundStaticAssets.test.ts tests/WasmHostImportContract.test.ts",
      "bun run test:wasm",
      "bun run check",
    ];

    expect(localCommandsForStep("PlaygroundBrowserWasmRuntime.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("BplBrowserCompiler.compileToHostedWasm missing"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "BplWasmHostAdapter.runHostedWasmInBrowser is not a function",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "BPL browser wasm runtime script must load before app.js",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps playground example contract failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/PlaygroundExampleContracts.test.ts",
      "bun test tests/PlaygroundWasmExamples.test.ts",
      'bun test tests/PlaygroundExamples.test.ts -t "Example 70|includes advanced"',
      "bun run check",
    ];

    expect(localCommandsForStep("PlaygroundExampleContracts.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("playground example contract parser"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "playground/examples/70-browser-wasm-showcase.json: expectedOutput[1] must be a string",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps playground process execution failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/PlaygroundNativeExecution.test.ts",
      "bun test tests/PlaygroundProcessRunner.test.ts",
      'bun test tests/PlaygroundExamples.test.ts -t "shell metacharacter args|argv-vector execution"',
      'bun test tests/TutorialExamples.test.ts -t "argv-vector execution"',
      "bun run check",
    ];

    expect(localCommandsForStep("PlaygroundNativeExecution.test")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("PlaygroundProcessRunner.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "Playground native execution response shaping > preserves stdout and stderr for nonzero runtime failures",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("Execution timeout (25ms) in native execution"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Playground process runner > does not surface stdin pipe errors after a successful child exit",
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("runProcessFile(binFile, args")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "passes shell metacharacter args literally and preserves stdin",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "backend server runs compiled programs through argv-vector execution",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps sanitizer runtime failures to focused repro commands", () => {
    const expectedCommands = [
      "bun run test:sanitizers",
      "bun test tests/CompilerSanitizerRuntime.test.ts",
      "bun index.ts doctor sanitizer --json",
    ];

    expect(localCommandsForStep("Run sanitizer-backed runtime tests")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("CompilerSanitizerRuntime.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "Compiler sanitizer-backed runtime tests > routes checked runtime failures through BPL errors under ASan and UBSan",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "Compiler sanitizer-backed runtime tests timed out after 5000ms",
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("BPL_SANITIZER_RUNTIME_UNAVAILABLE")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "compiler-rt/libclang_rt sanitizer support probe failed",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps scheduled fuzz artifact failures to replay and validation guidance", () => {
    const expectedCommands = [
      "bun run fuzz:repro -- fuzz/crashes",
      "bun run fuzz:validate-artifacts",
      "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json",
      "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --mode parser,typecheck,codegen,runtime,differential,sanitizer",
      "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --minimize --out fuzz/crashes/<artifact>.min.bpl",
    ];

    expect(localCommandsForStep("compiler-fuzz-crashes artifact")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "fuzz/crashes/crash_seed-cafe_iter-1_tokens.json",
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("Upload fuzz crash artifacts")).toEqual(
      expectedCommands,
    );
  });

  test("maps timeout failure text to focused repro commands", () => {
    expect(
      localCommandsForStep("compiler driver timed out after 600000ms"),
    ).toEqual([
      "bun index.ts doctor --json",
      "bun run test:ci",
      "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
    ]);
    expect(localCommandsForStep("BPL_COMPILE_DRIVER_TIMEOUT_MS=abc")).toEqual([
      "bun index.ts doctor --json",
      "bun run test:ci",
      "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
    ]);

    expect(
      localCommandsForStep("tar tool timed out while extracting package"),
    ).toEqual([
      "bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts",
      "bun index.ts doctor packages --json",
      "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
      'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
    ]);
    expect(localCommandsForStep("BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=0")).toEqual([
      "bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts",
      "bun index.ts doctor packages --json",
      "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
      'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
    ]);

    expect(localCommandsForStep("object symbol parsing timed out")).toEqual([
      "bun test tests/ObjectFileParser.test.ts",
      "bun index.ts doctor --json",
      "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
    ]);

    expect(localCommandsForStep("wasm linker probe timed out")).toEqual([
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
      "BPL_WASM_LINKER_PROBE_TIMEOUT_MS=5000 bun run test:wasm",
    ]);

    expect(
      localCommandsForStep(
        "CLIJsonParseability.test reports module path diagnostic codes in JSON-mode check and build diagnostics timed out after 5000ms",
      ),
    ).toEqual([
      'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|missing explicit std imports"',
      "bun test tests/CLIJsonParseability.test.ts",
      "bun run check",
    ]);

    expect(localCommandsForStep("Executable timed out after 5000ms")).toEqual([
      "bun test tests/BinaryRunner.test.ts",
      "BPL_RUN_TIMEOUT_MS=30000 bun test tests/BinaryRunner.test.ts",
      "bun run test:ci",
    ]);
  });

  test("maps integration concurrency failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/IntegrationRunner.test.ts",
      "BPL_INTEGRATION_JOBS=4 bun run test:ci",
      "bun run test:ci",
    ];

    expect(localCommandsForStep("IntegrationRunner.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "Ignoring invalid BPL_INTEGRATION_JOBS=1.5; expected a positive integer",
      ),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("integration job concurrency")).toEqual(
      expectedCommands,
    );
  });

  test("maps integration config validation failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/IntegrationConfig.test.ts",
      'bun test tests/Integration.test.ts -t "example test configs valid"',
      "bun run check",
    ];

    expect(localCommandsForStep("IntegrationConfig.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep(
        "examples/generics_map/test_config.json: unsupported key expected_output",
      ),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("invalid JSON in test_config.json"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "keeps example test configs valid for the integration harness",
      ),
    ).toEqual(expectedCommands);
  });

  test("summarizes failed jobs and formats local repro guidance", () => {
    const jobs: GitHubWorkflowJob[] = [
      {
        id: 11,
        name: "Ubuntu system clang release",
        conclusion: "failure",
        html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/11",
        steps: [
          { name: "Type check", conclusion: "success" },
          { name: "Run CI-safe test suite", conclusion: "failure" },
        ],
      },
      {
        id: 12,
        name: "macOS Apple clang release",
        conclusion: "success",
        steps: [
          { name: "Run compiler correctness tests", conclusion: "success" },
        ],
      },
    ];

    const summary = summarizeWorkflowJobs(jobs);
    expect(summary.failedJobs).toHaveLength(1);
    expect(summary.failedJobs[0]?.localCommands).toEqual([
      "bun test tests/TestCiRunner.test.ts",
      "bun tools/test_ci.ts --list",
      "bun run test:ci",
    ]);

    const formatted = formatTriageSummary(
      { owner: "pr0h0", repo: "bpl3", runId: 1 },
      summary,
      {
        id: 1,
        url: "https://github.com/pr0h0/bpl3/actions/runs/1",
        headBranch: "master",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        status: "completed",
        conclusion: "failure",
      },
    );
    expect(formatted).toContain(
      "GitHub Actions triage: pr0h0/bpl3 run 1 (master @ 0123456, completed/failure)",
    );
    expect(formatted).toContain("Ubuntu system clang release");
    expect(formatted).toContain("Run CI-safe test suite");
    expect(formatted).toContain("bun run test:ci");
  });

  test("formats no-match guidance for failed jobs without local repro commands", () => {
    const summary = summarizeWorkflowJobs([
      {
        id: 21,
        name: "Unexpected integration job",
        conclusion: "failure",
        steps: [
          {
            name: "Run opaque integration step",
            conclusion: "failure",
          },
        ],
      },
    ]);

    expect(summary.failedJobs[0]?.localCommands).toEqual([]);

    const formatted = formatTriageSummary(
      { owner: "pr0h0", repo: "bpl3", runId: 1 },
      summary,
    );

    expect(formatted).toContain("Unexpected integration job");
    expect(formatted).toContain("Run opaque integration step");
    expect(formatted).toContain(
      "No focused local repro command matched this job. Inspect the failed step logs and add a ci:triage mapping when the failure pattern is recurring.",
    );
  });

  test("classifies local checkout state against the workflow run head", () => {
    const run = {
      id: 1,
      url: "https://github.com/pr0h0/bpl3/actions/runs/1",
      headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    expect(
      compareCheckoutToRun(
        run,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toEqual({
      status: "current",
      headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(
      compareCheckoutToRun(
        run,
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toEqual({
      status: "stale",
      headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(compareCheckoutToRun(run, undefined)).toEqual({
      status: "unknown",
      reason: "local checkout SHA unavailable",
    });
    expect(
      compareCheckoutToRun(
        {
          id: 2,
          url: "https://github.com/pr0h0/bpl3/actions/runs/2",
        },
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toEqual({
      status: "unknown",
      headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      reason: "run head SHA unavailable",
    });
  });

  test("prints stale checkout guidance when local HEAD differs from the run head", () => {
    const jobs: GitHubWorkflowJob[] = [
      {
        id: 11,
        name: "Ubuntu system clang release",
        conclusion: "failure",
        steps: [{ name: "Run CI-safe test suite", conclusion: "failure" }],
      },
    ];
    const summary = summarizeWorkflowJobs(jobs);
    const run = {
      id: 1,
      url: "https://github.com/pr0h0/bpl3/actions/runs/1",
      headBranch: "master",
      headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "completed",
      conclusion: "failure",
    };

    const formatted = formatTriageSummary(
      { owner: "pr0h0", repo: "bpl3", runId: 1 },
      summary,
      run,
      compareCheckoutToRun(
        run,
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    );

    expect(formatted).toContain(
      "Checkout warning: local HEAD bbbbbbb differs from run HEAD aaaaaaa.",
    );
    expect(formatted).toContain(
      "Reproduce on the run SHA or confirm current HEAD already fixes it before patching.",
    );
  });

  test("reports missing requested jobs explicitly", () => {
    const jobs: GitHubWorkflowJob[] = [
      {
        id: 41,
        name: "Ubuntu CI",
        conclusion: "success",
        steps: [],
      },
    ];

    const summary = summarizeWorkflowJobs(jobs, { requestedJobId: 42 });
    expect(summary.failedJobs).toEqual([]);
    expect(summary.missingJobIds).toEqual([42]);

    const formatted = formatTriageSummary(
      { owner: "pr0h0", repo: "bpl3", runId: 1, jobId: 42 },
      summary,
    );
    expect(formatted).toContain("Missing requested jobs:");
    expect(formatted).toContain(
      "job 42 was not returned by GitHub for this run",
    );

    expect(
      formatTriageJsonReport(
        { owner: "pr0h0", repo: "bpl3", runId: 1, jobId: 42 },
        summary,
      ).summary.missingJobIds,
    ).toEqual([42]);
  });

  test("formats a versioned JSON report for automation", () => {
    const locator = { owner: "pr0h0", repo: "bpl3", runId: 26695335269 };
    const summary = summarizeWorkflowJobs([
      {
        id: 99,
        name: "Compiler correctness",
        conclusion: "failure",
        steps: [
          { name: "Run compiler correctness tests", conclusion: "failure" },
        ],
      },
    ]);

    expect(
      formatTriageJsonReport(
        locator,
        summary,
        {
          id: 26695335269,
          url: "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
          headBranch: "master",
          headSha: "fedcba9876543210fedcba9876543210fedcba98",
          status: "completed",
          conclusion: "failure",
        },
        {
          status: "stale",
          headSha: "1111111111111111111111111111111111111111",
        },
      ),
    ).toEqual({
      schemaVersion: 1,
      check: "ci-triage",
      success: true,
      locator,
      run: {
        id: 26695335269,
        url: "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
        headBranch: "master",
        headSha: "fedcba9876543210fedcba9876543210fedcba98",
        status: "completed",
        conclusion: "failure",
      },
      checkout: {
        status: "stale",
        headSha: "1111111111111111111111111111111111111111",
      },
      summary,
    });
  });

  test("prints versioned JSON from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-json-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          run: {
            id: 26695335269,
            html_url: "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
            head_branch: "master",
            head_sha: "1234567890abcdef1234567890abcdef12345678",
            status: "completed",
            conclusion: "failure",
          },
          jobs: [
            {
              id: 42,
              name: "Ubuntu CI",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/42",
              steps: [
                { name: "Run CI-safe test suite", conclusion: "failure" },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");

      const report = expectJsonStdoutReport<{
        run: {
          id: number;
          url: string;
          headBranch: string;
          headSha: string;
          status: string;
          conclusion: string;
        };
        summary: {
          failedJobs: Array<{ localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "ci-triage",
        success: true,
        locator: {
          owner: "pr0h0",
          repo: "bpl3",
          runId: 26695335269,
        },
        run: {
          id: 26695335269,
          url: "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
          headBranch: "master",
          headSha: "1234567890abcdef1234567890abcdef12345678",
          status: "completed",
          conclusion: "failure",
        },
      });
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TestCiRunner.test.ts",
        "bun tools/test_ci.ts --list",
        "bun run test:ci",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package and wasm repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-focused-json-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 51,
              name: "Package JSON contracts",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/51",
              steps: [
                {
                  name: "PackageJsonFailureContracts.test package-install JSON failure",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 53,
              name: "Package resolver",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/53",
              steps: [
                {
                  name: "Run focused tests",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 54,
              name: "Module resolver",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/54",
              steps: [
                {
                  name: "Run focused tests",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 55,
              name: "Package source safety",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/55",
              steps: [
                {
                  name: "Run focused tests",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 56,
              name: "Package manifest JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/56",
              steps: [
                {
                  name: "BPL_PACKAGE_MANIFEST_PARSE_ERROR manifest-loading failure",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 57,
              name: "Package-cache validation JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/57",
              steps: [
                {
                  name: "BPL_PACKAGE_CACHE_VERSION_INVALID package-cache validation failure",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 52,
              name: "Wasm runtime",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/52",
              steps: [
                {
                  name: "WasmRuntime.test WebAssembly runtime execution",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const packageJob = report.summary.failedJobs.find(
        (job) => job.name === "Package JSON contracts",
      );
      expect(packageJob?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
        "bun test tests/PackageJsonFailureContracts.test.ts",
        'bun test tests/PackageManagerCLI.test.ts -t "install command|doctor packages command"',
      ]);

      const packageManifestJob = report.summary.failedJobs.find(
        (job) => job.name === "Package manifest JSON codes",
      );
      expect(packageManifestJob?.localCommands).toEqual([
        'bun test tests/PackageJsonFailureContracts.test.ts -t "package manifest error codes"',
        "bun test tests/PackageJsonFailureContracts.test.ts",
        "bun run check",
      ]);

      const packageCacheJob = report.summary.failedJobs.find(
        (job) => job.name === "Package-cache validation JSON codes",
      );
      expect(packageCacheJob?.localCommands).toEqual([
        'bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache version filter"',
        "bun test tests/PackageJsonFailureContracts.test.ts",
        "bun run check",
      ]);

      const packageResolverJob = report.summary.failedJobs.find(
        (job) => job.name === "Package resolver",
      );
      expect(packageResolverJob?.localCommands).toEqual([
        "bun test tests/PackageResolver.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "package search directory"',
        'bun test tests/CLIJsonParseability.test.ts -t "global package root failures"',
      ]);

      const moduleResolverJob = report.summary.failedJobs.find(
        (job) => job.name === "Module resolver",
      );
      expect(moduleResolverJob?.localCommands).toEqual([
        "bun test tests/ModuleResolver.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|import diagnostics|JSON-mode build failures"',
      ]);

      const sourceSafetyJob = report.summary.failedJobs.find(
        (job) => job.name === "Package source safety",
      );
      expect(sourceSafetyJob?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "entrypoint|subpath|manifest"',
        "bun test tests/PackageResolver.test.ts",
      ]);

      const wasmJob = report.summary.failedJobs.find(
        (job) => job.name === "Wasm runtime",
      );
      expect(wasmJob?.localCommands).toEqual([
        "bun test tests/WasmRuntime.test.ts",
        "bun run test:wasm",
        "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
        "bun index.ts doctor --json",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints playground browser wasm repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-browser-wasm-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 58,
              name: "Playground wasm browser contracts",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/58",
              steps: [
                {
                  name: "PlaygroundBrowserWasmRuntime.test BplBrowserCompiler.compileToHostedWasm missing",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs).toHaveLength(1);
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/PlaygroundBrowserWasmRuntime.test.ts tests/PlaygroundWasmHostAdapter.test.ts tests/PlaygroundStaticAssets.test.ts tests/WasmHostImportContract.test.ts",
        "bun run test:wasm",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints CI-safe example phase repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-example-phase-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 60,
              name: "CI-safe examples",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/60",
              steps: [
                {
                  name: "Run integration and playground examples",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs).toHaveLength(1);
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/PlaygroundExampleContracts.test.ts tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
        "bun test tests/PlaygroundExampleContracts.test.ts",
        "bun test tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints playground process execution repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-playground-process-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 59,
              name: "Playground backend process execution",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/59",
              steps: [
                {
                  name: "playground/backend/nativeExecution.ts output-limit handling failed",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 60,
              name: "Playground backend argv execution",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/60",
              steps: [
                {
                  name: "playground/backend/processRunner.ts shell argv regression",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const expectedCommands = [
        "bun test tests/PlaygroundNativeExecution.test.ts",
        "bun test tests/PlaygroundProcessRunner.test.ts",
        'bun test tests/PlaygroundExamples.test.ts -t "shell metacharacter args|argv-vector execution"',
        'bun test tests/TutorialExamples.test.ts -t "argv-vector execution"',
        "bun run check",
      ];

      expect(report.summary.failedJobs).toHaveLength(2);
      expect(report.summary.failedJobs[0]?.localCommands).toEqual(
        expectedCommands,
      );
      expect(report.summary.failedJobs[1]?.localCommands).toEqual(
        expectedCommands,
      );

      const textResult = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(textResult.status).toBe(0);
      expect(textResult.stdout).toContain(
        "playground/backend/nativeExecution.ts output-limit handling failed",
      );
      expect(textResult.stdout).toContain(
        "playground/backend/processRunner.ts shell argv regression",
      );
      for (const command of expectedCommands) {
        expect(textResult.stdout).toContain(command);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints module diagnostic and packed smoke repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-import-codes-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 61,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/61",
              steps: [
                {
                  name: "BPL_MODULE_PATH_SYMLINK in JSON-mode check diagnostics",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 62,
              name: "Packed release smoke",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/62",
              steps: [
                {
                  name: "check packed npm CLI package import diagnostic code JSON",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 63,
              name: "Packed global package search symlink",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/63",
              steps: [
                {
                  name: "check packed npm CLI package global search symlink JSON",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 64,
              name: "Packed package search non-directory",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "check packed npm CLI package local search non-directory JSON",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const moduleJob = report.summary.failedJobs.find(
        (job) => job.name === "Generic test failure",
      );
      expect(moduleJob?.localCommands).toEqual([
        "bun test tests/ModuleResolver.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|import diagnostics|JSON-mode build failures"',
      ]);

      const releaseJob = report.summary.failedJobs.find(
        (job) => job.name === "Packed release smoke",
      );
      expect(releaseJob?.localCommands).toContain("bun run release:smoke");
      expect(releaseJob?.localCommands).toContain(
        'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      );

      const globalSearchJob = report.summary.failedJobs.find(
        (job) => job.name === "Packed global package search symlink",
      );
      expect(globalSearchJob?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "global package search directory failures"',
        'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      ]);

      const searchNotDirectoryJob = report.summary.failedJobs.find(
        (job) => job.name === "Packed package search non-directory",
      );
      expect(searchNotDirectoryJob?.localCommands).toEqual([
        'bun test tests/PackageResolver.test.ts -t "non-directory.*package search directories|rejects non-directory global"',
        'bun test tests/CLIJsonParseability.test.ts -t "package search directory|global package search directory failures"',
        'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints explicit std import repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-explicit-std-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 63,
              name: "Explicit std import diagnostics",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/63",
              steps: [
                {
                  name: "BPL_MODULE_NOT_FOUND Standard library module not found: std/missing.bpl",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 64,
              name: "Explicit std CLI timeout",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "CLI Tests > should preserve unrelated undefined diagnostics with missing explicit std imports timed out after 5000ms",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/ModuleResolver.test.ts -t "missing explicit std"',
        'bun test tests/CLI.test.ts -t "missing explicit std"',
        'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
        'bun test tests/MarkdownDocs.test.ts -t "std namespace isolation"',
      ]);
      expect(
        report.summary.failedJobs.find(
          (job) => job.name === "Explicit std CLI timeout",
        )?.localCommands,
      ).toEqual([
        'bun test tests/ModuleResolver.test.ts -t "missing explicit std"',
        'bun test tests/CLI.test.ts -t "missing explicit std"',
        'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
        'bun test tests/MarkdownDocs.test.ts -t "std namespace isolation"',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints release cli-registry repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-release-registry-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 63,
              name: "Release CLI registry sync check",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/63",
              steps: [
                {
                  name: "Run packed registry sync check",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
      expect(result.stdout).toContain("Release CLI registry sync check");
      expect(result.stdout).toContain("bun run release:cli-registry");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints VS Code type-check repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-vscode-ts-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 64,
              name: "VS Code extension type check",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "vscode-ext/src/test/todo-simple.test.ts(9,30): error TS2307: Cannot find module 'vscode-languageserver-textdocument' or its corresponding type declarations.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const vscodeJob = report.summary.failedJobs.find(
        (job) => job.name === "VS Code extension type check",
      );
      expect(vscodeJob?.localCommands).toEqual([
        "npm run compile:test --prefix vscode-ext",
        "npm test --prefix vscode-ext",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints integration concurrency repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-integration-jobs-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 65,
              name: "Integration concurrency",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/65",
              steps: [
                {
                  name: "Ignoring invalid BPL_INTEGRATION_JOBS=1.5; expected a positive integer",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const integrationJob = report.summary.failedJobs.find(
        (job) => job.name === "Integration concurrency",
      );
      expect(integrationJob?.localCommands).toEqual([
        "bun test tests/IntegrationRunner.test.ts",
        "BPL_INTEGRATION_JOBS=4 bun run test:ci",
        "bun run test:ci",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints integration config repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-integration-config-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 66,
              name: "Integration config schema",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/66",
              steps: [
                {
                  name: "examples/generics_map/test_config.json: unsupported key expected_output",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const integrationJob = report.summary.failedJobs.find(
        (job) => job.name === "Integration config schema",
      );
      expect(integrationJob?.localCommands).toEqual([
        "bun test tests/IntegrationConfig.test.ts",
        'bun test tests/Integration.test.ts -t "example test configs valid"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package import manifest repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-package-import-manifest-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 64,
              name: "Package import manifest diagnostics",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "BPL_PACKAGE_MANIFEST_PARSE_ERROR in JSON-mode build diagnostics",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "malformed package manifests|package manifest symlink|missing package manifests"',
        'bun test tests/PackageResolver.test.ts -t "manifest"',
        'bun test tests/ModuleResolver.test.ts -t "manifest"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package import casing repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-package-import-casing-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 79,
              name: "Package import casing diagnostics",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/79",
              steps: [
                {
                  name: "BPL_PACKAGE_ROOT_CASE_MISMATCH while importing math",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/PackageResolver.test.ts -t "casing|case-mismatched global versioned"',
        'bun test tests/ModuleResolver.test.ts -t "case-mismatched global versioned|filesystem casing"',
        'bun test tests/CLIJsonParseability.test.ts -t "package search directory|module path diagnostic codes|JSON-mode build failures"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints stdlib package collision repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-stdlib-package-collision-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 82,
              name: "Stdlib package collision diagnostics",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/82",
              steps: [
                {
                  name: "Module 'math' does not export 'packageMath'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/MarkdownDocs.test.ts -t "bare stdlib import precedence"',
        'bun test tests/ModuleResolver.test.ts -t "bare stdlib module names"',
        'bun test tests/CLIJsonParseability.test.ts -t "stdlib package-name collisions"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints missing imported-export repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-missing-imported-export-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 83,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/83",
              steps: [
                {
                  name: "Available exports: alpha, zeta.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/ImportHandler.test.ts -t "stable code|available exports"',
        'bun test tests/CLIJsonParseability.test.ts -t "available exports|stdlib package-name collisions"',
        'bun test tests/MarkdownDocs.test.ts -t "missing imported-export"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints duplicate-symbol repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-duplicate-symbol-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 84,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/84",
              steps: [
                {
                  name: "BPL_SYMBOL_ALREADY_DEFINED Symbol 'Thing' is already defined in this scope",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
        'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints import idempotency repro commands from duplicate Error import logs", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-import-idempotency-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 184,
              name: "Ubuntu system clang release",
              conclusion: "failure",
              html_url:
                "https://github.com/pr0h0/bpl3/actions/runs/1/job/184",
              steps: [
                {
                  name: "error[BPL_SYMBOL_ALREADY_DEFINED][errors.bpl:22:1]: Symbol 'Error' is already defined in this scope",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/ImportIdempotency.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "repeated namespace imports"',
        'bun test tests/Integration.test.ts -t "stack_trace_error|stack_trace_uncaught|test_zero_comprehensive"',
        "bun test tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints duplicate function signature repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-duplicate-function-signature-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 85,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/85",
              steps: [
                {
                  name: "Function 'pick' with this signature is already defined.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
        'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints duplicate parameter repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-duplicate-parameter-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 86,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/86",
              steps: [
                {
                  name: "Duplicate parameter name 'value'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
        'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints duplicate struct field repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-duplicate-struct-field-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 87,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/87",
              steps: [
                {
                  name: "Duplicate field 'x' in struct 'Point'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
        'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints duplicate enum variant repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-duplicate-enum-variant-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 88,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/88",
              steps: [
                {
                  name: "Duplicate enum variant 'Red' in enum 'Color'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
        'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints recursive struct cycle repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-recursive-struct-cycle-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 89,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/89",
              steps: [
                {
                  name: "BPL_TYPE_RECURSION_CYCLE Struct 'Node' has infinite size due to recursive field types",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerRecursiveTypes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "recursive struct field cycles|recursive enum variant cycles"',
        'bun test tests/MarkdownDocs.test.ts -t "recursive type-cycle"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints recursive inheritance cycle repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-recursive-inheritance-cycle-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 90,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/90",
              steps: [
                {
                  name: "Circular inheritance detected Inheritance cycle: A -> B -> A",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerRecursiveTypes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "recursive struct field cycles|recursive enum variant cycles"',
        'bun test tests/MarkdownDocs.test.ts -t "recursive type-cycle"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints generic type arity repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-generic-type-arity-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 91,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/91",
              steps: [
                {
                  name: "BPL_GENERIC_ARITY_MISMATCH Generic type 'Box' expects 1 type arguments, but got 2.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerGenericArity.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "generic type arity|generic alias arity"',
        'bun test tests/MarkdownDocs.test.ts -t "generic arity"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints generic alias arity repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-generic-alias-arity-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 92,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/92",
              steps: [
                {
                  name: "Generic type 'Alias' expects 1 type arguments, but got 2. Check generic argument count.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerGenericArity.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "generic type arity|generic alias arity"',
        'bun test tests/MarkdownDocs.test.ts -t "generic arity"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints variable undefined-type repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-variable-undefined-type-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 93,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/93",
              steps: [
                {
                  name: "BPL_TYPE_NOT_FOUND Undefined type 'MissingThing'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerUndefinedTypes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "undefined-type"',
        'bun test tests/MarkdownDocs.test.ts -t "undefined type"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints struct field undefined-type repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-struct-field-undefined-type-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 94,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/94",
              steps: [
                {
                  name: "reports struct field undefined-type failures in JSON-mode check and build diagnostics",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerUndefinedTypes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "undefined-type"',
        'bun test tests/MarkdownDocs.test.ts -t "undefined type"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints undefined symbol repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-undefined-symbol-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 115,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/115",
              steps: [
                {
                  name: "BPL_SYMBOL_NOT_FOUND Undefined symbol 'missingValue'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerUndefinedSymbolDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "undefined symbol"',
        'bun test tests/MarkdownDocs.test.ts -t "undefined symbol"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints invalid void repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-invalid-void-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 95,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/95",
              steps: [
                {
                  name: "BPL_VOID_TYPE_INVALID Variable '_value' cannot be void.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerVoidTypes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "invalid void type"',
        'bun test tests/MarkdownDocs.test.ts -t "invalid void type"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints builtin type redefinition repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-builtin-redefinition-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 96,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/96",
              steps: [
                {
                  name: "BPL_BUILTIN_TYPE_REDEFINITION Cannot redefine builtin type 'bool'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerBuiltinRedefinition.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "builtin type redefinition"',
        'bun test tests/MarkdownDocs.test.ts -t "builtin type redefinition"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints invalid array size repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-invalid-array-size-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 97,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/97",
              steps: [
                {
                  name: "BPL_ARRAY_SIZE_INVALID Array size must be greater than zero.",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerInvalidArraySizes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "invalid array size"',
        'bun test tests/MarkdownDocs.test.ts -t "invalid fixed array size"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints return type mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-return-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 98,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/98",
              steps: [
                {
                  name: "BPL_RETURN_TYPE_MISMATCH Return type mismatch: expected i32, got *i8",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerReturnTypeMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "return type mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "return type mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints assignment type mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-assignment-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 99,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/99",
              steps: [
                {
                  name: "BPL_ASSIGNMENT_TYPE_MISMATCH Type mismatch in assignment: cannot assign string to i32",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerAssignmentMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "assignment type mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "assignment type mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints condition type mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-condition-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_CONDITION_TYPE_MISMATCH If condition must be boolean, got int",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerConditionMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "condition type mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints ternary condition type mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-ternary-condition-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "Ternary condition must be boolean, got int",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerConditionMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "condition type mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints ternary branch type mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-ternary-branch-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_TERNARY_BRANCH_TYPE_MISMATCH Ternary branches must have compatible types: int vs string",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerTernaryBranchMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "ternary branch type mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "ternary branch mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints switch mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-switch-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_SWITCH_CASE_TYPE_MISMATCH Case pattern type string not compatible with switch value type i32",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerSwitchMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "switch type mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "switch mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints call-site mismatch repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-call-site-mismatch-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH Type mismatch for argument 2 of 'Move': expected i32, got string",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerCallSiteMismatch.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "call-site mismatch"',
        'bun test tests/MarkdownDocs.test.ts -t "call-site mismatch"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints control-flow misuse repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-control-flow-misuse-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_FALLTHROUGH_OUTSIDE_SWITCH 'fallthrough' statement outside of switch",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerControlFlowMisuse.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "control-flow misuse"',
        'bun test tests/MarkdownDocs.test.ts -t "control-flow misuse"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints binary operator misuse repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-binary-operator-misuse-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH Operator '+' cannot be applied to types",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerBinaryOperatorMisuse.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "binary operator misuse"',
        'bun test tests/MarkdownDocs.test.ts -t "binary operator misuse"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints unary operator misuse repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-unary-operator-misuse-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_UNARY_PLUS_UNSUPPORTED Unary plus operator '+' is not supported",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerUnaryOperatorMisuse.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "unary operator misuse"',
        'bun test tests/MarkdownDocs.test.ts -t "unary operator misuse"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints index expression misuse repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-index-expression-misuse-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 100,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/100",
              steps: [
                {
                  name: "BPL_INDEX_TARGET_NOT_INDEXABLE Type 'i32' is not indexable",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerIndexExpressionMisuse.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "index expression misuse"',
        'bun test tests/MarkdownDocs.test.ts -t "index expression misuse"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints member access misuse repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-member-access-misuse-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 101,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/101",
              steps: [
                {
                  name: "BPL_MEMBER_NOT_FOUND Cannot access member 'y' on type 'S'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerMemberAccessMisuse.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "member access misuse"',
        'bun test tests/MarkdownDocs.test.ts -t "member access misuse"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints expression semantic guard repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-expression-semantic-guard-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 102,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/102",
              steps: [
                {
                  name: "BPL_CAST_INVALID Cannot cast i32 to Box",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerExpressionSemanticGuards.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "expression semantic guard"',
        'bun test tests/MarkdownDocs.test.ts -t "expression semantic guard"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints statement semantic guard repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-statement-semantic-guard-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 103,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/103",
              steps: [
                {
                  name: "BPL_ASSIGNMENT_TARGET_INVALID Invalid assignment target",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerStatementSemanticGuards.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "statement semantic guard"',
        'bun test tests/MarkdownDocs.test.ts -t "statement semantic guard"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints struct literal diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-struct-literal-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 104,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/104",
              steps: [
                {
                  name: "BPL_STRUCT_LITERAL_FIELD_UNKNOWN Unknown field 'z' in struct 'Point'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerStructLiteralDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "struct literal diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "struct literal diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints enum variant field diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-enum-variant-field-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 105,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/105",
              steps: [
                {
                  name: "BPL_ENUM_VARIANT_FIELD_UNKNOWN Unknown field 'z' in variant 'MouseMove'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerEnumVariantFieldDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "enum variant field diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "enum variant field diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints intrinsic call diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-intrinsic-call-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 106,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/106",
              steps: [
                {
                  name: "BPL_INTRINSIC_GENERIC_ARITY_MISMATCH Intrinsic __type_id requires exactly 1 generic argument",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerIntrinsicCallDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "intrinsic call diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "intrinsic call diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints match exhaustiveness diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-match-exhaustiveness-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 107,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/107",
              steps: [
                {
                  name: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH Non-exhaustive match: missing variants: Blue",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerMatchExhaustivenessDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "match exhaustiveness diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "match exhaustiveness diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints tuple pattern diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-tuple-pattern-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 108,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/108",
              steps: [
                {
                  name: "BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH Tuple pattern has 3 elements, but type has 2",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerTuplePatternDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "tuple pattern diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "tuple match pattern diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints type-query diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-type-query-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 109,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/109",
              steps: [
                {
                  name: "BPL_TYPE_QUERY_ENUM_NOT_FOUND Cannot find enum 'Missing'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerTypeQueryDiagnostics.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "type-query diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "type-query diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints function-attribute diagnostic repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-function-attribute-diagnostics-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 110,
              name: "Compiler diagnostics regression",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/110",
              steps: [
                {
                  name: "BPL_FUNCTION_ATTRIBUTE_UNKNOWN Unknown function attribute 'trace'",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun test tests/TypeCheckerFunctionAttributeDiagnostics.test.ts",
        "bun test tests/FunctionAttributes.test.ts",
        'bun test tests/CLIJsonParseability.test.ts -t "function-attribute diagnostics"',
        'bun test tests/MarkdownDocs.test.ts -t "function-attribute diagnostic"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints explicit package source-file import repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-package-explicit-source-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 67,
              name: "Explicit package source-file import diagnostics",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/67",
              steps: [
                {
                  name: "explicit package source-file imports ending in .bpl or .x do not fall back to directory indexes",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/PackageResolver.test.ts -t "explicit source-file"',
        'bun test tests/CLIJsonParseability.test.ts -t "package import"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package docs smoke repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-package-docs-smoke-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 68,
              name: "Package import docs JSON smoke",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/68",
              steps: [
                {
                  name: "CLIJsonParseability.test keeps package/import docs examples covered by JSON smoke fixtures",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 69,
              name: "Package docs smoke documentation",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/69",
              steps: [
                {
                  name: "MarkdownDocs.test package docs document package/import docs smoke fixtures",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      const commandsByJobName = new Map(
        report.summary.failedJobs.map((job) => [job.name, job.localCommands]),
      );
      expect(commandsByJobName.get("Package import docs JSON smoke")).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"',
      ]);
      expect(commandsByJobName.get("Package docs smoke documentation")).toEqual([
        'bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints build validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-build-codes-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 63,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/63",
              steps: [
                {
                  name: "BPL_BUILD_UNSUPPORTED_TARGET in build --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "build validation failures"',
        "bun test tests/CLIJsonParseability.test.ts",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints root build no-input repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-build-no-input-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 64,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "BPL_BUILD_NO_INPUTS in root build --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "root build JSON no-input"',
        'bun test tests/CLI.test.ts -t "no-input compile"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints doctor scope repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-doctor-scope-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 73,
              name: "Doctor JSON contracts",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/73",
              steps: [
                {
                  name: "BPL_DOCTOR_SCOPE_UNKNOWN unknown doctor scope JSON",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "doctor scope failures"',
        "bun test tests/CLIJsonParseability.test.ts",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package-cache name repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-cache-name-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 74,
              name: "Package-cache name JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/74",
              steps: [
                {
                  name: "BPL_PACKAGE_CACHE_NAME_INVALID package-cache package filter",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache package filter"',
        "bun test tests/PackageJsonFailureContracts.test.ts",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package uninstall JSON repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-uninstall-json-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 75,
              name: "Package uninstall JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/75",
              steps: [
                {
                  name: "BPL_PACKAGE_UNINSTALL_NOT_INSTALLED package-uninstall JSON contract",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/PackageManagerCLI.test.ts -t "uninstall success and failures as JSON"',
        'bun test tests/PackageManagerCLI.test.ts -t "uninstall command"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package pack JSON repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-pack-json-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 76,
              name: "Package pack JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/76",
              steps: [
                {
                  name: "BPL_PACKAGE_MANIFEST_MISSING package-pack JSON contract",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/PackageManagerCLI.test.ts -t "pack success and failures as JSON"',
        'bun test tests/PackageManagerCLI.test.ts -t "pack command"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints package init JSON repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-init-json-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 77,
              name: "Package init JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/77",
              steps: [
                {
                  name: "BPL_PACKAGE_INIT_NAME_INVALID package-init JSON contract",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/PackageManagerCLI.test.ts -t "init success and failures as JSON"',
        'bun test tests/PackageManagerCLI.test.ts -t "init command"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints project creation JSON repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-new-json-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 78,
              name: "Project creation JSON codes",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/78",
              steps: [
                {
                  name: "BPL_NEW_TEMPLATE_INVALID project-new JSON contract",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLI.test.ts -t "new project success and failures as JSON"',
        'bun test tests/CLI.test.ts -t "scaffold library|reject invalid project names|existing non-directory project paths"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints clean validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-clean-codes-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 64,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "BPL_CLEAN_WORKDIR_SYMLINK in clean --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "clean JSON validation failures"',
        'bun test tests/CLI.test.ts -t "clean"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints format validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-format-codes-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 70,
              name: "Format JSON validation failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/70",
              steps: [
                {
                  name: "BPL_FORMAT_INPUT_NOT_FOUND in format --check --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLI.test.ts -t "format check results and validation failures as JSON"',
        'bun test tests/CLI.test.ts -t "format files|check formatting without rewriting files|reject symlinked files when formatting"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints bindgen validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-bindgen-codes-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 71,
              name: "Bindgen JSON validation failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/71",
              steps: [
                {
                  name: "BPL_BINDGEN_OUTPUT_DIRECTORY in bindgen --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLI.test.ts -t "bindgen success and validation failures as JSON"',
        'bun test tests/CLI.test.ts -t "bindgen"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints docs validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-docs-codes-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 72,
              name: "Docs JSON validation failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/72",
              steps: [
                {
                  name: "BPL_DOCS_OUTPUT_DIRECTORY in docs --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLI.test.ts -t "documentation generation success and validation failures as JSON"',
        'bun test tests/CLI.test.ts -t "documentation"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints completion JSON repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-completion-json-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 73,
              name: "Completion JSON validation failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/73",
              steps: [
                {
                  name: "BPL_COMPLETION_SHELL_UNSUPPORTED in completion --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "completion JSON"',
        'bun test tests/CLI.test.ts -t "shell completions"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints version JSON repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-version-json-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 79,
              name: "Version JSON validation failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/79",
              steps: [
                {
                  name: "bpl --version --json contract failed",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "version JSON"',
        "bun test tests/JsonContracts.test.ts",
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints JSON color-purity repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-json-color-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 80,
              name: "JSON color-purity validation failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/80",
              steps: [
                {
                  name: "JSON string at $.error contains ANSI escape sequence",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "forced-color JSON"',
        'bun test tests/CLI.test.ts -t "explicit color flags"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints run-script validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-run-script-codes-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 65,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/65",
              steps: [
                {
                  name: "BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND in run-script --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "run-script JSON validation failures"',
        'bun test tests/CLI.test.ts -t "run-script"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints check and lint validation repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-source-analysis-codes-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 66,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/66",
              steps: [
                {
                  name: "BPL_LINT_INPUT_SYMLINK in lint --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "check and lint JSON input validation"',
        'bun test tests/CLI.test.ts -t "source analysis|missing files in check JSON"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints check and lint no-input repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-source-no-input-"),
    );
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 67,
              name: "Generic test failure",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/67",
              steps: [
                {
                  name: "BPL_CHECK_NO_INPUTS in check --json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "no-input failures"',
        'bun test tests/CLI.test.ts -t "no-input source analysis"',
        "bun run check",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints timeout repro commands from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-timeouts-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 61,
              name: "Compiler timeout",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/61",
              steps: [
                {
                  name: "compiler driver timed out after 600000ms",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 62,
              name: "Runtime timeout",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/62",
              steps: [
                {
                  name: "Executable timed out after 5000ms",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 63,
              name: "Sanitizer timeout",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/63",
              steps: [
                {
                  name: "Compiler sanitizer-backed runtime tests > routes checked runtime failures through BPL errors under ASan and UBSan timed out after 5000ms",
                  conclusion: "failure",
                },
              ],
            },
            {
              id: 64,
              name: "CLI JSON timeout",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/64",
              steps: [
                {
                  name: "CLIJsonParseability.test reports module path diagnostic codes in JSON-mode check and build diagnostics timed out after 5000ms",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const jsonResult = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(jsonResult, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });
      expect(
        report.summary.failedJobs.find((job) => job.name === "Compiler timeout")
          ?.localCommands,
      ).toEqual([
        "bun index.ts doctor --json",
        "bun run test:ci",
        "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
      ]);
      expect(
        report.summary.failedJobs.find((job) => job.name === "Sanitizer timeout")
          ?.localCommands,
      ).toEqual([
        "bun run test:sanitizers",
        "bun test tests/CompilerSanitizerRuntime.test.ts",
        "bun index.ts doctor sanitizer --json",
      ]);
      expect(
        report.summary.failedJobs.find((job) => job.name === "CLI JSON timeout")
          ?.localCommands,
      ).toEqual([
        'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|missing explicit std imports"',
        "bun test tests/CLIJsonParseability.test.ts",
        "bun run check",
      ]);

      const textResult = spawnSync(
        "bun",
        ["run", "ci:triage", "--", "--jobs-json", jobsPath, "26695335269"],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      expect(textResult.status).toBe(0);
      expect(textResult.stdout).toContain("Compiler timeout");
      expect(textResult.stdout).toContain("Runtime timeout");
      expect(textResult.stdout).toContain("Sanitizer timeout");
      expect(textResult.stdout).toContain("CLI JSON timeout");
      expect(textResult.stdout).toContain(
        "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
      );
      expect(textResult.stdout).toContain(
        "BPL_RUN_TIMEOUT_MS=30000 bun test tests/BinaryRunner.test.ts",
      );
      expect(textResult.stdout).toContain(
        'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|missing explicit std imports"',
      );
      expect(textResult.stdout).toContain(
        "bun test tests/CompilerSanitizerRuntime.test.ts",
      );
      expect(textResult.stdout).toContain(
        "bun index.ts doctor sanitizer --json",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints sanitizer doctor repro command from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-sanitizer-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          run: {
            id: 26695335269,
            html_url: "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
            head_branch: "master",
            head_sha: "1234567890abcdef1234567890abcdef12345678",
            status: "completed",
            conclusion: "failure",
          },
          jobs: [
            {
              id: 42,
              name: "Sanitizer support diagnostics",
              conclusion: "failure",
              html_url:
                "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/42",
              steps: [
                {
                  name: "BPL_SANITIZER_RUNTIME_UNAVAILABLE: compiler-rt/libclang_rt missing",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs).toHaveLength(1);
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun run test:sanitizers",
        "bun test tests/CompilerSanitizerRuntime.test.ts",
        "bun index.ts doctor sanitizer --json",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints fuzz artifact repro guidance from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-fuzz-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 41,
              name: "Deterministic compiler fuzz",
              conclusion: "failure",
              html_url:
                "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/41",
              steps: [
                {
                  name: "compiler-fuzz-crashes artifact includes fuzz/crashes/crash_seed-cafe_iter-1_tokens.json",
                  conclusion: "failure",
                },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );
      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ name: string; localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });

      expect(report.summary.failedJobs).toHaveLength(1);
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun run fuzz:repro -- fuzz/crashes",
        "bun run fuzz:validate-artifacts",
        "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json",
        "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --mode parser,typecheck,codegen,runtime,differential,sanitizer",
        "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --minimize --out fuzz/crashes/<artifact>.min.bpl",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints missing requested job JSON from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-missing-job-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [{ id: 41, name: "Ubuntu CI", conclusion: "success" }],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/42",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        locator: { jobId: number };
        summary: { failedJobs: unknown[]; missingJobIds: number[] };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });
      expect(report.locator.jobId).toBe(42);
      expect(report.summary.failedJobs).toEqual([]);
      expect(report.summary.missingJobIds).toEqual([42]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints offline help without requiring a GitHub API call", () => {
    const result = spawnSync("bun", ["run", "ci:triage", "--", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: bun tools/ci_triage.ts");
    expect(result.stdout).toContain("--repo owner/repo");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--jobs-json jobs.json");
    expect(result.stdout).toContain("run-id-or-actions-url");
    expect(result.stderr).not.toContain("GitHub API");
    expect(result.stderr).not.toContain("Expected a GitHub Actions run URL");
  });

  test("accepts inline option values before GitHub API calls", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-inline-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          run: {
            id: 26695335269,
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
            head_branch: "master",
            head_sha: "1234567890abcdef1234567890abcdef12345678",
            status: "completed",
            conclusion: "failure",
          },
          jobs: [
            {
              id: 42,
              name: "CI-safe suite",
              conclusion: "failure",
              steps: [
                { name: "Run CI-safe test suite", conclusion: "failure" },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--repo=pr0h0/bpl3",
          `--jobs-json=${jobsPath}`,
          "--run=26695335269",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        locator: { owner: string; repo: string; runId: number };
        summary: { failedJobs: Array<{ localCommands: string[] }> };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });
      expect(report.locator).toMatchObject({
        owner: "pr0h0",
        repo: "bpl3",
        runId: 26695335269,
      });
      expect(report.summary.failedJobs[0]?.localCommands).toContain(
        "bun run test:ci",
      );
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects missing option values before GitHub API calls", () => {
    const cases: Array<[string[], string]> = [
      [["--repo", "--run", "26695335269"], "Missing value for --repo"],
      [
        ["--run", "--repo", "pr0h0/bpl3"],
        "Missing value for --run",
      ],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "ci:triage", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
    }
  });

  test("rejects malformed inline option values before GitHub API calls", () => {
    const cases: Array<[string[], string]> = [
      [["--json=true", "26695335269"], "--json does not accept a value"],
      [["--help=true"], "--help does not accept a value"],
      [["--jobs-json=", "26695335269"], "Missing value for --jobs-json"],
      [["--repo=", "26695335269"], "Missing value for --repo"],
      [["--run="], "Missing value for --run"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "ci:triage", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
    }
  });

  test("rejects unknown options and extra arguments before GitHub API calls", () => {
    const cases: Array<[string[], string]> = [
      [["--unknown", "26695335269"], "Unknown option --unknown"],
      [["26695335269", "extra"], "Unexpected argument: extra"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "ci:triage", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
    }
  });

  test("rejects invalid repo values before GitHub API calls", () => {
    const result = spawnSync(
      "bun",
      ["run", "ci:triage", "--", "--repo", "bad", "26695335269"],
      {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Expected --repo as owner/name, got bad");
    expect(result.stderr).not.toContain("GitHub API");
    expect(result.stderr).not.toContain("api.github.com");
  });

  test("rejects invalid run locators before GitHub API calls", () => {
    const cases: Array<{
      args: string[];
      expectedError: string;
      forbiddenError: string;
    }> = [
      {
        args: ["0"],
        expectedError: "Invalid GitHub Actions run id: 0",
        forbiddenError: "actions/runs/0",
      },
      {
        args: ["9007199254740993"],
        expectedError: "Invalid GitHub Actions run id: 9007199254740993",
        forbiddenError: "api.github.com",
      },
      {
        args: ["not-a-url"],
        expectedError:
          "Expected a numeric GitHub Actions run id or github.com Actions run URL, got not-a-url",
        forbiddenError: "cannot be parsed as a URL",
      },
      {
        args: ["https://example.com/pr0h0/bpl3/actions/runs/26695335269"],
        expectedError:
          "Expected a github.com Actions run URL, got https://example.com/pr0h0/bpl3/actions/runs/26695335269",
        forbiddenError: "api.github.com",
      },
      {
        args: ["https://github.com/pr0h0/bpl3/pull/1"],
        expectedError:
          "Expected a GitHub Actions run URL, got https://github.com/pr0h0/bpl3/pull/1",
        forbiddenError: "GitHub API",
      },
      {
        args: ["https://github.com/pr0h0/bpl3/actions/runs/not-a-run"],
        expectedError:
          "Invalid GitHub Actions run id in https://github.com/pr0h0/bpl3/actions/runs/not-a-run",
        forbiddenError: "api.github.com",
      },
      {
        args: [
          "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/not-a-job",
        ],
        expectedError:
          "Invalid GitHub Actions job id in https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/not-a-job",
        forbiddenError: "api.github.com",
      },
    ];

    for (const testCase of cases) {
      const result = spawnSync(
        "bun",
        ["run", "ci:triage", "--", ...testCase.args],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(testCase.expectedError);
      expect(result.stderr).not.toContain(testCase.forbiddenError);
      expect(result.stderr).not.toContain("api.github.com");
    }
  });

  test("rejects unreadable and malformed jobs-json files before GitHub API calls", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-jobs-json-"));

    try {
      const missingPath = join(tempDir, "missing-jobs.json");
      const malformedPath = join(tempDir, "malformed-jobs.json");
      const wrongShapePath = join(tempDir, "wrong-shape-jobs.json");
      writeFileSync(malformedPath, "{bad json");
      writeFileSync(wrongShapePath, JSON.stringify({ jobs: "bad" }) + "\n");

      const cases: Array<{
        args: string[];
        expectedError: string;
        forbiddenError: string;
      }> = [
        {
          args: ["--jobs-json", missingPath, "26695335269"],
          expectedError: `Unable to read --jobs-json file ${missingPath}: file does not exist.`,
          forbiddenError: "ENOENT",
        },
        {
          args: ["--jobs-json", malformedPath, "26695335269"],
          expectedError: `Unable to parse --jobs-json file ${malformedPath}:`,
          forbiddenError: "JSON Parse error",
        },
        {
          args: ["--jobs-json", wrongShapePath, "26695335269"],
          expectedError: `Expected --jobs-json file ${wrongShapePath} to contain a GitHub jobs API response with a jobs array.`,
          forbiddenError: "TypeError",
        },
      ];

      for (const testCase of cases) {
        const result = spawnSync(
          "bun",
          ["run", "ci:triage", "--", ...testCase.args],
          {
            cwd: join(import.meta.dir, ".."),
            encoding: "utf8",
          },
        );

        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(testCase.expectedError);
        expect(result.stderr).not.toContain(testCase.forbiddenError);
        expect(result.stderr).not.toContain("GitHub API");
        expect(result.stderr).not.toContain("api.github.com");
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
