import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const REPO_ROOT = join(import.meta.dir, "..");

describe("Package helper JSON contracts", () => {
  test("validates fuzz repro and CI triage JSON through package scripts", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-helper-json-contracts-"));
    const crashDir = join(tempDir, "fuzz", "crashes");
    const jobsPath = join(tempDir, "jobs.json");

    try {
      mkdirSync(crashDir, { recursive: true });
      writeFileSync(
        join(crashDir, "crash_seed-cafe_iter-1_tokens.bpl"),
        "frame main() ret int { return 0; }\n",
      );
      writeFileSync(
        join(crashDir, "crash_seed-cafe_iter-1_tokens.json"),
        JSON.stringify(
          {
            seedHex: "cafe",
            iteration: 1,
            kind: "tokens",
            failureKind: "crash",
            stage: "typecheck",
            message: "helper JSON contract fixture",
          },
          null,
          2,
        ),
      );
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 99,
              name: "CI-safe suite",
              conclusion: "failure",
              steps: [
                { name: "Run CI-safe test suite", conclusion: "failure" },
              ],
            },
          ],
        }),
      );

      const fuzzResult = spawnSync(
        "bun",
        [
          "run",
          "fuzz:repro",
          "--",
          "--input",
          crashDir,
          "--repo-root",
          tempDir,
          "--json",
        ],
        { cwd: REPO_ROOT, encoding: "utf8" },
      );
      expect(fuzzResult.status).toBe(0);
      const fuzzPlan = JSON.parse(fuzzResult.stdout);
      expect(fuzzPlan.schemaVersion).toBe(1);
      expect(fuzzPlan.entries).toHaveLength(1);
      expect(fuzzPlan.entries[0]).toMatchObject({
        metadataPath: "fuzz/crashes/crash_seed-cafe_iter-1_tokens.json",
        sourcePath: "fuzz/crashes/crash_seed-cafe_iter-1_tokens.bpl",
        seedHex: "0xcafe",
        iteration: 1,
        failureKind: "crash",
      });
      expect(fuzzPlan.entries[0].commands).toContain(
        "bun run fuzz -- --iterations 2 --seeds 0xcafe --minimize true --minimize-passes 8",
      );

      const triageResult = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "26695335269",
        ],
        { cwd: REPO_ROOT, encoding: "utf8" },
      );
      expect(triageResult.status).toBe(0);
      expect(triageResult.stderr).not.toContain("GitHub API");
      expect(triageResult.stderr).not.toContain("api.github.com");
      const triage = JSON.parse(triageResult.stdout);
      expect(triage).toMatchObject({
        schemaVersion: 1,
        check: "ci-triage",
        success: true,
        locator: {
          owner: "pr0h0",
          repo: "bpl3",
          runId: 26695335269,
        },
      });
      expect(triage.summary.missingJobIds).toEqual([]);
      expect(triage.summary.failedJobs[0].localCommands).toEqual([
        "bun run test:ci",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
