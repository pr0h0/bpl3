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
  allowSinglePositional: boolean;
}

class CliUsageError extends Error {}

const SCRIPT_CONFIGS: Record<FuzzScript, ScriptConfig> = {
  run: {
    target: "fuzz/run_fuzz.ts",
    usage: `Usage: bun fuzz/run_fuzz.ts [options]

Options:
  --iterations <n>    Iterations to run per seed
  --seeds <list>      Comma-separated decimal or 0x-prefixed seeds
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
      const nextArg = argv[index + 1];
      if (inlineValue === undefined && nextArg && !nextArg.startsWith("--")) {
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
  }

  if (positionals.length > 1) {
    throw new CliUsageError(`Unexpected argument: ${positionals[1]}`);
  }

  return true;
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
