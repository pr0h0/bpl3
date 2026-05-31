import { readFileSync } from "fs";
import { spawnSync } from "child_process";

export interface GitHubRunLocator {
  owner: string;
  repo: string;
  runId: number;
  jobId?: number;
}

export interface GitHubWorkflowStep {
  name: string;
  conclusion: string | null;
  status?: string;
  number?: number;
}

export interface GitHubWorkflowJob {
  id: number;
  name: string;
  conclusion: string | null;
  status?: string;
  html_url?: string;
  steps?: GitHubWorkflowStep[];
}

export interface GitHubWorkflowJobsResponse {
  jobs: GitHubWorkflowJob[];
}

export interface GitHubWorkflowRun {
  id: number;
  html_url?: string;
  head_branch?: string | null;
  head_sha?: string | null;
  status?: string | null;
  conclusion?: string | null;
}

export interface GitHubWorkflowData {
  jobs: GitHubWorkflowJob[];
  run?: GitHubWorkflowRun;
}

export interface TriageRunIdentity {
  id: number;
  url: string;
  headBranch?: string;
  headSha?: string;
  status?: string;
  conclusion?: string | null;
}

export type TriageCheckoutState = "current" | "stale" | "unknown";

export interface TriageCheckoutIdentity {
  status: TriageCheckoutState;
  headSha?: string;
  reason?: string;
}

export interface TriageSummary {
  failedJobs: Array<{
    id: number;
    name: string;
    url?: string;
    failedSteps: GitHubWorkflowStep[];
    localCommands: string[];
  }>;
  missingJobIds: number[];
}

export interface TriageSummaryOptions {
  requestedJobId?: number;
}

export interface TriageJsonReport {
  schemaVersion: typeof CI_TRIAGE_JSON_SCHEMA_VERSION;
  check: typeof CI_TRIAGE_JSON_CHECK;
  success: true;
  locator: GitHubRunLocator;
  run: TriageRunIdentity;
  checkout: TriageCheckoutIdentity;
  summary: TriageSummary;
}

const DEFAULT_REPO = "pr0h0/bpl3";
const CI_TRIAGE_JSON_SCHEMA_VERSION = 1;
const CI_TRIAGE_JSON_CHECK = "ci-triage";

class CliUsageError extends Error {}

const RELEASE_SMOKE_STEP_PATTERN =
  /(?:ReleaseSmoke\.test|release smoke|release:smoke|package import diagnostic code JSON)/i;
