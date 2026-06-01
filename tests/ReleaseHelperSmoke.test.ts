import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  runPackedCliRegistrySmoke,
  runPackedCliRegistryTypesSmoke,
  runPackedHelperScriptSmoke,
} from "../tools/release_smoke";

const HELPER_SMOKE_TIMEOUT_MS = 60 * 1000;

describe("Release helper smoke", () => {
  test(
    "exercises packed helper usage paths without full release smoke",
    () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-smoke-"));

      try {
        const installDir = writePackedHelperInstallFixture(tempRoot, {
          includePathSafety: true,
        });

        runPackedHelperScriptSmoke(installDir);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    HELPER_SMOKE_TIMEOUT_MS,
  );

  test("fails clearly when a packed helper dependency is missing", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-smoke-missing-"));

    try {
      const installDir = writePackedHelperInstallFixture(tempRoot, {
        includePathSafety: false,
      });

      expect(() => runPackedHelperScriptSmoke(installDir)).toThrow(
        /Release smoke step failed: check packed npm CLI fuzz artifact repro helper[\s\S]*Cannot find module.*PathSafety/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("keeps full release smoke as the authoritative package check", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:smoke",
    );
  });

  test("exercises packed CLI registry subpath import", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-cli-registry-smoke-"));

    try {
      const installDir = writePackedCliRegistryInstallFixture(tempRoot);

      runPackedCliRegistrySmoke(installDir);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("exercises packed CLI registry TypeScript declarations", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-cli-registry-types-smoke-"),
    );

    try {
      const installDir = writePackedCliRegistryInstallFixture(tempRoot);

      runPackedCliRegistryTypesSmoke(installDir);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("prints packed ci:triage release cli registry guidance", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-cli-registry-triage-smoke-"),
    );

    try {
      const installDir = writePackedHelperInstallFixture(tempRoot, {
        includePathSafety: true,
      });
      const packageDir = join(installDir, "node_modules", "bpl-v3");
      const jobsPath = join(packageDir, "release-cli-registry-jobs.json");
      writeFileSync(
        jobsPath,
        JSON.stringify(
          {
            run: {
              id: 26695335269,
              html_url:
                "https://github.com/pr0h0/bpl3/actions/runs/26695335269",
              head_branch: "master",
              head_sha: "1234567890abcdef1234567890abcdef12345678",
              status: "completed",
              conclusion: "failure",
            },
            jobs: [
              {
                id: 17,
                name: "Release CLI registry sync check",
                conclusion: "failure",
                html_url:
                  "https://github.com/pr0h0/bpl3/actions/runs/26695335269/job/17",
                steps: [
                  {
                    name: "CLI registry shim is stale",
                    conclusion: "failure",
                  },
                ],
              },
            ],
          },
          null,
          2,
        ) + "\n",
      );

      const result = spawnSync(
        "npm",
        [
          "run",
          "--silent",
          "ci:triage",
          "--",
          "--json",
          "--jobs-json",
          "release-cli-registry-jobs.json",
          "26695335269",
        ],
        {
          cwd: packageDir,
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "1" },
          timeout: HELPER_SMOKE_TIMEOUT_MS,
        },
      );

      if (result.error || result.status !== 0) {
        throw new Error(
          [
            "Packed ci:triage release CLI registry guidance smoke failed.",
            `status: ${result.status ?? "none"}`,
            `spawn error: ${result.error?.stack ?? result.error?.message ?? "none"}`,
            `stdout:\n${result.stdout}`,
            `stderr:\n${result.stderr}`,
          ].join("\n"),
        );
      }

      const report = JSON.parse(result.stdout);
      expect(report.summary.failedJobs[0]?.localCommands).toEqual([
        "bun run release:cli-registry",
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("prints packed ci:triage jobs-json diagnostics", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-ci-triage-jobs-json-smoke-"),
    );

    try {
      const installDir = writePackedHelperInstallFixture(tempRoot, {
        includePathSafety: true,
      });
      const packageDir = join(installDir, "node_modules", "bpl-v3");
      writeFileSync(join(packageDir, "malformed-jobs.json"), "{bad json");

      const cases: Array<{
        args: string[];
        expectedError: string;
        forbiddenError: string;
      }> = [
        {
          args: ["--jobs-json", "missing-jobs.json", "26695335269"],
          expectedError:
            "Unable to read --jobs-json file missing-jobs.json: file does not exist.",
          forbiddenError: "ENOENT",
        },
        {
          args: ["--jobs-json", "malformed-jobs.json", "26695335269"],
          expectedError:
            "Unable to parse --jobs-json file malformed-jobs.json:",
          forbiddenError: "JSON Parse error",
        },
      ];

      for (const testCase of cases) {
        const result = spawnSync(
          "npm",
          ["run", "--silent", "ci:triage", "--", ...testCase.args],
          {
            cwd: packageDir,
            encoding: "utf8",
            env: { ...process.env, NO_COLOR: "1" },
            timeout: HELPER_SMOKE_TIMEOUT_MS,
          },
        );

        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(testCase.expectedError);
        expect(result.stderr).not.toContain(testCase.forbiddenError);
        expect(result.stderr).not.toContain("GitHub API");
        expect(result.stderr).not.toContain("release:smoke");
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

function writePackedHelperInstallFixture(
  tempRoot: string,
  options: { includePathSafety: boolean },
): string {
  const repoRoot = join(import.meta.dir, "..");
  const installDir = join(tempRoot, "installed");
  const packageDir = join(installDir, "node_modules", "bpl-v3");

  mkdirSync(join(packageDir, "tools"), { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: "bpl-v3",
        private: true,
        scripts: {
          "ci:triage": "bun tools/ci_triage.ts",
          fuzz: "bun tools/fuzz_script_wrapper.ts run",
          "fuzz:promote": "bun tools/fuzz_script_wrapper.ts promote",
          "fuzz:replay": "bun tools/fuzz_script_wrapper.ts replay",
          "fuzz:repro": "bun tools/fuzz_artifact_repro.ts",
        },
      },
      null,
      2,
    ) + "\n",
  );

  for (const helperPath of [
    "tools/ci_triage.ts",
    "tools/fuzz_artifact_repro.ts",
    "tools/fuzz_script_wrapper.ts",
  ]) {
    cpSync(join(repoRoot, helperPath), join(packageDir, helperPath));
  }

  if (options.includePathSafety) {
    mkdirSync(join(packageDir, "compiler", "common"), { recursive: true });
    cpSync(
      join(repoRoot, "compiler", "common", "PathSafety.ts"),
      join(packageDir, "compiler", "common", "PathSafety.ts"),
    );
  }

  return installDir;
}

function writePackedCliRegistryInstallFixture(tempRoot: string): string {
  const repoRoot = join(import.meta.dir, "..");
  const installDir = join(tempRoot, "installed");
  const packageDir = join(installDir, "node_modules", "bpl-v3");

  mkdirSync(join(packageDir, "cli"), { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: "bpl-v3",
        private: true,
        exports: {
          "./cli": {
            types: "./cli/index.d.ts",
            import: "./cli/index.js",
            require: "./cli/index.js",
            default: "./cli/index.js",
          },
        },
      },
      null,
      2,
    ) + "\n",
  );

  for (const registryPath of ["cli/index.d.ts", "cli/index.js"]) {
    cpSync(join(repoRoot, registryPath), join(packageDir, registryPath));
  }

  return installDir;
}
