import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const BPL_CLI = resolve(__dirname, "../../index.ts");

export interface CorrectnessCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OptimizationComparisonResult {
  o0: CorrectnessCommandResult;
  o3: CorrectnessCommandResult;
  stdout: string;
}

const INTERNAL_EXCEPTION_PATTERNS = [
  /TypeError:/,
  /ReferenceError:/,
  /RangeError:/,
  /SyntaxError:/,
  /Unhandled/i,
  /Cannot read (properties|property) of/i,
  /\bat .+\.(ts|js):\d+:\d+/,
];

function runCommand(
  args: string[],
  cwd: string,
  timeout: number = 30000,
): CorrectnessCommandResult {
  const result = spawnSync(args[0]!, args.slice(1), {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 1024 * 1024 * 16,
  });

  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: result.status ?? -1,
  };
}

function withSourceFile<T>(source: string, callback: (paths: {
  dir: string;
  sourcePath: string;
}) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "bpl-correctness-"));
  const sourcePath = join(dir, "main.bpl");
  writeFileSync(sourcePath, source);

  try {
    return callback({ dir, sourcePath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function failWithResult(message: string, result: CorrectnessCommandResult): never {
  throw new Error(
    [
      message,
      `exitCode: ${result.exitCode}`,
      result.stdout ? `stdout:\n${result.stdout}` : "",
      result.stderr ? `stderr:\n${result.stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function assertNoInternalException(result: CorrectnessCommandResult): void {
  const combined = `${result.stderr}\n${result.stdout}`;
  for (const pattern of INTERNAL_EXCEPTION_PATTERNS) {
    if (pattern.test(combined)) {
      failWithResult(
        `Compiler surfaced an internal exception matching ${pattern}`,
        result,
      );
    }
  }
}

export function runBplAtOptimization(
  source: string,
  optimizationLevel: 0 | 3,
): CorrectnessCommandResult {
  return withSourceFile(source, ({ dir, sourcePath }) =>
    runCommand(
      ["bun", BPL_CLI, "run", sourcePath, "-O", String(optimizationLevel)],
      dir,
    ),
  );
}

export function expectSameBehaviorAtO0AndO3(
  source: string,
): OptimizationComparisonResult {
  const o0 = runBplAtOptimization(source, 0);
  if (o0.exitCode !== 0) {
    failWithResult("BPL program failed at -O0", o0);
  }

  const o3 = runBplAtOptimization(source, 3);
  if (o3.exitCode !== 0) {
    failWithResult("BPL program failed at -O3", o3);
  }

  if (o3.stdout !== o0.stdout || o3.stderr !== o0.stderr) {
    throw new Error(
      [
        "BPL program output differs between -O0 and -O3",
        `-O0 stdout:\n${o0.stdout}`,
        `-O3 stdout:\n${o3.stdout}`,
        o0.stderr ? `-O0 stderr:\n${o0.stderr}` : "",
        o3.stderr ? `-O3 stderr:\n${o3.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return { o0, o3, stdout: o0.stdout };
}

export function expectValidLlvmAtOptimizations(source: string): void {
  withSourceFile(source, ({ dir, sourcePath }) => {
    for (const optimizationLevel of [0, 3] as const) {
      const irPath = join(dir, `main-O${optimizationLevel}.ll`);
      const build = runCommand(
        [
          "bun",
          BPL_CLI,
          "build",
          sourcePath,
          "-O",
          String(optimizationLevel),
          "--emit",
          "llvm",
          "-o",
          irPath,
        ],
        dir,
      );
      if (build.exitCode !== 0) {
        failWithResult(`BPL failed to emit LLVM IR at -O${optimizationLevel}`, build);
      }

      const clang = runCommand(
        [
          "clang",
          "-Wno-override-module",
          "-c",
          irPath,
          "-o",
          join(dir, `main-O${optimizationLevel}.o`),
        ],
        dir,
      );
      if (clang.exitCode !== 0) {
        failWithResult(
          `clang rejected emitted LLVM IR at -O${optimizationLevel}`,
          clang,
        );
      }
    }
  });
}

export function expectCleanCompilationFailure(
  source: string,
): CorrectnessCommandResult {
  const result = withSourceFile(source, ({ dir, sourcePath }) =>
    runCommand(["bun", BPL_CLI, "build", sourcePath], dir),
  );

  if (result.exitCode === 0) {
    failWithResult("Expected BPL compilation to fail", result);
  }

  assertNoInternalException(result);
  return result;
}
