import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as ts from "typescript";
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

function hasFileLevelBunTimeoutPolicy(source: string): boolean {
  return /\bsetDefaultTimeout\s*\(/.test(source);
}

function hasTestLevelBunTimeoutPolicy(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
): boolean {
  const timeoutArg = call.arguments[2];
  if (!timeoutArg) {
    return false;
  }

  const timeoutText = timeoutArg.getText(sourceFile);
  return /^\d+$/.test(timeoutText) || /\btimeout\s*:/.test(timeoutText);
}

function callsRealCompilerProcessWork(body: string): boolean {
  return [
    /\bcompileAndRun(?:Code|Full)?\s*\(/,
    /\bcompilesSuccessfully\s*\(/,
    /\bspawnSync\s*\(\s*["']bun["']/,
    /\bBPL_CLI\b/,
    /\bexecFileAsync\s*\(\s*["']clang["']/,
  ].some((pattern) => pattern.test(body));
}

function findAsyncCompilerProcessTestsWithoutTimeoutPolicy(): string[] {
  const findings: string[] = [];

  for (const file of discoverCiSafeUnitTestFiles()) {
    const source = readFileSync(join(import.meta.dir, "..", file), "utf8");
    if (hasFileLevelBunTimeoutPolicy(source)) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const calleeName = ts.isIdentifier(callee) ? callee.text : undefined;
        const testFunction = node.arguments[1];

        if (
          (calleeName === "test" || calleeName === "it") &&
          testFunction &&
          (ts.isArrowFunction(testFunction) ||
            ts.isFunctionExpression(testFunction)) &&
          testFunction.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
          ) &&
          callsRealCompilerProcessWork(testFunction.body.getText(sourceFile)) &&
          !hasTestLevelBunTimeoutPolicy(sourceFile, node)
        ) {
          findings.push(
            `${file}: ${node.arguments[0]?.getText(sourceFile) ?? "<unnamed>"}`,
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return findings;
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
      "tests/PlaygroundExampleContracts.test.ts",
      "tests/Integration.test.ts",
      "tests/PlaygroundExamples.test.ts",
    ]);
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain(
      "PlaygroundExampleContracts.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain(
      "CompilerCorrectnessCorpus.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain("ReleaseSmoke.test.ts");
  });

  test("keeps ci:triage usage diagnostics in CI-safe discovery", () => {
    const ciSafeUnitTests = discoverCiSafeUnitTestFiles();
    const ciTriageTests = readFileSync(
      join(import.meta.dir, "CiTriage.test.ts"),
      "utf8",
    );

    expect(ciSafeUnitTests).toContain("tests/CiTriage.test.ts");
    expect(CI_SAFE_EXCLUDED_TEST_FILES).not.toContain("CiTriage.test.ts");
    expect(ciTriageTests).toContain(
      'test("rejects invalid run locators before GitHub API calls"',
    );
    expect(ciTriageTests).toContain(
      'test("rejects unreadable and malformed jobs-json files before GitHub API calls"',
    );
  });

  test("keeps async compiler process tests on explicit timeout budgets", () => {
    expect(findAsyncCompilerProcessTestsWithoutTimeoutPolicy()).toEqual([]);
  });

  test("plans runtime build, integration, registry sync, and CI-safe unit steps in order", () => {
    withTempTests(["Beta.test.ts", "Alpha.test.ts"], (testsDir) => {
      const plan = createTestCiPlan({ testsDir });

      expect(plan.map((step) => step.name)).toEqual([
        "Build runtime support",
        "Run integration and playground examples",
        "Run VS Code extension tests",
        "Check generated CLI registry shim",
        "Run CI-safe unit tests",
      ]);
      expect(plan.map((step) => [step.command, ...step.args])).toEqual([
        ["bun", "run", "build:runtime"],
        [
          "bun",
          "test",
          "tests/PlaygroundExampleContracts.test.ts",
          "tests/Integration.test.ts",
          "tests/PlaygroundExamples.test.ts",
        ],
        ["bun", "run", "test:vscode-ext"],
        ["bun", "run", "release:cli-registry"],
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
        "bun test tests/PlaygroundExampleContracts.test.ts tests/Integration.test.ts tests/PlaygroundExamples.test.ts",
      );
      expect(text).toContain("bun run test:vscode-ext");
      expect(text).toContain("# Check generated CLI registry shim");
      expect(text).toContain("bun run release:cli-registry");
      expect(text).toContain("bun test tests/Alpha.test.ts");
    });

    const packageJson = require("../package.json");
    expect(packageJson.scripts["test:ci"]).toBe("bun tools/test_ci.ts");
  });

  test("plans without unit tests when the tests directory is absent", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-missing-tests-"));

    try {
      const missingTestsDir = join(tempRoot, "tests");
      expect(discoverCiSafeUnitTestFiles(missingTestsDir)).toEqual([]);
      expect(
        createTestCiPlan({ testsDir: missingTestsDir }).map(
          (step) => step.name,
        ),
      ).toEqual([
        "Build runtime support",
        "Run integration and playground examples",
        "Run VS Code extension tests",
        "Check generated CLI registry shim",
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("keeps CLI help on stdout and usage failures on stderr", () => {
    const help = spawnSync("bun", ["tools/test_ci.ts", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: bun tools/test_ci.ts");
    expect(help.stdout).toContain("--list, --dry-run");
    expect(help.stderr).toBe("");

    const unknown = spawnSync("bun", ["tools/test_ci.ts", "--unknown"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(unknown.status).toBe(2);
    expect(unknown.stdout).toBe("");
    expect(unknown.stderr).toContain("Unknown option '--unknown'");
  });

  test("keeps CLI list, dry-run, and json planning modes non-executing", () => {
    for (const arg of ["--list", "--dry-run"] as const) {
      const result = spawnSync("bun", ["tools/test_ci.ts", arg], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("# Build runtime support");
      expect(result.stdout).toContain("bun run build:runtime");
      expect(result.stdout).toContain("# Run CI-safe unit tests");
    }

    const json = spawnSync("bun", ["tools/test_ci.ts", "--json"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(json.status).toBe(0);
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toMatchObject({
      schemaVersion: 1,
      check: "test-ci",
    });
  });

  test("rejects malformed inline option values before planning", () => {
    for (const [arg, message] of [
      ["--json=true", "--json does not accept a value"],
      ["--list=true", "--list does not accept a value"],
      ["--dry-run=true", "--dry-run does not accept a value"],
      ["--help=true", "--help does not accept a value"],
    ] as const) {
      const result = spawnSync("bun", ["tools/test_ci.ts", arg], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(message);
    }
  });

  test("formats concise success summaries for completed CI-safe runs", () => {
    withTempTests(["Alpha.test.ts"], (testsDir) => {
      const summary = formatTestCiSuccessSummary(
        createTestCiPlan({ testsDir }),
      );

      expect(summary).toBe("==> CI-safe validation passed (5 steps)");
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
        "==> CI-safe validation passed (1 step)",
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
