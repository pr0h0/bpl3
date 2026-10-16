import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("unfinished standard library modules reject imports rather than expose throwing placeholders", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-unsupported-stdlib-"));
  try {
    for (const [module, name] of [
      ["thread", "Thread"],
      ["sync", "Sync"],
      ["iter", "Iter"],
    ]) {
      const file = join(dir, "main.bpl");
      writeFileSync(
        file,
        `import [${name}] from "std/${module}.bpl";frame main(){}`,
      );
      const result = spawnSync(
        "bun",
        [resolve("index.ts"), "check", file, "--json"],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(result.status, result.stdout + result.stderr).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.errorCount).toBeGreaterThan(0);
      expect(
        report.files[0].diagnostics.some((diagnostic: { message: string }) =>
          diagnostic.message.includes(name!),
        ),
      ).toBe(true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
