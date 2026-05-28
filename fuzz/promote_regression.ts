import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { basename, join } from "path";
import { runCompilerPipeline } from "./compilerFuzz";

interface CliOptions {
  sourcePath?: string;
  metadataPath?: string;
  name?: string;
  corpusDir: string;
  force: boolean;
}

interface CrashMetadata {
  sourcePath?: string;
}

interface PromotionResult {
  sourcePath: string;
  destinationPath: string;
  outcomeStage: string;
  outcomeKind: "ok" | "expected-error";
}

const DEFAULT_CORPUS_DIR = join(__dirname, "../tests/fuzz-regressions");

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

    if (rawKey === "force") {
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
    name: values.get("name"),
    corpusDir: values.get("corpus-dir") ?? DEFAULT_CORPUS_DIR,
    force: flags.has("force"),
  };
}

function printHelp(): void {
  console.log(`Usage: bun fuzz/promote_regression.ts [source.bpl] [options]

Promote a fixed or cleanly-failing fuzz repro into tests/fuzz-regressions.
When --metadata is used, a sibling .min.bpl file is preferred over the original
artifact source.

Options:
  --source <path>      Path to a .bpl repro source
  --metadata <path>    Path to a generated .json crash metadata file
  --name <name>        Regression corpus name, sanitized to <name>.bpl
  --corpus-dir <dir>   Destination corpus directory
  --force              Overwrite an existing corpus file
  --help               Show this help text
`);
}

function promoteFuzzRegression(options: CliOptions): PromotionResult {
  const sourcePath = resolveSourcePath(options);
  const source = readFileSync(sourcePath, "utf8");
  const name = sanitizeName(options.name ?? inferNameFromPath(sourcePath));
  const destinationPath = join(options.corpusDir, `${name}.bpl`);

  if (existsSync(destinationPath) && !options.force) {
    throw new Error(
      `Regression corpus file already exists: ${destinationPath}. Use --force to overwrite it.`,
    );
  }

  const outcome = runCompilerPipeline(source, destinationPath, {
    skipImportResolution: true,
  });
  const cleanOutcome = outcome.ok || outcome.expectedError === true;

  if (outcome.crash !== undefined || !cleanOutcome) {
    throw new Error(
      [
        "Refusing to promote a repro that still triggers an internal compiler crash.",
        `stage: ${outcome.stage}`,
        outcome.message ? `message:\n${outcome.message}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  mkdirSync(options.corpusDir, { recursive: true });
  writeFileSync(destinationPath, source.endsWith("\n") ? source : `${source}\n`);

  return {
    sourcePath,
    destinationPath,
    outcomeStage: outcome.stage,
    outcomeKind: outcome.ok ? "ok" : "expected-error",
  };
}

function resolveSourcePath(options: CliOptions): string {
  if (options.sourcePath !== undefined) {
    return options.sourcePath;
  }

  if (options.metadataPath === undefined) {
    throw new Error("Either --source or --metadata is required.");
  }

  const metadata = readCrashMetadata(options.metadataPath);
  const candidates = [
    siblingPath(options.metadataPath, ".min.bpl"),
    siblingPath(options.metadataPath, ".bpl"),
    metadata.sourcePath,
  ].filter((candidate): candidate is string => candidate !== undefined);
  const existing = candidates.find((candidate) => existsSync(candidate));

  if (existing === undefined) {
    throw new Error(
      `No source artifact found for metadata: ${options.metadataPath}`,
    );
  }

  return existing;
}

function readCrashMetadata(metadataPath: string): CrashMetadata {
  return JSON.parse(readFileSync(metadataPath, "utf8")) as CrashMetadata;
}

function siblingPath(metadataPath: string, extension: string): string {
  return metadataPath.endsWith(".json")
    ? metadataPath.slice(0, -".json".length) + extension
    : `${metadataPath}${extension}`;
}

function inferNameFromPath(sourcePath: string): string {
  return basename(sourcePath)
    .replace(/\.min\.bpl$/i, "")
    .replace(/\.bpl$/i, "");
}

function sanitizeName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (sanitized.length === 0) {
    throw new Error(
      "Regression name must contain at least one alphanumeric character.",
    );
  }

  return sanitized;
}

async function main(): Promise<void> {
  const result = promoteFuzzRegression(parseCliOptions(process.argv.slice(2)));

  console.log(`Promoted fuzz regression: ${result.destinationPath}`);
  console.log(`Source: ${result.sourcePath}`);
  console.log(`Outcome: ${result.outcomeKind} at ${result.outcomeStage}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
