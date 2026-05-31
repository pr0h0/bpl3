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
    runPackedPackageUninstallJsonSmoke(installedBpl);
    runPackedPackageManifestValidationJsonSmoke(installedBpl);
    runPackedPackageListJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheListJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheVerifyJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheValidationJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheNameValidationJsonSmoke(installedBpl, installDir);
    runPackedLockedInstallSafetySmoke(installedBpl);
    runPackedPackageImportDiagnosticCodeSmoke(installedBpl);
    runPackedCheckJsonSmoke(installedBpl);
    runPackedLintJsonSmoke(installedBpl);
    runPackedSourceAnalysisValidationJsonSmoke(installedBpl);
    runPackedSourceAnalysisNoInputJsonSmoke(installedBpl);
    runCompletionSmoke(installedBpl, installDir);
    runLibraryTemplateSmoke(installedBpl, installDir);
    runPackedRunScriptListJsonSmoke(installedBpl);
    runPackedRunScriptFailureJsonSmoke(installedBpl);
    runTinyProgramSmoke("packed npm CLI", installedBpl, { bplHome: null });
    runPackedBuildJsonSmoke(installedBpl);
    runPackedBuildValidationJsonSmoke(installedBpl);
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
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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
  const llvmPath = `${outputPath}.ll`;

  try {
    writeFileSync(
      join(tempDir, "main.bpl"),
      "frame main() ret int { return 0; }\n",
    );

    console.log("release smoke: check packed npm CLI build validation JSON");
    const result = spawnSync(
      installedBpl,
      ["build", "main.bpl", "--json", "--emit", "llvm", "-o", outputPath],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_HOME: undefined,
          NO_COLOR: "1",
        },
        timeout: smokeTimeoutMs,
      },
    );

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 1) {
      throw new Error(
        [
          "Packed npm CLI build validation smoke did not fail as expected.",
          `exit: ${result.status ?? "unknown"}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
    if (result.stderr !== "") {
      throw new Error(
        `Packed npm CLI build validation smoke wrote stderr:\n${result.stderr}`,
      );
    }

    const report = parseBuildFailureReport(result.stdout);
    if (
      report.success ||
      report.file !== "main.bpl" ||
      report.errorCode !== "BPL_BUILD_OUTPUT_PARENT_NOT_FOUND" ||
      !report.error.includes("Output directory not found") ||
      existsSync(llvmPath)
    ) {
      throw new Error(
        `Packed npm CLI build validation JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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
  if (
    ciTriageReport.run.headSha !==
      "1234567890abcdef1234567890abcdef12345678" ||
    ciTriageReport.checkout.status !== "unknown" ||
    ciTriageReport.checkout.reason !== "local checkout SHA unavailable" ||
    ciTriageReport.summary.missingJobIds.length !== 0 ||
    ciTriageReport.summary.failedJobs[0]?.localCommands[0] !==
      "bun run test:ci"
  ) {
    throw new Error(
      `Packed npm CLI CI triage JSON reported unexpected payload:\n${JSON.stringify(ciTriageReport, null, 2)}`,
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