const PACKAGE_RESOLVER_STEP_PATTERN = new RegExp(
  [
    "PackageResolver\\.test",
    "Package resolver",
    "package/import resolver",
    "CLIJsonParseability\\.test",
    "package resolver",
    "package search directory",
    "global package root failures",
  ].join("|"),
  "i",
);
const IMPORT_RESOLVER_STEP_PATTERN = new RegExp(
  [
    "ModuleResolver\\.test",
    "Module resolver",
    "import resolver",
    "import diagnostics",
    "module path diagnostic codes",
    "BPL_MODULE_",
    "BPL_IMPORT_STD_PATH_UNSAFE",
    "JSON-mode build failures",
    "Module path is a symbolic link",
    "invalid package import subpaths",
    "invalid package import names",
    "unresolved package imports",
    "package manifest name mismatches",
  ].join("|"),
  "i",
);
const BUILD_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "build validation failures",
    "BPL_BUILD_",
    "Invalid optimization",
    "Invalid emit",
    "Invalid wasm runtime",
    "Invalid jobs count",
    "Input path is not a file",
    "Input path is a symbolic link",
    "Output directory not found",
    "Output path is a directory",
    "Output path is a symbolic link",
    "Output parent path",
  ].join("|"),
  "i",
);
const CLEAN_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "clean JSON validation failures",
    "BPL_CLEAN_",
    "Clean working directory path contains a symbolic link",
    "Could not determine git-tracked files",
    "clean --json",
  ].join("|"),
  "i",
);
const FORMAT_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "format JSON validation",
    "format JSON contract",
    "BPL_FORMAT_",
    "format --check --json",
    "File is not formatted",
    "No files specified.*format",
  ].join("|"),
  "i",
);
const BINDGEN_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "bindgen JSON validation",
    "bindgen JSON contract",
    "BPL_BINDGEN_",
    "bindgen --json",
    "Header path is not a file",
    "Header parent path contains a symbolic link",
    "Output path is a directory",
  ].join("|"),
  "i",
);
const DOCS_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "docs JSON validation",
    "docs JSON contract",
    "documentation generation success and validation failures",
    "BPL_DOCS_",
    "docs --json",
    "Documentation input is not a file",
    "Documentation input parent contains a symbolic link",
    "Output path is a directory",
  ].join("|"),
  "i",
);
const COMPLETION_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_COMPLETION_SHELL_UNSUPPORTED",
    "completion JSON",
    "completion JSON contract",
    "completion --json",
    "Unsupported shell",
  ].join("|"),
  "i",
);
const VERSION_JSON_STEP_PATTERN = new RegExp(
  [
    "version JSON",
    "version JSON contract",
    "bpl --version --json",
    "bpl --json --version",
    'check: "version"',
  ].join("|"),
  "i",
);
const JSON_COLOR_PURITY_STEP_PATTERN = new RegExp(
  [
    "forced-color JSON",
    "JSON color-purity",
    "JSON color purity",
    "JSON string at \\$\\.[^ ]+ contains ANSI escape sequence",
    "ANSI escape sequence.*JSON",
    "build --json --color",
    "check --json --color",
  ].join("|"),
  "i",
);
const DOCTOR_SCOPE_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_DOCTOR_SCOPE_UNKNOWN",
    "Unknown doctor scope",
    "doctor unknown scope",
    "doctor scope JSON",
  ].join("|"),
  "i",
);
const RUN_SCRIPT_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "run-script JSON validation failures",
    "BPL_RUN_SCRIPT_",
    "run-script --json",
    "run-script-list",
    "bpl\\.json parent path contains a symbolic link",
    "Script .* not found in bpl\\.json",
    "'scripts' in bpl\\.json",
    "Script .* in bpl\\.json must be a non-empty string",
  ].join("|"),
  "i",
);
const SOURCE_ANALYSIS_NO_INPUT_STEP_PATTERN = new RegExp(
  [
    "BPL_CHECK_NO_INPUTS",
    "BPL_LINT_NO_INPUTS",
    "check --json.*No files specified",
    "lint --json.*No files specified",
    "check/lint no-input",
  ].join("|"),
  "i",
);
const SOURCE_ANALYSIS_JSON_VALIDATION_STEP_PATTERN = new RegExp(
  [
    "check and lint JSON input validation",
    "source analysis commands",
    "BPL_CHECK_INPUT_",
    "BPL_LINT_INPUT_",
    "check --json.*Input path",
    "lint --json.*Input path",
  ].join("|"),
  "i",
);
const PACKAGE_SOURCE_SAFETY_STEP_PATTERN = new RegExp(
  [
    "package source-safety",
    "package source safety",
    "package import safety",
    "package entrypoint symlink failures",
    "package subpath symlink-parent failures",
    "package subpath file symlink failures",
    "entrypoint resolves to a symbolic link candidate",
    "subpath .* resolves to a symbolic link candidate",
    "unsafe entrypoint",
  ].join("|"),
  "i",
);
const PACKAGE_IMPORT_MANIFEST_STEP_PATTERN = new RegExp(
  [
    "package import manifest",
    "malformed package manifests",
    "package manifest symlink failures",
    "missing package manifests",
    "BPL_PACKAGE_MANIFEST_(MISSING|SYMLINK|NOT_FILE|PARSE_ERROR|NOT_OBJECT).*(JSON-mode|import|check|build)",
    "manifest path is a symbolic link",
    "manifest path is not a file",
    "manifest is not valid JSON",
    "manifest must contain a JSON object",
  ].join("|"),
  "i",
);
const PACKAGE_JSON_CONTRACT_STEP_PATTERN = new RegExp(
  [
    "PackageJsonFailureContracts\\.test",
    "PackageHelperJsonContracts\\.test",
    "Package JSON contracts",
    "package-install",
    "package install JSON",
    "BPL_LOCKFILE_",
  ].join("|"),
  "i",
);
const PACKAGE_MANIFEST_JSON_STEP_PATTERN = new RegExp(
  [
    "^(?!.*(?:package-pack|JSON-mode|package import|import diagnostics)).*BPL_PACKAGE_MANIFEST_",
    "PackageManager manifest-loading",
    "package manifest error codes",
    "package manifest JSON codes",
  ].join("|"),
  "i",
);
const PACKAGE_PACK_JSON_STEP_PATTERN = new RegExp(
  [
    "package-pack",
    "package pack JSON",
    "pack JSON report",
    "pack --json",
  ].join("|"),
  "i",
);
const PACKAGE_INIT_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_PACKAGE_INIT_",
    "package-init",
    "package init JSON",
    "init JSON contract",
  ].join("|"),
  "i",
);
const PROJECT_NEW_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_NEW_",
    "project-new",
    "project creation JSON",
    "new project JSON",
  ].join("|"),
  "i",
);
const PACKAGE_CACHE_VALIDATION_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_PACKAGE_CACHE_VERSION_INVALID",
    "Package-cache validation failures",
    "package-cache validation",
    "package-cache version filter",
  ].join("|"),
  "i",
);
const PACKAGE_CACHE_NAME_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_PACKAGE_CACHE_NAME_INVALID",
    "package-cache package filter",
    "invalid package-cache package name",
  ].join("|"),
  "i",
);
const PACKAGE_UNINSTALL_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_PACKAGE_UNINSTALL_",
    "package-uninstall",
    "package uninstall JSON",
    "uninstall JSON contract",
  ].join("|"),
  "i",
);
const WASM_TOOLCHAIN_STEP_PATTERN = new RegExp(
  [
    "Run WebAssembly runtime tests",
    "BPL_REQUIRE_WASM_LD=1 requires a wasm linker",
    "wasm-ld is required",
    "wasm linker",
    "Skipping wasm runtime execution",
    "optional prerequisite skip",
    "WASM_LD",
    "WebAssembly toolchain",
  ].join("|"),
  "i",
);
const WASM_RUNTIME_FAILURE_STEP_PATTERN = new RegExp(
  [
    "WasmRuntime\\.test",
    "WebAssembly runtime execution",
    "hosted wasm",
    "wasm stdout",
    "wasm stderr",
    "wasm args",
  ].join("|"),
  "i",
);
const SANITIZER_RUNTIME_STEP_PATTERN = new RegExp(
  [
    "Run sanitizer-backed runtime tests",
    "CompilerSanitizerRuntime\\.test",
    "Compiler sanitizer-backed runtime tests",
    "ASan and UBSan",
    "SANITIZER_RUNTIME_TEST_TIMEOUT_MS",
    "BPL_SANITIZER_RUNTIME_UNAVAILABLE",
    "compiler-rt",
    "libclang_rt",
  ].join("|"),
  "i",
);
const COMPILER_TIMEOUT_STEP_PATTERN = new RegExp(
  [
    "compiler driver timed out",
    "BPL_COMPILE_DRIVER_TIMEOUT_MS",
    "compile driver timeout",
  ].join("|"),
  "i",
);
const PACKAGE_TIMEOUT_STEP_PATTERN = new RegExp(
  [
    "package tool timed out",
    "tar tool timed out",
    "package archive .*timed out",
    "package IR verification timed out",
    "BPL_PACKAGE_TOOL_TIMEOUT_MS",
    "BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS",
  ].join("|"),
  "i",
);
const OBJECT_SYMBOL_TIMEOUT_STEP_PATTERN = new RegExp(
  [
    "object symbol parsing timed out",
    "object symbol .*timeout",
    "nm .*timed out",
    "BPL_OBJECT_SYMBOL_TIMEOUT_MS",
  ].join("|"),
  "i",
);
const WASM_LINKER_TIMEOUT_STEP_PATTERN = new RegExp(
  [
    "wasm linker probe timed out",
    "WebAssembly linker probe timed out",
    "BPL_WASM_LINKER_PROBE_TIMEOUT_MS",
  ].join("|"),
  "i",
);
const RUNTIME_TIMEOUT_STEP_PATTERN = new RegExp(
  [
    "Executable timed out",
    "binary execution timed out",
    "runtime execution timed out",
    "BPL_RUN_TIMEOUT_MS",
  ].join("|"),
  "i",
);

