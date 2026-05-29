import { writeFileSync } from "fs";
import {
  minimizeFuzzFailure,
  replayFuzzFailureArtifact,
  runFuzzReplayMode,
  type FuzzReplayMode,
  type FuzzFailureKind,
  type FuzzStage,
} from "./compilerFuzz";

interface CliOptions {
  sourcePath?: string;
  metadataPath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  expectedFailureKind?: FuzzFailureKind;
  modes: FuzzReplayMode[];
  minimize: boolean;
  outPath?: string;
}

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

function parseCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      throw new Error(`Missing option name in '${arg}'. Use --help for usage.`);
    }

    if (rawKey === "minimize") {
      flags.add(rawKey);
      continue;
    }

    const nextArg = argv[index + 1];
    const value =
      inlineValue ??
      (nextArg !== undefined && !nextArg.startsWith("--")
        ? argv[++index]!
        : undefined);

    if (value === undefined) {
      throw new Error(`--${rawKey} requires a value. Use --help for usage.`);
    }

    values.set(rawKey, value);
  }

  if (positionals.length > 1) {
    throw new Error("Expected at most one source path positional argument.");
  }

  return {
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
    throw new Error(
      `--stage must be one of ${Array.from(STAGES).join(", ")}, got '${value}'.`,
    );
  }

  return value as FuzzStage;
}

function parseReplayModes(value: string | undefined): FuzzReplayMode[] {
  if (value === undefined) {
    return [];
  }

  const modes = value
    .split(",")
    .map((mode) => mode.trim())
    .filter(Boolean);

  if (modes.includes("all")) {
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
      throw new Error(
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
    throw new Error(
      `--failure-kind must be one of ${Array.from(FAILURE_KINDS).join(", ")}, got '${value}'.`,
    );
  }

  return value as FuzzFailureKind;
}

function printHelp(): void {
  console.log(`Usage: bun fuzz/replay_crash.ts [source.bpl] [options]

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

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const replay = replayFuzzFailureArtifact({
    sourcePath: options.sourcePath,
    metadataPath: options.metadataPath,
    expectedStage: options.expectedStage,
    expectedMessageIncludes: options.expectedMessageIncludes,
    expectedFailureKind: options.expectedFailureKind,
  });

  console.log(`Source: ${replay.sourcePath}`);
  if (replay.metadataPath) {
    console.log(`Metadata: ${replay.metadataPath}`);
  }
  console.log(`Crashed: ${replay.crashed ? "yes" : "no"}`);
  console.log(`Failed: ${replay.failed ? "yes" : "no"}`);
  console.log(`Failure kind: ${replay.failureKind ?? "none"}`);
  console.log(`Stage: ${replay.outcome.stage}`);
  if (replay.outcome.message) {
    console.log(`Message: ${replay.outcome.message.split("\n")[0]}`);
  }
  console.log(`Signature matches: ${replay.signatureMatches ? "yes" : "no"}`);

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
      console.log(`Mode ${mode}: ${state} at ${result.outcome.stage}`);
      if (result.outcome.message) {
        console.log(
          `Mode ${mode} message: ${result.outcome.message.split("\n")[0]}`,
        );
      }
      if (!result.outcome.ok) {
        failedModes++;
      }
    }

    process.exit(failedModes === 0 ? 0 : 4);
  }

  if (!replay.failed) {
    process.exit(2);
  }

  if (!replay.signatureMatches) {
    process.exit(3);
  }

  if (options.minimize) {
    const minimized = minimizeFuzzFailure({
      source: replay.source,
      filePath: replay.sourcePath,
      expectedStage: replay.expectedStage ?? replay.outcome.stage,
      expectedMessageIncludes: replay.expectedMessageIncludes,
      expectedFailureKind: replay.expectedFailureKind ?? replay.failureKind,
    });
    const outPath = options.outPath ?? defaultMinimizedPath(replay.sourcePath);
    writeFileSync(outPath, minimized.minimizedSource);

    console.log(`Minimized source: ${outPath}`);
    console.log(
      `Tokens: ${minimized.originalTokenCount} -> ${minimized.minimizedTokenCount}`,
    );
    console.log(`Attempts: ${minimized.attempts}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
