/**
 * Test Helper: Compile and Run BPL Code
 *
 * Provides utilities for compiling and running BPL code in tests.
 * Handles temporary file creation, cleanup, and error reporting.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../../index.ts");

/**
 * Options for compileAndRun
 */
export interface CompileAndRunOptions {
  /** Additional arguments to pass to the BPL CLI */
  args?: string[];
  /** Input to pass to stdin */
  input?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to keep temp files for debugging */
  keepFiles?: boolean;
}

/**
 * Result from compileAndRun
 */
export interface CompileAndRunResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code */
  exitCode: number;
  /** Path to temp file (if keepFiles=true) */
  tempFile?: string;
}

/**
 * Generate a unique temp file path
 */
function createTempSourcePath(prefix = "test"): {
  tempDir: string;
  tempFile: string;
} {
  const id = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-test-run-"));

  return {
    tempDir,
    tempFile: path.join(tempDir, `${prefix}_${timestamp}_${id}.bpl`),
  };
}

/**
 * Compile and run BPL source code
 *
 * @param sourceCode - BPL source code to compile and run
 * @param options - Optional configuration
 * @returns The stdout from running the program
 * @throws Error if compilation or execution fails
 *
 * @example
 * ```typescript
 * const output = compileAndRun(`
 *   extern printf(fmt: *i8, ...) ret i32;
 *   frame main() {
 *     printf("Hello, World!\\n");
 *   }
 * `);
 * expect(output).toContain("Hello, World!");
 * ```
 */
export function compileAndRun(
  sourceCode: string,
  options: CompileAndRunOptions = {},
): string {
  const result = compileAndRunFull(sourceCode, options);

  if (result.exitCode !== 0) {
    const errorMsg = [
      `BPL execution failed with code ${result.exitCode}`,
      result.stderr ? `stderr: ${result.stderr}` : "",
      result.stdout ? `stdout: ${result.stdout}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(errorMsg);
  }

  return result.stdout;
}

/**
 * Compile and run BPL source code, returning full result
 *
 * Unlike `compileAndRun`, this doesn't throw on failure and returns
 * the full result including exit code and stderr.
 *
 * @param sourceCode - BPL source code to compile and run
 * @param options - Optional configuration
 * @returns Full result including stdout, stderr, and exit code
 */
export function compileAndRunFull(
  sourceCode: string,
  options: CompileAndRunOptions = {},
): CompileAndRunResult {
  const {
    args = [],
    input,
    env,
    cwd = __dirname,
    timeout = 30000,
    keepFiles = false,
  } = options;

  const { tempDir, tempFile } = createTempSourcePath();

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const spawnOptions: Parameters<typeof spawnSync>[2] = {
      encoding: "utf-8" as const,
      cwd,
      timeout,
      input,
      env: env ? { ...process.env, ...env } : process.env,
    };

    const result = spawnSync(
      "bun",
      [BPL_CLI, "run", tempFile, ...args],
      spawnOptions,
    );

    return {
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
      exitCode: result.status ?? -1,
      tempFile: keepFiles ? tempFile : undefined,
    };
  } finally {
    if (!keepFiles) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Compile BPL source code without running
 *
 * @param sourceCode - BPL source code to compile
 * @param options - Optional configuration
 * @returns Result including path to compiled binary
 */
export function compileOnly(
  sourceCode: string,
  options: Omit<CompileAndRunOptions, "input"> = {},
): CompileAndRunResult & { binaryPath?: string } {
  const { args = [], env, cwd = __dirname, timeout = 30000 } = options;

  const { tempDir, tempFile } = createTempSourcePath();

  try {
    fs.writeFileSync(tempFile, sourceCode);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }

  const spawnOptions: Parameters<typeof spawnSync>[2] = {
    encoding: "utf-8" as const,
    cwd,
    timeout,
    env: env ? { ...process.env, ...env } : process.env,
  };

  const result = spawnSync(
    "bun",
    [BPL_CLI, "build", tempFile, ...args],
    spawnOptions,
  );

  const binaryPath = tempFile.replace(".bpl", "");

  return {
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    exitCode: result.status ?? -1,
    tempFile,
    binaryPath: fs.existsSync(binaryPath) ? binaryPath : undefined,
  };
}

/**
 * Check if BPL code compiles successfully without running
 *
 * @param sourceCode - BPL source code to check
 * @returns true if compilation succeeds
 */
export function compilesSuccessfully(sourceCode: string): boolean {
  const result = compileAndRunFull(sourceCode);
  return result.exitCode === 0;
}

/**
 * Get compilation errors from BPL code
 *
 * @param sourceCode - BPL source code to check
 * @returns Array of error messages, or empty array if compilation succeeds
 */
export function getCompilationErrors(sourceCode: string): string[] {
  const result = compileAndRunFull(sourceCode);
  if (result.exitCode === 0) {
    return [];
  }

  // Parse errors from stderr
  const errorLines = result.stderr
    .split("\n")
    .filter((line) => line.includes("error") || line.includes("Error"));

  return errorLines.length > 0 ? errorLines : [result.stderr];
}
