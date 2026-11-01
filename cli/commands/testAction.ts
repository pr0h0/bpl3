import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type * as AST from "../../compiler/common/AST";
import { Compiler } from "../../compiler";
import { updateConfig } from "../../compiler/common/Config";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import { Parser } from "../../compiler/frontend/Parser";
import { compileToBinary } from "../BinaryRunner";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import { expandSourceInputs } from "../SourceInputs";
import { getHostDefaults } from "../utils";
import {
  TEST_NO_INPUTS_CODE,
  TEST_PROCESSING_ERROR_CODE,
  type TestOptions,
} from "./test";

/** Each test runs in its own process and is stopped after this long. */
export const TEST_TIMEOUT_MS = 60_000;

export interface TestCase {
  name: string;
  /** `ret int` tests fail with a nonzero result; others fail by throwing. */
  returnsStatus: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  output: string;
}

export interface TestFileResult {
  file: string;
  tests: TestResult[];
  error?: string;
}

const TEST_FILE_SUFFIX = "_test.bpl";
const TEST_NAME = /^test[A-Z0-9_]/;

/** Test files among the expanded inputs: sources named `*_test.bpl`. */
export function findTestFiles(inputs: readonly string[]): string[] {
  return expandSourceInputs([...inputs]).filter((file) =>
    path.basename(file).endsWith(TEST_FILE_SUFFIX),
  );
}

/**
 * Top-level frames named `testSomething` or `test_something` that take no
 * parameters and return nothing or an int. A test file must not define
 * `main`, which the runner generates.
 */
export function findTestCases(program: AST.Program): TestCase[] {
  const frames = program.statements.filter(
    (statement): statement is AST.FunctionDecl =>
      statement.kind === "FunctionDecl",
  );
  if (frames.some((frame) => frame.name === "main")) {
    throw new Error("A test file must not define main; bpl test generates it.");
  }
  return frames
    .filter((frame) => TEST_NAME.test(frame.name) && frame.params.length === 0)
    .flatMap((frame): TestCase[] => {
      const returnType = frame.returnType as AST.BasicTypeNode | undefined;
      const name = returnType?.kind === "BasicType" ? returnType.name : "void";
      const pointer =
        returnType?.kind === "BasicType" && returnType.pointerDepth;
      if (name === "void" && !pointer) {
        return [{ name: frame.name, returnsStatus: false }];
      }
      if ((name === "int" || name === "i32") && !pointer) {
        return [{ name: frame.name, returnsStatus: true }];
      }
      return [];
    });
}

/** A `main` that runs the test whose index is its first argument. */
export function generateTestMain(tests: readonly TestCase[]): string {
  const branches = tests.map((test, index) =>
    test.returnsStatus
      ? `    if (bplTestIndex == ${index}) {\n        return ${test.name}();\n    }\n`
      : `    if (bplTestIndex == ${index}) {\n        ${test.name}();\n        return 0;\n    }\n`,
  );
  return `
frame main(bplTestArgc: int, bplTestArgv: *string) ret int {
    if (bplTestArgc < 2) {
        return 2;
    }
    local bplTestSelector: string = bplTestArgv[1];
    local bplTestIndex: int = 0;
    loop (local i: int = 0; bplTestSelector[i] != cast<char>(0); i = i + 1) {
        bplTestIndex = bplTestIndex * 10 + (cast<int>(bplTestSelector[i]) - 48);
    }
${branches.join("")}    return 2;
}
`;
}

function buildTestBinary(
  file: string,
  source: string,
  tests: readonly TestCase[],
  directory: string,
): string {
  const irPath = path.join(directory, "tests.ll");
  const compiler = new Compiler({
    filePath: path.resolve(file),
    outputPath: irPath,
    emitType: "llvm",
    resolveImports: true,
    target: getHostDefaults().target,
    optimizationLevel: 0,
    treeShakeTopLevelFunctions: true,
  });
  const result = compiler.compile(source + generateTestMain(tests));
  if (!result.success || !result.output) {
    throw new Error(
      result.errors?.length
        ? diagnosticFormatter.formatErrors(result.errors)
        : "Compilation failed",
    );
  }
  fs.writeFileSync(irPath, result.output);
  const binary = compileToBinary(irPath, {});
  if (!binary.success || !binary.executablePath) {
    throw new Error(binary.error || "Linking the test binary failed");
  }
  return binary.executablePath;
}

