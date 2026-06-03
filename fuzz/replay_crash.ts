import { lstatSync, writeFileSync, type Stats } from "fs";
import { dirname, resolve } from "path";
import {
  minimizeFuzzFailure,
  replayFuzzFailureArtifact,
  runFuzzReplayMode,
  type FuzzReplayMode,
  type FuzzFailureKind,
  type FuzzRunner,
  type FuzzStage,
} from "./compilerFuzz";
import {
  findNonDirectoryPathComponent,
  findSymlinkedParentPath,
} from "../compiler/common/PathSafety";

interface CliOptions {
  help: boolean;
  sourcePath?: string;
  metadataPath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  expectedFailureKind?: FuzzFailureKind;
  modes: FuzzReplayMode[];
  minimize: boolean;
  outPath?: string;
}

export interface FuzzReplayCliOptions {
  runner?: FuzzRunner;
  stdout?: (line: string) => void;
}

class CliUsageError extends Error {}

const STAGES = new Set<FuzzStage>(["lexer", "parser", "typecheck", "codegen"]);
const FAILURE_KINDS = new Set<FuzzFailureKind>(["crash", "mismatch"]);
const REPLAY_MODES = new Set<FuzzReplayMode>([
  "artifact",
  "lexer",
  "parser",
  "typecheck",
  "codegen",
  "runtime",
  "differential",
  "sanitizer",
]);
const CLI_OPTIONS_WITH_VALUES = new Set([
  "source",
  "metadata",
  "stage",
  "message",
  "failure-kind",
  "mode",
  "out",
]);
const CLI_FLAG_OPTIONS = new Set(["minimize"]);

function parseCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;

    if (arg === "--help" || arg === "-h") {
      return { help: true, modes: [], minimize: false };
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      throw new CliUsageError(
        `Missing option name in '${arg}'. Use --help for usage.`,
      );
    }

    if (CLI_FLAG_OPTIONS.has(rawKey)) {
      if (inlineValue !== undefined) {
        throw new CliUsageError(
          `--${rawKey} does not accept a value. Use --help for usage.`,
        );
      }
      flags.add(rawKey);
      continue;
    }

    if (!CLI_OPTIONS_WITH_VALUES.has(rawKey)) {
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

    values.set(rawKey, value);
  }

  if (positionals.length > 1) {
    throw new CliUsageError(`Unexpected argument: ${positionals[1]}`);
  }

  return {
    help: false,
    sourcePath: values.get("source") ?? positionals[0],
    metadataPath: values.get("metadata"),
    expectedStage: parseStage(values.get("stage")),
    expectedMessageIncludes: values.get("message"),
    expectedFailureKind: parseFailureKind(values.get("failure-kind")),
    modes: parseReplayModes(values.get("mode")),
    minimize: flags.has("minimize"),
    outPath: values.get("out"),
  };
}

function parseStage(value: string | undefined): FuzzStage | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!STAGES.has(value as FuzzStage)) {
    throw new CliUsageError(
      `--stage must be one of ${Array.from(STAGES).join(", ")}, got '${value}'.`,
    );
  }

  return value as FuzzStage;
}

function parseReplayModes(value: string | undefined): FuzzReplayMode[] {
  if (value === undefined) {
    return [];
  }

  const modes = value.split(",").map((mode) => mode.trim());

  if (modes.some((mode) => mode.length === 0)) {
    throw new CliUsageError(
      `--mode must not contain empty entries, got '${value}'.`,
    );
  }

  if (modes.includes("all")) {
    if (modes.length !== 1) {
      throw new CliUsageError(`--mode all must be used alone, got '${value}'.`);
    }

    return [
      "parser",
      "typecheck",
      "codegen",
      "runtime",
      "differential",
      "sanitizer",
    ];
  }

  for (const mode of modes) {
    if (!REPLAY_MODES.has(mode as FuzzReplayMode)) {
      throw new CliUsageError(
        `--mode must include parser,typecheck,codegen,runtime,differential,sanitizer,artifact,all; got '${mode}'.`,
      );
    }
  }

  return modes as FuzzReplayMode[];
}

function parseFailureKind(
  value: string | undefined,
): FuzzFailureKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!FAILURE_KINDS.has(value as FuzzFailureKind)) {
    throw new CliUsageError(
      `--failure-kind must be one of ${Array.from(FAILURE_KINDS).join(", ")}, got '${value}'.`,
    );
  }

  return value as FuzzFailureKind;
}

function printHelp(stdout: (line: string) => void = console.log): void {
  stdout(`Usage: bun fuzz/replay_crash.ts [source.bpl] [options]

Re-run a compiler fuzz failure artifact and optionally reduce it by deleting
tokens while preserving the failure signature.

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
  --out <path>       Output path for --minimize (default: <source>.min.bpl)
  --help             Show this help text
`);
}

