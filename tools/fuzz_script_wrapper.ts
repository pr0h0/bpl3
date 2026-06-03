import { existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

type FuzzScript = "run" | "replay" | "promote";

interface ScriptConfig {
  target: string;
  usage: string;
  optionsWithValues: Set<string>;
  booleanOptions: Set<string>;
  flagOptions: Set<string>;
  valueValidators?: Record<string, (value: string, option: string) => void>;
  allowSinglePositional: boolean;
}

class CliUsageError extends Error {}

const BOOLEAN_VALUES = new Set([
  "0",
  "1",
  "false",
  "no",
  "off",
  "on",
  "true",
  "yes",
]);
const REPLAY_STAGES = new Set(["lexer", "parser", "typecheck", "codegen"]);
const REPLAY_FAILURE_KINDS = new Set(["crash", "mismatch"]);
const REPLAY_MODES = new Set([
  "artifact",
  "lexer",
  "parser",
  "typecheck",
  "codegen",
  "runtime",
  "differential",
  "sanitizer",
  "all",
]);

const SCRIPT_CONFIGS: Record<FuzzScript, ScriptConfig> = {
  run: {
    target: "fuzz/run_fuzz.ts",
    usage: `Usage: bun fuzz/run_fuzz.ts [options]

Options:
  --iterations <n>    Iterations to run per seed
  --seeds <list>      Comma-separated unsigned 32-bit decimal or 0x-prefixed seeds
  --crash-dir <dir>   Directory for .bpl repros and .json metadata
  --progress <n>      Progress log interval per seed
  --differential      Include deterministic O0/O3 runtime comparison inputs
  --minimize <bool>   Write token-minimized .min.bpl artifacts for failures
  --minimize-passes <n>
                     Maximum minimization passes per failed artifact`,
    optionsWithValues: new Set([
      "iterations",
      "seeds",
      "crash-dir",
      "progress",
      "minimize-passes",
    ]),
    booleanOptions: new Set(["differential", "minimize"]),
    flagOptions: new Set(),
    valueValidators: {
      iterations: assertPositiveIntegerValue,
      "minimize-passes": assertPositiveIntegerValue,
      progress: assertPositiveIntegerValue,
      seeds: assertSeedListValue,
    },
    allowSinglePositional: false,
  },
  replay: {
    target: "fuzz/replay_crash.ts",
    usage: `Usage: bun fuzz/replay_crash.ts [source.bpl] [options]

Options:
  --source <path>    Path to a .bpl crash repro source
  --metadata <path>  Path to the generated .json crash metadata
  --stage <stage>    Require the crash stage: lexer, parser, typecheck, codegen
  --message <text>   Require the crash message to include this text
  --failure-kind <kind>
                     Require crash or mismatch
  --mode <modes>     Run explicit modes from one artifact:
                     parser,typecheck,codegen,runtime,differential,sanitizer
                     Also accepts artifact, all, and comma-separated lists.
  --minimize         Write a token-minimized repro if replay still fails
  --out <path>       Output path for --minimize
  --help             Show this help text`,
    optionsWithValues: new Set([
      "source",
      "metadata",
      "stage",
      "message",
      "failure-kind",
      "mode",
      "out",
    ]),
    booleanOptions: new Set(),
    flagOptions: new Set(["minimize"]),
    valueValidators: {
      "failure-kind": assertReplayFailureKindValue,
      mode: assertReplayModeListValue,
      stage: assertReplayStageValue,
    },
    allowSinglePositional: true,
  },
  promote: {
    target: "fuzz/promote_regression.ts",
    usage: `Usage: bun fuzz/promote_regression.ts [source.bpl] [options]

Options:
  --source <path>      Path to a .bpl repro source
  --metadata <path>    Path to a generated .json crash metadata file
  --name <name>        Regression corpus name, sanitized to <name>.bpl
  --corpus-dir <dir>   Destination corpus directory
  --differential       Verify with O0/O3 runtime comparison before promotion
  --force              Overwrite an existing corpus file
  --help               Show this help text`,
    optionsWithValues: new Set(["source", "metadata", "name", "corpus-dir"]),
    booleanOptions: new Set(),
    flagOptions: new Set(["force", "differential"]),
    allowSinglePositional: true,
  },
};

function validateUsage(config: ScriptConfig, argv: string[]): boolean {
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;

    if (arg === "--help" || arg === "-h") {
      console.log(config.usage);
      return false;
    }

    if (!arg.startsWith("--")) {
      if (!config.allowSinglePositional) {
        throw new CliUsageError(`Unexpected argument: ${arg}`);
      }
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      throw new CliUsageError(
        `Missing option name in '${arg}'. Use --help for usage.`,
      );
    }

    if (config.flagOptions.has(rawKey)) {
      if (inlineValue !== undefined) {
        throw new CliUsageError(
          `--${rawKey} does not accept a value. Use --help for usage.`,
        );
      }
      continue;
    }

    if (config.booleanOptions.has(rawKey)) {
      if (inlineValue !== undefined) {
        assertBooleanOptionValue(rawKey, inlineValue);
        continue;
      }

      const nextArg = argv[index + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        assertBooleanOptionValue(rawKey, nextArg);
        index++;
      }
      continue;
    }

    if (!config.optionsWithValues.has(rawKey)) {
      throw new CliUsageError(
        `Unknown option --${rawKey}. Use --help for usage.`,
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
        `--${rawKey} requires a value. Use --help for usage.`,
      );
    }
    if (value.trim().length === 0) {
      throw new CliUsageError(
        `--${rawKey} requires a non-empty value. Use --help for usage.`,
      );
    }
    config.valueValidators?.[rawKey]?.(value, rawKey);
  }

  if (positionals.length > 1) {
    throw new CliUsageError(`Unexpected argument: ${positionals[1]}`);
  }

  return true;
}

