import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseJsonObjectStdout } from "./helpers/cliJson";

const BPL_CLI = path.join(process.cwd(), "index.ts");

function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): SpawnSyncReturns<string> {
  return spawnSync("bun", [BPL_CLI, ...args], {
    cwd: options.cwd,
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", ...options.env },
    input: options.input,
  });
}

describe("CLI JSON parseability", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-json-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("keeps representative successful JSON command stdout parseable", () => {
    const buildDir = path.join(tempDir, "build");
    fs.mkdirSync(buildDir);
    fs.writeFileSync(path.join(buildDir, "generated.o"), "object");
    const buildSource = path.join(tempDir, "main.bpl");
    const buildOutput = path.join(tempDir, "json-build-app");
    fs.writeFileSync(buildSource, "frame main() ret int { return 0; }\n");

    const doctor = runCli(["doctor", "--json"]);
    expect(doctor.status).toBe(0);
    expect(parseJsonObjectStdout(doctor)).toMatchObject({
      schemaVersion: 1,
      check: "toolchain",
      success: true,
    });

    const clean = runCli(["clean", "--dry-run", "--json"], { cwd: tempDir });
    expect(clean.status).toBe(0);
    expect(parseJsonObjectStdout(clean)).toMatchObject({
      dryRun: true,
      count: 1,
    });

    const build = runCli(["build", buildSource, "-o", buildOutput, "--json"]);
    expect(build.status).toBe(0);
    expect(parseJsonObjectStdout(build)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: true,
      file: buildSource,
      emit: "llvm",
      output: {
        llvm: `${buildOutput}.ll`,
        executable: buildOutput,
      },
    });

    const check = runCli(["check", "--json", buildSource]);
    expect(check.status).toBe(0);
    expect(parseJsonObjectStdout(check)).toMatchObject({
      schemaVersion: 1,
      check: "check",
      success: true,
      totalFiles: 1,
      errorCount: 0,
      files: [
        {
          file: buildSource,
          success: true,
        },
      ],
    });

    const lint = runCli(["lint", "--json", buildSource]);
    expect(lint.status).toBe(0);
    expect(parseJsonObjectStdout(lint)).toEqual({
      schemaVersion: 1,
      check: "lint",
      success: true,
      totalFiles: 1,
      errorCount: 0,
      files: [
        {
          file: buildSource,
          success: true,
          diagnostics: [],
        },
      ],
    });
  });

  test("keeps JSON-mode doctor scope failures parseable on stdout", () => {
    const result = runCli(["doctor", "unknown-scope", "--json"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parseJsonObjectStdout(result)).toMatchObject({
      schemaVersion: 1,
      check: "doctor",
      success: false,
      error: expect.stringContaining("Unknown doctor scope 'unknown-scope'"),
    });
  });

  test("keeps cached build JSON stdout parseable", () => {
    const helperSource = path.join(tempDir, "helper.bpl");
    const mainSource = path.join(tempDir, "cached-main.bpl");
    const outputFile = path.join(tempDir, "cached-json-app");

    fs.writeFileSync(
      helperSource,
      ["export value;", "frame value() ret int { return 42; }"].join("\n"),
    );
    fs.writeFileSync(
      mainSource,
      [
        'import value from "./helper.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    const result = runCli([
      "build",
      mainSource,
      "--cache",
      "--json",
      "-o",
      outputFile,
    ]);

    expect(result.status).toBe(0);
    expect(parseJsonObjectStdout(result)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: true,
      file: mainSource,
      cache: true,
      output: {
        executable: outputFile,
      },
    });
  });

  test("keeps package command JSON stdout parseable", () => {
    const list = runCli(["list", "--json"], { cwd: tempDir });
    expect(list.status).toBe(0);
    expect(parseJsonObjectStdout(list)).toMatchObject({
      schemaVersion: 1,
      check: "package-list",
      success: true,
      packages: [],
    });

    const listTree = runCli(["list", "--tree", "--json"], { cwd: tempDir });
    expect(listTree.status).toBe(0);
    expect(parseJsonObjectStdout(listTree)).toMatchObject({
      schemaVersion: 1,
      check: "package-list-tree",
      success: true,
      scope: "local",
      tree: [],
    });

    const homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir);
    const cacheList = runCli(["package-cache", "list", "--json"], {
      cwd: tempDir,
      env: { HOME: homeDir },
    });
    expect(cacheList.status).toBe(0);
    expect(parseJsonObjectStdout(cacheList)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-list",
      success: true,
      entries: [],
    });
  });

  test("keeps package-cache maintenance JSON stdout parseable", () => {
    const homeDir = path.join(tempDir, "cache-maintenance-home");
    fs.mkdirSync(homeDir);

    const clean = runCli(
      ["package-cache", "clean", "--dry-run", "--json"],
      {
        cwd: tempDir,
        env: { HOME: homeDir },
      },
    );
    expect(clean.status).toBe(0);
    expect(parseJsonObjectStdout(clean)).toEqual({
      schemaVersion: 1,
      check: "package-cache-clean",
      success: true,
      removed: [],
      dryRun: true,
    });

    const repair = runCli(
      ["package-cache", "repair", "--dry-run", "--json"],
      {
        cwd: tempDir,
        env: { HOME: homeDir },
      },
    );
    expect(repair.status).toBe(0);
    expect(parseJsonObjectStdout(repair)).toEqual({
      schemaVersion: 1,
      check: "package-cache-repair",
      success: true,
      dryRun: true,
      repaired: [],
      unchanged: [],
      issues: [],
    });
  });

  test("keeps run-script list JSON stdout parseable", () => {
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "cli-json-run-script",
          version: "1.0.0",
          scripts: {
            check: "bpl check src/main.bpl",
          },
        },
        null,
        2,
      ),
    );

    const result = runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    });
    expect(result.status).toBe(0);
    expect(parseJsonObjectStdout(result)).toEqual({
      schemaVersion: 1,
      check: "run-script-list",
      success: true,
      scripts: [{ name: "check", command: "bpl check src/main.bpl" }],
    });
  });

  test("keeps run-script list JSON failures parseable", () => {
    const result = runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    });
    expect(result.status).toBe(1);
    expect(parseJsonObjectStdout(result)).toMatchObject({
      schemaVersion: 1,
      check: "run-script-list",
      success: false,
      error: expect.stringContaining("No bpl.json found"),
    });
  });

  test("keeps JSON-mode build failures parseable on stdout", () => {
    const badSource = path.join(tempDir, "bad.bpl");
    fs.writeFileSync(
      badSource,
      'frame main() { local value: int = "not an int"; }\n',
    );

    const result = runCli(["build", badSource, "--json"]);
    expect(result.status).toBe(1);
    const report = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      error: string;
      diagnostics: Array<{
        severity: string;
        severityLabel: string;
        message: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
        source?: { line: string };
      }>;
    }>(result);
    expect(report).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: badSource,
      error: expect.stringContaining("Type mismatch"),
      diagnostics: [
        {
          severity: "error",
          severityLabel: "error",
          location: {
            file: badSource,
            start: { line: 1 },
          },
          source: {
            line: 'frame main() { local value: int = "not an int"; }',
          },
        },
      ],
    });
    expect(report.diagnostics[0]?.message).toContain("Type mismatch");
  });

  test("reports import diagnostics in JSON-mode build failures", () => {
    const unsafeStdFile = path.join(tempDir, "unsafe_std.bpl");
    const unsafeStdOutput = path.join(tempDir, "unsafe-std-app");
    const packageFile = path.join(tempDir, "package_import.bpl");
    const packageOutput = path.join(tempDir, "package-app");
    const packageDir = path.join(tempDir, "bpl_modules", "badpkg");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "different-name",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "index.bpl"),
      ["frame value() ret int {", "    return 1;", "}", "export value;"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      unsafeStdFile,
      [
        'import escaped from "std/../outside-std-lib.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      packageFile,
      [
        'import value from "badpkg";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const unsafeStdResult = runCli([
      "build",
      unsafeStdFile,
      "--json",
      "-o",
      unsafeStdOutput,
    ]);
    expect(unsafeStdResult.status).toBe(1);
    const unsafeStdReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(unsafeStdResult);
    expect(unsafeStdReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: unsafeStdFile,
      diagnostics: [
        {
          location: {
            file: unsafeStdFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(unsafeStdReport.diagnostics[0]?.message).toContain(
      "Unsafe standard library import: std/../outside-std-lib.bpl",
    );
    expect(unsafeStdReport.diagnostics[0]?.hint).toContain(
      "Use std/<path> without empty, '.', or '..' path segments.",
    );
    expect(fs.existsSync(`${unsafeStdOutput}.ll`)).toBe(false);
    expect(fs.existsSync(unsafeStdOutput)).toBe(false);

    const packageResult = runCli([
      "build",
      packageFile,
      "--json",
      "-o",
      packageOutput,
    ]);
    expect(packageResult.status).toBe(1);
    const packageReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(packageResult);
    expect(packageReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: packageFile,
      diagnostics: [
        {
          location: {
            file: packageFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(packageReport.diagnostics[0]?.message).toContain("invalid bpl.json");
    expect(packageReport.diagnostics[0]?.message).toContain(
      "manifest name 'different-name'",
    );
    expect(packageReport.diagnostics[0]?.hint).toContain("Searched paths:");
    expect(fs.existsSync(`${packageOutput}.ll`)).toBe(false);
    expect(fs.existsSync(packageOutput)).toBe(false);
  });

  test("reports virtual source diagnostics in JSON-mode build failures", () => {
    const source = [
      "frame main() {",
      '    local value: int = "not an int";',
      "}",
    ].join("\n");

    const expectVirtualDiagnostic = (
      result: SpawnSyncReturns<string>,
      file: "<eval>" | "<stdin>",
    ) => {
      expect(result.status).toBe(1);
      const report = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          message: string;
          location: {
            file: string;
            start: { line: number; column: number };
          };
          source?: { line: string };
        }>;
      }>(result);
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file,
        diagnostics: [
          {
            location: {
              file,
              start: { line: 2, column: 5 },
            },
            source: {
              line: '    local value: int = "not an int";',
            },
          },
        ],
      });
      expect(report.diagnostics[0]?.message).toContain("Type mismatch");
    };

    expectVirtualDiagnostic(runCli(["--eval", source, "--json"]), "<eval>");
    expectVirtualDiagnostic(
      runCli(["--stdin", "--json"], { input: source }),
      "<stdin>",
    );
  });

  test("keeps JSON-mode build validation failures parseable on stdout", () => {
    const sourceDir = path.join(tempDir, "source-dir");
    fs.mkdirSync(sourceDir);

    const assertValidationFailure = (
      result: SpawnSyncReturns<string>,
      expectedError: string,
      expectedFile?: string,
    ) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(parseJsonObjectStdout(result)).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        ...(expectedFile ? { file: expectedFile } : {}),
        error: expect.stringContaining(expectedError),
      });
    };

    const inputFailure = runCli(["build", sourceDir, "--json"]);
    assertValidationFailure(
      inputFailure,
      "Input path is not a file",
      sourceDir,
    );

    const validSource = path.join(tempDir, "valid.bpl");
    const missingParentOutput = path.join(tempDir, "missing", "app");
    fs.writeFileSync(validSource, "frame main() ret int { return 0; }\n");

    const validationCases: Array<[string[], string]> = [
      [["build", validSource, "--json", "-O", "debug"], "Invalid optimization"],
      [["build", validSource, "--json", "--emit", "bytecode"], "Invalid emit"],
      [
        ["build", validSource, "--json", "--wasm-runtime", "wasi"],
        "Invalid wasm runtime",
      ],
      [["build", validSource, "--json", "--jobs", "0"], "Invalid jobs count"],
    ];

    for (const [args, expectedError] of validationCases) {
      assertValidationFailure(runCli(args), expectedError, validSource);
    }

    const outputFailure = runCli([
      "build",
      validSource,
      "--json",
      "-o",
      missingParentOutput,
    ]);
    assertValidationFailure(
      outputFailure,
      "Output directory not found",
      validSource,
    );
    expect(fs.existsSync(`${missingParentOutput}.ll`)).toBe(false);

    const executableDirectoryOutput = path.join(tempDir, "app-dir");
    fs.mkdirSync(executableDirectoryOutput);
    const executablePathFailure = runCli([
      "build",
      validSource,
      "--json",
      "-o",
      executableDirectoryOutput,
    ]);
    assertValidationFailure(
      executablePathFailure,
      "Output path is a directory",
      validSource,
    );
    expect(fs.existsSync(`${executableDirectoryOutput}.ll`)).toBe(false);
  });
});