function defaultMinimizedPath(sourcePath: string): string {
  return sourcePath.endsWith(".bpl")
    ? sourcePath.slice(0, -".bpl".length) + ".min.bpl"
    : `${sourcePath}.min.bpl`;
}

export function runFuzzReplayCli(
  argv: string[],
  cliOptions: FuzzReplayCliOptions = {},
): number {
  const stdout = cliOptions.stdout ?? console.log;
  const options = parseCliOptions(argv);
  if (options.help) {
    printHelp(stdout);
    return 0;
  }

  const replay = replayFuzzFailureArtifact({
    sourcePath: options.sourcePath,
    metadataPath: options.metadataPath,
    expectedStage: options.expectedStage,
    expectedMessageIncludes: options.expectedMessageIncludes,
    expectedFailureKind: options.expectedFailureKind,
    runner: cliOptions.runner,
  });

  stdout(`Source: ${replay.sourcePath}`);
  if (replay.metadataPath) {
    stdout(`Metadata: ${replay.metadataPath}`);
  }
  stdout(`Crashed: ${replay.crashed ? "yes" : "no"}`);
  stdout(`Failed: ${replay.failed ? "yes" : "no"}`);
  stdout(`Failure kind: ${replay.failureKind ?? "none"}`);
  stdout(`Stage: ${replay.outcome.stage}`);
  if (replay.outcome.message) {
    stdout(`Message: ${replay.outcome.message.split("\n")[0]}`);
  }
  stdout(`Signature matches: ${replay.signatureMatches ? "yes" : "no"}`);

  if (options.modes.length > 0) {
    let failedModes = 0;
    for (const mode of options.modes) {
      const result = runFuzzReplayMode(
        replay.source,
        replay.sourcePath,
        mode,
        replay.metadata,
      );
      const state = result.outcome.ok ? "ok" : "failed";
      stdout(`Mode ${mode}: ${state} at ${result.outcome.stage}`);
      if (result.outcome.message) {
        stdout(
          `Mode ${mode} message: ${result.outcome.message.split("\n")[0]}`,
        );
      }
      if (!result.outcome.ok) {
        failedModes++;
      }
    }

    return failedModes === 0 ? 0 : 4;
  }

  if (!replay.failed) {
    return 2;
  }

  if (!replay.signatureMatches) {
    return 3;
  }

  if (options.minimize) {
    const outPath = options.outPath ?? defaultMinimizedPath(replay.sourcePath);
    assertWritableMinimizedOutputPath(outPath);
    const minimized = minimizeFuzzFailure({
      source: replay.source,
      filePath: replay.sourcePath,
      expectedStage: replay.expectedStage ?? replay.outcome.stage,
      expectedMessageIncludes: replay.expectedMessageIncludes,
      expectedFailureKind: replay.expectedFailureKind ?? replay.failureKind,
      runner: cliOptions.runner,
    });
    writeFileSync(outPath, minimized.minimizedSource);

    stdout(`Minimized source: ${outPath}`);
    stdout(
      `Tokens: ${minimized.originalTokenCount} -> ${minimized.minimizedTokenCount}`,
    );
    stdout(`Attempts: ${minimized.attempts}`);
  }

  return 0;
}

function assertWritableMinimizedOutputPath(outPath: string): void {
  const existingStats = tryLstat(outPath);
  if (existingStats?.isSymbolicLink()) {
    throw new Error(`Fuzz replay output path is a symbolic link: ${outPath}`);
  }
  if (existingStats?.isDirectory()) {
    throw new Error(`Fuzz replay output path is a directory: ${outPath}`);
  }
  if (existingStats && !existingStats.isFile()) {
    throw new Error(`Fuzz replay output path is not a regular file: ${outPath}`);
  }

  const symlinkedParent = findSymlinkedParentPath(outPath);
  if (symlinkedParent) {
    throw new Error(
      `Fuzz replay output parent contains a symbolic link: ${symlinkedParent}`,
    );
  }

  const parentPath = dirname(resolve(outPath));
  const nonDirectoryParent = findNonDirectoryPathComponent(parentPath);
  if (nonDirectoryParent) {
    throw new Error(
      `Fuzz replay output parent is not a directory: ${nonDirectoryParent}`,
    );
  }

  const parentStats = tryLstat(parentPath);
  if (!parentStats) {
    throw new Error(`Fuzz replay output directory does not exist: ${parentPath}`);
  }
  if (!parentStats.isDirectory()) {
    throw new Error(
      `Fuzz replay output parent is not a directory: ${parentPath}`,
    );
  }
}

function tryLstat(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

if (import.meta.main) {
  try {
    process.exit(runFuzzReplayCli(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof CliUsageError ? 2 : 1);
  }
}
