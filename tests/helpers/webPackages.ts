import { expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function native(source: string, flags: string[] = []) {
  // Keep the source in the repository so workspace package resolution is exercised.
  const dir = mkdtempSync(resolve(".web-package-test-"));
  // Build outside the checkout (it may be mounted noexec); the directory also
  // holds the .ll written beside the executable, so removing it cleans both.
  const outDir = mkdtempSync(join(tmpdir(), "bpl-web-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const exe = join(outDir, "main");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", file, "-o", exe, ...flags],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
    rmSync(outDir, { force: true, recursive: true });
  }
}
