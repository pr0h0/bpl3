import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

function parseJsonStdout(result: SpawnSyncReturns<string>): Record<string, unknown> {
  expect(result.stdout.trim()).not.toBe("");
  expect(result.stderr).toBe("");

  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toBeObject();
  return parsed as Record<string, unknown>;
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

    const doctor = runCli(["doctor", "--json"]);
    expect(doctor.status).toBe(0);
    expect(parseJsonStdout(doctor)).toMatchObject({
      schemaVersion: 1,
      check: "toolchain",
      success: true,
    });

    const clean = runCli(["clean", "--dry-run", "--json"], { cwd: tempDir });
    expect(clean.status).toBe(0);
    expect(parseJsonStdout(clean)).toMatchObject({
      dryRun: true,
      count: 1,
    });
  });

  test("keeps JSON-mode doctor scope failures parseable on stdout", () => {
    const result = runCli(["doctor", "unknown-scope", "--json"]);
    expect(result.status).toBe(1);
    expect(parseJsonStdout(result)).toMatchObject({
      success: false,
      error: expect.stringContaining("Unknown doctor scope 'unknown-scope'"),
    });
  });
});