const STEP_REPRO_COMMANDS: Array<[RegExp, string]> = [
  [/^Type check$/i, "bun run check"],
  [/^Lint$/i, "bun run lint"],
  [/Run Windows-safe codegen tests/i, "bun run test:codegen-cross-platform"],
  [WASM_TOOLCHAIN_STEP_PATTERN, "bun run test:wasm"],
  [WASM_TOOLCHAIN_STEP_PATTERN, "BPL_REQUIRE_WASM_LD=1 bun run test:wasm"],
  [WASM_TOOLCHAIN_STEP_PATTERN, "bun index.ts doctor --json"],
  [
    WASM_LINKER_TIMEOUT_STEP_PATTERN,
    "BPL_WASM_LINKER_PROBE_TIMEOUT_MS=5000 bun run test:wasm",
  ],
  [/Run CI-safe test suite/i, "bun run test:ci"],
  [COMPILER_TIMEOUT_STEP_PATTERN, "bun index.ts doctor --json"],
  [COMPILER_TIMEOUT_STEP_PATTERN, "bun run test:ci"],
  [
    COMPILER_TIMEOUT_STEP_PATTERN,
    "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
  ],
  [RELEASE_SMOKE_STEP_PATTERN, "bun run release:smoke"],
  [RELEASE_SMOKE_STEP_PATTERN, "bun test tests/ReleaseSmoke.test.ts"],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
  ],
  [RELEASE_SMOKE_STEP_PATTERN, "bun test tests/ReleaseHelperSmoke.test.ts"],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --help",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --input --json",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz -- --iterations --crash-dir fuzz/crashes",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:replay -- --metadata --mode parser",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run fuzz:promote -- --metadata --name bug",
  ],
  [
    RELEASE_SMOKE_STEP_PATTERN,
    "cd <packed-bpl-v3-package> && npm run ci:triage -- --help",
  ],
  [PACKAGE_RESOLVER_STEP_PATTERN, "bun test tests/PackageResolver.test.ts"],
  [
    PACKAGE_RESOLVER_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package search directory"',
  ],
  [
    PACKAGE_RESOLVER_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "global package root failures"',
  ],
  [IMPORT_RESOLVER_STEP_PATTERN, "bun test tests/ModuleResolver.test.ts"],
  [
    IMPORT_RESOLVER_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|import diagnostics|JSON-mode build failures"',
  ],
  [
    BUILD_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "build validation failures"',
  ],
  [
    BUILD_JSON_VALIDATION_STEP_PATTERN,
    "bun test tests/CLIJsonParseability.test.ts",
  ],
  [BUILD_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    CLEAN_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "clean JSON validation failures"',
  ],
  [
    CLEAN_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "clean"',
  ],
  [CLEAN_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    FORMAT_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "format check results and validation failures as JSON"',
  ],
  [
    FORMAT_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "format files|check formatting without rewriting files|reject symlinked files when formatting"',
  ],
  [FORMAT_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    BINDGEN_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "bindgen success and validation failures as JSON"',
  ],
  [
    BINDGEN_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "bindgen"',
  ],
  [BINDGEN_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    DOCS_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "documentation generation success and validation failures as JSON"',
  ],
  [
    DOCS_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "documentation"',
  ],
  [DOCS_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    COMPLETION_JSON_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "completion JSON"',
  ],
  [
    COMPLETION_JSON_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "shell completions"',
  ],
  [COMPLETION_JSON_STEP_PATTERN, "bun run check"],
  [
    VERSION_JSON_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "version JSON"',
  ],
  [VERSION_JSON_STEP_PATTERN, "bun test tests/JsonContracts.test.ts"],
  [VERSION_JSON_STEP_PATTERN, "bun run check"],
  [
    JSON_COLOR_PURITY_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "forced-color JSON"',
  ],
  [
    JSON_COLOR_PURITY_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "explicit color flags"',
  ],
  [JSON_COLOR_PURITY_STEP_PATTERN, "bun run check"],
  [
    DOCTOR_SCOPE_JSON_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "doctor scope failures"',
  ],
  [
    DOCTOR_SCOPE_JSON_STEP_PATTERN,
    "bun test tests/CLIJsonParseability.test.ts",
  ],
  [DOCTOR_SCOPE_JSON_STEP_PATTERN, "bun run check"],
  [
    RUN_SCRIPT_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "run-script JSON validation failures"',
  ],
  [
    RUN_SCRIPT_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "run-script"',
  ],
  [RUN_SCRIPT_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    SOURCE_ANALYSIS_NO_INPUT_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "no-input failures"',
  ],
  [
    SOURCE_ANALYSIS_NO_INPUT_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "no-input source analysis"',
  ],
  [SOURCE_ANALYSIS_NO_INPUT_STEP_PATTERN, "bun run check"],
  [
    SOURCE_ANALYSIS_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "check and lint JSON input validation"',
  ],
  [
    SOURCE_ANALYSIS_JSON_VALIDATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "source analysis|missing files in check JSON"',
  ],
  [SOURCE_ANALYSIS_JSON_VALIDATION_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_SOURCE_SAFETY_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "entrypoint|subpath|manifest"',
  ],
  [
    PACKAGE_SOURCE_SAFETY_STEP_PATTERN,
    "bun test tests/PackageResolver.test.ts",
  ],
  [
    PACKAGE_IMPORT_MANIFEST_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "malformed package manifests|package manifest symlink|missing package manifests"',
  ],
  [
    PACKAGE_IMPORT_MANIFEST_STEP_PATTERN,
    'bun test tests/PackageResolver.test.ts -t "manifest"',
  ],
  [
    PACKAGE_IMPORT_MANIFEST_STEP_PATTERN,
    'bun test tests/ModuleResolver.test.ts -t "manifest"',
  ],
  [PACKAGE_IMPORT_MANIFEST_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_JSON_CONTRACT_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
  ],
  [
    PACKAGE_JSON_CONTRACT_STEP_PATTERN,
    "bun test tests/PackageJsonFailureContracts.test.ts",
  ],
  [
    PACKAGE_JSON_CONTRACT_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "install command|doctor packages command"',
  ],
  [
    PACKAGE_PACK_JSON_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "pack success and failures as JSON"',
  ],
  [
    PACKAGE_PACK_JSON_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "pack command"',
  ],
  [PACKAGE_PACK_JSON_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_INIT_JSON_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "init success and failures as JSON"',
  ],
  [
    PACKAGE_INIT_JSON_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "init command"',
  ],
  [PACKAGE_INIT_JSON_STEP_PATTERN, "bun run check"],
  [
    PROJECT_NEW_JSON_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "new project success and failures as JSON"',
  ],
  [
    PROJECT_NEW_JSON_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "scaffold library|reject invalid project names|existing non-directory project paths"',
  ],
  [PROJECT_NEW_JSON_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_MANIFEST_JSON_STEP_PATTERN,
    'bun test tests/PackageJsonFailureContracts.test.ts -t "package manifest error codes"',
  ],
  [
    PACKAGE_MANIFEST_JSON_STEP_PATTERN,
    "bun test tests/PackageJsonFailureContracts.test.ts",
  ],
  [PACKAGE_MANIFEST_JSON_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_CACHE_VALIDATION_JSON_STEP_PATTERN,
    'bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache version filter"',
  ],
  [
    PACKAGE_CACHE_VALIDATION_JSON_STEP_PATTERN,
    "bun test tests/PackageJsonFailureContracts.test.ts",
  ],
  [PACKAGE_CACHE_VALIDATION_JSON_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_CACHE_NAME_JSON_STEP_PATTERN,
    'bun test tests/PackageJsonFailureContracts.test.ts -t "package-cache package filter"',
  ],
  [
    PACKAGE_CACHE_NAME_JSON_STEP_PATTERN,
    "bun test tests/PackageJsonFailureContracts.test.ts",
  ],
  [PACKAGE_CACHE_NAME_JSON_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_UNINSTALL_JSON_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "uninstall success and failures as JSON"',
  ],
  [
    PACKAGE_UNINSTALL_JSON_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "uninstall command"',
  ],
  [PACKAGE_UNINSTALL_JSON_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_TIMEOUT_STEP_PATTERN,
    "bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts",
  ],
  [PACKAGE_TIMEOUT_STEP_PATTERN, "bun index.ts doctor packages --json"],
  [
    PACKAGE_TIMEOUT_STEP_PATTERN,
    "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
  ],
  [
    PACKAGE_TIMEOUT_STEP_PATTERN,
    'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
  ],
  [OBJECT_SYMBOL_TIMEOUT_STEP_PATTERN, "bun test tests/ObjectFileParser.test.ts"],
  [OBJECT_SYMBOL_TIMEOUT_STEP_PATTERN, "bun index.ts doctor --json"],
  [
    OBJECT_SYMBOL_TIMEOUT_STEP_PATTERN,
    "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
  ],
  [WASM_RUNTIME_FAILURE_STEP_PATTERN, "bun test tests/WasmRuntime.test.ts"],
  [WASM_RUNTIME_FAILURE_STEP_PATTERN, "bun run test:wasm"],
  [
    WASM_RUNTIME_FAILURE_STEP_PATTERN,
    "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
  ],
  [WASM_RUNTIME_FAILURE_STEP_PATTERN, "bun index.ts doctor --json"],
  [SANITIZER_RUNTIME_STEP_PATTERN, "bun run test:sanitizers"],
  [
    SANITIZER_RUNTIME_STEP_PATTERN,
    "bun test tests/CompilerSanitizerRuntime.test.ts",
  ],
  [SANITIZER_RUNTIME_STEP_PATTERN, "bun index.ts doctor sanitizer --json"],
  [RUNTIME_TIMEOUT_STEP_PATTERN, "bun test tests/BinaryRunner.test.ts"],
  [
    RUNTIME_TIMEOUT_STEP_PATTERN,
    "BPL_RUN_TIMEOUT_MS=30000 bun test tests/BinaryRunner.test.ts",
  ],
  [RUNTIME_TIMEOUT_STEP_PATTERN, "bun run test:ci"],
  [/Run compiler correctness tests/i, "bun run test:correctness"],
  [/Validate saved fuzz failure artifacts/i, "bun run fuzz:validate-artifacts"],
  [/Run deterministic differential compiler fuzz/i, "bun run fuzz:differential"],
  [/Run deterministic compiler fuzz/i, "bun run fuzz:long"],
  [
    /Minimize fuzz crash artifacts/i,
    "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --minimize",
  ],
];

