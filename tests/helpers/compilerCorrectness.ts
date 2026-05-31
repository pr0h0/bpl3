import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import {
  getPositiveIntegerEnv,
  TIMEOUT_ENV_DEFAULTS,
} from "../../compiler/common/Env";
import { verifyLlvmFile } from "../../compiler/common/LlvmVerifier";
import {
  explainBplSanitizerSupportFailure,
  SANITIZER_DIAGNOSTIC_COMMANDS,
} from "../../compiler/common/SanitizerSupport";

export { explainBplSanitizerSupportFailure };

const BPL_CLI = resolve(__dirname, "../../index.ts");

export interface CorrectnessCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SanitizerSupportResult {
  supported: boolean;
  reason?: string;
}

interface RunCommandOptions {
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

export interface OptimizationComparisonResult {
  o0: CorrectnessCommandResult;
  o3: CorrectnessCommandResult;
  stdout: string;
}

export interface CorrectnessProgram {
  name: string;
  source: string;
  expectedStdout?: string;
  validateLlvm?: boolean;
}

export interface CorrectnessProgramResult extends OptimizationComparisonResult {
  name: string;
}

export interface CleanFailureCase {
  name: string;
  source: string;
  expectedMessage?: string | RegExp;
}

export interface RuntimeFailureCase {
  name: string;
  source: string;
  expectedMessage: string | RegExp;
}

const SEEDED_DIFFERENTIAL_FAMILIES = [
  "arithmetic-loop",
  "struct-array",
  "enum-match",
  "generic-branch",
  "lambda-capture",
  "pointer-array",
] as const;

export type SeededDifferentialFamily =
  (typeof SEEDED_DIFFERENTIAL_FAMILIES)[number];

export interface SeededDifferentialProgram extends CorrectnessProgram {
  seed: number;
  family: SeededDifferentialFamily;
  expectedStdout: string;
}

export interface SeededDifferentialResult
  extends CorrectnessProgramResult {
  seed: number;
  family: SeededDifferentialFamily;
  source: string;
  expectedStdout: string;
}

export interface SeededDifferentialOptions {
  seeds: readonly number[];
  validateLlvm?: boolean;
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
const SANITIZER_CLANG_FLAG = "--clang-flag=-fsanitize=address,undefined";
let cachedSanitizerSupport: SanitizerSupportResult | undefined;

export function getSanitizerRuntimeTestTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): number {
  return getPositiveIntegerEnv(
    "SANITIZER_RUNTIME_TEST_TIMEOUT_MS",
    TIMEOUT_ENV_DEFAULTS.SANITIZER_RUNTIME_TEST_TIMEOUT_MS,
    { env, warn },
  );
}

function runCommand(
  args: string[],
  cwd: string,
  options: number | RunCommandOptions = 30000,
): CorrectnessCommandResult {
  const normalizedOptions =
    typeof options === "number" ? { timeout: options } : options;
  const result = spawnSync(args[0]!, args.slice(1), {
    cwd,
    encoding: "utf8",
    timeout: normalizedOptions.timeout ?? 30000,
    env: normalizedOptions.env,
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

export function runBplWithSanitizers(
  source: string,
  optimizationLevel: 0 | 3,
): CorrectnessCommandResult {
  return withSourceFile(source, ({ dir, sourcePath }) =>
    runCommand(
      [
        "bun",
        BPL_CLI,
        SANITIZER_CLANG_FLAG,
        "run",
        sourcePath,
        "-O",
        String(optimizationLevel),
      ],
      dir,
      {
        timeout: 60000,
        env: {
          ...process.env,
          ASAN_OPTIONS: [
            process.env.ASAN_OPTIONS,
            "detect_leaks=0",
            "halt_on_error=1",
          ]
            .filter(Boolean)
            .join(":"),
          UBSAN_OPTIONS: [
            process.env.UBSAN_OPTIONS,
            "halt_on_error=1",
            "print_stacktrace=1",
          ]
            .filter(Boolean)
            .join(":"),
        },
      },
    ),
  );
}

export function checkBplSanitizerSupport(): SanitizerSupportResult {
  if (cachedSanitizerSupport !== undefined) {
    return cachedSanitizerSupport;
  }

  const result = runBplWithSanitizers(
    'extern printf(fmt: string, ...); frame main() ret int { printf("sanitizer-probe\\n"); return 0; }',
    0,
  );

  cachedSanitizerSupport =
    result.exitCode === 0
      ? { supported: true }
      : {
          supported: false,
          reason: explainBplSanitizerSupportFailure(
            result,
            SANITIZER_DIAGNOSTIC_COMMANDS,
          ),
        };

  return cachedSanitizerSupport;
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

export function expectSameRuntimeFailureAtO0AndO3(
  source: string,
  expectedMessage: string | RegExp,
): OptimizationComparisonResult {
  const o0 = runBplAtOptimization(source, 0);
  const o3 = runBplAtOptimization(source, 3);

  if (o0.exitCode === 0) {
    failWithResult("Expected BPL program to fail at -O0", o0);
  }

  if (o3.exitCode === 0) {
    failWithResult("Expected BPL program to fail at -O3", o3);
  }

  const o0Output = `${o0.stderr}\n${o0.stdout}`;
  const o3Output = `${o3.stderr}\n${o3.stdout}`;
  if (!matchesExpectedMessage(o0Output, expectedMessage)) {
    failWithResult(
      `Expected -O0 failure output to match ${expectedMessage}`,
      o0,
    );
  }
  if (!matchesExpectedMessage(o3Output, expectedMessage)) {
    failWithResult(
      `Expected -O3 failure output to match ${expectedMessage}`,
      o3,
    );
  }

  return { o0, o3, stdout: o0.stdout };
}

export function expectRuntimeFailureSuite(
  cases: RuntimeFailureCase[],
): OptimizationComparisonResult[] {
  return cases.map((testCase) => {
    try {
      return expectSameRuntimeFailureAtO0AndO3(
        testCase.source,
        testCase.expectedMessage,
      );
    } catch (error) {
      throw new Error(
        [
          `Runtime failure case failed: ${testCase.name}`,
          formatUnknownError(error),
        ].join("\n"),
      );
    }
  });
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function createSeededRng(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function nextInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function generateArithmeticLoopProgram(
  seed: number,
  rng: () => number,
): Pick<SeededDifferentialProgram, "source" | "expectedStdout"> {
  const count = nextInt(rng, 4, 8);
  const scale = nextInt(rng, 2, 7);
  const offset = nextInt(rng, 1, 9);

  let total = offset;
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      total += i * scale + offset;
    } else {
      total -= i + scale;
    }
  }

  return {
    expectedStdout: `seed=${seed} family=arithmetic-loop total=${total}\n`,
    source: `
      extern printf(fmt: string, ...);

      frame main() ret int {
        local total: int = ${offset};
        local i: int = 0;

        loop (i < ${count}) {
          if ((i % 2) == 0) {
            total = total + (i * ${scale}) + ${offset};
          } else {
            total = total - i - ${scale};
          }

          i = i + 1;
        }

        printf("seed=%d family=arithmetic-loop total=%d\\n", ${seed}, total);
        return 0;
      }
    `,
  };
}

function generateStructArrayProgram(
  seed: number,
  rng: () => number,
): Pick<SeededDifferentialProgram, "source" | "expectedStdout"> {
  const left = nextInt(rng, 1, 9);
  const right = nextInt(rng, 3, 12);
  const values = Array.from({ length: 4 }, () => nextInt(rng, 1, 5));
  const finalLeft = values.reduce((total, value) => total + value, left);
  const finalRight = values.reduce((total, value) => total + value * 2, right);

  return {
    expectedStdout: `seed=${seed} family=struct-array pair=${finalLeft},${finalRight}\n`,
    source: `
      extern printf(fmt: string, ...);

      struct Pair {
        left: int,
        right: int,
      }

      frame bump(pair: *Pair, value: int) ret void {
        pair.left = pair.left + value;
        pair.right = pair.right + (value * 2);
      }

      frame main() ret int {
        local pair: Pair = Pair { left: ${left}, right: ${right} };
        local values: int[4] = [${values.join(", ")}];
        local i: int = 0;

        loop (i < 4) {
          bump(&pair, values[i]);
          i = i + 1;
        }

        printf("seed=%d family=struct-array pair=%d,%d\\n", ${seed}, pair.left, pair.right);
        return 0;
      }
    `,
  };
}

function generateEnumMatchProgram(
  seed: number,
  rng: () => number,
): Pick<SeededDifferentialProgram, "source" | "expectedStdout"> {
  const redBonus = nextInt(rng, 1, 5);
  const greenBonus = nextInt(rng, 6, 10);
  const blueBonus = nextInt(rng, 11, 15);
  const base = nextInt(rng, 2, 8);
  const variants = ["Red", "Green", "Blue"] as const;
  const firstIndex = nextInt(rng, 0, variants.length - 1);
  const secondIndex = (firstIndex + nextInt(rng, 1, 2)) % variants.length;
  const bonuses = [redBonus, greenBonus, blueBonus] as const;
  const total = base + bonuses[firstIndex]! + base + 1 + bonuses[secondIndex]!;

  return {
    expectedStdout: `seed=${seed} family=enum-match total=${total}\n`,
    source: `
      extern printf(fmt: string, ...);

      enum Color { Red, Green, Blue }

      frame score(color: Color, base: int) ret int {
        return match (color) {
          Color.Red => base + ${redBonus},
          Color.Green => base + ${greenBonus},
          Color.Blue => base + ${blueBonus},
        };
      }

      frame main() ret int {
        local total: int = score(Color.${variants[firstIndex]}, ${base}) + score(Color.${variants[secondIndex]}, ${base + 1});
        printf("seed=%d family=enum-match total=%d\\n", ${seed}, total);
        return 0;
      }
    `,
  };
}

function generateGenericBranchProgram(
  seed: number,
  rng: () => number,
): Pick<SeededDifferentialProgram, "source" | "expectedStdout"> {
  const left = nextInt(rng, 8, 25);
  const right = nextInt(rng, 3, 22);
  const adjustment = nextInt(rng, 2, 9);
  const result =
    left > right ? left - right + adjustment : right - left + adjustment * 2;

  return {
    expectedStdout: `seed=${seed} family=generic-branch result=${result}\n`,
    source: `
      extern printf(fmt: string, ...);

      frame id<T>(value: T) ret T {
        return value;
      }

      frame compareDistance(a: int, b: int) ret int {
        local left: int = id<int>(a);
        local right: int = id<int>(b);

        if (left > right) {
          return (left - right) + ${adjustment};
        }

        return (right - left) + ${adjustment * 2};
      }

      frame main() ret int {
        local result: int = compareDistance(${left}, ${right});
        printf("seed=%d family=generic-branch result=%d\\n", ${seed}, result);
        return 0;
      }
    `,
  };
}

function generateLambdaCaptureProgram(
  seed: number,
  rng: () => number,
): Pick<SeededDifferentialProgram, "source" | "expectedStdout"> {
  const base = nextInt(rng, 3, 15);
  const multiplier = nextInt(rng, 2, 6);
  const input = nextInt(rng, 4, 12);
  const offset = nextInt(rng, 1, 5);
  const result = input * multiplier + base - offset;

  return {
    expectedStdout: `seed=${seed} family=lambda-capture result=${result}\n`,
    source: `
      extern printf(fmt: string, ...);

      frame main() ret int {
        local base: int = ${base};
        local multiplier: int = ${multiplier};
        local transform: Lambda<int>(int) = |x: int| ret int {
          return (x * multiplier) + base;
        };
        local result: int = transform(${input}) - ${offset};

        printf("seed=%d family=lambda-capture result=%d\\n", ${seed}, result);
        return 0;
      }
    `,
  };
}

function generatePointerArrayProgram(
  seed: number,
  rng: () => number,
): Pick<SeededDifferentialProgram, "source" | "expectedStdout"> {
  const values = Array.from({ length: 6 }, () => nextInt(rng, 1, 9));
  const row = nextInt(rng, 0, 1);
  const col = nextInt(rng, 0, 2);
  const replacement = nextInt(rng, 20, 60);
  const matrix = [
    values.slice(0, 3),
    values.slice(3, 6),
  ];
  matrix[row]![col] = replacement;
  const diagonal = matrix[0]![0]! + matrix[1]![2]!;

  return {
    expectedStdout: `seed=${seed} family=pointer-array cell=${replacement} diag=${diagonal}\n`,
    source: `
      extern printf(fmt: string, ...);

      type IntArray = int[3];

      frame writeCell(rows: *IntArray, row: int, col: int, value: int) {
        (*(rows + row))[col] = value;
      }

      frame readCell(rows: *IntArray, row: int, col: int) ret int {
        return (*(rows + row))[col];
      }

      frame main() ret int {
        local matrix: int[2][3] = [
          [${values.slice(0, 3).join(", ")}],
          [${values.slice(3, 6).join(", ")}],
        ];
        local rows: *IntArray = &matrix[0];

        writeCell(rows, ${row}, ${col}, ${replacement});
        printf(
          "seed=%d family=pointer-array cell=%d diag=%d\\n",
          ${seed},
          readCell(rows, ${row}, ${col}),
          matrix[0][0] + matrix[1][2],
        );
        return 0;
      }
    `,
  };
}

function generateSeededDifferentialProgram(
  seed: number,
): SeededDifferentialProgram {
  const family =
    SEEDED_DIFFERENTIAL_FAMILIES[
      Math.abs(Math.trunc(seed)) % SEEDED_DIFFERENTIAL_FAMILIES.length
    ]!;
  const rng = createSeededRng(seed);
  const generated =
    family === "arithmetic-loop"
      ? generateArithmeticLoopProgram(seed, rng)
      : family === "struct-array"
        ? generateStructArrayProgram(seed, rng)
        : family === "enum-match"
          ? generateEnumMatchProgram(seed, rng)
          : family === "generic-branch"
            ? generateGenericBranchProgram(seed, rng)
            : family === "lambda-capture"
              ? generateLambdaCaptureProgram(seed, rng)
              : generatePointerArrayProgram(seed, rng);

  return {
    seed,
    family,
    name: `seed ${seed} ${family}`,
    ...generated,
  };
}

export function generateSeededDifferentialPrograms(
  seeds: readonly number[],
): SeededDifferentialProgram[] {
  return seeds.map(generateSeededDifferentialProgram);
}

export function expectSeededDifferentialCorpus(
  options: SeededDifferentialOptions,
): SeededDifferentialResult[] {
  return generateSeededDifferentialPrograms(options.seeds).map((program) => {
    try {
      const result = expectCorrectnessSuite([
        {
          ...program,
          validateLlvm: options.validateLlvm === true,
        },
      ])[0]!;

      return {
        seed: program.seed,
        family: program.family,
        source: program.source,
        expectedStdout: program.expectedStdout,
        ...result,
      };
    } catch (error) {
      throw new Error(
        [
          `Seeded differential case failed: seed ${program.seed} (${program.family})`,
          formatUnknownError(error),
          `source:\n${program.source.trim()}`,
        ].join("\n"),
      );
    }
  });
}

export function expectCorrectnessSuite(
  cases: CorrectnessProgram[],
): CorrectnessProgramResult[] {
  return cases.map((testCase) => {
    try {
      const result = expectSameBehaviorAtO0AndO3(testCase.source);

      if (
        testCase.expectedStdout !== undefined &&
        result.stdout !== testCase.expectedStdout
      ) {
        throw new Error(
          [
            `Expected stdout:\n${testCase.expectedStdout}`,
            `Actual stdout:\n${result.stdout}`,
          ].join("\n"),
        );
      }

      if (testCase.validateLlvm === true) {
        expectValidLlvmAtOptimizations(testCase.source);
      }

      return {
        name: testCase.name,
        ...result,
      };
    } catch (error) {
      throw new Error(
        [
          `Correctness case failed: ${testCase.name}`,
          formatUnknownError(error),
        ].join("\n"),
      );
    }
  });
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
        failWithResult(
          `BPL failed to emit LLVM IR at -O${optimizationLevel}`,
          build,
        );
      }

      const verifier = verifyLlvmFile(irPath, { cwd: dir });
      if (verifier.exitCode !== 0) {
        failWithResult(
          `LLVM verifier (${verifier.tool}) rejected emitted LLVM IR at -O${optimizationLevel}`,
          verifier,
        );
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

function matchesExpectedMessage(
  output: string,
  expectedMessage: string | RegExp,
): boolean {
  if (typeof expectedMessage === "string") {
    return output.includes(expectedMessage);
  }

  expectedMessage.lastIndex = 0;
  return expectedMessage.test(output);
}

export function expectCleanFailureSuite(
  cases: CleanFailureCase[],
): CorrectnessCommandResult[] {
  return cases.map((testCase) => {
    try {
      const result = expectCleanCompilationFailure(testCase.source);
      const output = `${result.stderr}\n${result.stdout}`;

      if (
        testCase.expectedMessage !== undefined &&
        !matchesExpectedMessage(output, testCase.expectedMessage)
      ) {
        throw new Error(
          [
            `Expected failure output to match: ${testCase.expectedMessage}`,
            result.stdout ? `stdout:\n${result.stdout}` : "",
            result.stderr ? `stderr:\n${result.stderr}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      return result;
    } catch (error) {
      throw new Error(
        [
          `Clean failure case failed: ${testCase.name}`,
          formatUnknownError(error),
        ].join("\n"),
      );
    }
  });
}
