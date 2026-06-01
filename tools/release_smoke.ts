import { spawnSync } from "child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { delimiter, join, resolve } from "path";
import {
  discoverPackageHelperDependencyFiles,
  discoverPackageScriptHelperFiles,
  writeReleaseManifest,
} from "./release_manifest";

export {
  discoverPackageHelperDependencyFiles,
  discoverPackageScriptHelperFiles,
} from "./release_manifest";

const repoRoot = resolve(import.meta.dir, "..");
const bplBinary = join(
  repoRoot,
  process.platform === "win32" ? "bpl.exe" : "bpl",
);
const smokeTimeoutMs = 60 * 1000;
const DEDICATED_WASM_EXAMPLE_FILES = ["main.bpl", "test_config.json"] as const;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/;

interface DoctorReport {
  schemaVersion: 1;
  check: "toolchain";
  success: boolean;
  checks: DoctorToolchainCheck[];
}

interface DoctorToolchainCheck {
  id?: string;
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
  required?: boolean;
  code?: string;
  candidates?: string[];
  environment?: Record<string, string | null>;
  recommendedCommands?: string[];
}

interface VersionReport {
  schemaVersion: 1;
  check: "version";
  success: boolean;
  version: string;
}

interface DoctorFailureReport {
  schemaVersion: 1;
  check: "doctor";
  success: boolean;
  error: string;
  errorCode?: string;
}

interface PackageDoctorReport {
  schemaVersion: 1;
  check: "packages";
  success: boolean;
  ok: boolean;
  cacheVerification: PackageCacheVerifyReport;
  issues: unknown[];
}

interface PackageInstallReport {
  schemaVersion: 1;
  check: "package-install";
  success: boolean;
  mode: "package" | "project";
  target: string | null;
  global: boolean;
  locked: boolean;
  update: boolean;
  repairLock: boolean;
  error?: string;
  errorCode?: string;
}

interface PackagePackReport {
  schemaVersion: 1;
  check: "package-pack";
  success: boolean;
  package?: string;
  version?: string;
  packageDir: string;
  outputDir: string;
  archivePath?: string;
  error?: string;
  errorCode?: string;
}

interface PackageInitReport {
  schemaVersion: 1;
  check: "package-init";
  success: boolean;
  package: string | null;
  version?: string;
  manifestPath: string;
  error?: string;
  errorCode?: string;
}

interface ProjectNewReport {
  schemaVersion: 1;
  check: "project-new";
  success: boolean;
  name: string;
  template: string;
  projectPath: string | null;
  manifestPath?: string;
  entrypoint?: string;
  gitInitialized?: boolean;
  error?: string;
  errorCode?: string;
}

interface PackageUninstallReport {
  schemaVersion: 1;
  check: "package-uninstall";
  success: boolean;
  package: string;
  version?: string;
  global: boolean;
  error?: string;
  errorCode?: string;
}

interface PackageListReport {
  schemaVersion: 1;
  check: "package-list";
  success: boolean;
  scope: string;
  packages: unknown[];
}

interface PackageListTreeReport {
  schemaVersion: 1;
  check: "package-list-tree";
  success: boolean;
  scope: string;
  tree: unknown[];
}

interface PackageCacheListReport {
  schemaVersion: 1;
  check: "package-cache-list";
  success: boolean;
  entries: unknown[];
  error?: string;
  errorCode?: string;
}

interface PackageCacheVerifyReport {
  schemaVersion: 1;
  check: "package-cache-verify";
  success: boolean;
  ok: boolean;
  entriesChecked: number;
  issues: unknown[];
  error?: string;
  errorCode?: string;
}

interface PackageCacheCleanReport {
  schemaVersion: 1;
  check: "package-cache-clean";
  success: boolean;
  dryRun: boolean;
  removed: unknown[];
  error?: string;
  errorCode?: string;
}

interface PackageCacheRepairReport {
  schemaVersion: 1;
  check: "package-cache-repair";
  success: boolean;
  dryRun: boolean;
  repaired: unknown[];
  unchanged: unknown[];
  issues: unknown[];
  error?: string;
  errorCode?: string;
}

interface CheckReport {
  schemaVersion: 1;
  check: "check";
  success: boolean;
  totalFiles: number;
  errorCount: number;
  error?: string;
  errorCode?: string;
  files: Array<{
    file: string;
    success: boolean;
    diagnostics?: CheckDiagnostic[];
    error?: string;
    errorCode?: string;
  }>;
}

interface CheckDiagnostic {
  code?: unknown;
  hint?: unknown;
  message?: unknown;
  severityLabel?: unknown;
}

interface LintReport {
  schemaVersion: 1;
  check: "lint";
  success: boolean;
  totalFiles: number;
  errorCount: number;
  error?: string;
  errorCode?: string;
  files: Array<{
    file: string;
    success: boolean;
    diagnostics?: Array<{ code?: unknown; severityLabel?: unknown }>;
    error?: string;
    errorCode?: string;
  }>;
}

interface FormatReport {
  schemaVersion: 1;
  check: "format";
  success: boolean;
  mode: "check";
  totalFiles: number;
  formattedFiles: number;
  unformattedFiles: number;
  errorCount: number;
  error?: string;
  errorCode?: string;
  files: Array<{
    file: string;
    success: boolean;
    formatted: boolean;
    changed: boolean;
    error?: string;
    errorCode?: string;
  }>;
}

interface BindgenReport {
  schemaVersion: 1;
  check: "bindgen";
  success: boolean;
  header: string;
  outputPath: string | null;
  generatedBytes?: number;
  bindings?: string;
  error?: string;
  errorCode?: string;
}

interface DocsReport {
  schemaVersion: 1;
  check: "docs";
  success: boolean;
  file: string;
  outputPath: string;
  generatedBytes?: number;
  error?: string;
  errorCode?: string;
}

interface CompletionReport {
  schemaVersion: 1;
  check: "completion";
  success: boolean;
  shell: string;
  script?: string;
  error?: string;
  errorCode?: string;
}

interface RunScriptListReport {
  schemaVersion: 1;
  check: "run-script-list";
  success: boolean;
  scripts: Array<{ name: string; command: string }>;
}

interface RunScriptFailureReport {
  schemaVersion: 1;
  check: "run-script-list" | "run-script";
  success: boolean;
  error: string;
  errorCode?: string;
}

interface BuildReport {
  schemaVersion: 1;
  check: "build";
  success: boolean;
  output?: {
    llvm?: string;
    executable?: string;
  };
}

interface BuildFailureReport {
  schemaVersion: 1;
  check: "build";
  success: boolean;
  file?: string;
  error: string;
  errorCode?: string;
}

interface CleanFailureReport {
  schemaVersion: 1;
  check: "clean";
  success: boolean;
  dryRun: boolean;
  count: number;
  entries: unknown[];
  error: string;
  errorCode?: string;
}

interface FuzzArtifactReproPlan {
  schemaVersion: 1;
  inputPath: string;
  entries: Array<{
    metadataPath: string;
    sourcePath?: string;
    seedHex?: string;
    iteration?: number;
    commands: string[];
  }>;
}

interface CiTriageReport {
  schemaVersion: 1;
  check: "ci-triage";
  success: boolean;
  run: {
    id: number;
    headSha?: string;
  };
  checkout: {
    status: "current" | "stale" | "unknown";
    reason?: string;
  };
  summary: {
    missingJobIds: number[];
    failedJobs: Array<{ name: string; localCommands: string[] }>;
  };
}

interface NpmPackEntry {
  filename: string;
  name?: string;
  version?: string;
  size?: number;
  unpackedSize?: number;
  shasum?: string;
  integrity?: string;
  files?: Array<{ path: string }>;
}

interface RunStepOptions {
  cwd?: string;
  bplHome?: string | null;
  env?: NodeJS.ProcessEnv;
}

interface ExpectedFailureStepOptions extends RunStepOptions {
  expectedStatus: number;
  expectedStderrIncludes: string;
  forbiddenOutputIncludes?: string[];
}

interface PackageJson {
  name: string;
  version: string;
  license: string;
  bin: Record<string, string>;
  scripts?: Record<string, string>;
}

export function runReleaseSmoke(): void {
  runStep("build standalone compiler", "bun", ["run", "build"]);
  assertBuiltBinary();

  const version = runStep("check standalone compiler version", bplBinary, [
    "--version",
  ]);
  if (!version.stdout.trim()) {
    throw new Error("Standalone compiler did not print a version.");
  }

  const doctor = runStep("check standalone compiler doctor", bplBinary, [
    "doctor",
    "--json",
  ]);
  const report = parseDoctorReport(doctor.stdout);
  if (!report.success) {
    const failures = report.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.name}: ${check.detail}`)
      .join("\n");
    throw new Error(`Standalone doctor reported failures:\n${failures}`);
  }

  runTinyProgramSmoke("standalone compiler", bplBinary, { bplHome: repoRoot });
  runPackedPackageSmoke();

  console.log("release smoke passed");
}

function runTinyProgramSmoke(
  compilerLabel: string,
  compilerPath: string,
  options: RunStepOptions,
): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-smoke-"));
  const outputName =
    process.platform === "win32" ? "release-smoke.exe" : "release-smoke";
  const outputPath = join(tempDir, outputName);

  try {
    writeFileSync(
      join(tempDir, "main.bpl"),
      [
        "extern printf(fmt: string, ...);",
        "",
        "frame main() ret int {",
        '    printf("release-smoke %d\\n", 42);',
        "    return 0;",
        "}",
        "",
      ].join("\n"),
    );

    runStep(
      `compile tiny program with ${compilerLabel}`,
      compilerPath,
      ["build", "main.bpl", "-o", outputPath],
      { ...options, cwd: tempDir },
    );

    const program = runStep(
      `run tiny program built by ${compilerLabel}`,
      outputPath,
      [],
      { ...options, cwd: tempDir },
    );
    if (!program.stdout.includes("release-smoke 42")) {
      throw new Error(
        [
          "Standalone-compiled program did not print expected output.",
          `stdout:\n${program.stdout}`,
          `stderr:\n${program.stderr}`,
        ].join("\n"),
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedPackageSmoke(): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-pack-"));
  const installDir = join(tempDir, "installed");

  try {
    const pack = runStep("pack npm tarball", "npm", [
      "pack",
      "--json",
      "--pack-destination",
      tempDir,
    ]);
    const packEntry = parseNpmPackEntry(pack.stdout);
    const packageHelperFiles = discoverPackageScriptHelperFiles(repoRoot);
    const packageHelperDependencyFiles = discoverPackageHelperDependencyFiles(
      repoRoot,
      packageHelperFiles,
    );
    assertPackedMetadata(packEntry);
    assertPackedFiles(packEntry, [
      "bpl",
      "package.json",
      "README.md",
      "LICENSE",
      "cli/index.d.ts",
      "cli/index.js",
      "completions/_bpl",
      "completions/bpl-completion.bash",
      "docs/39-compiler-options.md",
      "docs/60-compiler-correctness.md",
      ...discoverDedicatedWasmExampleFiles(repoRoot),
      "grammar/grammar.bpl",
      "lib/runtime.ll",
      "lib/runtime_wasm.ll",
      "lib/runtime_wasm_host.ll",
      "lib/runtime_support.o",
      ...packageHelperFiles,
      ...packageHelperDependencyFiles,
    ]);
    assertSourceOnlyFiles(packEntry, [
      "playground/examples/70-browser-wasm-showcase.json",
      "playground/frontend/wasmHostAdapter.js",
      "playground/frontend/browserWasmRuntime.js",
      "playground/backend/processRunner.ts",
      "playground/backend/nativeExecution.ts",
      "playground/backend/wasmToolchain.ts",
    ]);
    assertPackedFileAllowlist(
      packEntry,
      packageHelperFiles,
      packageHelperDependencyFiles,
    );

    const tarballPath = join(tempDir, packEntry.filename);
    if (!existsSync(tarballPath)) {
      throw new Error(`npm pack did not create ${tarballPath}`);
    }
    const releaseManifest = writeReleaseManifest(
      join(tempDir, "release-manifest.json"),
      {
        repoRoot,
        npmPackage: {
          path: tarballPath,
          metadata: packEntry,
        },
      },
    );
    assertReleaseManifest(releaseManifest, [
      ...packageHelperFiles,
      ...packageHelperDependencyFiles,
    ]);

    mkdirSync(installDir, { recursive: true });
    writeFileSync(
      join(installDir, "package.json"),
      JSON.stringify({ private: true, dependencies: {} }, null, 2) + "\n",
    );

    runStep(
      "install packed npm CLI",
      "npm",
      ["install", "--no-audit", "--ignore-scripts", tarballPath],
      { cwd: installDir, bplHome: null },
    );

    const installedBpl =
      process.platform === "win32"
        ? join(installDir, "node_modules", ".bin", "bpl.cmd")
        : join(installDir, "node_modules", ".bin", "bpl");

    runPackedCliRegistrySmoke(installDir);
    runPackedCliRegistryTypesSmoke(installDir);
    runPackedVersionJsonSmoke(installedBpl, installDir, packEntry.version);
    runPackedHelpSmoke(installedBpl, installDir);
    runPackedJsonColorPuritySmoke(installedBpl, installDir, packEntry.version);

    const doctor = runStep(
      "check packed npm CLI doctor JSON",
      installedBpl,
      ["doctor", "--json"],
      { cwd: installDir, bplHome: null },
    );
    const report = parseDoctorReport(doctor.stdout);
    if (!report.success) {
      const failures = report.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.name}: ${check.detail}`)
        .join("\n");
      throw new Error(`Packed npm CLI doctor reported failures:\n${failures}`);
    }

    runPackedDoctorFailureJsonSmoke(installedBpl, installDir);
    assertWasmDoctorUnavailableContract(report);
    runPackedDoctorSanitizerJsonSmoke(installedBpl, installDir);
    runPackedPackageDoctorSmoke(installedBpl, installDir);
    runPackedPackageInstallJsonSmoke(installedBpl);
    runPackedPackagePackJsonSmoke(installedBpl);
    runPackedPackageInitJsonSmoke(installedBpl);
    runPackedProjectNewJsonSmoke(installedBpl);
    runPackedPackageUninstallJsonSmoke(installedBpl);
    runPackedPackageManifestValidationJsonSmoke(installedBpl);
    runPackedPackageListJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheListJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheVerifyJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheMaintenanceJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheValidationJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheNameValidationJsonSmoke(installedBpl, installDir);
    runPackedLockedInstallSafetySmoke(installedBpl);
    runPackedPackageImportDiagnosticCodeSmoke(installedBpl);
    runPackedCheckJsonSmoke(installedBpl);
    runPackedLintJsonSmoke(installedBpl);
    runPackedFormatJsonSmoke(installedBpl);
    runPackedBindgenJsonSmoke(installedBpl);
    runPackedDocsJsonSmoke(installedBpl);
    runPackedSourceAnalysisValidationJsonSmoke(installedBpl);
    runPackedSourceAnalysisNoInputJsonSmoke(installedBpl);
    runPackedCompletionJsonSmoke(installedBpl, installDir);
    runCompletionSmoke(installedBpl, installDir);
    runLibraryTemplateSmoke(installedBpl, installDir);
    runPackedRunScriptListJsonSmoke(installedBpl);
    runPackedRunScriptFailureJsonSmoke(installedBpl);
    runTinyProgramSmoke("packed npm CLI", installedBpl, { bplHome: null });
    runPackedBuildJsonSmoke(installedBpl);
    runPackedBuildValidationJsonSmoke(installedBpl);
    runPackedBuildNoInputJsonSmoke(installedBpl, installDir);
    runPackedCleanValidationJsonSmoke(installedBpl);
    runPackedWasmSmoke(installedBpl);
    runPackedCacheStatsSmoke(installedBpl);
    runPackedHelperScriptSmoke(installDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertReleaseManifest(
  manifest: {
    schemaVersion: number;
    artifacts: Array<{
      path: string;
      bytes: number;
      sha256: string;
      npmIntegrity?: string;
      npmShasum?: string;
    }>;
  },
  expectedHelperFiles: string[],
): void {
  console.log("release smoke: validate release checksum manifest");

  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unexpected release manifest schema version.`);
  }

  const artifactsByPath = new Map(
    manifest.artifacts.map((artifact) => [artifact.path, artifact]),
  );
  for (const artifactPath of [
    process.platform === "win32" ? "bpl.exe" : "bpl",
    "lib/runtime.ll",
    "lib/runtime_wasm.ll",
    "lib/runtime_wasm_host.ll",
    "lib/runtime_support.o",
    ...expectedHelperFiles,
  ]) {
    const artifact = artifactsByPath.get(artifactPath);
    if (!artifact?.sha256 || artifact.sha256.length !== 64) {
      throw new Error(`Release manifest is missing checksum for ${artifactPath}`);
    }
    if (artifact.bytes <= 0) {
      throw new Error(`Release manifest recorded empty artifact ${artifactPath}`);
    }
  }

  const npmArtifact = manifest.artifacts.find(
    (artifact) => artifact.path.endsWith(".tgz"),
  );
  if (!npmArtifact?.npmIntegrity || !npmArtifact.npmShasum) {
    throw new Error("Release manifest is missing npm package integrity data.");
  }
}

function runPackedHelpSmoke(installedBpl: string, installDir: string): void {
  const cases: Array<{
    label: string;
    args: string[];
    snippets: string[];
  }> = [
    {
      label: "check packed npm CLI help output",
      args: ["--help"],
      snippets: [
        "Usage: bpl [options] [command] [files...]",
        "-V, --version",
        "--json",
        "run-script|rs",
        "package-cache",
        "doctor [options] [scope]",
      ],
    },
    {
      label: "check packed npm CLI build help output",
      args: ["build", "--help"],
      snippets: [
        "Usage: bpl build [options] <file>",
        "--emit <type>",
        "--wasm-runtime <mode>",
        "--cache-stats",
        "--json",
      ],
    },
    {
      label: "check packed npm CLI check help output",
      args: ["check", "--help"],
      snippets: [
        "Usage: bpl check [options] [files...]",
        "--json",
        "--time",
        "--no-prelude",
      ],
    },
    {
      label: "check packed npm CLI package-cache help output",
      args: ["package-cache", "--help"],
      snippets: [
        "Usage: bpl package-cache [options] [command]",
        "list [options] [package]",
        "verify [options] [package]",
        "repair [options] [package]",
      ],
    },
  ];

  for (const helpCase of cases) {
    const result = runStep(helpCase.label, installedBpl, helpCase.args, {
      cwd: installDir,
      bplHome: null,
    });
    if (result.stderr !== "") {
      throw new Error(
        `Packed npm CLI help wrote stderr for ${helpCase.label}:\n${result.stderr}`,
      );
    }
    assertOutputContains(result.stdout, [
      "Usage:",
      "-h, --help",
      ...helpCase.snippets,
    ]);
  }
}

export function runPackedCliRegistrySmoke(installDir: string): void {
  const smokePath = join(installDir, "check-cli-registry.mjs");
  writeFileSync(
    smokePath,
    [
      'import { CLI_JSON_ERROR_CODE_LISTS, CLI_JSON_ERROR_CODES } from "bpl-v3/cli";',
      "",
      "if (!Array.isArray(CLI_JSON_ERROR_CODE_LISTS)) {",
      '  throw new Error("CLI_JSON_ERROR_CODE_LISTS is not an array");',
      "}",
      "if (!Array.isArray(CLI_JSON_ERROR_CODES)) {",
      '  throw new Error("CLI_JSON_ERROR_CODES is not an array");',
      "}",
      "",
      'const listNames = CLI_JSON_ERROR_CODE_LISTS.map((list) => list.name);',
      'if (!listNames.includes("package-resolver")) {',
      '  throw new Error("package-resolver registry list is missing");',
      "}",
      'if (!CLI_JSON_ERROR_CODES.includes("BPL_PACKAGE_NOT_FOUND")) {',
      '  throw new Error("flattened registry is missing BPL_PACKAGE_NOT_FOUND");',
      "}",
      "",
      "for (const { name, codes } of CLI_JSON_ERROR_CODE_LISTS) {",
      "  if (!Array.isArray(codes) || codes.length === 0) {",
      '    throw new Error(`${name} has no exported codes`);',
      "  }",
      "  for (const code of codes) {",
      "    if (!/^BPL_[A-Z0-9_]+$/.test(code)) {",
      '      throw new Error(`${name} has invalid registry code ${code}`);',
      "    }",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  runStep("check packed npm CLI registry subpath import", "bun", [smokePath], {
    cwd: installDir,
    bplHome: null,
  });
}

export function runPackedCliRegistryTypesSmoke(installDir: string): void {
  const smokePath = join(installDir, "check-cli-registry-types.ts");
  writeFileSync(
    smokePath,
    [
      'import { CLI_JSON_ERROR_CODE_LISTS, CLI_JSON_ERROR_CODES, type CliJsonErrorCodeList } from "bpl-v3/cli";',
      "",
      "const lists: readonly CliJsonErrorCodeList[] = CLI_JSON_ERROR_CODE_LISTS;",
      "const flattenedCodes: readonly string[] = CLI_JSON_ERROR_CODES;",
      "",
      "function collectCodes(list: CliJsonErrorCodeList): readonly string[] {",
      "  return list.codes;",
      "}",
      "",
      "for (const list of lists) {",
      "  const name: string = list.name;",
      "  const codes: readonly string[] = collectCodes(list);",
      "  if (name === \"package-resolver\") {",
      "    const hasPackageNotFound: boolean = codes.includes(\"BPL_PACKAGE_NOT_FOUND\");",
      "    void hasPackageNotFound;",
      "  }",
      "}",
      "",
      "const packageNotFoundIsKnown: boolean = flattenedCodes.includes(\"BPL_PACKAGE_NOT_FOUND\");",
      "void packageNotFoundIsKnown;",
      "",
    ].join("\n"),
  );

  const localTsc = join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );
  const command = existsSync(localTsc) ? localTsc : "bunx";
  const args = existsSync(localTsc)
    ? [
        "--noEmit",
        "--strict",
        "--lib",
        "ESNext",
        "--target",
        "ES2022",
        "--module",
        "ESNext",
        "--moduleResolution",
        "Bundler",
        smokePath,
      ]
    : [
        "tsc",
        "--noEmit",
        "--strict",
        "--lib",
        "ESNext",
        "--target",
        "ES2022",
        "--module",
        "ESNext",
        "--moduleResolution",
        "Bundler",
        smokePath,
      ];

  runStep("check packed npm CLI registry TypeScript declarations", command, args, {
    cwd: installDir,
    bplHome: null,
  });
}

function runPackedVersionJsonSmoke(
  installedBpl: string,
  installDir: string,
  expectedVersion: string | undefined,
): void {
  if (!expectedVersion) {
    throw new Error("npm pack metadata did not include a package version.");
  }

  const first = runStep(
    "check packed npm CLI version JSON",
    installedBpl,
    ["--version", "--json"],
    { cwd: installDir, bplHome: null },
  );
  const second = runStep(
    "check packed npm CLI version JSON alternate order",
    installedBpl,
    ["--json", "--version"],
    { cwd: installDir, bplHome: null },
  );

  if (first.stderr !== "" || second.stderr !== "") {
    throw new Error(
      [
        "Packed npm CLI version JSON wrote stderr.",
        `first stderr:\n${first.stderr}`,
        `second stderr:\n${second.stderr}`,
      ].join("\n"),
    );
  }

  const firstReport = parseVersionReport(first.stdout);
  const secondReport = parseVersionReport(second.stdout);
  for (const report of [firstReport, secondReport]) {
    if (
      !report.success ||
      report.version !== expectedVersion ||
      !/^\d+\.\d+\.\d+/.test(report.version)
    ) {
      throw new Error(
        `Packed npm CLI version JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  }
}

