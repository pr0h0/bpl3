import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  type Stats,
} from "fs";
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
} from "path";
import {
  findNonDirectoryPathComponent,
  findSymlinkedPathComponent,
} from "../compiler/common/PathSafety";

import type {
  CrashMetadata,
  FuzzFailureKind,
  FuzzInputKind,
  FuzzStage,
} from "../fuzz/compilerFuzz";

export interface FuzzArtifactReproOptions {
  repoRoot?: string;
}

export interface FuzzArtifactReproEntry {
  metadataPath: string;
  sourcePath?: string;
  minimizedSourcePath?: string;
  seedHex?: string;
  iteration?: number;
  inputKind?: FuzzInputKind;
  failureKind?: FuzzFailureKind;
  stage?: FuzzStage;
  message?: string;
  commands: string[];
}

export interface FuzzArtifactReproPlan {
  schemaVersion: typeof FUZZ_ARTIFACT_REPRO_SCHEMA_VERSION;
  inputPath: string;
  repoRoot: string;
  entries: FuzzArtifactReproEntry[];
}

interface CliOptions {
  inputPath?: string;
  repoRoot?: string;
  json: boolean;
}

const ALL_REPLAY_MODES =
  "parser,typecheck,codegen,runtime,differential,sanitizer";
const FUZZ_ARTIFACT_REPRO_SCHEMA_VERSION = 1;
const CLI_OPTIONS_WITH_VALUES = new Set(["input", "repo-root"]);
const CLI_FLAG_OPTIONS = new Set(["json"]);

class CliUsageError extends Error {}

export function buildFuzzArtifactReproPlan(
  inputPath: string,
  options: FuzzArtifactReproOptions = {},
): FuzzArtifactReproPlan {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const absoluteInputPath = resolve(inputPath);
  const metadataPaths = discoverFuzzArtifactMetadataPaths(absoluteInputPath);
  const singleExplicitMetadata =
    metadataPaths.length === 1 && absoluteInputPath.endsWith(".json");
  const entries: FuzzArtifactReproEntry[] = [];

  for (const metadataPath of metadataPaths) {
    const metadata = readFuzzArtifactMetadata(metadataPath);
    if (!looksLikeFuzzArtifactMetadata(metadata)) {
      if (singleExplicitMetadata) {
        throw new Error(
          `Metadata does not look like a fuzz artifact: ${metadataPath}`,
        );
      }
      continue;
    }

    entries.push(buildReproEntry(metadataPath, metadata, repoRoot));
  }

  if (entries.length === 0) {
    throw new Error(`No fuzz artifact metadata found under ${inputPath}.`);
  }

  return {
    schemaVersion: FUZZ_ARTIFACT_REPRO_SCHEMA_VERSION,
    inputPath: toDisplayPath(absoluteInputPath, repoRoot),
    repoRoot,
    entries: entries.sort((left, right) =>
      left.metadataPath.localeCompare(right.metadataPath),
    ),
  };
}

export function discoverFuzzArtifactMetadataPaths(inputPath: string): string[] {
  const absolutePath = resolve(inputPath);
  const stat = tryLstat(absolutePath);
  if (!stat) {
    throw new Error(`Fuzz artifact path does not exist: ${inputPath}`);
  }

  if (stat.isSymbolicLink()) {
    if (absolutePath.endsWith(".json")) {
      throw new Error(
        `Fuzz artifact metadata path is a symbolic link: ${absolutePath}`,
      );
    }
    throw new Error(`Fuzz artifact path is a symbolic link: ${absolutePath}`);
  }

  if (stat.isDirectory()) {
    return listJsonFiles(absolutePath).sort();
  }

  if (stat.isFile() && absolutePath.endsWith(".json")) {
    return [absolutePath];
  }

  if (stat.isFile() && absolutePath.endsWith(".bpl")) {
    const metadataPath = siblingMetadataPath(absolutePath);
    return existsSync(metadataPath) ? [metadataPath] : [];
  }

  throw new Error(
    `Expected a fuzz artifact directory, .json metadata, or .bpl source, got ${inputPath}.`,
  );
}

