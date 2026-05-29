import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const RELEASE_SMOKE_TIMEOUT_MS = 120 * 1000;

describe("Release smoke", () => {
  test(
    "builds and exercises the standalone and packed CLI binaries",
    () => {
      const repoRoot = join(import.meta.dir, "..");
      const result = spawnSync("bun", ["run", "release:smoke"], {
        cwd: repoRoot,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
        timeout: RELEASE_SMOKE_TIMEOUT_MS,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("release smoke: pack npm tarball");
      expect(result.stdout).toContain("release smoke: install packed npm CLI");
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI doctor",
      );
      expect(result.stdout).toContain(
        "release smoke: compile tiny program with packed npm CLI",
      );
      expect(result.stdout).toContain("release smoke passed");
    },
    RELEASE_SMOKE_TIMEOUT_MS + 10 * 1000,
  );
});
