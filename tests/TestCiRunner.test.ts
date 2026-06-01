import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CI_SAFE_EXCLUDED_TEST_FILES,
  CI_SAFE_FIXED_TEST_FILES,
  createTestCiPlan,
  discoverCiSafeUnitTestFiles,
  formatTestCiPlanText,
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
});
