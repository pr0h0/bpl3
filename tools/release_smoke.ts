import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "fs";
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

export function runReleaseSmoke(): void {
  runStep("build standalone compiler", "bun", ["run", "build"], repoRoot);
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

  runTinyProgramSmoke();

  console.log("release smoke passed");
}

function runTinyProgramSmoke(): void {
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
      "compile tiny program with standalone compiler",
      bplBinary,
      ["build", "main.bpl", "-o", outputPath],
      tempDir,
    );

    const program = runStep(
      "run tiny standalone-compiled program",
      outputPath,
      [],
      tempDir,
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
  cwd = repoRoot,
) {
  console.log(`release smoke: ${label}`);

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      BPL_HOME: repoRoot,
      NO_COLOR: "1",
    },
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
        `cwd: ${cwd}`,
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