export function formatCiTriageHelp(): string {
  return [
    "Usage: bun tools/ci_triage.ts [--json] [--repo owner/repo] [--jobs-json jobs.json] <run-id-or-actions-url>",
    "",
    "Summarize failed GitHub Actions jobs and print local BPL reproduction commands.",
    "",
    "Options:",
    "  --json                  Print machine-readable JSON.",
    "  --repo owner/repo       Default repository for numeric run IDs.",
    "  --jobs-json jobs.json   Read a saved GitHub jobs API response instead of fetching.",
    "  -h, --help              Show this help without making a GitHub API request.",
    "",
  ].join("\n");
}

export function parseGitHubRunLocator(
  input: string,
  defaultRepo = DEFAULT_REPO,
): GitHubRunLocator {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    const [owner, repo] = parseRepo(defaultRepo);
    return { owner, repo, runId: Number(trimmed) };
  }

  const url = new URL(trimmed);
  if (url.hostname !== "github.com") {
    throw new Error(`Expected a github.com Actions run URL, got ${url.href}`);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const actionsIndex = parts.indexOf("actions");
  const runsIndex = parts.indexOf("runs");
  if (parts.length < 5 || actionsIndex !== 2 || runsIndex !== 3) {
    throw new Error(`Expected a GitHub Actions run URL, got ${url.href}`);
  }

  const owner = parts[0]!;
  const repo = parts[1]!;
  const runId = Number(parts[4]);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new Error(`Invalid GitHub Actions run id in ${url.href}`);
  }

  const jobIndex = parts.indexOf("job");
  const jobId =
    jobIndex >= 0 && parts[jobIndex + 1]
      ? Number(parts[jobIndex + 1])
      : undefined;

  return Number.isSafeInteger(jobId) && jobId! > 0
    ? { owner, repo, runId, jobId }
    : { owner, repo, runId };
}

