import { describe, expect, test } from "bun:test";

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
});
