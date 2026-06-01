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
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("GitHub API");
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
