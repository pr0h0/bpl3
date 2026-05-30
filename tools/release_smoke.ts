import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { writeReleaseManifest } from "./release_manifest";

const repoRoot = resolve(import.meta.dir, "..");
const bplBinary = join(
  repoRoot,
  process.platform === "win32" ? "bpl.exe" : "bpl",
);
const smokeTimeoutMs = 60 * 1000;

interface DoctorReport {
  success: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
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
}

interface PackageJson {
  name: string;
  version: string;
  license: string;
  bin: Record<string, string>;
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
      "examples/wasm_control_flow/main.bpl",
      "examples/wasm_control_flow/test_config.json",
      "examples/wasm_hosted_io/main.bpl",
      "examples/wasm_hosted_io/test_config.json",
      "examples/wasm_lambdas_generics/main.bpl",
      "examples/wasm_lambdas_generics/test_config.json",
      "examples/wasm_memory_intrinsics/main.bpl",
      "examples/wasm_memory_intrinsics/test_config.json",
      "examples/wasm_memory_strings/main.bpl",
      "examples/wasm_memory_strings/test_config.json",
      "examples/wasm_stdlib_array/main.bpl",
      "examples/wasm_stdlib_array/test_config.json",
      "examples/wasm_stdlib_bitset/main.bpl",
      "examples/wasm_stdlib_bitset/test_config.json",
      "grammar/grammar.bpl",
      "lib/runtime.ll",
      "lib/runtime_wasm.ll",
      "lib/runtime_wasm_host.ll",
      "lib/runtime_support.o",
    ]);
    assertSourceOnlyFiles(packEntry, [
      "playground/examples/70-browser-wasm-showcase.json",
    ]);
    assertPackedFileAllowlist(packEntry);

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
    assertReleaseManifest(releaseManifest);

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
      "check packed npm CLI doctor",
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

    runCompletionSmoke(installedBpl, installDir);
    runLibraryTemplateSmoke(installedBpl, installDir);
    runTinyProgramSmoke("packed npm CLI", installedBpl, { bplHome: null });
    runPackedWasmSmoke(installedBpl);
    runPackedCacheStatsSmoke(installedBpl);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertReleaseManifest(manifest: {
  schemaVersion: number;
  artifacts: Array<{
    path: string;
    bytes: number;
    sha256: string;
    npmIntegrity?: string;
    npmShasum?: string;
  }>;
}): void {
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

function assertBuiltBinary(): void {
  if (!existsSync(bplBinary)) {
    throw new Error(`Standalone compiler was not built at ${bplBinary}`);
  }

  const stats = statSync(bplBinary);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(
      `Standalone compiler is not a non-empty file: ${bplBinary}`,
    );
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

function assertPackedFileAllowlist(packEntry: NpmPackEntry): void {
  console.log("release smoke: validate packed npm file allowlist");

  const allowedPaths = [
    "bpl",
    "bpl-wrapper.sh",
    "package.json",
    "README.md",
    "LICENSE",
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
    "tools/",
    "vscode-ext/",
  ];

  const packedPaths = packEntry.files?.map((file) => file.path) ?? [];
  const forbidden = packedPaths.filter((filePath) =>
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
    return JSON.parse(stdout) as DoctorReport;
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

function runStep(
  label: string,
  command: string,
  args: string[],
  options: RunStepOptions = {},
) {
  console.log(`release smoke: ${label}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
  };

  if (options.bplHome === null) {
    env.BPL_HOME = undefined;
  } else {
    env.BPL_HOME = options.bplHome ?? repoRoot;
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf-8",
    env,
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

if (import.meta.main) {
  try {
    runReleaseSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
