import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CI_SAFE_EXCLUDED_TEST_FILES,
  CI_SAFE_FIXED_TEST_FILES,
  createTestCiPlan,
  discoverCiSafeUnitTestFiles,
  formatTestCiFailureSummary,
  formatTestCiPlanText,
  formatTestCiSuccessSummary,
  runTestCiPlan,
} from "../tools/test_ci";

function withTempTests<T>(files: string[], run: (testsDir: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "bpl-test-ci-runner-"));
  try {
    const testsDir = join(root, "tests");
    mkdirSync(testsDir);
    for (const file of files) {
      writeFileSync(join(testsDir, file), "", { flag: "wx" });
    }
    return run(testsDir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("CI-safe test runner", () => {
  test("discovers sorted CI-safe unit tests while excluding heavyweight suites", () => {
    withTempTests(
      [
        "Zed.test.ts",
        "Integration.test.ts",
        "Alpha.test.ts",
        "CompilerCorrectnessCorpus.test.ts",
        "ReleaseSmoke.test.ts",
        "notes.txt",
      ],
      (testsDir) => {
        expect(discoverCiSafeUnitTestFiles(testsDir)).toEqual([
          "tests/Alpha.test.ts",
          "tests/Zed.test.ts",
        ]);
      },
    );

    expect(CI_SAFE_FIXED_TEST_FILES).toEqual([
      "tests/Integration.test.ts",
      "tests/PlaygroundExamples.test.ts",
    ]);
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain(
      "CompilerCorrectnessCorpus.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain("ReleaseSmoke.test.ts");
  });

  test("plans runtime build, integration, VS Code, and CI-safe unit steps in order", () => {
    withTempTests(["Beta.test.ts", "Alpha.test.ts"], (testsDir) => {
      const plan = createTestCiPlan({ testsDir });

      expect(plan.map((step) => step.name)).toEqual([
        "Build runtime support",
        "Run integration and playground examples",
        "Run VS Code extension tests",
        "Run CI-safe unit tests",
      ]);
      expect(plan.map((step) => [step.command, ...step.args])).toEqual([
        ["bun", "run", "build:runtime"],
        [
          "bun",
          "test",
          "tests/Integration.test.ts",
          "tests/PlaygroundExamples.test.ts",
        ],
        ["bun", "run", "test:vscode-ext"],
        [
          "bun",
          "test",
          "tests/Alpha.test.ts",
          "tests/Beta.test.ts",
        ],
      ]);
    });
  });

  test("formats list output and keeps package.json delegated to the runner", () => {
    withTempTests(["Alpha.test.ts"], (testsDir) => {
      const text = formatTestCiPlanText(createTestCiPlan({ testsDir }));

      expect(text).toContain("# Build runtime support");
      expect(text).toContain("bun run build:runtime");
      expect(text).toContain(
        "bun test tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
      );
      expect(text).toContain("bun run test:vscode-ext");
      expect(text).toContain("bun test tests/Alpha.test.ts");
    });

    const packageJson = require("../package.json");
    expect(packageJson.scripts["test:ci"]).toBe("bun tools/test_ci.ts");
  });

  test("formats concise success summaries for completed CI-safe runs", () => {
    withTempTests(["Alpha.test.ts"], (testsDir) => {
      const summary = formatTestCiSuccessSummary(
        createTestCiPlan({ testsDir }),
      );

      expect(summary).toBe("==> CI-safe validation passed (4 steps)");
    });
  });

  test("formats actionable failure summaries for failed CI-safe steps", () => {
    const step = {
      name: "Run CI-safe unit tests",
      command: "bun",
      args: ["test", "tests/Alpha.test.ts"],
    };

    expect(
      formatTestCiFailureSummary(step, { status: 2, signal: null }),
    ).toContain("==> CI-safe validation failed");
    expect(
      formatTestCiFailureSummary(step, { status: 2, signal: null }),
    ).toContain("Failed step: Run CI-safe unit tests");
    expect(
      formatTestCiFailureSummary(step, { status: 2, signal: null }),
    ).toContain("Command: bun test tests/Alpha.test.ts");
    expect(
      formatTestCiFailureSummary(step, { status: 2, signal: null }),
    ).toContain("Exit status: 2");

    expect(
      formatTestCiFailureSummary(step, {
        status: null,
        signal: "SIGTERM",
        errorMessage: "spawn failed",
      }),
    ).toContain("Signal: SIGTERM");
    expect(
      formatTestCiFailureSummary(step, {
        status: null,
        signal: "SIGTERM",
        errorMessage: "spawn failed",
      }),
    ).toContain("Start error: spawn failed");
  });

  test("prints success summaries when all CI-safe steps pass", () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ""));
    };
    try {
      const exitCode = runTestCiPlan([
        {
          name: "Pass quickly",
          command: process.execPath,
          args: ["-e", "process.exit(0)"],
        },
      ]);

      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toContain(
        "==> CI-safe validation passed (1 steps)",
      );
    } finally {
      console.log = originalLog;
    }
  });

  test("prints failure summaries when a CI-safe step fails", () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ""));
    };
    console.error = (message?: unknown) => {
      errors.push(String(message ?? ""));
    };
    try {
      const exitCode = runTestCiPlan([
        {
          name: "Fail quickly",
          command: process.execPath,
          args: ["-e", "process.exit(7)"],
        },
      ]);

      expect(exitCode).toBe(7);
      expect(logs.join("\n")).toContain("==> Fail quickly");
      expect(errors.join("\n")).toContain("CI-safe validation failed");
      expect(errors.join("\n")).toContain("Failed step: Fail quickly");
      expect(errors.join("\n")).toContain("Exit status: 7");
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });
});