function runCompletionSmoke(installedBpl: string, installDir: string): void {
  const bash = runStep(
    "check packed npm CLI bash completion",
    installedBpl,
    ["completion", "bash"],
    { cwd: installDir, bplHome: null },
  );
  assertOutputContains(bash.stdout, [
    "doctor",
    "--cache-stats",
    "wasm32-unknown-unknown",
  ]);

  const zsh = runStep(
    "check packed npm CLI zsh completion",
    installedBpl,
    ["completion", "zsh"],
    { cwd: installDir, bplHome: null },
  );
  assertOutputContains(zsh.stdout, [
    "doctor:Check local BPL toolchain",
    "--template",
    "wasm32-unknown-unknown",
  ]);
}

function runPackedCompletionJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const bash = runStep(
    "check packed npm CLI completion JSON",
    installedBpl,
    ["completion", "bash", "--json"],
    { cwd: installDir, bplHome: null },
  );
  const bashReport = parseCompletionReport(bash.stdout);
  if (
    !bashReport.success ||
    bashReport.shell !== "bash" ||
    typeof bashReport.script !== "string" ||
    !bashReport.script.includes("complete -F _bpl_completion bpl") ||
    !bashReport.script.includes("completion_opts=\"bash zsh --json\"")
  ) {
    throw new Error(
      `Packed npm CLI completion JSON success reported unexpected payload:\n${JSON.stringify(bashReport, null, 2)}`,
    );
  }

  console.log(
    "release smoke: check packed npm CLI completion unsupported-shell JSON",
  );
  const unsupported = spawnSync(
    installedBpl,
    ["completion", "fish", "--json"],
    {
      cwd: installDir,
      encoding: "utf-8",
      env: buildStepEnv({ bplHome: null }),
      timeout: smokeTimeoutMs,
    },
  );
  if (unsupported.error) {
    throw unsupported.error;
  }
  if (unsupported.status !== 1) {
    throw new Error(
      [
        "Packed npm CLI completion JSON failure smoke did not fail as expected.",
        `exit: ${unsupported.status ?? "unknown"}`,
        `stdout:\n${unsupported.stdout}`,
        `stderr:\n${unsupported.stderr}`,
      ].join("\n"),
    );
  }
  if (unsupported.stderr !== "") {
    throw new Error(
      `Packed npm CLI completion JSON failure wrote stderr:\n${unsupported.stderr}`,
    );
  }

  const unsupportedReport = parseCompletionReport(unsupported.stdout);
  if (
    unsupportedReport.success ||
    unsupportedReport.shell !== "fish" ||
    unsupportedReport.errorCode !== "BPL_COMPLETION_SHELL_UNSUPPORTED" ||
    typeof unsupportedReport.error !== "string" ||
    !unsupportedReport.error.includes("Unsupported shell")
  ) {
    throw new Error(
      `Packed npm CLI completion JSON failure reported unexpected payload:\n${JSON.stringify(unsupportedReport, null, 2)}`,
    );
  }
}

