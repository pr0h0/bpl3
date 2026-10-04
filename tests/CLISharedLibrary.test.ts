import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("shared builds reject incompatible modes with parseable diagnostics", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-shared-options-"));
  try {
    const source = join(dir, "library.bpl");
    writeFileSync(source, "frame value() ret int { return 42; }");
    for (const flags of [
      [],
      ["-o", join(dir, "lib.so"), "--cache"],
      ["-o", join(dir, "lib.so"), "--emit", "ast"],
      ["-o", join(dir, "lib.so"), "--target", "wasm32-unknown-unknown"],
    ]) {
      const result = spawnSync(
        "bun",
        [resolve("index.ts"), "build", source, "--shared", "--json", ...flags],
        { encoding: "utf8", timeout: 15000 },
      );
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(JSON.stringify(report)).toContain(
        "BPL_BUILD_INVALID_SHARED_OPTIONS",
      );
      expect(result.stderr).toBe("");
    }
    const executable = spawnSync(
      "bun",
      [resolve("index.ts"), "build", source, "--json"],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(executable.status).toBe(1);
    expect(executable.stdout).toContain("Missing entry point");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);