function assertBooleanOptionValue(option: string, value: string): void {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new CliUsageError(
      `--${option} requires a non-empty boolean value. Use --help for usage.`,
    );
  }

  if (!BOOLEAN_VALUES.has(normalized)) {
    throw new CliUsageError(
      `${option} must be a boolean value, got '${value}'.`,
    );
  }
}

function assertSeedListValue(value: string): void {
  const seedTexts = value.split(",").map((seed) => seed.trim());
  if (seedTexts.length === 0 || seedTexts.every((seed) => seed.length === 0)) {
    throw new CliUsageError(
      `seeds must be comma-separated integers, got '${value}'.`,
    );
  }

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
  }
}

function assertPositiveIntegerValue(value: string, option: string): void {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(
      `${option} must be a positive integer, got '${value}'.`,
    );
  }
}

function assertReplayStageValue(value: string): void {
  if (!REPLAY_STAGES.has(value)) {
    throw new CliUsageError(
      `--stage must be one of ${Array.from(REPLAY_STAGES).join(", ")}, got '${value}'.`,
    );
  }
}

function assertReplayFailureKindValue(value: string): void {
  if (!REPLAY_FAILURE_KINDS.has(value)) {
    throw new CliUsageError(
      `--failure-kind must be one of ${Array.from(REPLAY_FAILURE_KINDS).join(", ")}, got '${value}'.`,
    );
  }
}

function assertReplayModeListValue(value: string): void {
  const modes = value.split(",").map((mode) => mode.trim());
  if (modes.some((mode) => mode.length === 0)) {
    throw new CliUsageError(
      `--mode must not contain empty entries, got '${value}'.`,
    );
  }
  if (modes.includes("all") && modes.length !== 1) {
    throw new CliUsageError(`--mode all must be used alone, got '${value}'.`);
  }

  for (const mode of modes) {
    if (!REPLAY_MODES.has(mode)) {
      throw new CliUsageError(
        `--mode must include parser,typecheck,codegen,runtime,differential,sanitizer,artifact,all; got '${mode}'.`,
      );
    }
  }
}

function resolveScript(command: string | undefined): {
  command: FuzzScript;
  config: ScriptConfig;
  argv: string[];
} {
  if (
    command !== "run" &&
    command !== "replay" &&
    command !== "promote"
  ) {
    throw new CliUsageError(
      `Expected fuzz helper command run, replay, or promote.`,
    );
  }

  return {
    command,
    config: SCRIPT_CONFIGS[command],
    argv: process.argv.slice(3),
  };
}

function main(): void {
  const { command, config, argv } = resolveScript(process.argv[2]);
  if (!validateUsage(config, argv)) {
    return;
  }

  const targetPath = resolve(import.meta.dir, "..", config.target);
  if (!existsSync(targetPath)) {
    throw new Error(
      `fuzz:${command} requires a source checkout with ${config.target}; the packed npm package only supports usage validation for this helper.`,
    );
  }

  const result = spawnSync(process.execPath, [targetPath, ...argv], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(error instanceof CliUsageError ? 2 : 1);
}
