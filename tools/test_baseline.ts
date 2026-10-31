import { spawn } from "child_process";
import { closeSync, existsSync, openSync, readdirSync, writeSync } from "fs";
import { join } from "path";
import { getPositiveIntegerEnv } from "../compiler/common/Env";

// Runs the test suite and saves the combined output to test-baseline.txt.
// With no arguments, test files run in batches of BPL_BASELINE_BATCH_SIZE
// (default 40), each in its own `bun test` process, so a full baseline does
// not hold the whole suite in one process. Arguments are passed to a single
// `bun test` run unchanged.

export const BASELINE_LOG_FILE = "test-baseline.txt";
export const DEFAULT_BASELINE_BATCH_SIZE = 40;

export function discoverBaselineTestFiles(testsDir: string): string[] {
  if (!existsSync(testsDir)) return [];
  return readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.ts"))
    .sort()
    .map((name) => `tests/${name}`);
}

export function createBaselineBatches(
  args: readonly string[],
  testFiles: readonly string[],
  batchSize: number,
): string[][] {
  if (args.length > 0) return [[...args]];
  const batches: string[][] = [];
  for (let start = 0; start < testFiles.length; start += batchSize) {
    batches.push(testFiles.slice(start, start + batchSize));
  }
  return batches;
}

function runBatch(args: readonly string[], log: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["test", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const write = (chunk: Buffer) => {
      process.stdout.write(chunk);
      writeSync(log, chunk);
    };
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    child.on("error", (error) => {
      write(Buffer.from(`Failed to start bun test: ${error.message}\n`));
      resolve(1);
    });
    child.on("close", (status, signal) => {
      if (signal) write(Buffer.from(`bun test stopped by ${signal}\n`));
      resolve(status ?? 1);
    });
  });
}

export async function runBaseline(
  args: readonly string[],
  cwd = process.cwd(),
): Promise<number> {
  const batchSize = getPositiveIntegerEnv(
    "BPL_BASELINE_BATCH_SIZE",
    DEFAULT_BASELINE_BATCH_SIZE,
  );
  const batches = createBaselineBatches(
    args,
    discoverBaselineTestFiles(join(cwd, "tests")),
    batchSize,
  );
  const log = openSync(join(cwd, BASELINE_LOG_FILE), "w");
  let exitCode = 0;
  try {
    for (const [index, batch] of batches.entries()) {
      if (batches.length > 1) {
        const header = `\n==> Batch ${index + 1}/${batches.length} (${batch.length} ${batch.length === 1 ? "file" : "files"})\n`;
        process.stdout.write(header);
        writeSync(log, header);
      }
      const status = await runBatch(batch, log);
      if (status !== 0 && exitCode === 0) exitCode = status;
    }
  } finally {
    closeSync(log);
  }
  return exitCode;
}

if (import.meta.main) {
  process.exitCode = await runBaseline(process.argv.slice(2));
}
