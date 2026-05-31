import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseJsonObjectStdout } from "./helpers/cliJson";

const BPL_CLI = path.join(process.cwd(), "index.ts");

function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): SpawnSyncReturns<string> {
  return spawnSync("bun", [BPL_CLI, ...args], {
    cwd: options.cwd,
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", ...options.env },
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
  });

  test("keeps JSON-mode doctor scope failures parseable on stdout", () => {
    const result = runCli(["doctor", "unknown-scope", "--json"]);
    expect(result.status).toBe(1);
    expect(parseJsonObjectStdout(result)).toMatchObject({
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

  test("keeps JSON-mode build failures parseable on stdout", () => {
    const badSource = path.join(tempDir, "bad.bpl");
    fs.writeFileSync(
      badSource,
      'frame main() { local value: int = "not an int"; }\n',
    );

    const result = runCli(["build", badSource, "--json"]);
    expect(result.status).toBe(1);
    expect(parseJsonObjectStdout(result)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: badSource,
      error: expect.stringContaining("Type mismatch"),
    });
  });

  test("keeps JSON-mode build validation failures parseable on stdout", () => {
    const sourceDir = path.join(tempDir, "source-dir");
    fs.mkdirSync(sourceDir);

    const inputFailure = runCli(["build", sourceDir, "--json"]);
    expect(inputFailure.status).toBe(1);
    expect(parseJsonObjectStdout(inputFailure)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceDir,
      error: expect.stringContaining("Input path is not a file"),
    });

    const validSource = path.join(tempDir, "valid.bpl");
    const missingParentOutput = path.join(tempDir, "missing", "app");
    fs.writeFileSync(validSource, "frame main() ret int { return 0; }\n");

    const outputFailure = runCli([
      "build",
      validSource,
      "--json",
      "-o",
      missingParentOutput,
    ]);
    expect(outputFailure.status).toBe(1);
    expect(parseJsonObjectStdout(outputFailure)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: validSource,
      error: expect.stringContaining("Output directory not found"),
    });
    expect(fs.existsSync(`${missingParentOutput}.ll`)).toBe(false);
  });
});
