import * as path from "path";
import {
  runFuzzCampaign,
  type FuzzCampaignOptions,
} from "./compilerFuzz";

interface CliOptions {
  iterationsPerSeed: number;
  seeds: number[];
  crashDir: string;
  progressInterval: number;
}

const DEFAULT_ITERATIONS_PER_SEED = 10000;
const DEFAULT_SEEDS = [0x5eed1234];

function parseCliOptions(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument '${arg}'. Use --help for usage.`);
    }

    const parts = arg.slice(2).split("=", 2);
    const rawKey = parts[0];
    if (!rawKey) {
      throw new Error(`Missing option name in '${arg}'. Use --help for usage.`);
    }

    const key = rawKey.trim();
    const inlineValue = parts[1];
    const nextArg = argv[index + 1];
    const value =
      inlineValue ??
      (nextArg !== undefined && !nextArg.startsWith("--")
        ? argv[++index]!
        : "true");
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

  return {
    iterationsPerSeed: parsePositiveInteger(iterationsValue, "iterations"),
    seeds: parseSeeds(seedsValue),
    crashDir,
    progressInterval: parsePositiveInteger(progressValue, "progress"),
  };
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got '${value}'.`);
  }
  return parsed;
}

function parseSeeds(value: string): number[] {
  const seeds = value
    .split(",")
    .map((seed) => seed.trim())
    .filter(Boolean)
    .map((seed) => Number(seed));

  if (seeds.length === 0 || seeds.some((seed) => !Number.isInteger(seed))) {
    throw new Error(`seeds must be comma-separated integers, got '${value}'.`);
  }

  return seeds;
}

function printHelp(): void {
  console.log(`Usage: bun fuzz/run_fuzz.ts [options]

Options:
  --iterations <n>   Iterations to run per seed (default: ${DEFAULT_ITERATIONS_PER_SEED})
  --seeds <list>     Comma-separated decimal or 0x-prefixed seeds
  --crash-dir <dir>  Directory for .bpl repros and .json metadata
  --progress <n>     Progress log interval per seed (default: 1000)

Environment:
  FUZZ_ITERATIONS, FUZZ_SEEDS, FUZZ_CRASH_DIR, FUZZ_PROGRESS
`);
}

function printSummary(summary: ReturnType<typeof runFuzzCampaign>): void {
  console.log("\n--- Fuzz Campaign Results ---");
  console.log(`Total iterations: ${summary.totalIterations}`);
  console.log(`Valid programs: ${summary.validPrograms}`);
  console.log(`Expected compiler errors: ${summary.expectedErrors}`);
  console.log(`Crashes: ${summary.crashes}`);
  console.log(`Stage counts: ${JSON.stringify(summary.stageCounts)}`);

  for (const seedSummary of summary.seedSummaries) {
    console.log(
      [
        `seed ${formatSeed(seedSummary.seed)}`,
        `valid=${seedSummary.validPrograms}`,
        `expected=${seedSummary.expectedErrors}`,
        `crashes=${seedSummary.crashes}`,
      ].join(" "),
    );
  }

  if (summary.crashArtifacts.length > 0) {
    console.log("\nCrash artifacts:");
    for (const artifact of summary.crashArtifacts) {
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
  console.log(`Crash dir: ${options.crashDir}`);

  const campaignOptions: FuzzCampaignOptions = {
    seeds: options.seeds,
    iterationsPerSeed: options.iterationsPerSeed,
    crashDir: options.crashDir,
    progressInterval: options.progressInterval,
    logProgress: (message) => console.log(message),
  };
  const summary = runFuzzCampaign(campaignOptions);
  const durationSeconds = (Date.now() - startedAt) / 1000;

  printSummary(summary);
  console.log(`Duration: ${durationSeconds.toFixed(2)}s`);

  if (summary.crashes > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
