import * as path from "path";
import { runFuzzCampaign, type FuzzCampaignOptions } from "./compilerFuzz";

interface CliOptions {
  iterationsPerSeed: number;
  seeds: number[];
  crashDir: string;
  progressInterval: number;
  enableDifferential: boolean;
  minimizeFailures: boolean;
  maxMinimizePasses?: number;
}

class CliUsageError extends Error {}

const DEFAULT_ITERATIONS_PER_SEED = 10000;
const DEFAULT_SEEDS = [0x5eed1234];
const CLI_OPTIONS_WITH_VALUES = new Set([
  "iterations",
  "seeds",
  "crash-dir",
  "progress",
  "minimize-passes",
]);
const CLI_BOOLEAN_OPTIONS = new Set(["differential", "minimize"]);

function parseCliOptions(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      throw new CliUsageError(`Unexpected argument: ${arg}`);
    }

    const parts = arg.slice(2).split("=", 2);
    const rawKey = parts[0];
    if (!rawKey) {
      throw new CliUsageError(
        `Missing option name in '${arg}'. Use --help for usage.`,
      );
    }

    const key = rawKey.trim();
    const inlineValue = parts[1];

    if (CLI_BOOLEAN_OPTIONS.has(key)) {
      const nextArg = argv[index + 1];
      const value =
        inlineValue ??
        (nextArg !== undefined && !nextArg.startsWith("--")
          ? argv[++index]!
          : "true");
      if (value.trim().length === 0) {
        throw new CliUsageError(
          `--${key} requires a non-empty boolean value. Use --help for usage.`,
        );
      }
      values.set(key, value);
      continue;
    }

    if (!CLI_OPTIONS_WITH_VALUES.has(key)) {
      throw new CliUsageError(
        `Unknown option --${key}. Use --help for usage.`,
      );
    }

    const nextArg = argv[index + 1];
    const value =
      inlineValue ??
      (nextArg !== undefined && !nextArg.startsWith("--")
        ? argv[++index]!
        : undefined);
    if (value === undefined) {
      throw new CliUsageError(
        `--${key} requires a value. Use --help for usage.`,
      );
    }
    if (value.trim().length === 0) {
      throw new CliUsageError(
        `--${key} requires a non-empty value. Use --help for usage.`,
      );
    }
    values.set(key, value);
  }

  const iterationsValue =
    values.get("iterations") ??
    env.FUZZ_ITERATIONS ??
    `${DEFAULT_ITERATIONS_PER_SEED}`;
  const seedsValue =
    values.get("seeds") ??
    env.FUZZ_SEEDS ??
    DEFAULT_SEEDS.map(formatSeed).join(",");
  const crashDir =
    values.get("crash-dir") ??
    env.FUZZ_CRASH_DIR ??
    path.join(__dirname, "crashes");
  const progressValue = values.get("progress") ?? env.FUZZ_PROGRESS ?? "1000";
  const differentialValue =
    values.get("differential") ?? env.FUZZ_DIFFERENTIAL ?? "false";
  const minimizeValue = values.get("minimize") ?? env.FUZZ_MINIMIZE ?? "false";
  const minimizePassesValue =
    values.get("minimize-passes") ?? env.FUZZ_MINIMIZE_PASSES;

  return {
    iterationsPerSeed: parsePositiveInteger(iterationsValue, "iterations"),
    seeds: parseSeeds(seedsValue),
    crashDir,
    progressInterval: parsePositiveInteger(progressValue, "progress"),
    enableDifferential: parseBoolean(differentialValue, "differential"),
    minimizeFailures: parseBoolean(minimizeValue, "minimize"),
    maxMinimizePasses:
      minimizePassesValue === undefined
        ? undefined
        : parsePositiveInteger(minimizePassesValue, "minimize-passes"),
  };
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(
      `${name} must be a positive integer, got '${value}'.`,
    );
  }
  return parsed;
}

function parseSeeds(value: string): number[] {
  const seedTexts = value.split(",").map((seed) => seed.trim());
  if (seedTexts.length === 0 || seedTexts.every((seed) => seed.length === 0)) {
    throw new CliUsageError(
      `seeds must be comma-separated integers, got '${value}'.`,
    );
  }

  const seeds: number[] = [];
  for (const seedText of seedTexts) {
    if (seedText.length === 0) {
      throw new CliUsageError(
        `seeds must not contain empty entries, got '${value}'.`,
      );
    }

    if (seedText.startsWith("-")) {
      throw new CliUsageError(
        `seeds must be unsigned 32-bit integers, got '${value}'.`,
      );
    }

    if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(seedText)) {
      throw new CliUsageError(
        `seeds must be comma-separated integers, got '${value}'.`,
      );
    }

    const seed = Number(seedText);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new CliUsageError(
        `seeds must be unsigned 32-bit integers, got '${value}'.`,
      );
    }
    seeds.push(seed);
  }

  return seeds;
}