export function summarizeWorkflowJobs(
  jobs: GitHubWorkflowJob[],
  options: TriageSummaryOptions = {},
): TriageSummary {
  const selectedJobs =
    options.requestedJobId === undefined
      ? jobs
      : jobs.filter((job) => job.id === options.requestedJobId);
  const missingJobIds =
    options.requestedJobId !== undefined && selectedJobs.length === 0
      ? [options.requestedJobId]
      : [];
  const failedJobs = selectedJobs
    .filter((job) => job.conclusion === "failure")
    .map((job) => {
      const failedSteps = (job.steps ?? []).filter(
        (step) => step.conclusion === "failure",
      );
      const localCommands = uniqueStrings(
        [
          localCommandsForStep(job.name),
          failedSteps.flatMap((step) => localCommandsForStep(step.name)),
        ].flat(),
      );

      return {
        id: job.id,
        name: job.name,
        url: job.html_url,
        failedSteps,
        localCommands,
      };
    });

  return { failedJobs, missingJobIds };
}

export function localCommandsForStep(stepName: string): string[] {
  return STEP_REPRO_COMMANDS.filter(([pattern]) => pattern.test(stepName)).map(
    ([, command]) => command,
  );
}

export function formatTriageSummary(
  locator: GitHubRunLocator,
  summary: TriageSummary,
  run = runIdentityFromLocator(locator),
  checkout = compareCheckoutToRun(run),
): string {
  const lines = [formatRunIdentityLine(locator, run)];

  const checkoutWarning = formatCheckoutWarning(run, checkout);
  if (checkoutWarning) {
    lines.push("", checkoutWarning);
  }

  if (summary.missingJobIds.length > 0) {
    lines.push("", "Missing requested jobs:");
    for (const jobId of summary.missingJobIds) {
      lines.push(
        `- job ${jobId} was not returned by GitHub for this run. Recheck the job URL or rerun with the workflow run URL.`,
      );
    }
  }

  if (summary.failedJobs.length === 0) {
    if (summary.missingJobIds.length === 0) {
      lines.push("No failed jobs found.");
    }
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "Failed jobs:");
  for (const job of summary.failedJobs) {
    lines.push(`- ${job.name} (job ${job.id})`);
    if (job.url) {
      lines.push(`  url: ${job.url}`);
    }

    if (job.failedSteps.length > 0) {
      lines.push("  failed steps:");
      for (const step of job.failedSteps) {
        lines.push(`  - ${step.name}`);
      }
    }

    if (job.localCommands.length > 0) {
      lines.push("  local repro:");
      for (const command of job.localCommands) {
        lines.push(`  - ${command}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatTriageJsonReport(
  locator: GitHubRunLocator,
  summary: TriageSummary,
  run = runIdentityFromLocator(locator),
  checkout = compareCheckoutToRun(run),
): TriageJsonReport {
  return {
    schemaVersion: CI_TRIAGE_JSON_SCHEMA_VERSION,
    check: CI_TRIAGE_JSON_CHECK,
    success: true,
    locator,
    run,
    checkout,
    summary,
  };
}

export function compareCheckoutToRun(
  run: TriageRunIdentity,
  localHeadSha?: string,
): TriageCheckoutIdentity {
  const normalizedLocalSha = normalizeSha(localHeadSha);
  const normalizedRunSha = normalizeSha(run.headSha);

  if (!normalizedRunSha) {
    return {
      status: "unknown",
      ...(normalizedLocalSha ? { headSha: normalizedLocalSha } : {}),
      reason: "run head SHA unavailable",
    };
  }

  if (!normalizedLocalSha) {
    return {
      status: "unknown",
      reason: "local checkout SHA unavailable",
    };
  }

  return {
    status: normalizedLocalSha === normalizedRunSha ? "current" : "stale",
    headSha: normalizedLocalSha,
  };
}

export function runIdentityFromGitHubRun(
  locator: GitHubRunLocator,
  run?: GitHubWorkflowRun,
): TriageRunIdentity {
  if (!run) return runIdentityFromLocator(locator);

  const identity: TriageRunIdentity = {
    id: Number.isSafeInteger(run.id) && run.id > 0 ? run.id : locator.runId,
    url:
      typeof run.html_url === "string" && run.html_url.length > 0
        ? run.html_url
        : workflowRunUrl(locator),
  };

  if (typeof run.head_branch === "string" && run.head_branch.length > 0) {
    identity.headBranch = run.head_branch;
  }
  if (typeof run.head_sha === "string" && run.head_sha.length > 0) {
    identity.headSha = run.head_sha;
  }
  if (typeof run.status === "string" && run.status.length > 0) {
    identity.status = run.status;
  }
  if (typeof run.conclusion === "string" && run.conclusion.length > 0) {
    identity.conclusion = run.conclusion;
  }

  return identity;
}

async function fetchWorkflowJobs(
  locator: GitHubRunLocator,
): Promise<GitHubWorkflowJob[]> {
  const url = `https://api.github.com/repos/${locator.owner}/${locator.repo}/actions/runs/${locator.runId}/jobs?filter=latest&per_page=100`;
  const body = await fetchGitHubJson<GitHubWorkflowJobsResponse>(url);
  return body.jobs;
}

async function fetchWorkflowRun(
  locator: GitHubRunLocator,
): Promise<GitHubWorkflowRun> {
  const url = `https://api.github.com/repos/${locator.owner}/${locator.repo}/actions/runs/${locator.runId}`;
  return fetchGitHubJson<GitHubWorkflowRun>(url);
}

async function fetchWorkflowData(
  locator: GitHubRunLocator,
): Promise<GitHubWorkflowData> {
  const [jobs, run] = await Promise.all([
    fetchWorkflowJobs(locator),
    fetchWorkflowRun(locator),
  ]);
  return { jobs, run };
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

function readWorkflowDataFromJson(filePath: string): GitHubWorkflowData {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as
    | GitHubWorkflowJobsResponse
    | GitHubWorkflowData
    | GitHubWorkflowJob[];
  const jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
  if (!Array.isArray(jobs)) {
    throw new Error(
      `Expected ${filePath} to contain a GitHub jobs API response with a jobs array.`,
    );
  }
  return {
    jobs,
    run:
      !Array.isArray(parsed) &&
      "run" in parsed &&
      isWorkflowRunLike(parsed.run)
        ? parsed.run
        : undefined,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const help = takeFlag(args, "--help") || takeFlag(args, "-h");
  if (help) {
    process.stdout.write(formatCiTriageHelp());
    return;
  }

  const json = takeFlag(args, "--json");
  const repo = takeOption(args, "--repo") ?? DEFAULT_REPO;
  const jobsJsonPath = takeOption(args, "--jobs-json");
  const explicitRun = takeOption(args, "--run");
  const unknownOption = args.find((arg) => arg.startsWith("-"));
  if (unknownOption) {
    throw new CliUsageError(
      `Unknown option ${unknownOption.split("=", 1)[0]}. Use --help for usage.`,
    );
  }

  const run = explicitRun ?? args[0];
  const extraArgument = explicitRun ? args[0] : args[1];
  if (extraArgument) {
    throw new CliUsageError(`Unexpected argument: ${extraArgument}`);
  }

  if (!run) {
    console.error(formatCiTriageHelp().trimEnd());
    process.exit(2);
  }

  const locator = parseGitHubRunLocator(run, repo);
  const workflowData = jobsJsonPath
    ? readWorkflowDataFromJson(jobsJsonPath)
    : await fetchWorkflowData(locator);
  const runIdentity = runIdentityFromGitHubRun(locator, workflowData.run);
  const checkout = detectLocalCheckout(runIdentity);
  const summary = summarizeWorkflowJobs(workflowData.jobs, {
    requestedJobId: locator.jobId,
  });

  if (json) {
    console.log(
      JSON.stringify(
        formatTriageJsonReport(locator, summary, runIdentity, checkout),
        null,
        2,
      ),
    );
  } else {
    process.stdout.write(
      formatTriageSummary(locator, summary, runIdentity, checkout),
    );
  }
}

function runIdentityFromLocator(locator: GitHubRunLocator): TriageRunIdentity {
  return {
    id: locator.runId,
    url: workflowRunUrl(locator),
  };
}

function workflowRunUrl(locator: GitHubRunLocator): string {
  return `https://github.com/${locator.owner}/${locator.repo}/actions/runs/${locator.runId}`;
}

function formatRunIdentityLine(
  locator: GitHubRunLocator,
  run: TriageRunIdentity,
): string {
  const base = `GitHub Actions triage: ${locator.owner}/${locator.repo} run ${run.id}`;
  const details: string[] = [];

  if (run.headBranch || run.headSha) {
    const branch = run.headBranch ?? "unknown branch";
    const sha = run.headSha ? ` @ ${run.headSha.slice(0, 7)}` : "";
    details.push(`${branch}${sha}`);
  }

  const state = [run.status, run.conclusion].filter(Boolean).join("/");
  if (state.length > 0) {
    details.push(state);
  }

  return details.length > 0 ? `${base} (${details.join(", ")})` : base;
}

function formatCheckoutWarning(
  run: TriageRunIdentity,
  checkout: TriageCheckoutIdentity,
): string | null {
  if (checkout.status !== "stale" || !checkout.headSha || !run.headSha) {
    return null;
  }

  return [
    `Checkout warning: local HEAD ${checkout.headSha.slice(0, 7)} differs from run HEAD ${run.headSha.slice(0, 7)}.`,
    "Reproduce on the run SHA or confirm current HEAD already fixes it before patching.",
  ].join(" ");
}

function detectLocalCheckout(
  run: TriageRunIdentity,
): TriageCheckoutIdentity {
  return compareCheckoutToRun(run, readLocalGitHeadSha());
}

function readLocalGitHeadSha(): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2000,
  });

  if (result.status !== 0) {
    return undefined;
  }

  return normalizeSha(result.stdout);
}

function normalizeSha(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && /^[0-9a-f]+$/.test(trimmed) ? trimmed : undefined;
}

function isWorkflowRunLike(value: unknown): value is GitHubWorkflowRun {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number"
  );
}

function parseRepo(repo: string): [string, string] {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Expected repository as owner/name, got ${repo}`);
  }
  return [owner, name];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`Missing value for ${flag}`);
  }

  args.splice(index, 2);
  return value;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof CliUsageError ? 2 : 1);
  });
}
