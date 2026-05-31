import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

import {
  formatTriageSummary,
  localCommandsForStep,
  parseGitHubRunLocator,
  summarizeWorkflowJobs,
  type GitHubWorkflowJob,
} from "../tools/ci_triage";

describe("CI triage helper", () => {
  test("parses GitHub Actions run and job URLs", () => {
    expect(
      parseGitHubRunLocator(
        "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/78678793489",
      ),
    ).toEqual({
      owner: "pr0h0",
      repo: "bpl3",
      runId: 26695335269,
      jobId: 78678793489,
    });

    expect(parseGitHubRunLocator("26695335269")).toEqual({
      owner: "pr0h0",
      repo: "bpl3",
      runId: 26695335269,
    });
  });

  test("maps known CI steps to local reproduction commands", () => {
    expect(localCommandsForStep("Run CI-safe test suite")).toEqual([
      "bun run test:ci",
    ]);
    expect(localCommandsForStep("Run compiler correctness tests")).toEqual([
      "bun run test:correctness",
    ]);
    expect(
      localCommandsForStep("Run deterministic differential compiler fuzz"),
    ).toEqual(["bun run fuzz:differential"]);
  });

  test("maps release smoke failures to packed helper reproduction commands", () => {
    expect(localCommandsForStep("ReleaseSmoke.test")).toEqual([
      "bun run release:smoke",
      "bun test tests/ReleaseSmoke.test.ts",
      "bun test tests/ReleaseHelperSmoke.test.ts",
      "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --help",
      "cd <packed-bpl-v3-package> && npm run fuzz:repro -- --input --json",
      "cd <packed-bpl-v3-package> && npm run fuzz -- --iterations --crash-dir fuzz/crashes",
      "cd <packed-bpl-v3-package> && npm run fuzz:replay -- --metadata --mode parser",
      "cd <packed-bpl-v3-package> && npm run fuzz:promote -- --metadata --name bug",
      "cd <packed-bpl-v3-package> && npm run ci:triage -- --help",
    ]);
    expect(localCommandsForStep("Run release smoke")).toContain(
      "bun run release:smoke",
    );
  });

  test("maps package resolver JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      "bun test tests/PackageResolver.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "package search directory"',
      'bun test tests/CLIJsonParseability.test.ts -t "global package root failures"',
    ];

    expect(localCommandsForStep("PackageResolver.test")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("CLIJsonParseability.test package search directory"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("global package root failures in JSON-mode check"),
    ).toEqual(expectedCommands);
  });

  test("summarizes failed jobs and formats local repro guidance", () => {
    const jobs: GitHubWorkflowJob[] = [
      {
        id: 11,
        name: "Ubuntu system clang release",
        conclusion: "failure",
        html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/11",
        steps: [
          { name: "Type check", conclusion: "success" },
          { name: "Run CI-safe test suite", conclusion: "failure" },
        ],
      },
      {
        id: 12,
        name: "macOS Apple clang release",
        conclusion: "success",
        steps: [
          { name: "Run compiler correctness tests", conclusion: "success" },
        ],
      },
    ];

    const summary = summarizeWorkflowJobs(jobs);
    expect(summary.failedJobs).toHaveLength(1);
    expect(summary.failedJobs[0]?.localCommands).toEqual(["bun run test:ci"]);

    const formatted = formatTriageSummary(
      { owner: "pr0h0", repo: "bpl3", runId: 1 },
      summary,
    );
    expect(formatted).toContain("Ubuntu system clang release");
    expect(formatted).toContain("Run CI-safe test suite");
    expect(formatted).toContain("bun run test:ci");
  });

  test("prints offline help without requiring a GitHub API call", () => {
    const result = spawnSync("bun", ["run", "ci:triage", "--", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: bun tools/ci_triage.ts");
    expect(result.stdout).toContain("--repo owner/repo");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("run-id-or-actions-url");
    expect(result.stderr).not.toContain("GitHub API");
    expect(result.stderr).not.toContain("Expected a GitHub Actions run URL");
  });

  test("rejects missing option values before GitHub API calls", () => {
    const cases: Array<[string[], string]> = [
      [["--repo", "--run", "26695335269"], "Missing value for --repo"],
      [
        ["--run", "--repo", "pr0h0/bpl3"],
        "Missing value for --run",
      ],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "ci:triage", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
    }
  });

  test("rejects unknown options and extra arguments before GitHub API calls", () => {
    const cases: Array<[string[], string]> = [
      [["--unknown", "26695335269"], "Unknown option --unknown"],
      [["26695335269", "extra"], "Unexpected argument: extra"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "ci:triage", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");
    }
  });
});
