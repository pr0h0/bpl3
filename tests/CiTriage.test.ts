import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  formatTriageJsonReport,
  formatTriageSummary,
  localCommandsForStep,
  parseGitHubRunLocator,
  summarizeWorkflowJobs,
  type GitHubWorkflowJob,
} from "../tools/ci_triage";
import { expectJsonStdoutReport } from "./helpers/cliJson";

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
    expect(localCommandsForStep("Run WebAssembly runtime tests")).toEqual([
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
    ]);
    expect(localCommandsForStep("Run compiler correctness tests")).toEqual([
      "bun run test:correctness",
    ]);
    expect(
      localCommandsForStep("Run deterministic differential compiler fuzz"),
    ).toEqual(["bun run fuzz:differential"]);
  });

  test("maps wasm linker failure text to focused repro commands", () => {
    const expectedCommands = [
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
    ];

    expect(
      localCommandsForStep("BPL_REQUIRE_WASM_LD=1 requires a wasm linker"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("wasm-ld is required for compiler correctness CI")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("WASM_LD selected linker failed")).toEqual(
      expectedCommands,
    );
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

  test("maps package source-safety JSON failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "entrypoint|subpath|manifest"',
      "bun test tests/PackageResolver.test.ts",
    ];

    expect(
      localCommandsForStep("entrypoint resolves to a symbolic link candidate"),
    ).toEqual(expectedCommands);
    expect(localCommandsForStep("unsafe entrypoint '../outside.bpl'")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("missing bpl.json")).toEqual(expectedCommands);
    expect(
      localCommandsForStep(
        "subpath 'features/add' resolves to a symbolic link candidate",
      ),
    ).toEqual(expectedCommands);
  });

  test("maps package install JSON contract failures to focused reproduction commands", () => {
    const expectedCommands = [
      'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      'bun test tests/PackageManagerCLI.test.ts -t "install command|doctor packages command"',
    ];

    expect(localCommandsForStep("PackageJsonFailureContracts.test")).toEqual(
      expectedCommands,
    );
    expect(localCommandsForStep("package-install JSON failure")).toEqual(
      expectedCommands,
    );
    expect(
      localCommandsForStep("BPL_LOCKFILE_UNSUPPORTED_VERSION in packages JSON"),
    ).toEqual(expectedCommands);
  });

  test("maps wasm runtime execution failures to focused repro commands", () => {
    const expectedCommands = [
      "bun test tests/WasmRuntime.test.ts",
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "bun index.ts doctor --json",
    ];

    expect(localCommandsForStep("WasmRuntime.test")).toEqual(expectedCommands);
    expect(
      localCommandsForStep("WebAssembly runtime execution should trap"),
    ).toEqual(expectedCommands);
    expect(
      localCommandsForStep("routes hosted wasm stdout through host imports"),
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

  test("reports missing requested jobs explicitly", () => {
    const jobs: GitHubWorkflowJob[] = [
      {
        id: 41,
        name: "Ubuntu CI",
        conclusion: "success",
        steps: [],
      },
    ];

    const summary = summarizeWorkflowJobs(jobs, { requestedJobId: 42 });
    expect(summary.failedJobs).toEqual([]);
    expect(summary.missingJobIds).toEqual([42]);

    const formatted = formatTriageSummary(
      { owner: "pr0h0", repo: "bpl3", runId: 1, jobId: 42 },
      summary,
    );
    expect(formatted).toContain("Missing requested jobs:");
    expect(formatted).toContain(
      "job 42 was not returned by GitHub for this run",
    );

    expect(
      formatTriageJsonReport(
        { owner: "pr0h0", repo: "bpl3", runId: 1, jobId: 42 },
        summary,
      ).summary.missingJobIds,
    ).toEqual([42]);
  });

  test("formats a versioned JSON report for automation", () => {
    const locator = { owner: "pr0h0", repo: "bpl3", runId: 26695335269 };
    const summary = summarizeWorkflowJobs([
      {
        id: 99,
        name: "Compiler correctness",
        conclusion: "failure",
        steps: [
          { name: "Run compiler correctness tests", conclusion: "failure" },
        ],
      },
    ]);

    expect(formatTriageJsonReport(locator, summary)).toEqual({
      schemaVersion: 1,
      check: "ci-triage",
      success: true,
      locator,
      summary,
    });
  });

  test("prints versioned JSON from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-json-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [
            {
              id: 42,
              name: "Ubuntu CI",
              conclusion: "failure",
              html_url: "https://github.com/pr0h0/bpl3/actions/runs/1/job/42",
              steps: [
                { name: "Run CI-safe test suite", conclusion: "failure" },
              ],
            },
          ],
        }),
      );

      const result = spawnSync(
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
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.stderr).not.toContain("GitHub API");
      expect(result.stderr).not.toContain("api.github.com");

      const report = expectJsonStdoutReport<{
        summary: {
          failedJobs: Array<{ localCommands: string[] }>;
        };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "ci-triage",
        success: true,
        locator: {
          owner: "pr0h0",
          repo: "bpl3",
          runId: 26695335269,
        },
      });
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun run test:ci",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prints missing requested job JSON from an offline jobs fixture", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-ci-triage-missing-job-"));
    const jobsPath = join(tempDir, "jobs.json");

    try {
      writeFileSync(
        jobsPath,
        JSON.stringify({
          jobs: [{ id: 41, name: "Ubuntu CI", conclusion: "success" }],
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          jobsPath,
          "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/42",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const report = expectJsonStdoutReport<{
        locator: { jobId: number };
        summary: { failedJobs: unknown[]; missingJobIds: number[] };
      }>(result, {
        status: 0,
        check: "ci-triage",
        success: true,
        stderr: "allow",
      });
      expect(report.locator.jobId).toBe(42);
      expect(report.summary.failedJobs).toEqual([]);
      expect(report.summary.missingJobIds).toEqual([42]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
    expect(result.stdout).toContain("--jobs-json jobs.json");
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
