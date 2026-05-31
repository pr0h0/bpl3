import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const RELEASE_SMOKE_TIMEOUT_MS = 180 * 1000;

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
      expect(result.stdout).toContain(
        "release smoke: validate packed npm metadata",
      );
      expect(result.stdout).toContain(
        "release smoke: validate packed npm file allowlist",
      );
      expect(result.stdout).toContain("release smoke: install packed npm CLI");
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI doctor JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI doctor failure JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package doctor JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package list JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package list tree JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package-cache list JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package-cache verify JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI check JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI lint JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI bash completion",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI zsh completion",
      );
      expect(result.stdout).toContain(
        "release smoke: scaffold packed npm CLI library template",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI library template",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI run-script list JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI run-script failure JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: run packed npm CLI library example",
      );
      expect(result.stdout).toContain(
        "release smoke: compile tiny program with packed npm CLI",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI build JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: build packed npm CLI wasm artifact",
      );
      expect(result.stdout).toContain(
        "release smoke: build packed npm CLI cached module app",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI fuzz artifact repro helper",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI CI triage helper",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI CI triage usage errors",
      );
      expect(result.stdout).toContain("release smoke passed");
    },
    RELEASE_SMOKE_TIMEOUT_MS + 10 * 1000,
  );
});
