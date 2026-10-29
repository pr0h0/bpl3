import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scripts } from "../package.json";

test("test:baseline logs output and preserves both passing and failing test status", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-baseline-"));
  try {
    for (const passes of [true, false]) {
      const file = join(directory, "fixture with spaces.test.ts");
      writeFileSync(
        file,
        `import { test, expect } from "bun:test"; test("baseline fixture", () => expect(${passes}).toBe(true));`,
      );
      const result = Bun.spawnSync(
        ["bash", "-c", `${scripts["test:baseline"]} "$@"`, "--", file],
        {
          cwd: directory,
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(result.exitCode === 0).toBe(passes);
      const log = readFileSync(join(directory, "test-baseline.txt"), "utf8");
      // Newer Bun releases list only failing tests by name when piped.
      expect(log).toContain(passes ? "1 pass" : "baseline fixture");
      expect(result.stdout.toString()).toBe(log);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
