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
const NO_LOCAL_REPRO_GUIDANCE =
  "No focused local repro command matched this job. Inspect the failed step logs and add a ci:triage mapping when the failure pattern is recurring.";

class CliUsageError extends Error {}

export interface CiTriageJsonCodeGroupCoverageDecision {
  groupName: string;
  coverage: "mapped" | "excluded";
  reason: string;
}

const MAPPED_JSON_CODE_GROUP_NAMES = [
  "bindgen",
  "build",
  "check",
  "clean",
  "completion",
  "docs",
  "doctor",
  "format",
  "lint",
  "project-new",
  "package-init",
  "package-uninstall",
  "package-cache",
  "package-install",
  "package-archive",
  "package-manifest",
  "package-resolver",
  "module-resolver",
  "import-handler",
  "type-checker",
  "run-script",
  "sanitizer-runtime",
  "wasm-linker",
] as const;

export const CI_TRIAGE_JSON_CODE_GROUP_COVERAGE_DECISIONS: readonly CiTriageJsonCodeGroupCoverageDecision[] =
  MAPPED_JSON_CODE_GROUP_NAMES.map((groupName) => ({
    groupName,
    coverage: "mapped",
    reason:
      "Group codes are routed to focused local reproduction commands by localCommandsForStep.",
  }));

const RELEASE_SMOKE_STEP_PATTERN =
  /(?:ReleaseSmoke\.test|release smoke|release:smoke|package import diagnostic code JSON)/i;