export function readFuzzArtifactMetadata(
  metadataPath: string,
): CrashMetadata {
  try {
    assertFuzzArtifactMetadataPath(metadataPath);
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("metadata JSON must be an object");
    }
    return parsed as CrashMetadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse fuzz artifact metadata ${metadataPath}: ${message}`,
    );
  }
}

export function formatFuzzArtifactReproPlan(
  plan: FuzzArtifactReproPlan,
): string {
  const lines = [
    "Fuzz artifact repro plan",
    `Input: ${plan.inputPath}`,
    `Artifacts: ${plan.entries.length}`,
  ];

  for (const [index, entry] of plan.entries.entries()) {
    lines.push("", `${index + 1}. metadata: ${entry.metadataPath}`);
    lines.push(
      `   failure: ${entry.failureKind ?? "unknown"} at ${entry.stage ?? "unknown"}`,
    );
    if (entry.seedHex !== undefined || entry.iteration !== undefined) {
      lines.push(
        `   seed/pass: ${entry.seedHex ?? "unknown"} / ${entry.iteration ?? "unknown"}`,
      );
    }
    if (entry.inputKind !== undefined) {
      lines.push(`   lane: ${entry.inputKind}`);
    }
    if (entry.sourcePath !== undefined) {
      lines.push(`   source: ${entry.sourcePath}`);
    }
    if (entry.minimizedSourcePath !== undefined) {
      lines.push(`   minimized: ${entry.minimizedSourcePath}`);
    }
    if (entry.message !== undefined && entry.message.length > 0) {
      lines.push(`   message: ${entry.message.split("\n")[0]}`);
    }
    lines.push("   commands:");
    for (const command of entry.commands) {
      lines.push(`   - ${command}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildReproEntry(
  metadataPath: string,
  metadata: CrashMetadata,
  repoRoot: string,
): FuzzArtifactReproEntry {
  const metadataDisplayPath = toDisplayPath(metadataPath, repoRoot);
  const sourcePath = findOriginalSourcePath(metadataPath, metadata);
  const minimizedSourcePath = findMinimizedSourcePath(metadataPath, metadata);
  const seedHex = normalizeSeedHex(metadata);
  const iteration = normalizeIteration(metadata);
  const failureKind = normalizeFailureKind(metadata);
  const commands = buildCommands({
    metadataPath: metadataDisplayPath,
    minimizedSourcePath:
      minimizedSourcePath === undefined
        ? defaultMinimizedSourcePath(metadataDisplayPath)
        : toDisplayPath(minimizedSourcePath, repoRoot),
    seedHex,
    iteration,
    inputKind: metadata.kind,
    failureKind,
    promotionName: promotionNameFromMetadataPath(metadataPath),
  });

  return {
    metadataPath: metadataDisplayPath,
    sourcePath:
      sourcePath === undefined ? undefined : toDisplayPath(sourcePath, repoRoot),
    minimizedSourcePath:
      minimizedSourcePath === undefined
        ? undefined
        : toDisplayPath(minimizedSourcePath, repoRoot),
    seedHex,
    iteration,
    inputKind: metadata.kind,
    failureKind,
    stage: metadata.stage ?? metadata.failure?.stage,
    message: metadata.message ?? metadata.failure?.message,
    commands,
  };
}

function buildCommands(options: {
  metadataPath: string;
  minimizedSourcePath: string;
  seedHex?: string;
  iteration?: number;
  inputKind?: FuzzInputKind;
  failureKind?: FuzzFailureKind;
  promotionName: string;
}): string[] {
  const metadataArg = shellQuote(options.metadataPath);
  const commands = [
    `bun run fuzz:replay -- --metadata ${metadataArg}`,
    `bun run fuzz:replay -- --metadata ${metadataArg} --mode ${ALL_REPLAY_MODES}`,
    `bun run fuzz:replay -- --metadata ${metadataArg} --minimize --out ${shellQuote(options.minimizedSourcePath)}`,
  ];

  if (options.seedHex !== undefined && options.iteration !== undefined) {
    commands.push(
      buildDeterministicFuzzRunCommand({
        seedHex: options.seedHex,
        iteration: options.iteration,
        inputKind: options.inputKind,
        failureKind: options.failureKind,
      }),
    );
  }

  commands.push(
    [
      `bun run fuzz:promote -- --metadata ${metadataArg}`,
      options.failureKind === "mismatch" ? "--differential" : undefined,
      `--name ${shellQuote(options.promotionName)}`,
    ]
      .filter((part): part is string => part !== undefined)
      .join(" "),
  );
  commands.push("bun run fuzz:validate-artifacts");

  return commands;
}

function buildDeterministicFuzzRunCommand(options: {
  seedHex: string;
  iteration: number;
  inputKind?: FuzzInputKind;
  failureKind?: FuzzFailureKind;
}): string {
  return [
    "bun run fuzz --",
    `--iterations ${options.iteration + 1}`,
    `--seeds ${shellQuote(options.seedHex)}`,
    "--minimize true",
    "--minimize-passes 8",
    options.failureKind === "mismatch" || options.inputKind === "differential"
      ? "--differential"
      : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}

function looksLikeFuzzArtifactMetadata(metadata: CrashMetadata): boolean {
  return (
    metadata.seed !== undefined ||
    metadata.seedHex !== undefined ||
    metadata.iteration !== undefined ||
    metadata.pass !== undefined ||
    metadata.kind !== undefined ||
    metadata.failureKind !== undefined ||
    metadata.failure !== undefined ||
    metadata.stage !== undefined ||
    metadata.replayCommand !== undefined
  );
}

function listJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = lstatSync(path);

    if (stat.isSymbolicLink()) {
      if (entry.endsWith(".json")) {
        throw new Error(
          `Fuzz artifact metadata path is a symbolic link: ${path}`,
        );
      }
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...listJsonFiles(path));
    } else if (stat.isFile() && entry.endsWith(".json")) {
      results.push(path);
    }
  }

  return results;
}

