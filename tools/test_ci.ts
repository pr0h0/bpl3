import { spawnSync } from "child_process";
import { readdirSync } from "fs";
import { basename, join } from "path";

export const CI_SAFE_FIXED_TEST_FILES = [
  "tests/Integration.test.ts",
  "tests/PlaygroundExamples.test.ts",
] as const;

export const CI_SAFE_EXCLUDED_TEST_FILES = [
  "Integration.test.ts",
  "PlaygroundExamples.test.ts",
  "CompilerCorrectnessCorpus.test.ts",
  "CompilerCorrectnessSeededFuzz.test.ts",
  "FuzzRegressionCorpus.test.ts",
  "FuzzDifferentialRegressionCorpus.test.ts",
  "CompilerSanitizerRuntime.test.ts",
  "CompilerFuzzRunner.test.ts",
  "ReleaseSmoke.test.ts",
  "fuzz.test.ts",
  "GoldenLLVMShapes.test.ts",
] as const;

export interface TestCiStep {
  name: string;
  command: string;
  args: string[];
}

export interface TestCiPlanOptions {
  testsDir?: string;
}

export interface TestCiStepResultSummary {
  status: number | null;
  signal: string | null;
  errorMessage?: string;
}

class UsageError extends Error {}

const EXCLUDED_TEST_FILE_SET = new Set<string>(CI_SAFE_EXCLUDED_TEST_FILES);

export function discoverCiSafeUnitTestFiles(
  testsDir = join(process.cwd(), "tests"),
): string[] {
  return readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.ts"))
    .filter((name) => !EXCLUDED_TEST_FILE_SET.has(name))
    .sort()
    .map((name) => `tests/${basename(name)}`);
}

export function createTestCiPlan(options: TestCiPlanOptions = {}): TestCiStep[] {
  const ciSafeUnitTests = discoverCiSafeUnitTestFiles(options.testsDir);

  return [
    {
      name: "Build runtime support",
      command: "bun",
      args: ["run", "build:runtime"],
    },
    {
      name: "Run integration and playground examples",
      command: "bun",
      args: ["test", ...CI_SAFE_FIXED_TEST_FILES],
    },
    {
      name: "Run VS Code extension tests",
      command: "bun",
      args: ["run", "test:vscode-ext"],
    },
    {
      name: "Run CI-safe unit tests",
      command: "bun",
      args: ["test", ...ciSafeUnitTests],
    },
  ];
}

function quoteShellArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

function formatCommand(step: TestCiStep): string {
  return [step.command, ...step.args].map(quoteShellArg).join(" ");
}

export function formatTestCiPlanText(plan: TestCiStep[]): string {
  return plan
    .map((step) => [`# ${step.name}`, formatCommand(step)].join("\n"))
    .join("\n\n");
}

export function formatTestCiSuccessSummary(plan: TestCiStep[]): string {
  return `==> CI-safe validation passed (${plan.length} steps)`;
}

export function formatTestCiFailureSummary(
  step: TestCiStep,
  result: TestCiStepResultSummary,
): string {
  const lines = [
    "==> CI-safe validation failed",
    `Failed step: ${step.name}`,
    `Command: ${formatCommand(step)}`,
  ];

  if (result.errorMessage) {
    lines.push(`Start error: ${result.errorMessage}`);
  }
  if (result.status !== null) {
    lines.push(`Exit status: ${result.status}`);
  }
  if (result.signal) {
    lines.push(`Signal: ${result.signal}`);
  }
  if (
    !result.errorMessage &&
    result.status === null &&
    result.signal === null
  ) {
    lines.push("No exit status was reported.");
  }

  return lines.join("\n");
}

export function runTestCiPlan(plan: TestCiStep[]): number {
  for (const step of plan) {
    console.log(`\n==> ${step.name}`);
    const result = spawnSync(step.command, step.args, {
      stdio: "inherit",
      env: process.env,
    });

    if (result.error) {
      console.error(
        `\n${formatTestCiFailureSummary(step, {
          status: result.status,
          signal: result.signal,
          errorMessage: result.error.message,
        })}`,
      );
      return 1;
    }

    if (result.status !== 0) {
      console.error(
        `\n${formatTestCiFailureSummary(step, {
          status: result.status,
          signal: result.signal,
        })}`,
      );
      return result.status ?? 1;
    }
  }

  console.log(`\n${formatTestCiSuccessSummary(plan)}`);
  return 0;
}

function parseArgs(argv: string[]): { list: boolean; json: boolean } {
  const options = { list: false, json: false };

  for (const arg of argv) {
    if (arg === "--list" || arg === "--dry-run") {
      options.list = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new UsageError(
        [
          "Usage: bun tools/test_ci.ts [--list|--dry-run] [--json]",
          "",
          "Runs the CI-safe local validation suite in the same order as CI.",
          "--list, --dry-run  Print the planned commands without running them.",
          "--json             Print the planned commands as JSON. Implies --list.",
        ].join("\n"),
      );
    } else {
      throw new UsageError(`Unknown option '${arg}'`);
    }
  }

  if (options.json) {
    options.list = true;
  }

  return options;
}

function main(argv: string[]): number {
  let options: { list: boolean; json: boolean };
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.log(error.message);
      return error.message.startsWith("Usage:") ? 0 : 2;
    }
    throw error;
  }

  const plan = createTestCiPlan();
  if (options.json) {
    console.log(JSON.stringify({ schemaVersion: 1, check: "test-ci", plan }));
    return 0;
  }
  if (options.list) {
    console.log(formatTestCiPlanText(plan));
    return 0;
  }

  return runTestCiPlan(plan);
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
