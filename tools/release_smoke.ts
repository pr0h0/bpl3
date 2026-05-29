import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

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
  files?: Array<{ path: string }>;
}

interface RunStepOptions {
  cwd?: string;
  bplHome?: string | null;
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
    assertPackedFiles(packEntry, [
      "bpl",
      "package.json",
      "README.md",
      "LICENSE",
      "grammar/grammar.bpl",
      "lib/runtime.ll",
      "lib/runtime_support.o",
    ]);

    const tarballPath = join(tempDir, packEntry.filename);
    if (!existsSync(tarballPath)) {
      throw new Error(`npm pack did not create ${tarballPath}`);
    }

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

    runTinyProgramSmoke("packed npm CLI", installedBpl, { bplHome: null });
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