function runPackedJsonColorPuritySmoke(
  installedBpl: string,
  installDir: string,
  expectedVersion: string | undefined,
): void {
  if (!expectedVersion) {
    throw new Error("npm pack metadata did not include a package version.");
  }

  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-json-color-"));

  try {
    writeFileSync(
      join(tempDir, "good.bpl"),
      "frame main() ret int { return 0; }\n",
    );
    writeFileSync(
      join(tempDir, "bad.bpl"),
      'frame main() { local value: int = "not an int"; }\n',
    );

    const version = runStep(
      "check packed npm CLI forced-color version JSON",
      installedBpl,
      ["--color", "--version", "--json"],
      { cwd: installDir, bplHome: null },
    );
    if (version.stderr !== "") {
      throw new Error(
        `Packed npm CLI forced-color version JSON wrote stderr:\n${version.stderr}`,
      );
    }
    const versionReport = parseVersionReport(version.stdout);
    assertJsonValueHasNoAnsi(versionReport);
    if (!versionReport.success || versionReport.version !== expectedVersion) {
      throw new Error(
        `Packed npm CLI forced-color version JSON reported unexpected payload:\n${JSON.stringify(versionReport, null, 2)}`,
      );
    }

    const checkSuccess = runStep(
      "check packed npm CLI forced-color check JSON",
      installedBpl,
      ["check", "good.bpl", "--json", "--color"],
      { cwd: tempDir, bplHome: null },
    );
    if (checkSuccess.stderr !== "") {
      throw new Error(
        `Packed npm CLI forced-color check JSON wrote stderr:\n${checkSuccess.stderr}`,
      );
    }
    const checkSuccessReport = parseCheckReport(checkSuccess.stdout);
    assertJsonValueHasNoAnsi(checkSuccessReport);
    if (!checkSuccessReport.success || checkSuccessReport.errorCount !== 0) {
      throw new Error(
        `Packed npm CLI forced-color check JSON reported unexpected success payload:\n${JSON.stringify(checkSuccessReport, null, 2)}`,
      );
    }

    const checkFailure = runJsonFailureStep(
      "check packed npm CLI forced-color check failure JSON",
      installedBpl,
      ["check", "bad.bpl", "--json", "--color"],
      { cwd: tempDir, bplHome: null, expectedStatus: 1 },
    );
    const checkFailureReport = parseCheckReport(checkFailure.stdout);
    assertJsonValueHasNoAnsi(checkFailureReport);
    if (
      checkFailureReport.success ||
      checkFailureReport.errorCount !== 1 ||
      !JSON.stringify(checkFailureReport.files).includes("Type mismatch")
    ) {
      throw new Error(
        `Packed npm CLI forced-color check failure JSON reported unexpected payload:\n${JSON.stringify(checkFailureReport, null, 2)}`,
      );
    }

    const buildFailure = runJsonFailureStep(
      "check packed npm CLI forced-color build failure JSON",
      installedBpl,
      ["build", "bad.bpl", "--json", "--color"],
      { cwd: tempDir, bplHome: null, expectedStatus: 1 },
    );
    const buildFailureReport = parseBuildFailureReport(buildFailure.stdout);
    assertJsonValueHasNoAnsi(buildFailureReport);
    if (
      buildFailureReport.success ||
      !buildFailureReport.error.includes("Type mismatch")
    ) {
      throw new Error(
        `Packed npm CLI forced-color build failure JSON reported unexpected payload:\n${JSON.stringify(buildFailureReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedDoctorFailureJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  console.log("release smoke: check packed npm CLI doctor failure JSON");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BPL_HOME: undefined,
    NO_COLOR: "1",
  };
  const result = spawnSync(
    installedBpl,
    ["doctor", "unknown-scope", "--json"],
    {
      cwd: installDir,
      encoding: "utf-8",
      env,
      timeout: smokeTimeoutMs,
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 1) {
    throw new Error(
      [
        "Packed npm CLI doctor failure smoke did not fail as expected.",
        `exit: ${result.status ?? "unknown"}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }
  if (result.stderr !== "") {
    throw new Error(
      `Packed npm CLI doctor JSON failure wrote stderr:\n${result.stderr}`,
    );
  }

  const report = parseDoctorFailureReport(result.stdout);
  if (
    report.success ||
    report.errorCode !== "BPL_DOCTOR_SCOPE_UNKNOWN" ||
    !report.error.includes("Unknown doctor scope 'unknown-scope'")
  ) {
    throw new Error(
      `Packed npm CLI doctor failure JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
    );
  }
}

function runLibraryTemplateSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const workspaceDir = mkdtempSync(join(tmpdir(), "bpl-release-template-"));

  try {
    runStep(
      "scaffold packed npm CLI library template",
      installedBpl,
      ["new", "smoke-lib", "--template", "library", "--no-git"],
      { cwd: workspaceDir, bplHome: null },
    );

    runStep(
      "check packed npm CLI library template",
      installedBpl,
      ["check", join("smoke-lib", "src", "index.bpl")],
      { cwd: workspaceDir, bplHome: null },
    );

    const example = runStep(
      "run packed npm CLI library example",
      installedBpl,
      ["run", join("smoke-lib", "examples", "usage.bpl")],
      { cwd: workspaceDir, bplHome: null },
    );
    if (!example.stdout.includes("total = 42")) {
      throw new Error(
        [
          "Packed npm CLI library example did not print expected output.",
          `stdout:\n${example.stdout}`,
          `stderr:\n${example.stderr}`,
        ].join("\n"),
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedRunScriptListJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-run-script-"));
  const markerPath = join(tempDir, "should-not-exist.txt");
  const markerCommand = `node -e "require('fs').writeFileSync('${markerPath}', 'bad')"`;

  try {
    writeFileSync(
      join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "release-smoke-run-script",
          version: "1.0.0",
          scripts: {
            check: "bpl check src/main.bpl",
            marker: markerCommand,
          },
        },
        null,
        2,
      ) + "\n",
    );

    const result = runStep(
      "check packed npm CLI run-script list JSON",
      installedBpl,
      ["run-script", "--list", "--json"],
      { cwd: tempDir, bplHome: null },
    );
    const report = parseRunScriptListReport(result.stdout);
    const expectedScripts = [
      { name: "check", command: "bpl check src/main.bpl" },
      { name: "marker", command: markerCommand },
    ];

    if (
      !report.success ||
      JSON.stringify(report.scripts) !== JSON.stringify(expectedScripts)
    ) {
      throw new Error(
        `Packed npm CLI run-script list JSON reported unexpected scripts:\n${JSON.stringify(report, null, 2)}`,
      );
    }
    if (existsSync(markerPath)) {
      throw new Error("Packed npm CLI run-script --list executed a script.");
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedRunScriptFailureJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-run-script-fail-"));

  try {
    console.log("release smoke: check packed npm CLI run-script failure JSON");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const result = spawnSync(
      installedBpl,
      ["run-script", "--list", "--json"],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI run-script failure smoke did not fail as expected.",
          `exit: ${result.status ?? "unknown"}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
    if (result.stderr !== "") {
      throw new Error(
        `Packed npm CLI run-script JSON failure wrote stderr:\n${result.stderr}`,
      );
    }

    const report = parseRunScriptFailureReport(result.stdout);
    if (
      report.success ||
      !report.error.includes("No bpl.json found in current directory") ||
      report.errorCode !== "BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND"
    ) {
      throw new Error(
        `Packed npm CLI run-script failure JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedDoctorSanitizerJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const doctor = runStep(
    "check packed npm CLI doctor sanitizer JSON",
    installedBpl,
    ["doctor", "sanitizer", "--json"],
    { cwd: installDir, bplHome: null },
  );
  const report = parseDoctorReport(doctor.stdout);
  assertSanitizerDoctorContract(report);
}

function runPackedPackageDoctorSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const projectDir = join(installDir, "package-doctor-json");
  const homeDir = join(projectDir, "home");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(
    join(projectDir, "bpl.json"),
    JSON.stringify(
      {
        name: "release-smoke-package-doctor",
        version: "1.0.0",
      },
      null,
      2,
    ) + "\n",
  );

  const doctor = runStep(
    "check packed npm CLI package doctor JSON",
    installedBpl,
    ["doctor", "packages", "--json"],
    {
      cwd: projectDir,
      bplHome: null,
      env: { HOME: homeDir },
    },
  );
  const report = parsePackageDoctorReport(doctor.stdout);

  if (!report.success || !report.ok) {
    throw new Error(
      `Packed npm CLI package doctor reported issues:\n${JSON.stringify(report.issues, null, 2)}`,
    );
  }

  if (
    !report.cacheVerification.success ||
    !report.cacheVerification.ok ||
    report.cacheVerification.entriesChecked !== 0
  ) {
    throw new Error(
      `Packed npm CLI package doctor cache verification was not isolated:\n${JSON.stringify(report.cacheVerification, null, 2)}`,
    );
  }
}

function runPackedPackageInstallJsonSmoke(installedBpl: string): void {
  const workspaceDir = mkdtempSync(join(tmpdir(), "bpl-release-install-json-"));
  const packageDir = join(workspaceDir, "install-json-pkg");
  const appDir = join(workspaceDir, "install-json-app");
  const homeDir = join(workspaceDir, "home");

  try {
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(
      join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "release-smoke-install-json",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(packageDir, "index.bpl"), "export value;\n");

    runStep("pack package install JSON fixture", installedBpl, ["pack"], {
      cwd: packageDir,
      bplHome: null,
    });
    const archivePath = join(
      packageDir,
      "release-smoke-install-json-1.0.0.tgz",
    );
    const install = runStep(
      "check packed npm CLI package install JSON",
      installedBpl,
      ["install", archivePath, "--json"],
      {
        cwd: appDir,
        bplHome: null,
        env: { HOME: homeDir },
      },
    );
    const report = parsePackageInstallReport(install.stdout);

    if (
      !report.success ||
      report.mode !== "package" ||
      report.target !== archivePath ||
      report.global ||
      report.locked ||
      report.update ||
      report.repairLock
    ) {
      throw new Error(
        `Packed npm CLI package install JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }

    const installedManifest = join(
      appDir,
      "bpl_modules",
      "release-smoke-install-json",
      "bpl.json",
    );
    if (!existsSync(installedManifest)) {
      throw new Error(
        "Packed npm CLI package install JSON did not install package.",
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedPackagePackJsonSmoke(installedBpl: string): void {
  const workspaceDir = mkdtempSync(join(tmpdir(), "bpl-release-pack-json-"));
  const packageDir = join(workspaceDir, "pack-json-pkg");
  const missingManifestDir = join(workspaceDir, "missing-manifest");
  const outputDir = join(workspaceDir, "dist");

  try {
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(missingManifestDir, { recursive: true });
    writeFileSync(
      join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "release-smoke-pack-json",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(packageDir, "index.bpl"), "export value;\n");

    const pack = runStep(
      "check packed npm CLI package pack JSON",
      installedBpl,
      ["pack", packageDir, "--output", outputDir, "--json"],
      {
        cwd: workspaceDir,
        bplHome: null,
      },
    );
    const report = parsePackagePackReport(pack.stdout);

    if (
      !report.success ||
      report.package !== "release-smoke-pack-json" ||
      report.version !== "1.0.0" ||
      report.packageDir !== packageDir ||
      report.outputDir !== outputDir ||
      !report.archivePath?.endsWith("release-smoke-pack-json-1.0.0.tgz") ||
      !existsSync(report.archivePath)
    ) {
      throw new Error(
        `Packed npm CLI package pack JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }

    const missing = spawnSync(installedBpl, ["pack", missingManifestDir, "--json"], {
      cwd: workspaceDir,
      encoding: "utf-8",
      env: buildStepEnv({ bplHome: null }),
      timeout: smokeTimeoutMs,
    });
    if (missing.error) throw missing.error;
    if (missing.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI package pack JSON failure did not fail as expected.",
          `exit: ${missing.status ?? "unknown"}`,
          `stdout:\n${missing.stdout}`,
          `stderr:\n${missing.stderr}`,
        ].join("\n"),
      );
    }
    if (missing.stderr !== "") {
      throw new Error(
        `Packed npm CLI package pack JSON failure wrote stderr:\n${missing.stderr}`,
      );
    }

    const missingReport = parsePackagePackReport(missing.stdout);
    if (
      missingReport.success ||
      missingReport.packageDir !== missingManifestDir ||
      missingReport.outputDir !== missingManifestDir ||
      missingReport.errorCode !== "BPL_PACKAGE_MANIFEST_MISSING" ||
      typeof missingReport.error !== "string"
    ) {
      throw new Error(
        `Packed npm CLI package pack failure JSON reported unexpected payload:\n${JSON.stringify(missingReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedPackageInitJsonSmoke(installedBpl: string): void {
  const workspaceDir = mkdtempSync(join(tmpdir(), "bpl-release-init-json-"));
  const initDir = join(workspaceDir, "init-json-project");
  const existingDir = join(workspaceDir, "init-json-existing");

  try {
    mkdirSync(initDir, { recursive: true });
    mkdirSync(existingDir, { recursive: true });
    writeFileSync(join(existingDir, "bpl.json"), "{}\n");

    const init = runStep(
      "check packed npm CLI package init JSON",
      installedBpl,
      ["init", "release-smoke-init-json", "--json"],
      {
        cwd: initDir,
        bplHome: null,
      },
    );
    const report = parsePackageInitReport(init.stdout);

    if (
      !report.success ||
      report.package !== "release-smoke-init-json" ||
      report.version !== "1.0.0" ||
      report.manifestPath !== join(initDir, "bpl.json") ||
      !existsSync(report.manifestPath)
    ) {
      throw new Error(
        `Packed npm CLI package init JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }

    const invalid = spawnSync(installedBpl, ["init", "Bad_Name", "--json"], {
      cwd: workspaceDir,
      encoding: "utf-8",
      env: buildStepEnv({ bplHome: null }),
      timeout: smokeTimeoutMs,
    });
    if (invalid.error) throw invalid.error;
    if (invalid.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI package init invalid-name JSON did not fail as expected.",
          `exit: ${invalid.status ?? "unknown"}`,
          `stdout:\n${invalid.stdout}`,
          `stderr:\n${invalid.stderr}`,
        ].join("\n"),
      );
    }
    if (invalid.stderr !== "") {
      throw new Error(
        `Packed npm CLI package init invalid-name JSON wrote stderr:\n${invalid.stderr}`,
      );
    }

    const invalidReport = parsePackageInitReport(invalid.stdout);
    if (
      invalidReport.success ||
      invalidReport.package !== "Bad_Name" ||
      invalidReport.manifestPath !== join(workspaceDir, "bpl.json") ||
      invalidReport.errorCode !== "BPL_PACKAGE_INIT_NAME_INVALID" ||
      typeof invalidReport.error !== "string"
    ) {
      throw new Error(
        `Packed npm CLI package init invalid-name JSON reported unexpected payload:\n${JSON.stringify(invalidReport, null, 2)}`,
      );
    }

    const existing = spawnSync(installedBpl, ["init", "--json"], {
      cwd: existingDir,
      encoding: "utf-8",
      env: buildStepEnv({ bplHome: null }),
      timeout: smokeTimeoutMs,
    });
    if (existing.error) throw existing.error;
    if (existing.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI package init existing-manifest JSON did not fail as expected.",
          `exit: ${existing.status ?? "unknown"}`,
          `stdout:\n${existing.stdout}`,
          `stderr:\n${existing.stderr}`,
        ].join("\n"),
      );
    }
    if (existing.stderr !== "") {
      throw new Error(
        `Packed npm CLI package init existing-manifest JSON wrote stderr:\n${existing.stderr}`,
      );
    }

    const existingReport = parsePackageInitReport(existing.stdout);
    if (
      existingReport.success ||
      existingReport.package !== null ||
      existingReport.manifestPath !== join(existingDir, "bpl.json") ||
      existingReport.errorCode !== "BPL_PACKAGE_INIT_MANIFEST_EXISTS" ||
      typeof existingReport.error !== "string"
    ) {
      throw new Error(
        `Packed npm CLI package init existing-manifest JSON reported unexpected payload:\n${JSON.stringify(existingReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedProjectNewJsonSmoke(installedBpl: string): void {
  const workspaceDir = mkdtempSync(join(tmpdir(), "bpl-release-new-json-"));
  const projectDir = join(workspaceDir, "release-smoke-new-json");
  const existingDir = join(workspaceDir, "taken-new-json");

  try {
    mkdirSync(existingDir, { recursive: true });

    const scaffold = runStep(
      "check packed npm CLI bpl new JSON",
      installedBpl,
      [
        "new",
        "release-smoke-new-json",
        "--template",
        "library",
        "--no-git",
        "--json",
      ],
      {
        cwd: workspaceDir,
        bplHome: null,
      },
    );
    const report = parseProjectNewReport(scaffold.stdout);

    if (
      !report.success ||
      report.name !== "release-smoke-new-json" ||
      report.template !== "library" ||
      report.projectPath !== projectDir ||
      report.manifestPath !== join(projectDir, "bpl.json") ||
      report.entrypoint !== "src/index.bpl" ||
      report.gitInitialized !== false ||
      !existsSync(join(projectDir, "src", "index.bpl")) ||
      !existsSync(join(projectDir, "examples", "usage.bpl"))
    ) {
      throw new Error(
        `Packed npm CLI bpl new JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }

    const badTemplate = spawnSync(
      installedBpl,
      ["new", "bad-new-template", "--template", "bad", "--json"],
      {
        cwd: workspaceDir,
        encoding: "utf-8",
        env: buildStepEnv({ bplHome: null }),
        timeout: smokeTimeoutMs,
      },
    );
    if (badTemplate.error) throw badTemplate.error;
    if (badTemplate.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI bpl new invalid-template JSON did not fail as expected.",
          `exit: ${badTemplate.status ?? "unknown"}`,
          `stdout:\n${badTemplate.stdout}`,
          `stderr:\n${badTemplate.stderr}`,
        ].join("\n"),
      );
    }
    if (badTemplate.stderr !== "") {
      throw new Error(
        `Packed npm CLI bpl new invalid-template JSON wrote stderr:\n${badTemplate.stderr}`,
      );
    }

    const badTemplateReport = parseProjectNewReport(badTemplate.stdout);
    if (
      badTemplateReport.success ||
      badTemplateReport.name !== "bad-new-template" ||
      badTemplateReport.template !== "bad" ||
      badTemplateReport.projectPath !== join(workspaceDir, "bad-new-template") ||
      badTemplateReport.errorCode !== "BPL_NEW_TEMPLATE_INVALID" ||
      typeof badTemplateReport.error !== "string"
    ) {
      throw new Error(
        `Packed npm CLI bpl new invalid-template JSON reported unexpected payload:\n${JSON.stringify(badTemplateReport, null, 2)}`,
      );
    }

    const existing = spawnSync(installedBpl, ["new", "taken-new-json", "--json"], {
      cwd: workspaceDir,
      encoding: "utf-8",
      env: buildStepEnv({ bplHome: null }),
      timeout: smokeTimeoutMs,
    });
    if (existing.error) throw existing.error;
    if (existing.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI bpl new existing-directory JSON did not fail as expected.",
          `exit: ${existing.status ?? "unknown"}`,
          `stdout:\n${existing.stdout}`,
          `stderr:\n${existing.stderr}`,
        ].join("\n"),
      );
    }
    if (existing.stderr !== "") {
      throw new Error(
        `Packed npm CLI bpl new existing-directory JSON wrote stderr:\n${existing.stderr}`,
      );
    }

    const existingReport = parseProjectNewReport(existing.stdout);
    if (
      existingReport.success ||
      existingReport.name !== "taken-new-json" ||
      existingReport.template !== "app" ||
      existingReport.projectPath !== existingDir ||
      existingReport.errorCode !== "BPL_NEW_PATH_EXISTS_DIRECTORY" ||
      typeof existingReport.error !== "string"
    ) {
      throw new Error(
        `Packed npm CLI bpl new existing-directory JSON reported unexpected payload:\n${JSON.stringify(existingReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedPackageUninstallJsonSmoke(installedBpl: string): void {
  const workspaceDir = mkdtempSync(
    join(tmpdir(), "bpl-release-uninstall-json-"),
  );
  const packageDir = join(workspaceDir, "uninstall-json-pkg");
  const appDir = join(workspaceDir, "uninstall-json-app");
  const homeDir = join(workspaceDir, "home");

  try {
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(
      join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "release-smoke-uninstall-json",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(packageDir, "index.bpl"), "export value;\n");

    runStep("pack package uninstall JSON fixture", installedBpl, ["pack"], {
      cwd: packageDir,
      bplHome: null,
    });
    const archivePath = join(
      packageDir,
      "release-smoke-uninstall-json-1.0.0.tgz",
    );
    runStep(
      "install packed npm CLI package uninstall fixture",
      installedBpl,
      ["install", archivePath],
      {
        cwd: appDir,
        bplHome: null,
        env: { HOME: homeDir },
      },
    );

    const uninstall = runStep(
      "check packed npm CLI package uninstall JSON",
      installedBpl,
      ["uninstall", "release-smoke-uninstall-json", "--json"],
      {
        cwd: appDir,
        bplHome: null,
        env: { HOME: homeDir },
      },
    );
    const report = parsePackageUninstallReport(uninstall.stdout);

    if (
      !report.success ||
      report.package !== "release-smoke-uninstall-json" ||
      report.version !== "1.0.0" ||
      report.global
    ) {
      throw new Error(
        `Packed npm CLI package uninstall JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }

    const installedManifest = join(
      appDir,
      "bpl_modules",
      "release-smoke-uninstall-json",
      "bpl.json",
    );
    if (existsSync(installedManifest)) {
      throw new Error(
        "Packed npm CLI package uninstall JSON did not remove package.",
      );
    }

    const missing = spawnSync(
      installedBpl,
      ["remove", "missing-release-smoke-uninstall", "--json"],
      {
        cwd: appDir,
        encoding: "utf-8",
        env: buildStepEnv({ bplHome: null, env: { HOME: homeDir } }),
        timeout: smokeTimeoutMs,
      },
    );
    if (missing.error) throw missing.error;
    if (missing.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI package uninstall JSON failure did not fail as expected.",
          `exit: ${missing.status ?? "unknown"}`,
          `stdout:\n${missing.stdout}`,
          `stderr:\n${missing.stderr}`,
        ].join("\n"),
      );
    }
    if (missing.stderr !== "") {
      throw new Error(
        `Packed npm CLI package uninstall JSON failure wrote stderr:\n${missing.stderr}`,
      );
    }

    const missingReport = parsePackageUninstallReport(missing.stdout);
    if (
      missingReport.success ||
      missingReport.package !== "missing-release-smoke-uninstall" ||
      missingReport.global ||
      missingReport.errorCode !== "BPL_PACKAGE_UNINSTALL_NOT_INSTALLED" ||
      typeof missingReport.error !== "string"
    ) {
      throw new Error(
        `Packed npm CLI package uninstall failure JSON reported unexpected payload:\n${JSON.stringify(missingReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedPackageManifestValidationJsonSmoke(
  installedBpl: string,
): void {
  const workspaceDir = mkdtempSync(
    join(tmpdir(), "bpl-release-package-manifest-json-"),
  );
  const missingManifestDir = join(workspaceDir, "missing-manifest");
  const invalidMainDir = join(workspaceDir, "invalid-main");
  const homeDir = join(workspaceDir, "home");

  try {
    mkdirSync(missingManifestDir, { recursive: true });
    mkdirSync(invalidMainDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(
      join(invalidMainDir, "bpl.json"),
      JSON.stringify(
        {
          name: "invalid-main",
          version: "1.0.0",
          main: "src//index.bpl",
        },
        null,
        2,
      ) + "\n",
    );

    console.log(
      "release smoke: check packed npm CLI package manifest validation JSON",
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      HOME: homeDir,
      NO_COLOR: "1",
    };
    const missingResult = spawnSync(installedBpl, ["install", "--json"], {
      cwd: missingManifestDir,
      encoding: "utf-8",
      env,
      timeout: smokeTimeoutMs,
    });
    const invalidMainResult = spawnSync(installedBpl, ["install", "--json"], {
      cwd: invalidMainDir,
      encoding: "utf-8",
      env,
      timeout: smokeTimeoutMs,
    });

    if (missingResult.error) throw missingResult.error;
    if (invalidMainResult.error) throw invalidMainResult.error;
    if (missingResult.status !== 1 || invalidMainResult.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI package manifest validation smoke did not fail as expected.",
          `missing exit: ${missingResult.status ?? "unknown"}`,
          `missing stdout:\n${missingResult.stdout}`,
          `missing stderr:\n${missingResult.stderr}`,
          `invalid main exit: ${invalidMainResult.status ?? "unknown"}`,
          `invalid main stdout:\n${invalidMainResult.stdout}`,
          `invalid main stderr:\n${invalidMainResult.stderr}`,
        ].join("\n"),
      );
    }
    if (missingResult.stderr !== "" || invalidMainResult.stderr !== "") {
      throw new Error(
        [
          "Packed npm CLI package manifest validation JSON wrote stderr.",
          `missing stderr:\n${missingResult.stderr}`,
          `invalid main stderr:\n${invalidMainResult.stderr}`,
        ].join("\n"),
      );
    }

    const missingReport = parsePackageInstallReport(missingResult.stdout);
    const invalidMainReport = parsePackageInstallReport(
      invalidMainResult.stdout,
    );
    if (
      missingReport.success ||
      missingReport.mode !== "project" ||
      missingReport.target !== null ||
      missingReport.global ||
      missingReport.locked ||
      missingReport.update ||
      missingReport.repairLock ||
      missingReport.errorCode !== "BPL_PACKAGE_MANIFEST_MISSING" ||
      typeof missingReport.error !== "string" ||
      invalidMainReport.success ||
      invalidMainReport.mode !== "project" ||
      invalidMainReport.target !== null ||
      invalidMainReport.global ||
      invalidMainReport.locked ||
      invalidMainReport.update ||
      invalidMainReport.repairLock ||
      invalidMainReport.errorCode !== "BPL_PACKAGE_MANIFEST_MAIN_INVALID" ||
      typeof invalidMainReport.error !== "string"
    ) {
      throw new Error(
        [
          "Packed npm CLI package manifest validation JSON reported unexpected payload.",
          `missing:\n${JSON.stringify(missingReport, null, 2)}`,
          `invalid main:\n${JSON.stringify(invalidMainReport, null, 2)}`,
        ].join("\n"),
      );
    }
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedPackageListJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const globalHomeDir = join(installDir, "package-list-global-home");
  mkdirSync(globalHomeDir, { recursive: true });

  const list = runStep(
    "check packed npm CLI package list JSON",
    installedBpl,
    ["list", "--json"],
    { cwd: installDir, bplHome: null },
  );
  const listReport = parsePackageListReport(list.stdout);

  if (
    !listReport.success ||
    listReport.scope !== "local" ||
    listReport.packages.length !== 0
  ) {
    throw new Error(
      `Packed npm CLI package list JSON was not isolated:\n${JSON.stringify(listReport, null, 2)}`,
    );
  }

  const tree = runStep(
    "check packed npm CLI package list tree JSON",
    installedBpl,
    ["list", "--tree", "--json"],
    { cwd: installDir, bplHome: null },
  );
  const treeReport = parsePackageListTreeReport(tree.stdout);

  if (
    !treeReport.success ||
    treeReport.scope !== "local" ||
    treeReport.tree.length !== 0
  ) {
    throw new Error(
      `Packed npm CLI package list tree JSON was not isolated:\n${JSON.stringify(treeReport, null, 2)}`,
    );
  }

  const globalList = runStep(
    "check packed npm CLI global package list JSON",
    installedBpl,
    ["list", "--global", "--json"],
    {
      cwd: installDir,
      bplHome: null,
      env: { HOME: globalHomeDir },
    },
  );
  const globalListReport = parsePackageListReport(globalList.stdout);

  if (
    !globalListReport.success ||
    globalListReport.scope !== "global" ||
    globalListReport.packages.length !== 0
  ) {
    throw new Error(
      `Packed npm CLI global package list JSON was not isolated:\n${JSON.stringify(globalListReport, null, 2)}`,
    );
  }

  const globalTree = runStep(
    "check packed npm CLI global package list tree JSON",
    installedBpl,
    ["list", "--global", "--tree", "--json"],
    {
      cwd: installDir,
      bplHome: null,
      env: { HOME: globalHomeDir },
    },
  );
  const globalTreeReport = parsePackageListTreeReport(globalTree.stdout);

  if (
    !globalTreeReport.success ||
    globalTreeReport.scope !== "global" ||
    globalTreeReport.tree.length !== 0
  ) {
    throw new Error(
      `Packed npm CLI global package list tree JSON was not isolated:\n${JSON.stringify(globalTreeReport, null, 2)}`,
    );
  }
}

function runPackedPackageCacheListJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const homeDir = join(installDir, "package-cache-list-home");
  mkdirSync(homeDir, { recursive: true });

  const result = runStep(
    "check packed npm CLI package-cache list JSON",
    installedBpl,
    ["package-cache", "list", "--json"],
    {
      cwd: installDir,
      bplHome: null,
      env: { HOME: homeDir },
    },
  );
  const report = parsePackageCacheListReport(result.stdout);

  if (!report.success || report.entries.length !== 0) {
    throw new Error(
      `Packed npm CLI package-cache list JSON was not isolated:\n${JSON.stringify(report, null, 2)}`,
    );
  }
}

function runPackedPackageCacheVerifyJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const homeDir = join(installDir, "package-cache-verify-home");
  mkdirSync(homeDir, { recursive: true });

  const result = runStep(
    "check packed npm CLI package-cache verify JSON",
    installedBpl,
    ["package-cache", "verify", "--json"],
    {
      cwd: installDir,
      bplHome: null,
      env: { HOME: homeDir },
    },
  );
  const report = parsePackageCacheVerifyReport(result.stdout);

  if (
    !report.success ||
    !report.ok ||
    report.entriesChecked !== 0 ||
    report.issues.length !== 0
  ) {
    throw new Error(
      `Packed npm CLI package-cache verify JSON was not isolated:\n${JSON.stringify(report, null, 2)}`,
    );
  }
}

function runPackedPackageCacheMaintenanceJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const homeDir = join(installDir, "package-cache-maintenance-home");
  mkdirSync(homeDir, { recursive: true });

  console.log("release smoke: check packed npm CLI package-cache maintenance JSON");
  const clean = runStep(
    "check packed npm CLI package-cache clean JSON",
    installedBpl,
    ["package-cache", "clean", "--dry-run", "--json"],
    {
      cwd: installDir,
      bplHome: null,
      env: { HOME: homeDir },
    },
  );
  const cleanReport = parsePackageCacheCleanReport(clean.stdout);

  const repair = runStep(
    "check packed npm CLI package-cache repair JSON",
    installedBpl,
    ["package-cache", "repair", "--dry-run", "--json"],
    {
      cwd: installDir,
      bplHome: null,
      env: { HOME: homeDir },
    },
  );
  const repairReport = parsePackageCacheRepairReport(repair.stdout);

  if (
    !cleanReport.success ||
    !cleanReport.dryRun ||
    cleanReport.removed.length !== 0 ||
    cleanReport.error !== undefined ||
    cleanReport.errorCode !== undefined ||
    !repairReport.success ||
    !repairReport.dryRun ||
    repairReport.repaired.length !== 0 ||
    repairReport.unchanged.length !== 0 ||
    repairReport.issues.length !== 0 ||
    repairReport.error !== undefined ||
    repairReport.errorCode !== undefined
  ) {
    throw new Error(
      [
        "Packed npm CLI package-cache maintenance JSON reported unexpected payload.",
        `clean:\n${JSON.stringify(cleanReport, null, 2)}`,
        `repair:\n${JSON.stringify(repairReport, null, 2)}`,
      ].join("\n"),
    );
  }
}

function runPackedPackageCacheValidationJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const homeDir = join(installDir, "package-cache-validation-home");
  mkdirSync(homeDir, { recursive: true });

  console.log("release smoke: check packed npm CLI package-cache validation JSON");
  const env = buildStepEnv({ bplHome: null, env: { HOME: homeDir } });
  const cleanResult = spawnSync(installedBpl, ["package-cache", "clean", "pkg", "--package-version", "^1.0.0", "--dry-run", "--json"], {
    cwd: installDir,
    encoding: "utf-8",
    env,
    timeout: smokeTimeoutMs,
  });
  const repairResult = spawnSync(installedBpl, ["package-cache", "repair", "pkg", "--package-version", "latest", "--dry-run", "--json"], {
    cwd: installDir,
    encoding: "utf-8",
    env,
    timeout: smokeTimeoutMs,
  });

  if (cleanResult.error) throw cleanResult.error;
  if (repairResult.error) throw repairResult.error;
  if (cleanResult.status !== 1 || repairResult.status !== 1) {
    throw new Error(
      [
        "Packed npm CLI package-cache validation smoke did not fail as expected.",
        `clean exit: ${cleanResult.status ?? "unknown"}`,
        `clean stdout:\n${cleanResult.stdout}`,
        `clean stderr:\n${cleanResult.stderr}`,
        `repair exit: ${repairResult.status ?? "unknown"}`,
        `repair stdout:\n${repairResult.stdout}`,
        `repair stderr:\n${repairResult.stderr}`,
      ].join("\n"),
    );
  }
  if (cleanResult.stderr !== "" || repairResult.stderr !== "") {
    throw new Error(
      [
        "Packed npm CLI package-cache validation JSON wrote stderr.",
        `clean stderr:\n${cleanResult.stderr}`,
        `repair stderr:\n${repairResult.stderr}`,
      ].join("\n"),
    );
  }

  const cleanReport = parsePackageCacheCleanReport(cleanResult.stdout);
  const repairReport = parsePackageCacheRepairReport(repairResult.stdout);
  if (
    cleanReport.success ||
    !cleanReport.dryRun ||
    cleanReport.removed.length !== 0 ||
    cleanReport.errorCode !== "BPL_PACKAGE_CACHE_VERSION_INVALID" ||
    typeof cleanReport.error !== "string" ||
    repairReport.success ||
    !repairReport.dryRun ||
    repairReport.repaired.length !== 0 ||
    repairReport.unchanged.length !== 0 ||
    repairReport.issues.length !== 0 ||
    repairReport.errorCode !== "BPL_PACKAGE_CACHE_VERSION_INVALID" ||
    typeof repairReport.error !== "string"
  ) {
    throw new Error(
      [
        "Packed npm CLI package-cache validation JSON reported unexpected payload.",
        `clean:\n${JSON.stringify(cleanReport, null, 2)}`,
        `repair:\n${JSON.stringify(repairReport, null, 2)}`,
      ].join("\n"),
    );
  }
}

function runPackedPackageCacheNameValidationJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const homeDir = join(installDir, "package-cache-name-validation-home");
  mkdirSync(homeDir, { recursive: true });

  console.log(
    "release smoke: check packed npm CLI package-cache package filter JSON",
  );
  const env = buildStepEnv({ bplHome: null, env: { HOME: homeDir } });
  const listResult = spawnSync(installedBpl, ["package-cache", "list", "Bad_Name", "--json"], {
    cwd: installDir,
    encoding: "utf-8",
    env,
    timeout: smokeTimeoutMs,
  });
  const verifyResult = spawnSync(installedBpl, ["package-cache", "verify", "Bad_Name", "--json"], {
    cwd: installDir,
    encoding: "utf-8",
    env,
    timeout: smokeTimeoutMs,
  });
  const cleanResult = spawnSync(installedBpl, ["package-cache", "clean", "Bad_Name", "--dry-run", "--json"], {
    cwd: installDir,
    encoding: "utf-8",
    env,
    timeout: smokeTimeoutMs,
  });
  const repairResult = spawnSync(installedBpl, ["package-cache", "repair", "Bad_Name", "--dry-run", "--json"], {
    cwd: installDir,
    encoding: "utf-8",
    env,
    timeout: smokeTimeoutMs,
  });

  if (listResult.error) throw listResult.error;
  if (verifyResult.error) throw verifyResult.error;
  if (cleanResult.error) throw cleanResult.error;
  if (repairResult.error) throw repairResult.error;
  if (
    listResult.status !== 1 ||
    verifyResult.status !== 1 ||
    cleanResult.status !== 1 ||
    repairResult.status !== 1
  ) {
    throw new Error(
      [
        "Packed npm CLI package-cache name validation smoke did not fail as expected.",
        `list exit: ${listResult.status ?? "unknown"}`,
        `list stdout:\n${listResult.stdout}`,
        `list stderr:\n${listResult.stderr}`,
        `verify exit: ${verifyResult.status ?? "unknown"}`,
        `verify stdout:\n${verifyResult.stdout}`,
        `verify stderr:\n${verifyResult.stderr}`,
        `clean exit: ${cleanResult.status ?? "unknown"}`,
        `clean stdout:\n${cleanResult.stdout}`,
        `clean stderr:\n${cleanResult.stderr}`,
        `repair exit: ${repairResult.status ?? "unknown"}`,
        `repair stdout:\n${repairResult.stdout}`,
        `repair stderr:\n${repairResult.stderr}`,
      ].join("\n"),
    );
  }
  if (
    listResult.stderr !== "" ||
    verifyResult.stderr !== "" ||
    cleanResult.stderr !== "" ||
    repairResult.stderr !== ""
  ) {
    throw new Error(
      [
        "Packed npm CLI package-cache name validation JSON wrote stderr.",
        `list stderr:\n${listResult.stderr}`,
        `verify stderr:\n${verifyResult.stderr}`,
        `clean stderr:\n${cleanResult.stderr}`,
        `repair stderr:\n${repairResult.stderr}`,
      ].join("\n"),
    );
  }

  const listReport = parsePackageCacheListReport(listResult.stdout);
  const verifyReport = parsePackageCacheVerifyReport(verifyResult.stdout);
  const cleanReport = parsePackageCacheCleanReport(cleanResult.stdout);
  const repairReport = parsePackageCacheRepairReport(repairResult.stdout);
  if (
    listReport.success ||
    listReport.entries.length !== 0 ||
    listReport.errorCode !== "BPL_PACKAGE_CACHE_NAME_INVALID" ||
    typeof listReport.error !== "string" ||
    verifyReport.success ||
    verifyReport.ok ||
    verifyReport.entriesChecked !== 0 ||
    verifyReport.issues.length !== 0 ||
    verifyReport.errorCode !== "BPL_PACKAGE_CACHE_NAME_INVALID" ||
    typeof verifyReport.error !== "string" ||
    cleanReport.success ||
    !cleanReport.dryRun ||
    cleanReport.removed.length !== 0 ||
    cleanReport.errorCode !== "BPL_PACKAGE_CACHE_NAME_INVALID" ||
    typeof cleanReport.error !== "string" ||
    repairReport.success ||
    !repairReport.dryRun ||
    repairReport.repaired.length !== 0 ||
    repairReport.unchanged.length !== 0 ||
    repairReport.issues.length !== 0 ||
    repairReport.errorCode !== "BPL_PACKAGE_CACHE_NAME_INVALID" ||
    typeof repairReport.error !== "string"
  ) {
    throw new Error(
      [
        "Packed npm CLI package-cache name validation JSON reported unexpected payload.",
        `list:\n${JSON.stringify(listReport, null, 2)}`,
        `verify:\n${JSON.stringify(verifyReport, null, 2)}`,
        `clean:\n${JSON.stringify(cleanReport, null, 2)}`,
        `repair:\n${JSON.stringify(repairReport, null, 2)}`,
      ].join("\n"),
    );
  }
}

function runPackedLockedInstallSafetySmoke(installedBpl: string): void {
  const workspaceDir = mkdtempSync(join(tmpdir(), "bpl-release-lock-safety-"));
  const packageDir = join(workspaceDir, "lock-safety-pkg");
  const rootSymlinkAppDir = join(workspaceDir, "root-symlink-app");
  const sourceSymlinkAppDir = join(workspaceDir, "source-symlink-app");

  try {
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "lock-safety-pkg",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(packageDir, "index.bpl"), "export stable;\n");

    runStep("pack locked install safety fixture", installedBpl, ["pack"], {
      cwd: packageDir,
      bplHome: null,
    });
    const archivePath = join(packageDir, "lock-safety-pkg-1.0.0.tgz");

    mkdirSync(rootSymlinkAppDir, { recursive: true });
    runStep(
      "install packed npm CLI lock safety root fixture",
      installedBpl,
      ["install", archivePath],
      { cwd: rootSymlinkAppDir, bplHome: null },
    );
    const installedPackageRoot = join(
      rootSymlinkAppDir,
      "bpl_modules",
      "lock-safety-pkg",
    );
    const outsidePackageRoot = join(workspaceDir, "outside-lock-safety-pkg");
    renameSync(installedPackageRoot, outsidePackageRoot);
    symlinkSync(outsidePackageRoot, installedPackageRoot, "dir");
    runExpectedFailureStep(
      "check packed npm CLI locked install rejects symlinked package root",
      installedBpl,
      ["install", "--locked"],
      {
        cwd: rootSymlinkAppDir,
        bplHome: null,
        expectedStatus: 1,
        expectedStderrIncludes: "installed package root is a symbolic link",
      },
    );

    mkdirSync(sourceSymlinkAppDir, { recursive: true });
    runStep(
      "install packed npm CLI lock safety source fixture",
      installedBpl,
      ["install", archivePath],
      { cwd: sourceSymlinkAppDir, bplHome: null },
    );
    const realArchivePath = join(workspaceDir, "real-lock-safety-pkg.tgz");
    renameSync(archivePath, realArchivePath);
    symlinkSync(realArchivePath, archivePath, "file");
    runExpectedFailureStep(
      "check packed npm CLI locked install rejects symlinked lock source",
      installedBpl,
      ["install", "--locked"],
      {
        cwd: sourceSymlinkAppDir,
        bplHome: null,
        expectedStatus: 1,
        expectedStderrIncludes: "lock source is not reachable",
      },
    );
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function runPackedPackageImportDiagnosticCodeSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(
    join(tmpdir(), "bpl-release-package-diagnostic-"),
  );
  const packageDir = join(tempDir, "bpl_modules", "pkg-math");

  try {
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(tempDir, "main.bpl"),
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
        "",
      ].join("\n"),
    );

    console.log(
      "release smoke: check packed npm CLI package import diagnostic code JSON",
    );
    const result = spawnSync(installedBpl, ["check", "--json", "main.bpl"], {
      cwd: tempDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        BPL_HOME: undefined,
        NO_COLOR: "1",
      },
      timeout: smokeTimeoutMs,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI package import diagnostic smoke did not fail as expected.",
          `exit: ${result.status ?? "unknown"}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
    if (result.stderr !== "") {
      throw new Error(
        `Packed npm CLI package import diagnostic smoke wrote stderr:\n${result.stderr}`,
      );
    }

    const report = parseCheckReport(result.stdout);
    const fileReport = report.files[0];
    const diagnostic = fileReport?.diagnostics?.[0];
    if (
      report.success ||
      report.totalFiles !== 1 ||
      report.errorCount !== 1 ||
      report.files.length !== 1 ||
      fileReport?.file !== "main.bpl" ||
      fileReport.success ||
      diagnostic?.code !== "BPL_PACKAGE_MANIFEST_MISSING" ||
      typeof diagnostic.message !== "string" ||
      !diagnostic.message.includes("missing bpl.json")
    ) {
      throw new Error(
        `Packed npm CLI package import diagnostic JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }

    const globalSymlinkTempDir = mkdtempSync(
      join(tmpdir(), "bpl-release-package-global-symlink-"),
    );
    try {
      const appDir = join(globalSymlinkTempDir, "app");
      const homeDir = join(globalSymlinkTempDir, "home");
      const bplHomeDir = join(homeDir, ".bpl");
      const linkedGlobalPackageDir = join(bplHomeDir, "packages");
      const realGlobalPackageDir = join(
        globalSymlinkTempDir,
        "outside-global-packages",
      );
      mkdirSync(appDir, { recursive: true });
      mkdirSync(bplHomeDir, { recursive: true });
      mkdirSync(realGlobalPackageDir, { recursive: true });
      symlinkSync(realGlobalPackageDir, linkedGlobalPackageDir, "dir");
      writeFileSync(
        join(appDir, "main.bpl"),
        [
          'import value from "pkg-math";',
          "frame main() ret int {",
          "    return 0;",
          "}",
          "",
        ].join("\n"),
      );

      const globalSymlinkResult = runJsonFailureStep(
        "check packed npm CLI package global search symlink JSON",
        installedBpl,
        ["check", "--json", "main.bpl"],
        {
          cwd: appDir,
          bplHome: null,
          expectedStatus: 1,
          env: { HOME: homeDir, USERPROFILE: homeDir },
        },
      );
      const globalSymlinkReport = parseCheckReport(
        globalSymlinkResult.stdout,
      );
      const globalSymlinkFileReport = globalSymlinkReport.files[0];
      const globalSymlinkDiagnostic =
        globalSymlinkFileReport?.diagnostics?.[0];
      if (
        globalSymlinkReport.success ||
        globalSymlinkReport.totalFiles !== 1 ||
        globalSymlinkReport.errorCount !== 1 ||
        globalSymlinkReport.files.length !== 1 ||
        globalSymlinkFileReport?.file !== "main.bpl" ||
        globalSymlinkFileReport.success ||
        globalSymlinkDiagnostic?.code !==
          "BPL_PACKAGE_SEARCH_DIR_SYMLINK" ||
        typeof globalSymlinkDiagnostic.message !== "string" ||
        !globalSymlinkDiagnostic.message.includes(
          "Global package directory path is a symbolic link",
        ) ||
        !globalSymlinkDiagnostic.message.includes(linkedGlobalPackageDir) ||
        typeof globalSymlinkDiagnostic.hint !== "string" ||
        !globalSymlinkDiagnostic.hint.includes(
          "Move the symlink out of the way",
        ) ||
        globalSymlinkDiagnostic.hint.includes(linkedGlobalPackageDir) ||
        globalSymlinkDiagnostic.hint.includes(realGlobalPackageDir)
      ) {
        throw new Error(
          `Packed npm CLI package global search symlink JSON reported unexpected payload:\n${JSON.stringify(globalSymlinkReport, null, 2)}`,
        );
      }
    } finally {
      rmSync(globalSymlinkTempDir, { recursive: true, force: true });
    }

    const searchNotDirectoryTempDir = mkdtempSync(
      join(tmpdir(), "bpl-release-package-search-file-"),
    );
    try {
      const homeDir = join(searchNotDirectoryTempDir, "home");
      const globalPackageDir = join(homeDir, ".bpl", "packages");

      const localSearchAppDir = join(searchNotDirectoryTempDir, "local-app");
      const localSearchDir = join(localSearchAppDir, "bpl_modules");
      mkdirSync(localSearchAppDir, { recursive: true });
      writeFileSync(localSearchDir, "not a package search directory");
      writePackedPackageImportMain(localSearchAppDir);
      writePackedPackageRoot(
        join(localSearchAppDir, "packages", "pkg-math"),
        "1.0.0",
      );
      writePackedPackageRoot(
        join(globalPackageDir, "pkg-math-9.0.0"),
        "9.0.0",
      );
      const localSearchResult = runJsonFailureStep(
        "check packed npm CLI package local search non-directory JSON",
        installedBpl,
        ["check", "--json", "main.bpl"],
        {
          cwd: localSearchAppDir,
          bplHome: null,
          expectedStatus: 1,
          env: { HOME: homeDir, USERPROFILE: homeDir },
        },
      );
      assertPackageSearchDirectoryNotDirectoryReport(
        parseCheckReport(localSearchResult.stdout),
        "Packed npm CLI package local search non-directory JSON",
        "package search directory is not a directory",
        localSearchDir,
      );

      const workspaceSearchAppDir = join(
        searchNotDirectoryTempDir,
        "workspace-app",
      );
      const workspaceSearchDir = join(workspaceSearchAppDir, "packages");
      mkdirSync(workspaceSearchAppDir, { recursive: true });
      writeFileSync(workspaceSearchDir, "not a package search directory");
      writePackedPackageImportMain(workspaceSearchAppDir);
      const workspaceSearchResult = runJsonFailureStep(
        "check packed npm CLI package workspace search non-directory JSON",
        installedBpl,
        ["check", "--json", "main.bpl"],
        {
          cwd: workspaceSearchAppDir,
          bplHome: null,
          expectedStatus: 1,
          env: { HOME: homeDir, USERPROFILE: homeDir },
        },
      );
      assertPackageSearchDirectoryNotDirectoryReport(
        parseCheckReport(workspaceSearchResult.stdout),
        "Packed npm CLI package workspace search non-directory JSON",
        "package search directory is not a directory",
        workspaceSearchDir,
      );

      const globalSearchAppDir = join(
        searchNotDirectoryTempDir,
        "global-app",
      );
      const globalSearchHomeDir = join(
        searchNotDirectoryTempDir,
        "global-home",
      );
      const globalSearchDir = join(globalSearchHomeDir, ".bpl", "packages");
      mkdirSync(globalSearchAppDir, { recursive: true });
      mkdirSync(join(globalSearchHomeDir, ".bpl"), { recursive: true });
      writeFileSync(globalSearchDir, "not a package search directory");
      writePackedPackageImportMain(globalSearchAppDir);
      const globalSearchResult = runJsonFailureStep(
        "check packed npm CLI package global search non-directory JSON",
        installedBpl,
        ["check", "--json", "main.bpl"],
        {
          cwd: globalSearchAppDir,
          bplHome: null,
          expectedStatus: 1,
          env: { HOME: globalSearchHomeDir, USERPROFILE: globalSearchHomeDir },
        },
      );
      assertPackageSearchDirectoryNotDirectoryReport(
        parseCheckReport(globalSearchResult.stdout),
        "Packed npm CLI package global search non-directory JSON",
        "Global package directory path is not a directory",
        globalSearchDir,
      );
    } finally {
      rmSync(searchNotDirectoryTempDir, { recursive: true, force: true });
    }

    writeFileSync(join(packageDir, "bpl.json"), "{not-json");

    const malformedResult = runJsonFailureStep(
      "check packed npm CLI package import malformed manifest JSON",
      installedBpl,
      ["check", "--json", "main.bpl"],
      { cwd: tempDir, bplHome: null, expectedStatus: 1 },
    );
    const malformedReport = parseCheckReport(malformedResult.stdout);
    const malformedFileReport = malformedReport.files[0];
    const malformedDiagnostic = malformedFileReport?.diagnostics?.[0];
    if (
      malformedReport.success ||
      malformedReport.totalFiles !== 1 ||
      malformedReport.errorCount !== 1 ||
      malformedReport.files.length !== 1 ||
      malformedFileReport?.file !== "main.bpl" ||
      malformedFileReport.success ||
      malformedDiagnostic?.code !== "BPL_PACKAGE_MANIFEST_PARSE_ERROR" ||
      typeof malformedDiagnostic.message !== "string" ||
      !malformedDiagnostic.message.includes("manifest is not valid JSON") ||
      typeof malformedDiagnostic.hint !== "string" ||
      !malformedDiagnostic.hint.includes("manifest is not valid JSON")
    ) {
      throw new Error(
        `Packed npm CLI package import malformed manifest JSON reported unexpected payload:\n${JSON.stringify(malformedReport, null, 2)}`,
      );
    }

    writeFileSync(
      join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "pkg-math",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(packageDir, "index.bpl"), "export root;\n");
    mkdirSync(join(packageDir, "features", "increment"), {
      recursive: true,
    });
    writeFileSync(
      join(packageDir, "features", "add.bpl"),
      [
        "export add;",
        "",
        "frame add(left: int, right: int) ret int {",
        "    return left + right;",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(packageDir, "features", "increment", "index.bpl"),
      [
        "export increment;",
        "",
        "frame increment(value: int) ret int {",
        "    return value + 1;",
        "}",
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(tempDir, "main.bpl"),
      [
        'import add from "pkg-math/features/add.bpl";',
        "",
        "frame main() ret int {",
        "    return add(2, 3);",
        "}",
        "",
      ].join("\n"),
    );
    const explicitSourceImport = runStep(
      "check packed npm CLI package explicit source import JSON",
      installedBpl,
      ["check", "--json", "main.bpl"],
      { cwd: tempDir, bplHome: null },
    );
    const explicitSourceReport = parseCheckReport(explicitSourceImport.stdout);
    const explicitSourceFileReport = explicitSourceReport.files[0];
    if (
      !explicitSourceReport.success ||
      explicitSourceReport.totalFiles !== 1 ||
      explicitSourceReport.errorCount !== 0 ||
      explicitSourceReport.files.length !== 1 ||
      explicitSourceFileReport?.file !== "main.bpl" ||
      !explicitSourceFileReport.success
    ) {
      throw new Error(
        `Packed npm CLI package explicit source import JSON reported unexpected payload:\n${JSON.stringify(explicitSourceReport, null, 2)}`,
      );
    }

    writeFileSync(
      join(tempDir, "main.bpl"),
      [
        'import increment from "pkg-math/features/increment";',
        "",
        "frame main() ret int {",
        "    return increment(41);",
        "}",
        "",
      ].join("\n"),
    );
    const directoryIndexImport = runStep(
      "check packed npm CLI package directory index import JSON",
      installedBpl,
      ["check", "--json", "main.bpl"],
      { cwd: tempDir, bplHome: null },
    );
    const directoryIndexReport = parseCheckReport(directoryIndexImport.stdout);
    const directoryIndexFileReport = directoryIndexReport.files[0];
    if (
      !directoryIndexReport.success ||
      directoryIndexReport.totalFiles !== 1 ||
      directoryIndexReport.errorCount !== 0 ||
      directoryIndexReport.files.length !== 1 ||
      directoryIndexFileReport?.file !== "main.bpl" ||
      !directoryIndexFileReport.success
    ) {
      throw new Error(
        `Packed npm CLI package directory index import JSON reported unexpected payload:\n${JSON.stringify(directoryIndexReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function writePackedPackageImportMain(appDir: string): void {
  writeFileSync(
    join(appDir, "main.bpl"),
    [
      'import value from "pkg-math";',
      "frame main() ret int {",
      "    return 0;",
      "}",
      "",
    ].join("\n"),
  );
}

function writePackedPackageRoot(packageDir: string, version: string): void {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "bpl.json"),
    JSON.stringify(
      {
        name: "pkg-math",
        version,
        main: "index.bpl",
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(packageDir, "index.bpl"), "export value;\n");
}

function assertPackageSearchDirectoryNotDirectoryReport(
  report: CheckReport,
  label: string,
  expectedMessage: string,
  expectedPath: string,
): void {
  const fileReport = report.files[0];
  const diagnostic = fileReport?.diagnostics?.[0];
  if (
    report.success ||
    report.totalFiles !== 1 ||
    report.errorCount !== 1 ||
    report.files.length !== 1 ||
    fileReport?.file !== "main.bpl" ||
    fileReport.success ||
    diagnostic?.code !== "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY" ||
    typeof diagnostic.message !== "string" ||
    !diagnostic.message.includes(expectedMessage) ||
    !diagnostic.message.includes(expectedPath)
  ) {
    throw new Error(
      `${label} reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
    );
  }
}

function runPackedCheckJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-check-json-"));

  try {
    writeFileSync(
      join(tempDir, "main.bpl"),
      "frame main() ret int { return 0; }\n",
    );

    const result = runStep(
      "check packed npm CLI check JSON",
      installedBpl,
      ["check", "--json", "main.bpl"],
      { cwd: tempDir, bplHome: null },
    );
    const report = parseCheckReport(result.stdout);
    const fileReport = report.files[0];

    if (
      !report.success ||
      report.totalFiles !== 1 ||
      report.errorCount !== 0 ||
      report.files.length !== 1 ||
      fileReport?.file !== "main.bpl" ||
      !fileReport.success
    ) {
      throw new Error(
        `Packed npm CLI check JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedLintJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-lint-json-"));

  try {
    writeFileSync(
      join(tempDir, "main.bpl"),
      [
        "struct bad_struct_name {",
        "    x: int,",
        "}",
        "",
        "frame main() ret int {",
        "    return 0;",
        "}",
        "",
      ].join("\n"),
    );

    console.log("release smoke: check packed npm CLI lint JSON");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const result = spawnSync(installedBpl, ["lint", "--json", "main.bpl"], {
      cwd: tempDir,
      encoding: "utf-8",
      env,
      timeout: smokeTimeoutMs,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI lint JSON smoke did not fail as expected.",
          `exit: ${result.status ?? "unknown"}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
    if (result.stderr !== "") {
      throw new Error(
        `Packed npm CLI lint JSON wrote stderr:\n${result.stderr}`,
      );
    }

    const report = parseLintReport(result.stdout);
    const fileReport = report.files[0];
    const diagnostic = fileReport?.diagnostics?.[0];
    if (
      report.success ||
      report.totalFiles !== 1 ||
      report.errorCount < 1 ||
      report.files.length !== 1 ||
      fileReport?.file !== "main.bpl" ||
      fileReport.success ||
      diagnostic?.code !== "L001" ||
      diagnostic.severityLabel !== "warning"
    ) {
      throw new Error(
        `Packed npm CLI lint JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedFormatJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-format-json-"));
  const formattedPath = join(tempDir, "formatted.bpl");
  const unformattedPath = join(tempDir, "unformatted.bpl");
  const formatted = "frame main() ret int {\n    return 0;\n}\n";
  const unformatted = "frame  main ( )  ret  int { return 0 ; }";

  try {
    writeFileSync(formattedPath, formatted);
    writeFileSync(unformattedPath, unformatted);

    console.log("release smoke: check packed npm CLI format JSON");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const successResult = spawnSync(
      installedBpl,
      ["format", "--check", "--json", formattedPath],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );
    const failureResult = spawnSync(
      installedBpl,
      ["format", "--check", "--json", unformattedPath],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );

    if (successResult.error) throw successResult.error;
    if (failureResult.error) throw failureResult.error;
    if (successResult.status !== 0 || failureResult.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI format JSON smoke returned unexpected exits.",
          `success exit: ${successResult.status ?? "unknown"}`,
          `success stdout:\n${successResult.stdout}`,
          `success stderr:\n${successResult.stderr}`,
          `failure exit: ${failureResult.status ?? "unknown"}`,
          `failure stdout:\n${failureResult.stdout}`,
          `failure stderr:\n${failureResult.stderr}`,
        ].join("\n"),
      );
    }
    if (successResult.stderr !== "" || failureResult.stderr !== "") {
      throw new Error(
        [
          "Packed npm CLI format JSON wrote stderr.",
          `success stderr:\n${successResult.stderr}`,
          `failure stderr:\n${failureResult.stderr}`,
        ].join("\n"),
      );
    }

    const successReport = parseFormatReport(successResult.stdout);
    const failureReport = parseFormatReport(failureResult.stdout);
    const successFileReport = successReport.files[0];
    const failureFileReport = failureReport.files[0];
    if (
      !successReport.success ||
      successReport.mode !== "check" ||
      successReport.totalFiles !== 1 ||
      successReport.formattedFiles !== 1 ||
      successReport.unformattedFiles !== 0 ||
      successReport.errorCount !== 0 ||
      successReport.files.length !== 1 ||
      successFileReport?.file !== formattedPath ||
      !successFileReport.success ||
      !successFileReport.formatted ||
      successFileReport.changed
    ) {
      throw new Error(
        `Packed npm CLI format JSON success reported unexpected payload:\n${JSON.stringify(successReport, null, 2)}`,
      );
    }
    if (
      failureReport.success ||
      failureReport.mode !== "check" ||
      failureReport.totalFiles !== 1 ||
      failureReport.formattedFiles !== 0 ||
      failureReport.unformattedFiles !== 1 ||
      failureReport.errorCount !== 1 ||
      failureReport.files.length !== 1 ||
      failureFileReport?.file !== unformattedPath ||
      failureFileReport.success ||
      failureFileReport.formatted ||
      !failureFileReport.changed ||
      failureFileReport.error !== "File is not formatted" ||
      failureFileReport.errorCode !== "BPL_FORMAT_NOT_FORMATTED" ||
      readFileSync(unformattedPath, "utf-8") !== unformatted
    ) {
      throw new Error(
        `Packed npm CLI format JSON failure reported unexpected payload:\n${JSON.stringify(failureReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedBindgenJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-bindgen-json-"));
  const headerPath = join(tempDir, "input.h");

  try {
    writeFileSync(headerPath, "int puts(const char *s);\n");

    console.log("release smoke: check packed npm CLI bindgen JSON");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const successResult = spawnSync(
      installedBpl,
      ["bindgen", "--json", headerPath],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );
    const failureResult = spawnSync(
      installedBpl,
      ["bindgen", "--json", headerPath, "-o", tempDir],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );

    if (successResult.error) throw successResult.error;
    if (failureResult.error) throw failureResult.error;
    if (successResult.status !== 0 || failureResult.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI bindgen JSON smoke returned unexpected exits.",
          `success exit: ${successResult.status ?? "unknown"}`,
          `success stdout:\n${successResult.stdout}`,
          `success stderr:\n${successResult.stderr}`,
          `failure exit: ${failureResult.status ?? "unknown"}`,
          `failure stdout:\n${failureResult.stdout}`,
          `failure stderr:\n${failureResult.stderr}`,
        ].join("\n"),
      );
    }
    if (successResult.stderr !== "" || failureResult.stderr !== "") {
      throw new Error(
        [
          "Packed npm CLI bindgen JSON wrote stderr.",
          `success stderr:\n${successResult.stderr}`,
          `failure stderr:\n${failureResult.stderr}`,
        ].join("\n"),
      );
    }

    const successReport = parseBindgenReport(successResult.stdout);
    const failureReport = parseBindgenReport(failureResult.stdout);
    if (
      !successReport.success ||
      successReport.header !== headerPath ||
      successReport.outputPath !== null ||
      typeof successReport.generatedBytes !== "number" ||
      successReport.generatedBytes <= 0 ||
      typeof successReport.bindings !== "string" ||
      !successReport.bindings.includes("extern puts(s: string) ret int;")
    ) {
      throw new Error(
        `Packed npm CLI bindgen JSON success reported unexpected payload:\n${JSON.stringify(successReport, null, 2)}`,
      );
    }
    if (
      failureReport.success ||
      failureReport.header !== headerPath ||
      failureReport.outputPath !== tempDir ||
      failureReport.errorCode !== "BPL_BINDGEN_OUTPUT_DIRECTORY" ||
      typeof failureReport.error !== "string" ||
      !failureReport.error.includes("Output path is a directory")
    ) {
      throw new Error(
        `Packed npm CLI bindgen JSON failure reported unexpected payload:\n${JSON.stringify(failureReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedDocsJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-docs-json-"));
  const sourcePath = join(tempDir, "main.bpl");
  const outputPath = join(tempDir, "docs.md");

  try {
    writeFileSync(
      sourcePath,
      [
        "frame main() ret int {",
        "    return 0;",
        "}",
        "",
      ].join("\n"),
    );

    console.log("release smoke: check packed npm CLI docs JSON");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const successResult = spawnSync(
      installedBpl,
      ["docs", "--json", sourcePath, "-o", outputPath],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );
    const failureResult = spawnSync(
      installedBpl,
      ["docs", "--json", sourcePath, "-o", tempDir],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );

    if (successResult.error) throw successResult.error;
    if (failureResult.error) throw failureResult.error;
    if (successResult.status !== 0 || failureResult.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI docs JSON smoke returned unexpected exits.",
          `success exit: ${successResult.status ?? "unknown"}`,
          `success stdout:\n${successResult.stdout}`,
          `success stderr:\n${successResult.stderr}`,
          `failure exit: ${failureResult.status ?? "unknown"}`,
          `failure stdout:\n${failureResult.stdout}`,
          `failure stderr:\n${failureResult.stderr}`,
        ].join("\n"),
      );
    }
    if (successResult.stderr !== "" || failureResult.stderr !== "") {
      throw new Error(
        [
          "Packed npm CLI docs JSON wrote stderr.",
          `success stderr:\n${successResult.stderr}`,
          `failure stderr:\n${failureResult.stderr}`,
        ].join("\n"),
      );
    }

    const successReport = parseDocsReport(successResult.stdout);
    const failureReport = parseDocsReport(failureResult.stdout);
    if (
      !successReport.success ||
      successReport.file !== sourcePath ||
      successReport.outputPath !== outputPath ||
      typeof successReport.generatedBytes !== "number" ||
      successReport.generatedBytes <= 0 ||
      !readFileSync(outputPath, "utf-8").includes("# Module: main.bpl")
    ) {
      throw new Error(
        `Packed npm CLI docs JSON success reported unexpected payload:\n${JSON.stringify(successReport, null, 2)}`,
      );
    }
    if (
      failureReport.success ||
      failureReport.file !== sourcePath ||
      failureReport.outputPath !== tempDir ||
      failureReport.errorCode !== "BPL_DOCS_OUTPUT_DIRECTORY" ||
      typeof failureReport.error !== "string" ||
      !failureReport.error.includes("Output path is a directory")
    ) {
      throw new Error(
        `Packed npm CLI docs JSON failure reported unexpected payload:\n${JSON.stringify(failureReport, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedSourceAnalysisValidationJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(
    join(tmpdir(), "bpl-release-source-validation-"),
  );
  const sourceDir = join(tempDir, "src");
  const sourcePath = join(tempDir, "main.bpl");
  const linkedSourcePath = join(tempDir, "linked.bpl");

  try {
    mkdirSync(sourceDir);
    writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
    symlinkSync(sourcePath, linkedSourcePath, "file");

    console.log(
      "release smoke: check packed npm CLI check/lint validation JSON",
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const checkResult = spawnSync(
      installedBpl,
      ["check", "--json", sourceDir],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );
    const lintResult = spawnSync(
      installedBpl,
      ["lint", "--json", linkedSourcePath],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env,
        timeout: smokeTimeoutMs,
      },
    );

    if (checkResult.error) throw checkResult.error;
    if (lintResult.error) throw lintResult.error;
    if (checkResult.status !== 1 || lintResult.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI source-analysis validation smoke did not fail as expected.",
          `check exit: ${checkResult.status ?? "unknown"}`,
          `check stdout:\n${checkResult.stdout}`,
          `check stderr:\n${checkResult.stderr}`,
          `lint exit: ${lintResult.status ?? "unknown"}`,
          `lint stdout:\n${lintResult.stdout}`,
          `lint stderr:\n${lintResult.stderr}`,
        ].join("\n"),
      );
    }
    if (checkResult.stderr !== "" || lintResult.stderr !== "") {
      throw new Error(
        [
          "Packed npm CLI source-analysis validation JSON wrote stderr.",
          `check stderr:\n${checkResult.stderr}`,
          `lint stderr:\n${lintResult.stderr}`,
        ].join("\n"),
      );
    }

    const checkReport = parseCheckReport(checkResult.stdout);
    const lintReport = parseLintReport(lintResult.stdout);
    const checkFileReport = checkReport.files[0];
    const lintFileReport = lintReport.files[0];
    if (
      checkReport.success ||
      checkReport.totalFiles !== 1 ||
      checkReport.errorCount !== 1 ||
      checkReport.files.length !== 1 ||
      checkFileReport?.file !== sourceDir ||
      checkFileReport.success ||
      checkFileReport.error !== "Input path is not a file" ||
      checkFileReport.errorCode !== "BPL_CHECK_INPUT_NOT_FILE" ||
      lintReport.success ||
      lintReport.totalFiles !== 1 ||
      lintReport.errorCount !== 1 ||
      lintReport.files.length !== 1 ||
      lintFileReport?.file !== linkedSourcePath ||
      lintFileReport.success ||
      lintFileReport.error !== "Input path is a symbolic link" ||
      lintFileReport.errorCode !== "BPL_LINT_INPUT_SYMLINK"
    ) {
      throw new Error(
        [
          "Packed npm CLI source-analysis validation JSON reported unexpected payload.",
          `check:\n${JSON.stringify(checkReport, null, 2)}`,
          `lint:\n${JSON.stringify(lintReport, null, 2)}`,
        ].join("\n"),
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedSourceAnalysisNoInputJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-source-no-input-"));

  try {
    console.log("release smoke: check packed npm CLI check/lint no-input JSON");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BPL_HOME: undefined,
      NO_COLOR: "1",
    };
    const checkResult = spawnSync(installedBpl, ["check", "--json"], {
      cwd: tempDir,
      encoding: "utf-8",
      env,
      timeout: smokeTimeoutMs,
    });
    const lintResult = spawnSync(installedBpl, ["lint", "--json"], {
      cwd: tempDir,
      encoding: "utf-8",
      env,
      timeout: smokeTimeoutMs,
    });

    if (checkResult.error) throw checkResult.error;
    if (lintResult.error) throw lintResult.error;
    if (checkResult.status !== 1 || lintResult.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI source-analysis no-input smoke did not fail as expected.",
          `check exit: ${checkResult.status ?? "unknown"}`,
          `check stdout:\n${checkResult.stdout}`,
          `check stderr:\n${checkResult.stderr}`,
          `lint exit: ${lintResult.status ?? "unknown"}`,
          `lint stdout:\n${lintResult.stdout}`,
          `lint stderr:\n${lintResult.stderr}`,
        ].join("\n"),
      );
    }
    if (checkResult.stderr !== "" || lintResult.stderr !== "") {
      throw new Error(
        [
          "Packed npm CLI source-analysis no-input JSON wrote stderr.",
          `check stderr:\n${checkResult.stderr}`,
          `lint stderr:\n${lintResult.stderr}`,
        ].join("\n"),
      );
    }

    const checkReport = parseCheckReport(checkResult.stdout);
    const lintReport = parseLintReport(lintResult.stdout);
    if (
      checkReport.success ||
      checkReport.totalFiles !== 0 ||
      checkReport.errorCount !== 1 ||
      checkReport.files.length !== 0 ||
      checkReport.error !== "No files specified." ||
      checkReport.errorCode !== "BPL_CHECK_NO_INPUTS" ||
      lintReport.success ||
      lintReport.totalFiles !== 0 ||
      lintReport.errorCount !== 1 ||
      lintReport.files.length !== 0 ||
      lintReport.error !== "No files specified." ||
      lintReport.errorCode !== "BPL_LINT_NO_INPUTS"
    ) {
      throw new Error(
        [
          "Packed npm CLI source-analysis no-input JSON reported unexpected payload.",
          `check:\n${JSON.stringify(checkReport, null, 2)}`,
          `lint:\n${JSON.stringify(lintReport, null, 2)}`,
        ].join("\n"),
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedWasmSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-wasm-"));
  const wasmPath = join(tempDir, "smoke.wasm");

  try {
    writeFileSync(
      join(tempDir, "wasm.bpl"),
      "frame main() ret int { return 7; }\n",
    );

    runStep(
      "build packed npm CLI wasm artifact",
      installedBpl,
      [
        "build",
        "wasm.bpl",
        "--target",
        "wasm32-unknown-unknown",
        "-o",
        wasmPath,
      ],
      { cwd: tempDir, bplHome: null },
    );

    if (readFileSync(wasmPath).subarray(0, 4).toString("binary") !== "\0asm") {
      throw new Error(`Packed npm CLI did not emit a valid wasm artifact.`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedBuildJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-build-json-"));
  const outputPath = join(tempDir, "build-json-smoke");
  const llvmPath = `${outputPath}.ll`;

  try {
    writeFileSync(
      join(tempDir, "main.bpl"),
      "frame main() ret int { return 0; }\n",
    );

    const result = runStep(
      "check packed npm CLI build JSON",
      installedBpl,
      ["build", "main.bpl", "--json", "-o", outputPath],
      { cwd: tempDir, bplHome: null },
    );
    const report = parseBuildReport(result.stdout);
    if (!report.success) {
      throw new Error(
        `Packed npm CLI build JSON reported failure:\n${JSON.stringify(report, null, 2)}`,
      );
    }
    const output = report.output;
    if (!output || output.llvm !== llvmPath || output.executable !== outputPath) {
      throw new Error(
        `Packed npm CLI build JSON reported unexpected artifacts:\n${JSON.stringify(output, null, 2)}`,
      );
    }
    if (!existsSync(llvmPath) || !existsSync(outputPath)) {
      throw new Error("Packed npm CLI build JSON did not create artifacts.");
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedBuildValidationJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(
    join(tmpdir(), "bpl-release-build-validation-json-"),
  );
  const outputPath = join(tempDir, "missing", "build-validation-smoke");
  const unsupportedTargetOutputPath = join(tempDir, "unsupported-target-smoke");

  try {
    writeFileSync(
      join(tempDir, "main.bpl"),
      "frame main() ret int { return 0; }\n",
    );

    const validationCases = [
      {
        label: "check packed npm CLI build validation JSON",
        args: [
          "build",
          "main.bpl",
          "--json",
          "--emit",
          "llvm",
          "-o",
          outputPath,
        ],
        expectedError: "Output directory not found",
        expectedErrorCode: "BPL_BUILD_OUTPUT_PARENT_NOT_FOUND",
        forbiddenArtifact: `${outputPath}.ll`,
      },
      {
        label: "check packed npm CLI unsupported target validation JSON",
        args: [
          "build",
          "main.bpl",
          "--json",
          "--emit",
          "llvm",
          "--target",
          "mips64-unknown-bpl",
          "-o",
          unsupportedTargetOutputPath,
        ],
        expectedError: 'Unsupported target triple "mips64-unknown-bpl"',
        expectedErrorCode: "BPL_BUILD_UNSUPPORTED_TARGET",
        forbiddenArtifact: `${unsupportedTargetOutputPath}.ll`,
      },
    ];

    for (const validationCase of validationCases) {
      const result = runJsonFailureStep(
        validationCase.label,
        installedBpl,
        validationCase.args,
        { cwd: tempDir, bplHome: null, expectedStatus: 1 },
      );
      const report = parseBuildFailureReport(result.stdout);
      if (
        report.success ||
        report.file !== "main.bpl" ||
        report.errorCode !== validationCase.expectedErrorCode ||
        !report.error.includes(validationCase.expectedError) ||
        existsSync(validationCase.forbiddenArtifact)
      ) {
        throw new Error(
          `Packed npm CLI build validation JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
        );
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedBuildNoInputJsonSmoke(
  installedBpl: string,
  installDir: string,
): void {
  const result = runJsonFailureStep(
    "check packed npm CLI root build no-input JSON",
    installedBpl,
    ["--json"],
    { cwd: installDir, bplHome: null, expectedStatus: 1 },
  );
  const report = parseBuildFailureReport(result.stdout);
  if (
    report.success ||
    report.file !== undefined ||
    report.errorCode !== "BPL_BUILD_NO_INPUTS" ||
    report.error !== "No input files specified."
  ) {
    throw new Error(
      `Packed npm CLI root build no-input JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
    );
  }
}

function runPackedCleanValidationJsonSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(
    join(tmpdir(), "bpl-release-clean-validation-json-"),
  );
  const fakeBin = join(tempDir, "bin");
  const artifactPath = join(tempDir, "main.ll");

  try {
    mkdirSync(join(tempDir, ".git"));
    mkdirSync(fakeBin);
    writeFileSync(artifactPath, "; keep clean artifact");
    writeNodeCommandShim(join(fakeBin, "git"), [
      'console.error("fatal: simulated git failure");',
      "process.exit(1);",
    ]);

    console.log("release smoke: check packed npm CLI clean validation JSON");
    const result = spawnSync(installedBpl, ["clean", "--json"], {
      cwd: tempDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        BPL_HOME: undefined,
        NO_COLOR: "1",
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
      },
      timeout: smokeTimeoutMs,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI clean validation smoke did not fail as expected.",
          `exit: ${result.status ?? "unknown"}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
    if (result.stderr !== "") {
      throw new Error(
        `Packed npm CLI clean validation smoke wrote stderr:\n${result.stderr}`,
      );
    }

    const report = parseCleanFailureReport(result.stdout);
    if (
      report.success ||
      report.dryRun ||
      report.count !== 0 ||
      report.entries.length !== 0 ||
      report.errorCode !== "BPL_CLEAN_GIT_TRACKED_UNAVAILABLE" ||
      report.error !==
        "Could not determine git-tracked files; refusing to clean in a git repository." ||
      !existsSync(artifactPath)
    ) {
      throw new Error(
        `Packed npm CLI clean validation JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedCacheStatsSmoke(installedBpl: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-release-cache-"));

  try {
    writeFileSync(
      join(tempDir, "constants.bpl"),
      ["export seed;", "frame seed() ret int {", "    return 9;", "}", ""].join(
        "\n",
      ),
    );
    writeFileSync(
      join(tempDir, "main.bpl"),
      [
        'import seed from "./constants.bpl";',
        "extern printf(fmt: string, ...);",
        "",
        "frame main() ret int {",
        '    printf("cache-smoke %d\\n", seed());',
        "    return 0;",
        "}",
        "",
      ].join("\n"),
    );

    const result = runStep(
      "build packed npm CLI cached module app",
      installedBpl,
      ["build", "main.bpl", "--cache", "--cache-stats", "-o", "cache-smoke"],
      { cwd: tempDir, bplHome: null },
    );
    if (!result.stdout.includes("Cache stats:")) {
      throw new Error(
        [
          "Packed npm CLI cached build did not print cache stats.",
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function runPackedHelperScriptSmoke(installDir: string): void {
  const packageDir = join(installDir, "node_modules", "bpl-v3");
  const fuzzRepro = runStep(
    "check packed npm CLI fuzz artifact repro helper",
    "npm",
    ["run", "fuzz:repro", "--", "--help"],
    { cwd: packageDir, bplHome: null },
  );

  assertOutputContains(fuzzRepro.stdout, [
    "Usage: bun tools/fuzz_artifact_repro.ts",
    "fuzz/crashes",
  ]);

  const fuzzCrashDir = join(packageDir, "fuzz", "crashes");
  const metadataName = "crash_seed-1234_iter-2_tokens.json";
  mkdirSync(fuzzCrashDir, { recursive: true });
  writeFileSync(
    join(fuzzCrashDir, "crash_seed-1234_iter-2_tokens.bpl"),
    "frame main() ret int { return 0; }\n",
  );
  writeFileSync(
    join(fuzzCrashDir, metadataName),
    JSON.stringify(
      {
        seed: 0x1234,
        iteration: 2,
        kind: "tokens",
        failureKind: "crash",
        stage: "typecheck",
        message: "packed helper smoke",
      },
      null,
      2,
    ) + "\n",
  );

  const fuzzReproJson = runStep(
    "check packed npm CLI fuzz artifact repro JSON",
    "npm",
    [
      "run",
      "--silent",
      "fuzz:repro",
      "--",
      "--input",
      "fuzz/crashes",
      "--repo-root",
      packageDir,
      "--json",
    ],
    { cwd: packageDir, bplHome: null },
  );
  const fuzzReproPlan = parseFuzzArtifactReproPlan(fuzzReproJson.stdout);
  const fuzzReproEntry = fuzzReproPlan.entries[0];
  if (
    fuzzReproPlan.inputPath !== "fuzz/crashes" ||
    fuzzReproEntry?.metadataPath !== `fuzz/crashes/${metadataName}` ||
    fuzzReproEntry.sourcePath !==
      "fuzz/crashes/crash_seed-1234_iter-2_tokens.bpl" ||
    fuzzReproEntry.seedHex !== "0x1234" ||
    fuzzReproEntry.iteration !== 2 ||
    !fuzzReproEntry.commands.includes(
      "bun run fuzz -- --iterations 3 --seeds 0x1234 --minimize true --minimize-passes 8",
    )
  ) {
    throw new Error(
      `Packed npm CLI fuzz artifact repro JSON reported unexpected payload:\n${JSON.stringify(fuzzReproPlan, null, 2)}`,
    );
  }

  runExpectedFailureStep(
    "check packed npm CLI fuzz artifact repro usage errors",
    "npm",
    ["run", "fuzz:repro", "--", "--input", "--json"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--input requires a value",
      forbiddenOutputIncludes: [
        "Fuzz artifact path does not exist",
        "No fuzz artifact metadata found",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz artifact repro flag value usage errors",
    "npm",
    ["run", "fuzz:repro", "--", "--json=true", "fuzz/crashes"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--json does not accept a value",
      forbiddenOutputIncludes: [
        "Fuzz artifact path does not exist",
        "No fuzz artifact metadata found",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz artifact repro empty input usage errors",
    "npm",
    ["run", "fuzz:repro", "--", "--input="],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--input requires a non-empty value",
      forbiddenOutputIncludes: [
        "Fuzz artifact path does not exist",
        "No fuzz artifact metadata found",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz artifact repro conflicting input usage errors",
    "npm",
    [
      "run",
      "fuzz:repro",
      "--",
      "--input",
      "fuzz/crashes",
      "other-artifacts",
    ],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes:
        "Pass artifact path either positionally or with --input, not both.",
      forbiddenOutputIncludes: [
        "Fuzz artifact path does not exist",
        "No fuzz artifact metadata found",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz runner usage errors",
    "npm",
    ["run", "fuzz", "--", "--iterations", "--crash-dir", "fuzz/crashes"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--iterations requires a value",
      forbiddenOutputIncludes: [
        "Starting compiler fuzz campaign",
        "requires a source checkout",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz runner boolean usage errors",
    "npm",
    [
      "run",
      "fuzz",
      "--",
      "--minimize",
      "maybe",
      "--iterations",
      "1",
      "--crash-dir",
      "fuzz/crashes",
    ],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "minimize must be a boolean value",
      forbiddenOutputIncludes: [
        "Starting compiler fuzz campaign",
        "requires a source checkout",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz runner empty value usage errors",
    "npm",
    ["run", "fuzz", "--", "--iterations="],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--iterations requires a non-empty value",
      forbiddenOutputIncludes: [
        "Starting compiler fuzz campaign",
        "requires a source checkout",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz replay usage errors",
    "npm",
    ["run", "fuzz:replay", "--", "--metadata", "--mode", "parser"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--metadata requires a value",
      forbiddenOutputIncludes: [
        "Either sourcePath or metadataPath",
        "No source artifact found",
        "Source:",
      ],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI fuzz promote usage errors",
    "npm",
    ["run", "fuzz:promote", "--", "--metadata", "--name", "bug"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--metadata requires a value",
      forbiddenOutputIncludes: [
        "Either --source or --metadata",
        "No source artifact found",
        "Promoted fuzz regression",
      ],
    },
  );

  const testCiHelp = runStep(
    "check packed npm CLI test:ci help",
    "npm",
    ["run", "--silent", "test:ci", "--", "--help"],
    { cwd: packageDir, bplHome: null },
  );
  assertOutputContains(testCiHelp.stdout, [
    "Usage: bun tools/test_ci.ts",
    "--list, --dry-run",
    "--json",
  ]);

  const testCiList = runStep(
    "check packed npm CLI test:ci list",
    "npm",
    ["run", "--silent", "test:ci", "--", "--list"],
    { cwd: packageDir, bplHome: null },
  );
  assertOutputContains(testCiList.stdout, [
    "# Build runtime support",
    "bun run build:runtime",
    "# Check generated CLI registry shim",
    "bun run release:cli-registry",
  ]);

  const testCiJson = runStep(
    "check packed npm CLI test:ci JSON",
    "npm",
    ["run", "--silent", "test:ci", "--", "--json"],
    { cwd: packageDir, bplHome: null },
  );
  const testCiPlan = JSON.parse(testCiJson.stdout) as {
    schemaVersion?: unknown;
    check?: unknown;
    plan?: Array<{ name?: unknown; command?: unknown; args?: unknown }>;
  };
  const testCiStepNames = testCiPlan.plan?.map((step) => step.name) ?? [];
  if (
    testCiPlan.schemaVersion !== 1 ||
    testCiPlan.check !== "test-ci" ||
    JSON.stringify(testCiStepNames) !==
      JSON.stringify([
        "Build runtime support",
        "Run integration and playground examples",
        "Run VS Code extension tests",
        "Check generated CLI registry shim",
      ])
  ) {
    throw new Error(
      `Packed npm CLI test:ci JSON reported unexpected payload:\n${JSON.stringify(testCiPlan, null, 2)}`,
    );
  }

  runExpectedFailureStep(
    "check packed npm CLI test:ci flag value usage errors",
    "npm",
    ["run", "--silent", "test:ci", "--", "--dry-run=true"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--dry-run does not accept a value",
      forbiddenOutputIncludes: [
        "Build runtime support",
        "Run CI-safe unit tests",
      ],
    },
  );

  const ciTriage = runStep(
    "check packed npm CLI CI triage helper",
    "npm",
    ["run", "ci:triage", "--", "--help"],
    { cwd: packageDir, bplHome: null },
  );

  assertOutputContains(ciTriage.stdout, [
    "Usage: bun tools/ci_triage.ts",
    "--repo owner/repo",
    "run-id-or-actions-url",
  ]);

  const ciTriageJobsPath = join(packageDir, "ci-triage-jobs.json");
  writeFileSync(
    ciTriageJobsPath,
    JSON.stringify(
      {
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
            name: "Ubuntu system clang release",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/42",
            steps: [
              { name: "Run CI-safe test suite", conclusion: "failure" },
            ],
          },
          {
            id: 43,
            name: "Package timeout metadata",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/43",
            steps: [
              {
                name: "tar tool timed out while extracting package",
                conclusion: "failure",
              },
              {
                name: "object symbol parsing timed out",
                conclusion: "failure",
              },
            ],
          },
          {
            id: 44,
            name: "Sanitizer timeout metadata",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/44",
            steps: [
              {
                name: "Compiler sanitizer-backed runtime tests > routes checked runtime failures through BPL errors under ASan and UBSan timed out after 5000ms",
                conclusion: "failure",
              },
            ],
          },
          {
            id: 49,
            name: "CLI JSON timeout metadata",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/49",
            steps: [
              {
                name: "CLIJsonParseability.test reports module path diagnostic codes in JSON-mode check and build diagnostics timed out after 5000ms",
                conclusion: "failure",
              },
            ],
          },
          {
            id: 45,
            name: "Root build no-input JSON",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/45",
            steps: [
              {
                name: "BPL_BUILD_NO_INPUTS in root build --json",
                conclusion: "failure",
              },
            ],
          },
          {
            id: 46,
            name: "Package archive JSON code mapping",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/46",
            steps: [
              {
                name: "BPL_PACKAGE_ARCHIVE_NOT_FILE in package install JSON",
                conclusion: "failure",
              },
            ],
          },
          {
            id: 47,
            name: "Wasm linker JSON code mapping",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/47",
            steps: [
              {
                name: "BPL_WASM_LINKER_UNAVAILABLE",
                conclusion: "failure",
              },
            ],
          },
          {
            id: 48,
            name: "Explicit std import JSON code mapping",
            conclusion: "failure",
            html_url:
              "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/48",
            steps: [
              {
                name: "BPL_MODULE_NOT_FOUND Standard library module not found: std/missing.bpl",
                conclusion: "failure",
              },
            ],
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );

  const ciTriageJson = runStep(
    "check packed npm CLI CI triage JSON",
    "npm",
    [
      "run",
      "--silent",
      "ci:triage",
      "--",
      "--json",
      "--jobs-json",
      "ci-triage-jobs.json",
      "26695335269",
    ],
    { cwd: packageDir, bplHome: null },
  );
  const ciTriageReport = parseCiTriageReport(ciTriageJson.stdout);
  const expectedCiTriageSuiteCommands = [
    "bun test tests/TestCiRunner.test.ts",
    "bun tools/test_ci.ts --list",
    "bun run test:ci",
  ];
  if (
    ciTriageReport.run.headSha !==
      "1234567890abcdef1234567890abcdef12345678" ||
    ciTriageReport.checkout.status !== "unknown" ||
    ciTriageReport.checkout.reason !== "local checkout SHA unavailable" ||
    ciTriageReport.summary.missingJobIds.length !== 0 ||
    JSON.stringify(ciTriageReport.summary.failedJobs[0]?.localCommands) !==
      JSON.stringify(expectedCiTriageSuiteCommands)
  ) {
    throw new Error(
      `Packed npm CLI CI triage JSON reported unexpected payload:\n${JSON.stringify(ciTriageReport, null, 2)}`,
    );
  }

  const ciTriageInlineJson = runStep(
    "check packed npm CLI CI triage inline JSON",
    "npm",
    [
      "run",
      "--silent",
      "ci:triage",
      "--",
      "--json",
      "--jobs-json=ci-triage-jobs.json",
      "--run=26695335269",
      "--repo=pr0h0/bpl3",
    ],
    { cwd: packageDir, bplHome: null },
  );
  const ciTriageInlineReport = parseCiTriageReport(ciTriageInlineJson.stdout);
  if (
    ciTriageInlineReport.run.headSha !==
      "1234567890abcdef1234567890abcdef12345678" ||
    ciTriageInlineReport.summary.missingJobIds.length !== 0 ||
    JSON.stringify(
      ciTriageInlineReport.summary.failedJobs[0]?.localCommands,
    ) !== JSON.stringify(expectedCiTriageSuiteCommands)
  ) {
    throw new Error(
      `Packed npm CLI CI triage inline JSON reported unexpected payload:\n${JSON.stringify(ciTriageInlineReport, null, 2)}`,
    );
  }

  const ciTriageRootBuildNoInputLabel =
    "check packed npm CLI CI triage root build no-input JSON";
  console.log(`release smoke: ${ciTriageRootBuildNoInputLabel}`);
  const rootBuildNoInputCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "Root build no-input JSON",
    )?.localCommands ?? [];
  const expectedRootBuildNoInputCommands = [
    'bun test tests/CLIJsonParseability.test.ts -t "root build JSON no-input"',
    'bun test tests/CLI.test.ts -t "no-input compile"',
    "bun run check",
  ];
  if (
    rootBuildNoInputCommands.length !==
      expectedRootBuildNoInputCommands.length ||
    !expectedRootBuildNoInputCommands.every(
      (command, index) => rootBuildNoInputCommands[index] === command,
    )
  ) {
    throw new Error(
      [
        `${ciTriageRootBuildNoInputLabel} reported unexpected payload:`,
        "expected root build no-input commands:",
        ...expectedRootBuildNoInputCommands.map((command) => `- ${command}`),
        "actual root build no-input commands:",
        ...rootBuildNoInputCommands.map((command) => `- ${command}`),
        `report:\n${JSON.stringify(ciTriageReport, null, 2)}`,
      ].join("\n"),
    );
  }

  const ciTriageTimeoutLabel =
    "check packed npm CLI CI triage timeout JSON";
  const packageTimeoutCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "Package timeout metadata",
    )?.localCommands ?? [];
  const expectedPackageTimeoutCommands = [
    "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
    'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
    "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
  ];
  const missingPackageTimeoutCommands = expectedPackageTimeoutCommands.filter(
    (command) => !packageTimeoutCommands.includes(command),
  );
  if (missingPackageTimeoutCommands.length > 0) {
    throw new Error(
      [
        `${ciTriageTimeoutLabel} reported unexpected payload:`,
        "missing timeout commands:",
        ...missingPackageTimeoutCommands.map((command) => `- ${command}`),
        `report:\n${JSON.stringify(ciTriageReport, null, 2)}`,
      ].join("\n"),
    );
  }
  const cliJsonTimeoutCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "CLI JSON timeout metadata",
    )?.localCommands ?? [];
  const expectedCliJsonTimeoutCommands = [
    'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|missing explicit std imports"',
    "bun test tests/CLIJsonParseability.test.ts",
    "bun run check",
  ];
  const missingCliJsonTimeoutCommands = expectedCliJsonTimeoutCommands.filter(
    (command) => !cliJsonTimeoutCommands.includes(command),
  );
  if (missingCliJsonTimeoutCommands.length > 0) {
    throw new Error(
      [
        `${ciTriageTimeoutLabel} reported unexpected payload:`,
        "missing CLI JSON timeout commands:",
        ...missingCliJsonTimeoutCommands.map((command) => `- ${command}`),
        `report:\n${JSON.stringify(ciTriageReport, null, 2)}`,
      ].join("\n"),
    );
  }

  const ciTriageSanitizerLabel =
    "check packed npm CLI CI triage sanitizer JSON";
  const sanitizerCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "Sanitizer timeout metadata",
    )?.localCommands ?? [];
  const expectedSanitizerCommands = [
    "bun run test:sanitizers",
    "bun test tests/CompilerSanitizerRuntime.test.ts",
    "bun index.ts doctor sanitizer --json",
  ];
  const missingSanitizerCommands = expectedSanitizerCommands.filter(
    (command) => !sanitizerCommands.includes(command),
  );
  if (missingSanitizerCommands.length > 0) {
    throw new Error(
      [
        `${ciTriageSanitizerLabel} reported unexpected payload:`,
        "missing sanitizer commands:",
        ...missingSanitizerCommands.map((command) => `- ${command}`),
        `report:\n${JSON.stringify(ciTriageReport, null, 2)}`,
      ].join("\n"),
    );
  }

  const ciTriageCodeMappingLabel =
    "check packed npm CLI CI triage JSON-code mappings";
  console.log(`release smoke: ${ciTriageCodeMappingLabel}`);
  const packageArchiveCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "Package archive JSON code mapping",
    )?.localCommands ?? [];
  const wasmLinkerCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "Wasm linker JSON code mapping",
    )?.localCommands ?? [];
  const explicitStdImportCommands =
    ciTriageReport.summary.failedJobs.find(
      (job) => job.name === "Explicit std import JSON code mapping",
    )?.localCommands ?? [];
  const expectedPackageArchiveCommands = [
    'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
    "bun test tests/PackageJsonFailureContracts.test.ts",
    'bun test tests/PackageManagerCLI.test.ts -t "install command|doctor packages command"',
  ];
  const expectedWasmLinkerCommands = [
    "bun run test:wasm",
    "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
    "bun index.ts doctor --json",
  ];
  const expectedExplicitStdImportCommands = [
    'bun test tests/ModuleResolver.test.ts -t "missing explicit std"',
    'bun test tests/CLI.test.ts -t "missing explicit std"',
    'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
    'bun test tests/MarkdownDocs.test.ts -t "std namespace isolation"',
  ];
  const missingCodeMappingCommands = [
    ...expectedPackageArchiveCommands.filter(
      (command) => !packageArchiveCommands.includes(command),
    ),
    ...expectedWasmLinkerCommands.filter(
      (command) => !wasmLinkerCommands.includes(command),
    ),
    ...expectedExplicitStdImportCommands.filter(
      (command) => !explicitStdImportCommands.includes(command),
    ),
  ];
  if (missingCodeMappingCommands.length > 0) {
    throw new Error(
      [
        `${ciTriageCodeMappingLabel} reported unexpected payload:`,
        "missing JSON-code mapping commands:",
        ...missingCodeMappingCommands.map((command) => `- ${command}`),
        `report:\n${JSON.stringify(ciTriageReport, null, 2)}`,
      ].join("\n"),
    );
  }

  runExpectedFailureStep(
    "check packed npm CLI CI triage usage errors",
    "npm",
    ["run", "ci:triage", "--", "--repo", "--run", "26695335269"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "Missing value for --repo",
      forbiddenOutputIncludes: ["GitHub API", "api.github.com"],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI CI triage flag value usage errors",
    "npm",
    ["run", "ci:triage", "--", "--json=true", "26695335269"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "--json does not accept a value",
      forbiddenOutputIncludes: ["GitHub API", "api.github.com"],
    },
  );

  runExpectedFailureStep(
    "check packed npm CLI CI triage empty value usage errors",
    "npm",
    ["run", "ci:triage", "--", "--jobs-json=", "26695335269"],
    {
      cwd: packageDir,
      bplHome: null,
      expectedStatus: 2,
      expectedStderrIncludes: "Missing value for --jobs-json",
      forbiddenOutputIncludes: ["GitHub API", "api.github.com"],
    },
  );
}

function assertBuiltBinary(): void {
  assertStandaloneCompilerArtifact(bplBinary);
}

export function assertStandaloneCompilerArtifact(binaryPath: string): void {
  const linkStats = tryLstat(binaryPath);
  if (!linkStats) {
    throw new Error(`Standalone compiler was not built at ${binaryPath}`);
  }

  if (linkStats.isSymbolicLink()) {
    throw new Error(`Standalone compiler is a symbolic link: ${binaryPath}`);
  }

  const stats = statSync(binaryPath);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(
      `Standalone compiler is not a non-empty file: ${binaryPath}`,
    );
  }
}

export function discoverDedicatedWasmExampleFiles(sourceRoot: string): string[] {
  const examplesDir = join(sourceRoot, "examples");
  const exampleNames = readdirSync(examplesDir).sort();
  const files: string[] = [];

  for (const exampleName of exampleNames) {
    if (!exampleName.startsWith("wasm_")) {
      continue;
    }

    const exampleDir = join(examplesDir, exampleName);
    const exampleStats = tryLstat(exampleDir);
    if (!exampleStats?.isDirectory()) {
      continue;
    }

    const mainFile = join(exampleDir, "main.bpl");
    const mainStats = tryLstat(mainFile);
    if (!mainStats?.isFile()) {
      continue;
    }

    for (const fileName of DEDICATED_WASM_EXAMPLE_FILES) {
      const filePath = join(exampleDir, fileName);
      const stats = tryLstat(filePath);
      const relativePath = `examples/${exampleName}/${fileName}`;
      if (!stats?.isFile()) {
        throw new Error(
          `Dedicated wasm example release file is missing or not a file: ${relativePath}`,
        );
      }
      files.push(relativePath);
    }
  }

  return files;
}

function tryLstat(filePath: string) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

function parseNpmPackEntry(stdout: string): NpmPackEntry {
  try {
    const entries = JSON.parse(stdout) as NpmPackEntry[];
    const entry = entries[0];
    if (!Array.isArray(entries) || !entry?.filename) {
      throw new Error("missing filename in npm pack JSON");
    }

    return entry;
  } catch (error) {
    throw new Error(
      [
        "npm pack did not print valid JSON metadata.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function assertPackedMetadata(packEntry: NpmPackEntry): void {
  console.log("release smoke: validate packed npm metadata");

  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8"),
  ) as PackageJson;

  if (packEntry.name !== packageJson.name) {
    throw new Error(
      `npm pack name mismatch: expected ${packageJson.name}, got ${packEntry.name}`,
    );
  }
  if (packEntry.version !== packageJson.version) {
    throw new Error(
      `npm pack version mismatch: expected ${packageJson.version}, got ${packEntry.version}`,
    );
  }
  if (!packEntry.filename.endsWith(".tgz")) {
    throw new Error(
      `npm pack filename is not a tarball: ${packEntry.filename}`,
    );
  }
  if (!packEntry.integrity || !packEntry.shasum) {
    throw new Error("npm pack metadata is missing integrity or shasum.");
  }
  if ((packEntry.size ?? 0) <= 0 || (packEntry.unpackedSize ?? 0) <= 0) {
    throw new Error("npm pack metadata reports an empty package.");
  }
  if (packageJson.bin.bpl !== "./bpl") {
    throw new Error("package.json bin.bpl must point at ./bpl.");
  }
}

function assertPackedFiles(
  packEntry: NpmPackEntry,
  expectedFiles: string[],
): void {
  const packedPaths = new Set(packEntry.files?.map((file) => file.path));
  if (packedPaths.size === 0) {
    throw new Error("npm pack metadata did not report packed files.");
  }

  const missing = expectedFiles.filter(
    (file) => !packedPaths.has(file) && !packedPaths.has(`package/${file}`),
  );
  if (missing.length > 0) {
    throw new Error(
      [
        "npm tarball is missing required release files:",
        ...missing.map((file) => `- ${file}`),
      ].join("\n"),
    );
  }
}

function assertSourceOnlyFiles(
  packEntry: NpmPackEntry,
  sourceOnlyFiles: string[],
): void {
  console.log("release smoke: validate source-only release files");

  const packedPaths = new Set(packEntry.files?.map((file) => file.path));
  const missingFromSource = sourceOnlyFiles.filter(
    (filePath) => !existsSync(join(repoRoot, filePath)),
  );
  if (missingFromSource.length > 0) {
    throw new Error(
      [
        "Source tree is missing required source-only files:",
        ...missingFromSource.map((filePath) => `- ${filePath}`),
      ].join("\n"),
    );
  }

  const unexpectedlyPacked = sourceOnlyFiles.filter(
    (filePath) =>
      packedPaths.has(filePath) || packedPaths.has(`package/${filePath}`),
  );
  if (unexpectedlyPacked.length > 0) {
    throw new Error(
      [
        "npm tarball includes source-only files:",
        ...unexpectedlyPacked.map((filePath) => `- ${filePath}`),
      ].join("\n"),
    );
  }
}

function assertPackedFileAllowlist(
  packEntry: NpmPackEntry,
  packageHelperFiles: string[],
  packageHelperDependencyFiles: string[],
): void {
  console.log("release smoke: validate packed npm file allowlist");

  const allowedPaths = [
    "bpl",
    "bpl-wrapper.sh",
    "cli/index.d.ts",
    "cli/index.js",
    "package.json",
    "README.md",
    "LICENSE",
    ...packageHelperFiles,
    ...packageHelperDependencyFiles,
  ];
  const allowedPrefixes = [
    "completions/",
    "docs/",
    "examples/",
    "grammar/",
    "lib/",
  ];
  const forbiddenPrefixes = [
    ".github/",
    ".worktrees/",
    "benchmark/",
    "compiler/",
    "fuzz/",
    "node_modules/",
    "playground/",
    "tests/",
    "vscode-ext/",
  ];

  const packedPaths = packEntry.files?.map((file) => file.path) ?? [];
  const forbidden = packedPaths.filter(
    (filePath) =>
      !allowedPaths.includes(filePath) &&
      forbiddenPrefixes.some((prefix) => filePath.startsWith(prefix)),
  );
  if (forbidden.length > 0) {
    throw new Error(
      [
        "npm tarball includes development-only paths:",
        ...forbidden.map((filePath) => `- ${filePath}`),
      ].join("\n"),
    );
  }

  const unexpected = packedPaths.filter(
    (filePath) =>
      !allowedPaths.includes(filePath) &&
      !allowedPrefixes.some((prefix) => filePath.startsWith(prefix)),
  );
  if (unexpected.length > 0) {
    throw new Error(
      [
        "npm tarball includes paths outside the release allowlist:",
        ...unexpected.map((filePath) => `- ${filePath}`),
      ].join("\n"),
    );
  }
}

function assertOutputContains(output: string, expected: string[]): void {
  const missing = expected.filter((item) => !output.includes(item));
  if (missing.length > 0) {
    throw new Error(
      [
        "Command output is missing expected text:",
        ...missing.map((item) => `- ${item}`),
        `stdout:\n${output}`,
      ].join("\n"),
    );
  }
}

function parseDoctorReport(stdout: string): DoctorReport {
  try {
    const report = JSON.parse(stdout) as DoctorReport;
    assertJsonReportContract(report, "toolchain", "doctor");
    return report;
  } catch (error) {
    throw new Error(
      [
        "Standalone doctor did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseVersionReport(stdout: string): VersionReport {
  try {
    const report = JSON.parse(stdout) as VersionReport;
    assertJsonReportContract(report, "version", "version");
    if (typeof report.version !== "string") {
      throw new Error("version is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Version command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

export function assertWasmDoctorUnavailableContract(report: unknown): void {
  const checks = (report as { checks?: unknown }).checks;
  if (!Array.isArray(checks)) {
    throw new Error("doctor report checks is not an array");
  }

  const wasmLinkerCheck = checks.find(
    (check): check is DoctorToolchainCheck =>
      typeof check === "object" &&
      check !== null &&
      (check as { name?: unknown }).name === "wasm linker",
  );
  if (!wasmLinkerCheck) {
    throw new Error("doctor report missing wasm linker check");
  }
  if (wasmLinkerCheck.ok) {
    return;
  }

  if (wasmLinkerCheck.code !== "BPL_WASM_LINKER_UNAVAILABLE") {
    throw new Error("wasm linker check missing BPL_WASM_LINKER_UNAVAILABLE code");
  }
  if (
    !Array.isArray(wasmLinkerCheck.candidates) ||
    wasmLinkerCheck.candidates.length === 0
  ) {
    throw new Error("wasm linker check missing checked candidates");
  }
  if (
    !wasmLinkerCheck.environment ||
    !("WASM_LD" in wasmLinkerCheck.environment) ||
    !("BPL_REQUIRE_WASM_LD" in wasmLinkerCheck.environment)
  ) {
    throw new Error("wasm linker check missing environment values");
  }
  if (
    !Array.isArray(wasmLinkerCheck.recommendedCommands) ||
    !wasmLinkerCheck.recommendedCommands.includes(
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
    )
  ) {
    throw new Error("wasm linker check missing required-linker repro command");
  }
  if (
    typeof wasmLinkerCheck.hint !== "string" ||
    !wasmLinkerCheck.hint.includes("not a successful wasm execution")
  ) {
    throw new Error("wasm linker check missing non-execution hint");
  }
}

export function assertSanitizerDoctorContract(report: unknown): void {
  const checks = (report as { checks?: unknown }).checks;
  if (!Array.isArray(checks)) {
    throw new Error("doctor sanitizer report checks is not an array");
  }

  const sanitizerChecks = checks.filter(
    (check): check is DoctorToolchainCheck =>
      typeof check === "object" &&
      check !== null &&
      (check as { name?: unknown }).name === "sanitizer runtime support",
  );
  if (sanitizerChecks.length !== 1) {
    throw new Error("doctor sanitizer report must contain exactly one check");
  }

  const sanitizerCheck = sanitizerChecks[0]!;
  if (sanitizerCheck.id !== "sanitizer-runtime-support") {
    throw new Error("sanitizer check missing stable id");
  }
  if (sanitizerCheck.required !== false) {
    throw new Error("sanitizer check must remain optional");
  }
  if (
    !sanitizerCheck.environment ||
    !("BPL_CC" in sanitizerCheck.environment) ||
    !("CC" in sanitizerCheck.environment)
  ) {
    throw new Error("sanitizer check missing compiler environment values");
  }

  if (sanitizerCheck.ok) {
    return;
  }

  if (sanitizerCheck.code !== "BPL_SANITIZER_RUNTIME_UNAVAILABLE") {
    throw new Error(
      "sanitizer check missing BPL_SANITIZER_RUNTIME_UNAVAILABLE code",
    );
  }

  const recommendedCommands = sanitizerCheck.recommendedCommands ?? [];
  for (const command of [
    "bun run test:sanitizers",
    "bun test tests/CompilerSanitizerRuntime.test.ts",
  ]) {
    if (!recommendedCommands.includes(command)) {
      throw new Error(`sanitizer check missing repro command: ${command}`);
    }
  }

  if (
    typeof sanitizerCheck.hint !== "string" ||
    !sanitizerCheck.hint.includes("compiler-rt") ||
    !sanitizerCheck.hint.includes("ASan/UBSan")
  ) {
    throw new Error("sanitizer check missing compiler-rt guidance");
  }
}

function parseDoctorFailureReport(stdout: string): DoctorFailureReport {
  try {
    const report = JSON.parse(stdout) as DoctorFailureReport;
    assertJsonReportContract(report, "doctor", "doctor failure");
    if (typeof report.error !== "string") {
      throw new Error("doctor failure error is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Doctor failure did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageDoctorReport(stdout: string): PackageDoctorReport {
  try {
    const report = JSON.parse(stdout) as PackageDoctorReport;
    assertJsonReportContract(report, "packages", "package doctor");
    assertJsonReportContract(
      report.cacheVerification,
      "package-cache-verify",
      "package doctor cache verification",
    );
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package doctor did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageInstallReport(stdout: string): PackageInstallReport {
  try {
    const report = JSON.parse(stdout) as PackageInstallReport;
    assertJsonReportContract(report, "package-install", "package install");
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package install did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackagePackReport(stdout: string): PackagePackReport {
  try {
    const report = JSON.parse(stdout) as PackagePackReport;
    assertJsonReportContract(report, "package-pack", "package pack");
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package pack did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageInitReport(stdout: string): PackageInitReport {
  try {
    const report = JSON.parse(stdout) as PackageInitReport;
    assertJsonReportContract(report, "package-init", "package init");
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package init did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseProjectNewReport(stdout: string): ProjectNewReport {
  try {
    const report = JSON.parse(stdout) as ProjectNewReport;
    assertJsonReportContract(report, "project-new", "project new");
    return report;
  } catch (error) {
    throw new Error(
      [
        "Project new did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageUninstallReport(stdout: string): PackageUninstallReport {
  try {
    const report = JSON.parse(stdout) as PackageUninstallReport;
    assertJsonReportContract(
      report,
      "package-uninstall",
      "package uninstall",
    );
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package uninstall did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageListReport(stdout: string): PackageListReport {
  try {
    const report = JSON.parse(stdout) as PackageListReport;
    assertJsonReportContract(report, "package-list", "package list");
    if (!Array.isArray(report.packages)) {
      throw new Error("package list packages is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package list did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageListTreeReport(stdout: string): PackageListTreeReport {
  try {
    const report = JSON.parse(stdout) as PackageListTreeReport;
    assertJsonReportContract(
      report,
      "package-list-tree",
      "package list tree",
    );
    if (!Array.isArray(report.tree)) {
      throw new Error("package list tree is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package list tree did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageCacheListReport(stdout: string): PackageCacheListReport {
  try {
    const report = JSON.parse(stdout) as PackageCacheListReport;
    assertJsonReportContract(
      report,
      "package-cache-list",
      "package-cache list",
    );
    if (!Array.isArray(report.entries)) {
      throw new Error("package-cache list entries is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package-cache list did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageCacheVerifyReport(stdout: string): PackageCacheVerifyReport {
  try {
    const report = JSON.parse(stdout) as PackageCacheVerifyReport;
    assertJsonReportContract(
      report,
      "package-cache-verify",
      "package-cache verify",
    );
    if (!Array.isArray(report.issues)) {
      throw new Error("package-cache verify issues is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package-cache verify did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageCacheCleanReport(stdout: string): PackageCacheCleanReport {
  try {
    const report = JSON.parse(stdout) as PackageCacheCleanReport;
    assertJsonReportContract(
      report,
      "package-cache-clean",
      "package-cache clean",
    );
    if (!Array.isArray(report.removed)) {
      throw new Error("package-cache clean removed is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package-cache clean did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parsePackageCacheRepairReport(stdout: string): PackageCacheRepairReport {
  try {
    const report = JSON.parse(stdout) as PackageCacheRepairReport;
    assertJsonReportContract(
      report,
      "package-cache-repair",
      "package-cache repair",
    );
    if (!Array.isArray(report.repaired)) {
      throw new Error("package-cache repair repaired is not an array");
    }
    if (!Array.isArray(report.unchanged)) {
      throw new Error("package-cache repair unchanged is not an array");
    }
    if (!Array.isArray(report.issues)) {
      throw new Error("package-cache repair issues is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Package-cache repair did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseCheckReport(stdout: string): CheckReport {
  try {
    const report = JSON.parse(stdout) as CheckReport;
    assertJsonReportContract(report, "check", "check");
    if (!Array.isArray(report.files)) {
      throw new Error("check files is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Check command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseLintReport(stdout: string): LintReport {
  try {
    const report = JSON.parse(stdout) as LintReport;
    assertJsonReportContract(report, "lint", "lint");
    if (!Array.isArray(report.files)) {
      throw new Error("lint files is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Lint command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseFormatReport(stdout: string): FormatReport {
  try {
    const report = JSON.parse(stdout) as FormatReport;
    assertJsonReportContract(report, "format", "format");
    if (report.mode !== "check") {
      throw new Error("format mode is not check");
    }
    if (!Array.isArray(report.files)) {
      throw new Error("format files is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Format command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseBindgenReport(stdout: string): BindgenReport {
  try {
    const report = JSON.parse(stdout) as BindgenReport;
    assertJsonReportContract(report, "bindgen", "bindgen");
    if (typeof report.header !== "string") {
      throw new Error("bindgen header is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Bindgen command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseDocsReport(stdout: string): DocsReport {
  try {
    const report = JSON.parse(stdout) as DocsReport;
    assertJsonReportContract(report, "docs", "docs");
    if (typeof report.file !== "string") {
      throw new Error("docs file is not a string");
    }
    if (typeof report.outputPath !== "string") {
      throw new Error("docs outputPath is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Docs command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseCompletionReport(stdout: string): CompletionReport {
  try {
    const report = JSON.parse(stdout) as CompletionReport;
    assertJsonReportContract(report, "completion", "completion");
    if (typeof report.shell !== "string") {
      throw new Error("completion shell is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Completion command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseRunScriptListReport(stdout: string): RunScriptListReport {
  try {
    const report = JSON.parse(stdout) as RunScriptListReport;
    assertJsonReportContract(report, "run-script-list", "run-script list");
    if (!Array.isArray(report.scripts)) {
      throw new Error("run-script list scripts is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Run-script list did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseRunScriptFailureReport(stdout: string): RunScriptFailureReport {
  try {
    const report = JSON.parse(stdout) as RunScriptFailureReport;
    assertJsonReportContract(report, "run-script-list", "run-script failure");
    if (typeof report.error !== "string") {
      throw new Error("run-script failure error is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Run-script failure did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseBuildReport(stdout: string): BuildReport {
  try {
    const report = JSON.parse(stdout) as BuildReport;
    assertJsonReportContract(report, "build", "build");
    return report;
  } catch (error) {
    throw new Error(
      [
        "Build command did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseBuildFailureReport(stdout: string): BuildFailureReport {
  try {
    const report = JSON.parse(stdout) as BuildFailureReport;
    assertJsonReportContract(report, "build", "build failure");
    if (typeof report.error !== "string") {
      throw new Error("build failure error is not a string");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Build failure did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseCleanFailureReport(stdout: string): CleanFailureReport {
  try {
    const report = JSON.parse(stdout) as CleanFailureReport;
    assertJsonReportContract(report, "clean", "clean failure");
    if (typeof report.error !== "string") {
      throw new Error("clean failure error is not a string");
    }
    if (!Array.isArray(report.entries)) {
      throw new Error("clean failure entries is not an array");
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Clean failure did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseFuzzArtifactReproPlan(stdout: string): FuzzArtifactReproPlan {
  try {
    const report = JSON.parse(stdout) as FuzzArtifactReproPlan;
    if (
      report.schemaVersion !== 1 ||
      typeof report.inputPath !== "string" ||
      !Array.isArray(report.entries)
    ) {
      throw new Error(
        `fuzz artifact repro JSON contract mismatch: ${JSON.stringify(
          {
            schemaVersion: report.schemaVersion,
            inputPath: report.inputPath,
            entries: Array.isArray(report.entries)
              ? report.entries.length
              : typeof report.entries,
          },
          null,
          2,
        )}`,
      );
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "Fuzz artifact repro did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function parseCiTriageReport(stdout: string): CiTriageReport {
  try {
    const report = JSON.parse(stdout) as CiTriageReport;
    assertJsonReportContract(report, "ci-triage", "CI triage");
    if (
      typeof report.run?.id !== "number" ||
      typeof report.run.headSha !== "string" ||
      !["current", "stale", "unknown"].includes(report.checkout?.status) ||
      !Array.isArray(report.summary?.missingJobIds) ||
      !Array.isArray(report.summary.failedJobs)
    ) {
      throw new Error(
        `ci:triage JSON contract mismatch: ${JSON.stringify(
          {
            run: report.run,
            checkout: report.checkout,
            summary: report.summary,
          },
          null,
          2,
        )}`,
      );
    }
    return report;
  } catch (error) {
    throw new Error(
      [
        "CI triage helper did not print valid JSON.",
        `stdout:\n${stdout}`,
        `parse error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

function assertJsonReportContract(
  report: { schemaVersion?: unknown; check?: unknown; success?: unknown },
  expectedCheck: string,
  label: string,
): void {
  if (
    report.schemaVersion !== 1 ||
    report.check !== expectedCheck ||
    typeof report.success !== "boolean"
  ) {
    throw new Error(
      `${label} JSON contract mismatch: ${JSON.stringify(
        {
          schemaVersion: report.schemaVersion,
          check: report.check,
          success: report.success,
        },
        null,
        2,
      )}`,
    );
  }
}

function assertJsonValueHasNoAnsi(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    const match = ANSI_ESCAPE_PATTERN.exec(value);
    if (match) {
      throw new Error(
        `JSON string at ${path} contains ANSI escape sequence ${JSON.stringify(
          match[0],
        )}`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValueHasNoAnsi(item, `${path}[${index}]`),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, childValue] of Object.entries(value)) {
      assertJsonValueHasNoAnsi(childValue, `${path}.${key}`);
    }
  }
}

function runStep(
  label: string,
  command: string,
  args: string[],
  options: RunStepOptions = {},
) {
  console.log(`release smoke: ${label}`);

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf-8",
    env: buildStepEnv(options),
    timeout: smokeTimeoutMs,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `Release smoke step failed: ${label}`,
        `command: ${[command, ...args].join(" ")}`,
        `cwd: ${options.cwd ?? repoRoot}`,
        `exit: ${result.status ?? "unknown"}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }

  return result;
}

function runJsonFailureStep(
  label: string,
  command: string,
  args: string[],
  options: RunStepOptions & { expectedStatus: number },
) {
  console.log(`release smoke: ${label}`);

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf-8",
    env: buildStepEnv(options),
    timeout: smokeTimeoutMs,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== options.expectedStatus) {
    throw new Error(
      [
        `Release smoke JSON failure step did not fail as expected: ${label}`,
        `command: ${[command, ...args].join(" ")}`,
        `cwd: ${options.cwd ?? repoRoot}`,
        `exit: ${result.status ?? "unknown"}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }

  if (result.stderr !== "") {
    throw new Error(
      [
        `Release smoke JSON failure step wrote stderr: ${label}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }

  return result;
}

function runExpectedFailureStep(
  label: string,
  command: string,
  args: string[],
  options: ExpectedFailureStepOptions,
): void {
  console.log(`release smoke: ${label}`);

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf-8",
    env: buildStepEnv(options),
    timeout: smokeTimeoutMs,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== options.expectedStatus) {
    throw new Error(
      [
        `Release smoke expected-failure step did not fail as expected: ${label}`,
        `command: ${[command, ...args].join(" ")}`,
        `cwd: ${options.cwd ?? repoRoot}`,
        `exit: ${result.status ?? "unknown"}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }

  if (!result.stderr.includes(options.expectedStderrIncludes)) {
    throw new Error(
      [
        `Release smoke expected-failure step missed stderr marker: ${label}`,
        `expected stderr to include: ${options.expectedStderrIncludes}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }

  for (const forbidden of options.forbiddenOutputIncludes ?? []) {
    if (result.stdout.includes(forbidden) || result.stderr.includes(forbidden)) {
      throw new Error(
        [
          `Release smoke expected-failure step emitted forbidden marker: ${label}`,
          `forbidden marker: ${forbidden}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
  }
}

function buildStepEnv(options: RunStepOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
  };

  if (options.bplHome === null) {
    env.BPL_HOME = undefined;
  } else {
    env.BPL_HOME = options.bplHome ?? repoRoot;
  }
  Object.assign(env, options.env);

  return env;
}

function writeNodeCommandShim(basePath: string, sourceLines: string[]): string {
  if (process.platform === "win32") {
    const scriptPath = `${basePath}.js`;
    const commandPath = `${basePath}.cmd`;
    writeFileSync(scriptPath, sourceLines.join("\n"));
    writeFileSync(
      commandPath,
      `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
    );
    return commandPath;
  }

  writeFileSync(basePath, ["#!/usr/bin/env node", ...sourceLines].join("\n"));
  chmodSync(basePath, 0o755);
  return basePath;
}

if (import.meta.main) {
  try {
    runReleaseSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
