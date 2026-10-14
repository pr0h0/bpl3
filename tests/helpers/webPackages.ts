import { expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export function native(source: string, flags: string[] = []) {
  // Keep the source in the repository so workspace package resolution is exercised.
  const dir = mkdtempSync(resolve(".web-package-test-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const exe = join(tmpdir(), `bpl-web-${process.pid}-${dir.split("-").at(-1)}`);
    try {
      const build = spawnSync("bun", [resolve("index.ts"), "build", file, "-o", exe, ...flags], { encoding: "utf8", timeout: 60000 });
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const run = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
      expect(run.status, run.stdout + run.stderr).toBe(0);
    } finally { rmSync(exe, { force: true }); }
  } finally { rmSync(dir, { force: true, recursive: true }); }
}

