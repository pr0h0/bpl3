import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const BPL_CLI = resolve(import.meta.dir, "../../index.ts");

export interface SpecDiagnosticCase {
  /** Unique file-name-safe case name. */
  name: string;
  /** A complete program; it must fail `bpl check`. */
  source: string;
  /** Required diagnostic code, when the diagnostic has one. */
  code?: string;
  /** Required substring of the diagnostic message. */
  message?: string;
  severity?: "error" | "warning";
}

interface JsonDiagnostic {
  severity?: string;
  code?: string;
  message?: string;
}

interface JsonCheckReport {
  files: { file: string; diagnostics?: JsonDiagnostic[] }[];
}

/**
 * Checks every case with one `bpl check --json` process and requires each
 * program to report a matching diagnostic.
 */
export function expectCheckDiagnostics(cases: SpecDiagnosticCase[]): void {
  const directory = mkdtempSync(join(tmpdir(), "bpl-spec-check-"));
  try {
    const names = new Set<string>();
    for (const testCase of cases) {
      if (!/^[\w-]+$/.test(testCase.name) || names.has(testCase.name)) {
        throw new Error(`Invalid or duplicate case name: ${testCase.name}`);
      }
      names.add(testCase.name);
      writeFileSync(join(directory, `${testCase.name}.bpl`), testCase.source);
    }

    const result = spawnSync(
      process.execPath,
      [
        BPL_CLI,
        "check",
        ...cases.map((testCase) => `${testCase.name}.bpl`),
        "--json",
      ],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (result.error) throw result.error;

    const report = JSON.parse(result.stdout) as JsonCheckReport;
    const failures: string[] = [];
    for (const testCase of cases) {
      const file = report.files.find(
        (candidate) => candidate.file === `${testCase.name}.bpl`,
      );
      const diagnostics = file?.diagnostics ?? [];
      const severity = testCase.severity ?? "error";
      const matched = diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === severity &&
          (testCase.code === undefined || diagnostic.code === testCase.code) &&
          (testCase.message === undefined ||
            (diagnostic.message ?? "").includes(testCase.message)),
      );
      if (!matched) {
        failures.push(
          `${testCase.name}: expected ${severity} ${testCase.code ?? ""} ${
            testCase.message ?? ""
          }; got ${JSON.stringify(diagnostics)}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export interface SpecRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Writes sibling module files and runs the entry file with `bpl run`. */
export function runSpecModules(
  files: Record<string, string>,
  entry: string,
  optimizationLevel: 0 | 3,
): SpecRunResult {
  const directory = mkdtempSync(join(tmpdir(), "bpl-spec-modules-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(directory, name), source);
    }
    const result = spawnSync(
      process.execPath,
      [BPL_CLI, "run", entry, "-O", String(optimizationLevel)],
      { cwd: directory, encoding: "utf8", timeout: 120000 },
    );
    if (result.error) throw result.error;
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? -1,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