const RELEASE_PACKAGE_ALLOWLIST_STEP_PATTERN = new RegExp(
  [
    "npm tarball includes paths outside the release allowlist",
    "npm tarball includes development-only paths",
    "npm tarball includes source-only files",
    "Source tree is missing required source-only files",
    "Unaccounted packed tools payload",
    "validate packed npm file allowlist",
    "validate source-only release files",
  ].join("|"),
  "i",
);
const RELEASE_CLI_REGISTRY_STEP_PATTERN = new RegExp(
  [
    "release:cli-registry",
    "release cli-registry",
    "release CLI registry",
    "CLI registry shim",
    "registry sync check",
    "cli_json_registry_shim",
    "bpl-v3/cli registry",
  ].join("|"),
  "i",
);
const PACKAGE_RESOLVER_STEP_PATTERN = new RegExp(
  [
    "PackageResolver\\.test",
    "Package resolver",
    "package/import resolver",
    "package resolver",
    "package search directory",
    "global package root failures",
    "BPL_PACKAGE_(IMPORT_INVALID|NOT_FOUND|ENTRYPOINT_|SUBPATH_|SEARCH_DIR_|ROOT_)",
  ].join("|"),
  "i",
);
const PACKAGE_GLOBAL_SEARCH_DIR_STEP_PATTERN = new RegExp(
  [
    "global package search directory",
    "Global package directory path is a symbolic link",
    "package global search symlink JSON",
  ].join("|"),
  "i",
);
const PACKAGE_SEARCH_DIR_NOT_DIRECTORY_STEP_PATTERN = new RegExp(
  [
    "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
    "package search directory is not a directory",
    "Global package directory path is not a directory",
    "package .* search non-directory JSON",
  ].join("|"),
  "i",
);
const PACKAGE_IMPORT_CASING_STEP_PATTERN = new RegExp(
  [
    "BPL_PACKAGE_(ROOT|SEARCH_DIR|ENTRYPOINT|SUBPATH)_CASE_MISMATCH",
    "package root casing does not match",
    "package search directory casing does not match",
    "entrypoint casing does not match filesystem",
    "subpath .* casing does not match filesystem",
    "case-mismatched global versioned package",
  ].join("|"),
  "i",
);
const PACKAGE_IMPORT_DOCS_SMOKE_STEP_PATTERN = new RegExp(
  [
    "CLIJsonParseability\\.test.*package/import docs examples",
    "package/import docs examples",
    "keeps package/import docs examples covered by JSON smoke fixtures",
  ].join("|"),
  "i",
);
const PACKAGE_DOCS_SMOKE_DOCUMENTATION_STEP_PATTERN = new RegExp(
  [
    "MarkdownDocs\\.test.*package docs document package/import docs smoke fixtures",
    "package docs document package/import docs smoke fixtures",
    "PACKAGE_DOCS_SMOKE_DOCUMENTATION_SNIPPETS",
  ].join("|"),
  "i",
);
const PACKAGE_EXPLICIT_SOURCE_FILE_STEP_PATTERN = new RegExp(
  [
    "explicit package source-file",
    "explicit source file shadowed by directory",
    "do not fall back to directory indexes",
  ].join("|"),
  "i",
);
const STD_IMPORT_ISOLATION_STEP_PATTERN = new RegExp(
  [
    "Standard library module not found",
    "missing explicit std",
    "std namespace isolation",
    "Explicit std[/\\\\].*do not fall back",
    "std[/\\\\].*BPL_MODULE_NOT_FOUND",
    "BPL_MODULE_NOT_FOUND.*std[/\\\\]",
  ].join("|"),
  "i",
);
const STDLIB_PACKAGE_COLLISION_STEP_PATTERN = new RegExp(
  [
    "stdlib package-name collisions",
    "bare stdlib module names before same-name packages",
    "bare stdlib import precedence",
    "Module ['\"]math['\"] does not export ['\"]packageMath['\"]",
    "package named `math` is shadowed",
    "package named math is shadowed",
  ].join("|"),
  "i",
);
const IMPORT_EXPORT_NOT_FOUND_STEP_PATTERN = new RegExp(
  [
    "BPL_IMPORT_EXPORT_NOT_FOUND",
    "missing imported-export",
    "missing imported export",
    "named import is not exported",
    "stable code when a named import is not exported",
    "Available exports:",
    "Module ['\"](?:\\./|\\.\\./|/|[A-Za-z]:[\\\\/])[^'\"]+['\"] does not export",
  ].join("|"),
  "i",
);
const DUPLICATE_SYMBOL_STEP_PATTERN = new RegExp(
  [
    "BPL_SYMBOL_ALREADY_DEFINED",
    "duplicate-symbol",
    "duplicate symbol",
    "duplicate top-level symbols",
    "duplicate function signatures",
    "duplicate function parameters",
    "duplicate generic parameters",
    "duplicate struct fields",
    "duplicate enum variants",
    "Duplicate parameter name",
    "Duplicate generic type parameter",
    "Duplicate field ['\"][^'\"]+['\"] in struct",
    "Duplicate enum variant ['\"][^'\"]+['\"] in enum",
    "declared multiple times in function",
    "already defined in this scope",
    "with this signature is already defined",
    "Overloads must have different parameter types",
    "remove the earlier .* declaration",
  ].join("|"),
  "i",
);
const TYPE_RECURSION_CYCLE_STEP_PATTERN = new RegExp(
  [
    "BPL_TYPE_RECURSION_CYCLE",
    "recursive type-cycle",
    "recursive type cycle",
    "recursive struct field cycles",
    "recursive enum variant cycles",
    "infinite size due to recursive (?:field|variant) types",
    "Struct ['\"][^'\"]+['\"] cannot inherit from itself",
    "Circular inheritance detected",
    "Recursive cycle detected:",
    "Inheritance cycle:",
  ].join("|"),
  "i",
);
const GENERIC_ARITY_STEP_PATTERN = new RegExp(
  [
    "BPL_GENERIC_ARITY_MISMATCH",
    "generic arity",
    "generic type arity",
    "generic alias arity",
    "Generic type ['\"][^'\"]+['\"] expects \\d+ type arguments, but got \\d+",
    "Generic alias ['\"][^'\"]+['\"] expects \\d+ type arguments, but got \\d+",
    "Check generic argument count",
  ].join("|"),
  "i",
);
const TYPE_NOT_FOUND_STEP_PATTERN = new RegExp(
  [
    "BPL_TYPE_NOT_FOUND",
    "Undefined type ['\"][^'\"]+['\"]",
    "undefined-type",
    "undefined type",
    "The type is not defined",
    "variable undefined-type failures",
    "struct field undefined-type failures",
  ].join("|"),
  "i",
);
const VOID_TYPE_INVALID_STEP_PATTERN = new RegExp(
  [
    "BPL_VOID_TYPE_INVALID",
    "invalid void",
    "Invalid bare void type",
    "Variable ['\"][^'\"]+['\"] cannot be void",
    "Parameter ['\"][^'\"]+['\"] cannot be of type ['\"]void['\"]",
    "Struct field ['\"][^'\"]+['\"] cannot be void",
    "Generic type argument cannot be ['\"]void['\"]",
    "Use ['\"]\\*void['\"] for void pointers",
  ].join("|"),
  "i",
);
const BUILTIN_TYPE_REDEFINITION_STEP_PATTERN = new RegExp(
  [
    "BPL_BUILTIN_TYPE_REDEFINITION",
    "builtin type redefinition",
    "built-in type redefinition",
    "Cannot redefine builtin type ['\"][^'\"]+['\"]",
    "Builtin type names are reserved",
  ].join("|"),
  "i",
);
const ARRAY_SIZE_INVALID_STEP_PATTERN = new RegExp(
  [
    "BPL_ARRAY_SIZE_INVALID",
    "invalid array size",
    "invalid fixed array size",
    "Array size must be greater than zero",
    "Arrays cannot have zero or negative size",
  ].join("|"),
  "i",
);
const RETURN_TYPE_MISMATCH_STEP_PATTERN = new RegExp(
  [
    "BPL_RETURN_TYPE_MISMATCH",
    "return type mismatch",
    "Return type mismatch: expected",
    "Ensure the returned value matches the function's return type",
  ].join("|"),
  "i",
);
const ASSIGNMENT_TYPE_MISMATCH_STEP_PATTERN = new RegExp(
  [
    "BPL_ASSIGNMENT_TYPE_MISMATCH",
    "assignment type mismatch",
    "Type mismatch in assignment",
    "The assigned value is not compatible with the target variable's type",
  ].join("|"),
  "i",
);
const CONDITION_TYPE_MISMATCH_STEP_PATTERN = new RegExp(
  [
    "BPL_CONDITION_TYPE_MISMATCH",
    "condition type mismatch",
    "If condition must be boolean",
    "Loop condition must be boolean",
    "Ternary condition must be boolean",
    "Ensure the condition evaluates to a boolean",
  ].join("|"),
  "i",
);
const CLI_JSON_PARSEABILITY_TIMEOUT_STEP_PATTERN = new RegExp(
  [
    "CLIJsonParseability\\.test.*timed out after",
    "CLI JSON parseability.*timed out after",
    "reports module path diagnostic codes.*timed out after",
    "reports missing explicit std imports.*timed out after",
  ].join("|"),
  "i",
);
const IMPORT_RESOLVER_STEP_PATTERN = new RegExp(
  [
    "ModuleResolver\\.test",
    "Module resolver",
    "import resolver",
    "import diagnostics in JSON-mode build failures",
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
    "BPL_BUILD_(?!NO_INPUTS)",
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
const BUILD_NO_INPUT_JSON_STEP_PATTERN = new RegExp(
  [
    "BPL_BUILD_NO_INPUTS",
    "root build JSON no-input",
    "build --json.*No input files specified",
    "No input files specified.*build --json",
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
const ATOMIC_WRITE_PERMISSION_STEP_PATTERN = new RegExp(
  [
    "CLIUtils\\.test",
    "CLI utils.*preserves file permissions",
    "writeFileAtomically.*permission",
    "format files in write mode atomically",
    "preserve executable permissions",
    "Expected:\\s*484",
    "Received:\\s*448",
  ].join("|"),
  "i",
);
const PACKAGE_ATOMIC_MODE_STEP_PATTERN = new RegExp(
  [
    "PackageManager.*(?:lockfile|package provenance|package archive|global cache archive).*permissions",
    "PackageManagerCLI.*(?:lockfile|package archive|global cache archive).*mode",
    "PackageManager.*(?:bpl\\.lock|bplmeta|package archive|global cache archive).*mode",
    "copyFileAtomically.*mode",
    "package atomic mode",
    "package archive permissions",
    "global cache archive permissions",
    "package provenance permissions",
    "lockfile permissions",
    "Expected:\\s*416",
    "Received:\\s*384",
  ].join("|"),
  "i",
);
const MODULE_CACHE_MANIFEST_MODE_STEP_PATTERN = new RegExp(
  [
    "ModuleCache.*manifest permissions",
    "module cache manifest.*permissions",
    "preserves existing manifest permissions",
    "manifest permissions.*Expected:\\s*416.*Received:\\s*384",
    "manifest permissions.*expected\\s+416.*received\\s+384",
  ].join("|"),
  "i",
);
const DEBUG_IR_PATH_STEP_PATTERN = new RegExp(
  [
    "Debug IR path",
    "Debug IR parent path",
    "CodeGenerator.*debug IR",
    "debug IR.*symbolic link",
    "debug IR.*parent",
  ].join("|"),
  "i",
);
const EXECUTABLE_OUTPUT_MODE_STEP_PATTERN = new RegExp(
  [
    "BinaryRunner.*executable permissions",
    "Linker.*linked output permissions",
    "ModuleCache.*linked output permissions",
    "executable output mode",
    "linked output mode",
    "linked output permissions.*Expected:\\s*493.*Received:\\s*384",
    "linked output permissions.*expected\\s+493.*received\\s+384",
    "expected\\s+493.*received\\s+384.*(?:executable|linked)",
    "(?:executable|linked).*expected\\s+493.*received\\s+384",
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
    "BPL_PACKAGE_INSTALL_",
    "BPL_PACKAGE_ARCHIVE_",
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
    "BPL_WASM_LINKER_UNAVAILABLE",
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
const PLAYGROUND_BROWSER_WASM_STEP_PATTERN = new RegExp(
  [
    "PlaygroundBrowserWasmRuntime\\.test",
    "PlaygroundWasmHostAdapter\\.test",
    "PlaygroundStaticAssets\\.test",
    "WasmHostImportContract\\.test",
    "BplBrowserCompiler\\.compileToHostedWasm",
    "BplWasmHostAdapter\\.runHostedWasmInBrowser",
    "BPL browser wasm runtime script must load before app\\.js",
    "BPL wasm host adapter script must load before app\\.js",
    "Browser-only BPL compilation is not available",
    "Browser BPL compiler: unavailable",
    "playground wasm browser",
    "browser wasm runtime",
  ].join("|"),
  "i",
);
const PLAYGROUND_PROCESS_EXECUTION_STEP_PATTERN = new RegExp(
  [
    "PlaygroundNativeExecution\\.test",
    "PlaygroundProcessRunner\\.test",
    "playground/backend/nativeExecution\\.ts",
    "playground/backend/processRunner\\.ts",
    "PlaygroundExamples\\.test.*(?:shell metacharacter args|argv-vector execution)",
    "TutorialExamples\\.test.*argv-vector execution",
    "Playground native execution response shaping",
    "Playground process runner",
    "playground process execution",
    "playground backend execution",
    "native execution.*(?:Runtime error|Execution timeout|maxBuffer|stdout|stderr)",
    "(?:Runtime error|Execution timeout|maxBuffer|stdout|stderr).*native execution",
    "backend server runs compiled programs through argv-vector execution",
    "passes shell metacharacter args literally and preserves stdin",
    "does not surface stdin pipe errors after a successful child exit",
    "runPlaygroundNativeBinary",
    "runProcessFile\\(binFile, args",
    "runProcessFile",
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
const INTEGRATION_JOBS_STEP_PATTERN = new RegExp(
  [
    "IntegrationRunner\\.test",
    "integration job concurrency",
    "integration jobs",
    "BPL_INTEGRATION_JOBS",
  ].join("|"),
  "i",
);
const INTEGRATION_CONFIG_STEP_PATTERN = new RegExp(
  [
    "IntegrationConfig\\.test",
    "integration example config parser",
    "example test configs valid",
    "test_config\\.json: unsupported key",
    "invalid JSON in test_config\\.json",
    "expectedOutput\\[\\d+\\] must be a string",
    "skip_compilation must be a boolean",
  ].join("|"),
  "i",
);
const VSCODE_EXTENSION_TYPECHECK_STEP_PATTERN = new RegExp(
  [
    "VS Code extension type check",
    "Run VS Code extension tests",
    "VS Code extension test type-check",
    "vscode extension type check",
    "vscode-ext/src/test/.*TS(?:7006|2307)",
    "vscode-ext/src/test/.*implicitly has an ['\"]any['\"] type",
    "vscode-ext/src/test/.*Cannot find module",
    "vscode-languageserver-textdocument",
    "npm run compile:test --prefix vscode-ext",
    "tsconfig\\.test\\.json",
    "test:vscode-ext",
  ].join("|"),
  "i",
);
const TEST_CI_RUNNER_STEP_PATTERN = new RegExp(
  [
    "Run CI-safe test suite",
    "CI-safe validation failed",
    "CI-safe test runner",
    "Run CI-safe unit tests",
    "tools/test_ci\\.ts",
    "test_ci\\.ts",
    "bun tools/test_ci\\.ts",
    "check: ['\"]test-ci['\"]",
  ].join("|"),
  "i",
);
const FUZZ_ARTIFACT_REPRO_STEP_PATTERN = new RegExp(
  [
    "compiler-fuzz-crashes",
    "fuzz/crashes/[^\\s]+\\.json",
    "Upload fuzz crash artifacts",
    "fuzz crash artifacts",
  ].join("|"),
  "i",
);

const EXCLUSIVE_STEP_REPRO_COMMANDS: Array<[RegExp, string]> = [
  [
    RELEASE_PACKAGE_ALLOWLIST_STEP_PATTERN,
    'bun test tests/ReleaseMetadata.test.ts -t "packed tools payload|playground browser wasm helper assets|package helper script inventory"',
  ],
  [
    RELEASE_PACKAGE_ALLOWLIST_STEP_PATTERN,
    "bun test tests/ReleaseSmoke.test.ts",
  ],
  [RELEASE_PACKAGE_ALLOWLIST_STEP_PATTERN, "bun run release:smoke"],
  [
    PLAYGROUND_BROWSER_WASM_STEP_PATTERN,
    "bun test tests/PlaygroundBrowserWasmRuntime.test.ts tests/PlaygroundWasmHostAdapter.test.ts tests/PlaygroundStaticAssets.test.ts tests/WasmHostImportContract.test.ts",
  ],
  [PLAYGROUND_BROWSER_WASM_STEP_PATTERN, "bun run test:wasm"],
  [PLAYGROUND_BROWSER_WASM_STEP_PATTERN, "bun run check"],
  [
    PLAYGROUND_PROCESS_EXECUTION_STEP_PATTERN,
    "bun test tests/PlaygroundNativeExecution.test.ts",
  ],
  [
    PLAYGROUND_PROCESS_EXECUTION_STEP_PATTERN,
    "bun test tests/PlaygroundProcessRunner.test.ts",
  ],
  [
    PLAYGROUND_PROCESS_EXECUTION_STEP_PATTERN,
    'bun test tests/PlaygroundExamples.test.ts -t "shell metacharacter args|argv-vector execution"',
  ],
  [
    PLAYGROUND_PROCESS_EXECUTION_STEP_PATTERN,
    'bun test tests/TutorialExamples.test.ts -t "argv-vector execution"',
  ],
  [PLAYGROUND_PROCESS_EXECUTION_STEP_PATTERN, "bun run check"],
  [
    FUZZ_ARTIFACT_REPRO_STEP_PATTERN,
    "bun run fuzz:repro -- fuzz/crashes",
  ],
  [
    FUZZ_ARTIFACT_REPRO_STEP_PATTERN,
    "bun run fuzz:validate-artifacts",
  ],
  [
    FUZZ_ARTIFACT_REPRO_STEP_PATTERN,
    "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json",
  ],
  [
    FUZZ_ARTIFACT_REPRO_STEP_PATTERN,
    "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --mode parser,typecheck,codegen,runtime,differential,sanitizer",
  ],
  [
    FUZZ_ARTIFACT_REPRO_STEP_PATTERN,
    "bun run fuzz:replay -- --metadata fuzz/crashes/<artifact>.json --minimize --out fuzz/crashes/<artifact>.min.bpl",
  ],
  [
    CLI_JSON_PARSEABILITY_TIMEOUT_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|missing explicit std imports"',
  ],
  [
    CLI_JSON_PARSEABILITY_TIMEOUT_STEP_PATTERN,
    "bun test tests/CLIJsonParseability.test.ts",
  ],
  [CLI_JSON_PARSEABILITY_TIMEOUT_STEP_PATTERN, "bun run check"],
  [
    STD_IMPORT_ISOLATION_STEP_PATTERN,
    'bun test tests/ModuleResolver.test.ts -t "missing explicit std"',
  ],
  [
    STD_IMPORT_ISOLATION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "missing explicit std"',
  ],
  [
    STD_IMPORT_ISOLATION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
  ],
  [
    STD_IMPORT_ISOLATION_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "std namespace isolation"',
  ],
  [
    STDLIB_PACKAGE_COLLISION_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "bare stdlib import precedence"',
  ],
  [
    STDLIB_PACKAGE_COLLISION_STEP_PATTERN,
    'bun test tests/ModuleResolver.test.ts -t "bare stdlib module names"',
  ],
  [
    STDLIB_PACKAGE_COLLISION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "stdlib package-name collisions"',
  ],
  [STDLIB_PACKAGE_COLLISION_STEP_PATTERN, "bun run check"],
  [
    IMPORT_EXPORT_NOT_FOUND_STEP_PATTERN,
    'bun test tests/ImportHandler.test.ts -t "stable code|available exports"',
  ],
  [
    IMPORT_EXPORT_NOT_FOUND_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "available exports|stdlib package-name collisions"',
  ],
  [
    IMPORT_EXPORT_NOT_FOUND_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "missing imported-export"',
  ],
  [IMPORT_EXPORT_NOT_FOUND_STEP_PATTERN, "bun run check"],
  [
    DUPLICATE_SYMBOL_STEP_PATTERN,
    "bun test tests/TypeCheckerDuplicateSymbols.test.ts",
  ],
  [
    DUPLICATE_SYMBOL_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters|duplicate function signatures|duplicate top-level symbols|duplicate struct fields|duplicate enum variants"',
  ],
  [
    DUPLICATE_SYMBOL_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "duplicate-symbol"',
  ],
  [DUPLICATE_SYMBOL_STEP_PATTERN, "bun run check"],
  [
    TYPE_RECURSION_CYCLE_STEP_PATTERN,
    "bun test tests/TypeCheckerRecursiveTypes.test.ts",
  ],
  [
    TYPE_RECURSION_CYCLE_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "recursive struct field cycles|recursive enum variant cycles"',
  ],
  [
    TYPE_RECURSION_CYCLE_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "recursive type-cycle"',
  ],
  [TYPE_RECURSION_CYCLE_STEP_PATTERN, "bun run check"],
  [
    GENERIC_ARITY_STEP_PATTERN,
    "bun test tests/TypeCheckerGenericArity.test.ts",
  ],
  [
    GENERIC_ARITY_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "generic type arity|generic alias arity"',
  ],
  [
    GENERIC_ARITY_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "generic arity"',
  ],
  [GENERIC_ARITY_STEP_PATTERN, "bun run check"],
  [
    TYPE_NOT_FOUND_STEP_PATTERN,
    "bun test tests/TypeCheckerUndefinedTypes.test.ts",
  ],
  [
    TYPE_NOT_FOUND_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "undefined-type"',
  ],
  [
    TYPE_NOT_FOUND_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "undefined type"',
  ],
  [TYPE_NOT_FOUND_STEP_PATTERN, "bun run check"],
  [
    VOID_TYPE_INVALID_STEP_PATTERN,
    "bun test tests/TypeCheckerVoidTypes.test.ts",
  ],
  [
    VOID_TYPE_INVALID_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "invalid void type"',
  ],
  [
    VOID_TYPE_INVALID_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "invalid void type"',
  ],
  [VOID_TYPE_INVALID_STEP_PATTERN, "bun run check"],
  [
    BUILTIN_TYPE_REDEFINITION_STEP_PATTERN,
    "bun test tests/TypeCheckerBuiltinRedefinition.test.ts",
  ],
  [
    BUILTIN_TYPE_REDEFINITION_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "builtin type redefinition"',
  ],
  [
    BUILTIN_TYPE_REDEFINITION_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "builtin type redefinition"',
  ],
  [BUILTIN_TYPE_REDEFINITION_STEP_PATTERN, "bun run check"],
  [
    ARRAY_SIZE_INVALID_STEP_PATTERN,
    "bun test tests/TypeCheckerInvalidArraySizes.test.ts",
  ],
  [
    ARRAY_SIZE_INVALID_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "invalid array size"',
  ],
  [
    ARRAY_SIZE_INVALID_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "invalid fixed array size"',
  ],
  [ARRAY_SIZE_INVALID_STEP_PATTERN, "bun run check"],
  [
    RETURN_TYPE_MISMATCH_STEP_PATTERN,
    "bun test tests/TypeCheckerReturnTypeMismatch.test.ts",
  ],
  [
    RETURN_TYPE_MISMATCH_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "return type mismatch"',
  ],
  [
    RETURN_TYPE_MISMATCH_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "return type mismatch"',
  ],
  [RETURN_TYPE_MISMATCH_STEP_PATTERN, "bun run check"],
  [
    ASSIGNMENT_TYPE_MISMATCH_STEP_PATTERN,
    "bun test tests/TypeCheckerAssignmentMismatch.test.ts",
  ],
  [
    ASSIGNMENT_TYPE_MISMATCH_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "assignment type mismatch"',
  ],
  [
    ASSIGNMENT_TYPE_MISMATCH_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "assignment type mismatch"',
  ],
  [ASSIGNMENT_TYPE_MISMATCH_STEP_PATTERN, "bun run check"],
  [
    CONDITION_TYPE_MISMATCH_STEP_PATTERN,
    "bun test tests/TypeCheckerConditionMismatch.test.ts",
  ],
  [
    CONDITION_TYPE_MISMATCH_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"',
  ],
  [
    CONDITION_TYPE_MISMATCH_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "condition type mismatch"',
  ],
  [CONDITION_TYPE_MISMATCH_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_SEARCH_DIR_NOT_DIRECTORY_STEP_PATTERN,
    'bun test tests/PackageResolver.test.ts -t "non-directory.*package search directories|rejects non-directory global"',
  ],
  [
    PACKAGE_SEARCH_DIR_NOT_DIRECTORY_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package search directory|global package search directory failures"',
  ],
  [
    PACKAGE_SEARCH_DIR_NOT_DIRECTORY_STEP_PATTERN,
    'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
  ],
  [
    PACKAGE_IMPORT_CASING_STEP_PATTERN,
    'bun test tests/PackageResolver.test.ts -t "casing|case-mismatched global versioned"',
  ],
  [
    PACKAGE_IMPORT_CASING_STEP_PATTERN,
    'bun test tests/ModuleResolver.test.ts -t "case-mismatched global versioned|filesystem casing"',
  ],
  [
    PACKAGE_IMPORT_CASING_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package search directory|module path diagnostic codes|JSON-mode build failures"',
  ],
  [PACKAGE_IMPORT_CASING_STEP_PATTERN, "bun run check"],
];

const STEP_REPRO_COMMANDS: Array<[RegExp, string]> = [
  [/^Type check$/i, "bun run check"],
  [/^Lint$/i, "bun run lint"],
  [
    VSCODE_EXTENSION_TYPECHECK_STEP_PATTERN,
    "npm run compile:test --prefix vscode-ext",
  ],
  [VSCODE_EXTENSION_TYPECHECK_STEP_PATTERN, "npm test --prefix vscode-ext"],
  [VSCODE_EXTENSION_TYPECHECK_STEP_PATTERN, "bun run check"],
  [/Run Windows-safe codegen tests/i, "bun run test:codegen-cross-platform"],
  [WASM_TOOLCHAIN_STEP_PATTERN, "bun run test:wasm"],
  [WASM_TOOLCHAIN_STEP_PATTERN, "BPL_REQUIRE_WASM_LD=1 bun run test:wasm"],
  [WASM_TOOLCHAIN_STEP_PATTERN, "bun index.ts doctor --json"],
  [
    WASM_LINKER_TIMEOUT_STEP_PATTERN,
    "BPL_WASM_LINKER_PROBE_TIMEOUT_MS=5000 bun run test:wasm",
  ],
  [TEST_CI_RUNNER_STEP_PATTERN, "bun test tests/TestCiRunner.test.ts"],
  [TEST_CI_RUNNER_STEP_PATTERN, "bun tools/test_ci.ts --list"],
  [TEST_CI_RUNNER_STEP_PATTERN, "bun run test:ci"],
  [INTEGRATION_JOBS_STEP_PATTERN, "bun test tests/IntegrationRunner.test.ts"],
  [
    INTEGRATION_JOBS_STEP_PATTERN,
    "BPL_INTEGRATION_JOBS=4 bun run test:ci",
  ],
  [INTEGRATION_JOBS_STEP_PATTERN, "bun run test:ci"],
  [
    INTEGRATION_CONFIG_STEP_PATTERN,
    "bun test tests/IntegrationConfig.test.ts",
  ],
  [
    INTEGRATION_CONFIG_STEP_PATTERN,
    'bun test tests/Integration.test.ts -t "example test configs valid"',
  ],
  [INTEGRATION_CONFIG_STEP_PATTERN, "bun run check"],
  [COMPILER_TIMEOUT_STEP_PATTERN, "bun index.ts doctor --json"],
  [COMPILER_TIMEOUT_STEP_PATTERN, "bun run test:ci"],
  [
    COMPILER_TIMEOUT_STEP_PATTERN,
    "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
  ],
  [RELEASE_CLI_REGISTRY_STEP_PATTERN, "bun run release:cli-registry"],
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
  [
    PACKAGE_GLOBAL_SEARCH_DIR_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "global package search directory failures"',
  ],
  [
    PACKAGE_GLOBAL_SEARCH_DIR_STEP_PATTERN,
    'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
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
  [
    PACKAGE_IMPORT_DOCS_SMOKE_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"',
  ],
  [
    PACKAGE_DOCS_SMOKE_DOCUMENTATION_STEP_PATTERN,
    'bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"',
  ],
  [
    PACKAGE_EXPLICIT_SOURCE_FILE_STEP_PATTERN,
    'bun test tests/PackageResolver.test.ts -t "explicit source-file"',
  ],
  [
    PACKAGE_EXPLICIT_SOURCE_FILE_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "package import"',
  ],
  [PACKAGE_EXPLICIT_SOURCE_FILE_STEP_PATTERN, "bun run check"],
  [IMPORT_RESOLVER_STEP_PATTERN, "bun test tests/ModuleResolver.test.ts"],
  [
    IMPORT_RESOLVER_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|import diagnostics|JSON-mode build failures"',
  ],
  [
    BUILD_NO_INPUT_JSON_STEP_PATTERN,
    'bun test tests/CLIJsonParseability.test.ts -t "root build JSON no-input"',
  ],
  [
    BUILD_NO_INPUT_JSON_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "no-input compile"',
  ],
  [BUILD_NO_INPUT_JSON_STEP_PATTERN, "bun run check"],
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
  [ATOMIC_WRITE_PERMISSION_STEP_PATTERN, "bun test tests/CLIUtils.test.ts"],
  [
    ATOMIC_WRITE_PERMISSION_STEP_PATTERN,
    'bun test tests/CLI.test.ts -t "format files in write mode atomically"',
  ],
  [
    MODULE_CACHE_MANIFEST_MODE_STEP_PATTERN,
    'bun test tests/ModuleCache.test.ts -t "manifest permissions"',
  ],
  [MODULE_CACHE_MANIFEST_MODE_STEP_PATTERN, "bun run check"],
  [
    DEBUG_IR_PATH_STEP_PATTERN,
    'bun test tests/CodeGenerator.test.ts -t "debug IR"',
  ],
  [DEBUG_IR_PATH_STEP_PATTERN, "bun run check"],
  [
    PACKAGE_ATOMIC_MODE_STEP_PATTERN,
    'bun test tests/PackageManager.test.ts -t "lockfile permissions|package provenance permissions|package archive permissions|global cache archive permissions"',
  ],
  [
    PACKAGE_ATOMIC_MODE_STEP_PATTERN,
    'bun test tests/PackageManagerCLI.test.ts -t "lockfile permissions|package archive permissions|global cache archive permissions"',
  ],
  [PACKAGE_ATOMIC_MODE_STEP_PATTERN, "bun run check"],
  [
    EXECUTABLE_OUTPUT_MODE_STEP_PATTERN,
    'bun test tests/BinaryRunner.test.ts -t "executable permissions"',
  ],
  [
    EXECUTABLE_OUTPUT_MODE_STEP_PATTERN,
    'bun test tests/Linker.test.ts -t "linked output permissions"',
  ],
  [
    EXECUTABLE_OUTPUT_MODE_STEP_PATTERN,
    'bun test tests/ModuleCache.test.ts -t "linked output permissions"',
  ],
  [EXECUTABLE_OUTPUT_MODE_STEP_PATTERN, "bun run check"],
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
    const runId = Number(trimmed);
    if (!Number.isSafeInteger(runId) || runId <= 0) {
      throw new CliUsageError(`Invalid GitHub Actions run id: ${trimmed}`);
    }
    const [owner, repo] = parseRepo(defaultRepo);
    return { owner, repo, runId };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CliUsageError(
      `Expected a numeric GitHub Actions run id or github.com Actions run URL, got ${trimmed}`,
    );
  }

  if (url.hostname !== "github.com") {
    throw new CliUsageError(
      `Expected a github.com Actions run URL, got ${url.href}`,
    );
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const actionsIndex = parts.indexOf("actions");
  const runsIndex = parts.indexOf("runs");
  if (parts.length < 5 || actionsIndex !== 2 || runsIndex !== 3) {
    throw new CliUsageError(
      `Expected a GitHub Actions run URL, got ${url.href}`,
    );
  }

  const owner = parts[0]!;
  const repo = parts[1]!;
  const runId = Number(parts[4]);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new CliUsageError(`Invalid GitHub Actions run id in ${url.href}`);
  }

  const jobIndex = parts.indexOf("job");
  let jobId: number | undefined;
  if (jobIndex >= 0) {
    jobId = Number(parts[jobIndex + 1]);
    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      throw new CliUsageError(`Invalid GitHub Actions job id in ${url.href}`);
    }
  }

  return jobId === undefined
    ? { owner, repo, runId }
    : { owner, repo, runId, jobId };
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
  const exclusiveCommands = EXCLUSIVE_STEP_REPRO_COMMANDS.filter(([pattern]) =>
    pattern.test(stepName),
  ).map(([, command]) => command);
  if (exclusiveCommands.length > 0) {
    return exclusiveCommands;
  }

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
    } else {
      lines.push(`  local repro: ${NO_LOCAL_REPRO_GUIDANCE}`);
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
  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new CliUsageError(
      `Unable to read --jobs-json file ${filePath}: ${formatReadFileError(error)}.`,
    );
  }

  let parsed:
    | GitHubWorkflowJobsResponse
    | GitHubWorkflowData
    | GitHubWorkflowJob[];
  try {
    parsed = JSON.parse(source) as
      | GitHubWorkflowJobsResponse
      | GitHubWorkflowData
      | GitHubWorkflowJob[];
  } catch (error) {
    throw new CliUsageError(
      `Unable to parse --jobs-json file ${filePath}: ${formatJsonParseError(error)}.`,
    );
  }

  const jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
  if (!Array.isArray(jobs)) {
    throw new CliUsageError(
      `Expected --jobs-json file ${filePath} to contain a GitHub jobs API response with a jobs array.`,
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

function formatReadFileError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  if (code === "ENOENT") {
    return "file does not exist";
  }
  if (code === "EACCES" || code === "EPERM") {
    return "permission denied";
  }
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

function formatJsonParseError(error: unknown): string {
  const message =
    error instanceof Error && error.message ? error.message : String(error);
  return message.replace(/^JSON Parse error:\s*/i, "");
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
    throw new CliUsageError(`Expected --repo as owner/name, got ${repo}`);
  }
  return [owner, name];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index >= 0) {
    args.splice(index, 1);
    return true;
  }

  const inlineIndex = args.findIndex((arg) => arg.startsWith(`${flag}=`));
  if (inlineIndex >= 0) {
    throw new CliUsageError(
      `${flag} does not accept a value. Use --help for usage.`,
    );
  }

  return false;
}

function takeOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    const inlineIndex = args.findIndex((arg) => arg.startsWith(`${flag}=`));
    if (inlineIndex < 0) return undefined;

    const value = args[inlineIndex]!.slice(flag.length + 1);
    if (!value || value.startsWith("-")) {
      throw new CliUsageError(`Missing value for ${flag}`);
    }

    args.splice(inlineIndex, 1);
    return value;
  }

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