function runTest(executable: string, index: number, name: string): TestResult {
  const started = Date.now();
  const run = spawnSync(executable, [String(index)], {
    encoding: "utf8",
    timeout: TEST_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  const timedOut =
    run.error && (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  const output =
    (run.stdout ?? "") +
    (run.stderr ?? "") +
    (timedOut ? `Timed out after ${TEST_TIMEOUT_MS / 1000}s\n` : "") +
    (run.signal && !timedOut ? `Stopped by ${run.signal}\n` : "");
  return {
    name,
    passed: run.status === 0,
    exitCode: run.status,
    durationMs: Date.now() - started,
    output,
  };
}

/** The tests of one file, without building it. */
export function listTestFile(file: string, filter?: string): TestFileResult {
  try {
    const source = fs.readFileSync(file, "utf8");
    const tests = findTestCases(new Parser(source, file).parse()).filter(
      (test) => !filter || test.name.includes(filter),
    );
    return {
      file,
      tests: tests.map((test) => ({
        name: test.name,
        passed: false,
        exitCode: null,
        durationMs: 0,
        output: "",
      })),
    };
  } catch (error) {
    return {
      file,
      tests: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build and run the tests of one file. With `failFast`, tests after the
 * first failure are not run.
 */
export function runTestFile(
  file: string,
  filter?: string,
  failFast = false,
): TestFileResult {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-test-"));
  try {
    const source = fs.readFileSync(file, "utf8");
    const program = new Parser(source, file).parse();
    const tests = findTestCases(program).filter(
      (test) => !filter || test.name.includes(filter),
    );
    if (tests.length === 0) return { file, tests: [] };
    const executable = buildTestBinary(file, source, tests, directory);
    const results: TestResult[] = [];
    for (const [index, test] of tests.entries()) {
      const result = runTest(executable, index, test.name);
      results.push(result);
      if (failFast && !result.passed) break;
    }
    return { file, tests: results };
  } catch (error) {
    return {
      file,
      tests: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function indent(text: string): string {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

export async function runTestCommand(
  paths: string[] | undefined,
  options: TestOptions,
): Promise<number> {
  if (options.color !== undefined) {
    updateConfig({ features: { colorize: options.color } });
    diagnosticFormatter.setConfig({ colorize: options.color });
  }
  const started = Date.now();
  let files: string[];
  try {
    files = findTestFiles(paths && paths.length > 0 ? paths : ["."]);
  } catch (error) {
    return reportFailure(
      options,
      error instanceof Error ? error.message : String(error),
      TEST_PROCESSING_ERROR_CODE,
    );
  }
  if (files.length === 0) {
    return reportFailure(
      options,
      "No test files found (files named *_test.bpl).",
      TEST_NO_INPUTS_CODE,
    );
  }

  if (options.list) {
    const listed = files.map((file) => listTestFile(file, options.filter));
    if (options.json) {
      console.log(
        JSON.stringify(
          createJsonReport(CLI_JSON_CHECKS.test, true, {
            totalFiles: listed.length,
            totalTests: listed.reduce((n, r) => n + r.tests.length, 0),
            files: listed.map((result) => ({
              file: result.file,
              tests: result.tests.map((test) => test.name),
              ...(result.error ? { error: result.error } : {}),
            })),
          }),
          null,
          2,
        ),
      );
    } else {
      for (const result of listed) {
        if (result.error) console.log(`ERROR ${result.file}`);
        for (const test of result.tests) {
          console.log(`${result.file} ${test.name}`);
        }
      }
    }
    return listed.some((result) => result.error) ? 1 : 0;
  }

  const results: TestFileResult[] = [];
  for (const file of files) {
    const result = runTestFile(file, options.filter, options.failFast);
    results.push(result);
    if (
      options.failFast &&
      (result.error || result.tests.some((test) => !test.passed))
    ) {
      break;
    }
  }
  const tests = results.flatMap((result) => result.tests);
  const passed = tests.filter((test) => test.passed).length;
  const failed = tests.length - passed;
  const fileErrors = results.filter((result) => result.error).length;
  const success = failed === 0 && fileErrors === 0;

  if (options.json) {
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.test, success, {
          totalFiles: results.length,
          totalTests: tests.length,
          passed,
          failed,
          fileErrors,
          timeMs: Date.now() - started,
          files: results,
        }),
        null,
        2,
      ),
    );
    return success ? 0 : 1;
  }

  for (const result of results) {
    if (result.error) {
      console.log(`ERROR ${result.file}\n${indent(result.error)}`);
      continue;
    }
    for (const test of result.tests) {
      console.log(
        `${test.passed ? "PASS" : "FAIL"} ${result.file} ${test.name} (${test.durationMs}ms)`,
      );
      if ((!test.passed || options.verbose) && test.output.trim()) {
        console.log(indent(test.output));
      }
      if (!test.passed && test.exitCode !== null) {
        console.log(`      exit status ${test.exitCode}`);
      }
    }
  }
  console.log(
    `\n${passed} passed, ${failed} failed` +
      (fileErrors ? `, ${fileErrors} file(s) could not be built` : "") +
      ` (${Date.now() - started}ms)`,
  );
  return success ? 0 : 1;
}

function reportFailure(
  options: TestOptions,
  message: string,
  errorCode: string,
): number {
  if (options.json) {
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.test, false, {
          totalFiles: 0,
          totalTests: 0,
          passed: 0,
          failed: 0,
          fileErrors: 0,
          timeMs: 0,
          files: [],
          error: message,
          errorCode,
        }),
        null,
        2,
      ),
    );
  } else {
    console.error(message);
  }
  return 1;
}