function parseBoolean(value: string, name: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new CliUsageError(`${name} must be a boolean value, got '${value}'.`);
}

function printHelp(): void {
  console.log(`Usage: bun fuzz/run_fuzz.ts [options]

Options:
  --iterations <n>    Iterations to run per seed (default: ${DEFAULT_ITERATIONS_PER_SEED})
  --seeds <list>      Comma-separated unsigned 32-bit decimal or 0x-prefixed seeds
  --crash-dir <dir>   Directory for .bpl repros and .json metadata
  --progress <n>      Progress log interval per seed (default: 1000)
  --differential      Include deterministic O0/O3 runtime comparison inputs
  --minimize <bool>   Write token-minimized .min.bpl artifacts for failures
  --minimize-passes <n>
                     Maximum minimization passes per failed artifact

Environment:
  FUZZ_ITERATIONS, FUZZ_SEEDS, FUZZ_CRASH_DIR, FUZZ_PROGRESS, FUZZ_DIFFERENTIAL,
  FUZZ_MINIMIZE, FUZZ_MINIMIZE_PASSES
`);
}

function printSummary(summary: ReturnType<typeof runFuzzCampaign>): void {
  console.log("\n--- Fuzz Campaign Results ---");
  console.log(`Total iterations: ${summary.totalIterations}`);
  console.log(`Valid programs: ${summary.validPrograms}`);
  console.log(`Expected compiler errors: ${summary.expectedErrors}`);
  console.log(`Crashes: ${summary.crashes}`);
  console.log(`Mismatches: ${summary.mismatches}`);
  console.log(`Stage counts: ${JSON.stringify(summary.stageCounts)}`);

  for (const seedSummary of summary.seedSummaries) {
    console.log(
      [
        `seed ${formatSeed(seedSummary.seed)}`,
        `valid=${seedSummary.validPrograms}`,
        `expected=${seedSummary.expectedErrors}`,
        `crashes=${seedSummary.crashes}`,
        `mismatches=${seedSummary.mismatches}`,
      ].join(" "),
    );
  }

  if (summary.failureArtifacts.length > 0) {
    console.log("\nFailure artifacts:");
    for (const artifact of summary.failureArtifacts) {
      console.log(`  kind=${artifact.failureKind}`);
      console.log(`  ${artifact.sourcePath}`);
      console.log(`  ${artifact.metadataPath}`);
    }
  }
}

function formatSeed(seed: number): string {
  return `0x${(Math.trunc(seed) >>> 0).toString(16)}`;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2), process.env);
  const startedAt = Date.now();

  console.log("Starting compiler fuzz campaign...");
  console.log(`Seeds: ${options.seeds.map(formatSeed).join(", ")}`);
  console.log(`Iterations per seed: ${options.iterationsPerSeed}`);
  console.log(`Progress interval: ${options.progressInterval} iterations`);
  console.log(`Crash dir: ${options.crashDir}`);
  console.log(
    `Differential runtime inputs: ${options.enableDifferential ? "enabled" : "disabled"}`,
  );
  console.log(
    `Automatic failure minimization: ${options.minimizeFailures ? "enabled" : "disabled"}`,
  );

  const campaignOptions: FuzzCampaignOptions = {
    seeds: options.seeds,
    iterationsPerSeed: options.iterationsPerSeed,
    crashDir: options.crashDir,
    enableDifferential: options.enableDifferential,
    minimizeFailures: options.minimizeFailures,
    maxMinimizePasses: options.maxMinimizePasses,
    progressInterval: options.progressInterval,
    logProgress: (message) => console.log(message),
  };
  const summary = runFuzzCampaign(campaignOptions);
  const durationSeconds = (Date.now() - startedAt) / 1000;

  printSummary(summary);
  console.log(`Duration: ${durationSeconds.toFixed(2)}s`);

  if (summary.crashes > 0 || summary.mismatches > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(error instanceof CliUsageError ? 2 : 1);
});
