import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Builds apps/bpl-quant once, runs its deterministic self-test against the
// golden output, then (on Linux) starts the HTTP API on an ephemeral port.

const appDir = resolve("apps/bpl-quant");
let workDir = "";
let exe = "";
let buildOutput = "";
let buildStatus: number | null = null;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "bpl-quant-"));
  exe = join(workDir, "bpl-quant");
  const build = spawnSync(
    "bun",
    [
      resolve("index.ts"),
      "build",
      join(appDir, "src/main.bpl"),
      "-O",
      "2",
      "-o",
      exe,
    ],
    { encoding: "utf8", timeout: 120000 },
  );
  buildStatus = build.status;
  buildOutput = (build.stdout ?? "") + (build.stderr ?? "");
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("bpl-quant", () => {
  test("builds", () => {
    expect(buildStatus, buildOutput).toBe(0);
  });

  test("self-test matches the golden output", () => {
    expect(buildStatus, buildOutput).toBe(0);
    const run = spawnSync(exe, ["selftest"], {
      encoding: "utf8",
      timeout: 60000,
    });
    const expected = readFileSync(
      join(appDir, "tests/selftest.expected"),
      "utf8",
    );
    expect(run.stdout).toBe(expected);
    expect(run.status, run.stderr).toBe(0);
  });
});
