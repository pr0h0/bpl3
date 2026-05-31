import { spawnSync } from "child_process";
import {
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
import { join, resolve } from "path";
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
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

interface DoctorFailureReport {
  schemaVersion: 1;
  check: "doctor";
  success: boolean;
  error: string;
}

interface PackageDoctorReport {
  schemaVersion: 1;
  check: "packages";
  success: boolean;
  ok: boolean;
  cacheVerification: PackageCacheVerifyReport;
  issues: unknown[];
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
}

interface PackageCacheVerifyReport {
  schemaVersion: 1;
  check: "package-cache-verify";
  success: boolean;
  ok: boolean;
  entriesChecked: number;
  issues: unknown[];
}

interface CheckReport {
  schemaVersion: 1;
  check: "check";
  success: boolean;
  totalFiles: number;
  errorCount: number;
  files: Array<{
    file: string;
    success: boolean;
    diagnostics?: unknown[];
    error?: string;
  }>;
}

interface LintReport {
  schemaVersion: 1;
  check: "lint";
  success: boolean;
  totalFiles: number;
  errorCount: number;
  files: Array<{
    file: string;
    success: boolean;
    diagnostics?: Array<{ code?: unknown; severityLabel?: unknown }>;
    error?: string;
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
    runPackedPackageDoctorSmoke(installedBpl, installDir);
    runPackedPackageListJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheListJsonSmoke(installedBpl, installDir);
    runPackedPackageCacheVerifyJsonSmoke(installedBpl, installDir);
    runPackedLockedInstallSafetySmoke(installedBpl);
    runPackedCheckJsonSmoke(installedBpl);
    runPackedLintJsonSmoke(installedBpl);
    runCompletionSmoke(installedBpl, installDir);
    runLibraryTemplateSmoke(installedBpl, installDir);
    runPackedRunScriptListJsonSmoke(installedBpl);
    runPackedRunScriptFailureJsonSmoke(installedBpl);
    runTinyProgramSmoke("packed npm CLI", installedBpl, { bplHome: null });
    runPackedBuildJsonSmoke(installedBpl);
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
      !report.error.includes("No bpl.json found in current directory")
    ) {
      throw new Error(
        `Packed npm CLI run-script failure JSON reported unexpected payload:\n${JSON.stringify(report, null, 2)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runPackedPackageDoctorSmoke(installedBpl: string, installDir: string): void {
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

if (import.meta.main) {
  try {
    runReleaseSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