function assertFuzzArtifactMetadataPath(metadataPath: string): void {
  const absoluteMetadataPath = resolve(metadataPath);
  const symlinkedComponent = findSymlinkedPathComponent(absoluteMetadataPath);
  if (symlinkedComponent) {
    if (symlinkedComponent === absoluteMetadataPath) {
      throw new Error(
        `Fuzz artifact metadata path is a symbolic link: ${symlinkedComponent}`,
      );
    }

    throw new Error(
      `Fuzz artifact metadata parent contains a symbolic link: ${symlinkedComponent}`,
    );
  }

  const nonDirectoryComponent =
    findNonDirectoryPathComponent(absoluteMetadataPath);
  if (
    nonDirectoryComponent &&
    nonDirectoryComponent !== absoluteMetadataPath
  ) {
    throw new Error(
      `Fuzz artifact metadata parent is not a directory: ${nonDirectoryComponent}`,
    );
  }

  const metadataStats = tryLstat(absoluteMetadataPath);
  if (metadataStats && !metadataStats.isFile()) {
    throw new Error(
      `Fuzz artifact metadata path is not a file: ${absoluteMetadataPath}`,
    );
  }
}

function tryLstat(filePath: string): Stats | null {
  try {
    return lstatSync(filePath);
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

function findOriginalSourcePath(
  metadataPath: string,
  metadata: CrashMetadata,
): string | undefined {
  const sibling = siblingPath(metadataPath, ".bpl");
  if (existsSync(sibling)) {
    return sibling;
  }

  if (metadata.sourcePath !== undefined && existsSync(metadata.sourcePath)) {
    return metadata.sourcePath;
  }

  return undefined;
}

function findMinimizedSourcePath(
  metadataPath: string,
  metadata: CrashMetadata,
): string | undefined {
  const sibling = siblingPath(metadataPath, ".min.bpl");
  if (existsSync(sibling)) {
    return sibling;
  }

  if (
    metadata.minimizedSourcePath !== undefined &&
    existsSync(metadata.minimizedSourcePath)
  ) {
    return metadata.minimizedSourcePath;
  }

  return undefined;
}

function siblingMetadataPath(sourcePath: string): string {
  return sourcePath.endsWith(".min.bpl")
    ? `${sourcePath.slice(0, -".min.bpl".length)}.json`
    : `${sourcePath.slice(0, -".bpl".length)}.json`;
}

function siblingPath(metadataPath: string, extension: string): string {
  return metadataPath.endsWith(".json")
    ? `${metadataPath.slice(0, -".json".length)}${extension}`
    : `${metadataPath}${extension}`;
}

function defaultMinimizedSourcePath(metadataDisplayPath: string): string {
  return metadataDisplayPath.endsWith(".json")
    ? `${metadataDisplayPath.slice(0, -".json".length)}.min.bpl`
    : `${metadataDisplayPath}.min.bpl`;
}

function normalizeSeedHex(metadata: CrashMetadata): string | undefined {
  if (
    typeof metadata.seedHex === "string" &&
    metadata.seedHex.trim().length > 0
  ) {
    const trimmed = metadata.seedHex.trim().toLowerCase();
    return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  }

  if (typeof metadata.seed === "number" && Number.isFinite(metadata.seed)) {
    return `0x${(Math.trunc(metadata.seed) >>> 0).toString(16)}`;
  }

  return undefined;
}

function normalizeIteration(metadata: CrashMetadata): number | undefined {
  if (
    typeof metadata.iteration === "number" &&
    Number.isInteger(metadata.iteration) &&
    metadata.iteration >= 0
  ) {
    return metadata.iteration;
  }

  if (
    typeof metadata.pass === "number" &&
    Number.isInteger(metadata.pass) &&
    metadata.pass >= 0
  ) {
    return metadata.pass;
  }

  return undefined;
}

function normalizeFailureKind(
  metadata: CrashMetadata,
): FuzzFailureKind | undefined {
  const value = metadata.failureKind ?? metadata.failure?.kind;
  return value === "crash" || value === "mismatch" ? value : undefined;
}

function promotionNameFromMetadataPath(metadataPath: string): string {
  const withoutExtension = basename(metadataPath).replace(/\.json$/i, "");
  const sanitized = withoutExtension
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : "fuzz-regression";
}

function toDisplayPath(path: string, repoRoot: string): string {
  const absolutePath = resolve(path);
  const relativePath = relative(repoRoot, absolutePath);
  const displayPath =
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
      ? relativePath
      : absolutePath;

  return displayPath.replace(/\\/g, "/");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

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
      throw new CliUsageError(
        `Missing option name in '${arg}'. Use --help for usage.`,
      );
    }

    if (!CLI_OPTIONS_WITH_VALUES.has(rawKey) && !CLI_FLAG_OPTIONS.has(rawKey)) {
      throw new CliUsageError(
        `Unknown option --${rawKey}. Use --help for usage.`,
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
    throw new CliUsageError(
      "Expected at most one artifact path positional argument.",
    );
  }
  if (values.has("input") && positionals.length > 0) {
    throw new CliUsageError(
      "Pass artifact path either positionally or with --input, not both.",
    );
  }

  return {
    inputPath: values.get("input") ?? positionals[0],
    repoRoot: values.get("repo-root"),
    json: flags.has("json"),
  };
}

function printHelp(): void {
  console.log(`Usage: bun tools/fuzz_artifact_repro.ts [artifact-path] [options]

Print deterministic local commands for scheduled compiler fuzz artifacts.

Arguments:
  artifact-path       Downloaded fuzz artifact directory, .json metadata, or
                      .bpl source with sibling metadata. Example: fuzz/crashes

Options:
  --input <path>      Artifact path when not passed positionally
  --repo-root <dir>   Repository root used to print relative paths
  --json              Print the repro plan as JSON
  --help              Show this help text
`);
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.inputPath === undefined) {
    printHelp();
    process.exit(2);
  }

  const plan = buildFuzzArtifactReproPlan(options.inputPath, {
    repoRoot: options.repoRoot,
  });

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    process.stdout.write(formatFuzzArtifactReproPlan(plan));
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof CliUsageError ? 2 : 1);
  });
}
