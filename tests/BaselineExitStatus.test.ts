import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { scripts } from "../package.json";
import {
  BASELINE_LOG_FILE,
  createBaselineBatches,
} from "../tools/test_baseline";

const runner = resolve(import.meta.dir, "../tools/test_baseline.ts");

function fixture(passes: boolean): string {
  return `import { test, expect } from "bun:test"; test("baseline fixture", () => expect(${passes}).toBe(true));`;
}

test("test:baseline runs the batched baseline runner", () => {
  expect(scripts["test:baseline"]).toBe("bun tools/test_baseline.ts");
});

test("test:baseline logs output and preserves both passing and failing test status", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-baseline-"));
  try {
    for (const passes of [true, false]) {
      const file = join(directory, "fixture with spaces.test.ts");
      writeFileSync(file, fixture(passes));
      const result = Bun.spawnSync([process.execPath, runner, file], {
        cwd: directory,
        env: { ...process.env, NO_COLOR: "1" },
      });
      expect(result.exitCode === 0).toBe(passes);
      const log = readFileSync(join(directory, BASELINE_LOG_FILE), "utf8");
      // Newer Bun releases list only failing tests by name when piped.
      expect(log).toContain(passes ? "1 pass" : "baseline fixture");
      expect(result.stdout.toString()).toBe(log);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("test:baseline without arguments runs every test file in batches and reports a failing batch", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-baseline-batches-"));
  try {
    mkdirSync(join(directory, "tests"));
    writeFileSync(join(directory, "tests/a.test.ts"), fixture(false));
    writeFileSync(join(directory, "tests/b.test.ts"), fixture(true));
    writeFileSync(join(directory, "tests/c.test.ts"), fixture(true));
    const result = Bun.spawnSync([process.execPath, runner], {
      cwd: directory,
      env: { ...process.env, NO_COLOR: "1", BPL_BASELINE_BATCH_SIZE: "2" },
    });
    expect(result.exitCode).not.toBe(0);
    const log = readFileSync(join(directory, BASELINE_LOG_FILE), "utf8");
    expect(log).toContain("==> Batch 1/2 (2 files)");
    expect(log).toContain("==> Batch 2/2 (1 file)");
    expect(log).toContain("1 pass");
    expect(result.stdout.toString()).toBe(log);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("baseline batches split discovered files and pass explicit arguments through", () => {
  const files = ["tests/a.test.ts", "tests/b.test.ts", "tests/c.test.ts"];
  expect(createBaselineBatches([], files, 2)).toEqual([
    ["tests/a.test.ts", "tests/b.test.ts"],
    ["tests/c.test.ts"],
  ]);
  expect(
    createBaselineBatches(["tests/x.test.ts", "-t", "name"], files, 2),
  ).toEqual([["tests/x.test.ts", "-t", "name"]]);
  expect(createBaselineBatches([], [], 2)).toEqual([]);
});
