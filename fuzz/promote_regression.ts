import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  type Stats,
  writeFileSync,
} from "fs";
import { basename, join, parse, relative, resolve } from "path";
import {
  runBplDifferentialPipeline,
  runCompilerPipeline,
} from "./compilerFuzz";

interface CliOptions {
  sourcePath?: string;
  metadataPath?: string;
  name?: string;
  corpusDir: string;
  force: boolean;
  differential: boolean;
}

class CliUsageError extends Error {}

interface CrashMetadata {
  sourcePath?: string;
  promotedTo?: string;
}

interface PromotionResult {
  sourcePath: string;
  destinationPath: string;
  outcomeStage: string;
  outcomeKind: "ok" | "expected-error" | "differential";
}

const DEFAULT_CORPUS_DIR = join(__dirname, "../tests/fuzz-regressions");
const DEFAULT_DIFFERENTIAL_CORPUS_DIR = join(
  __dirname,
  "../tests/fuzz-differential-regressions",
);
const CLI_OPTIONS_WITH_VALUES = new Set([
  "source",
  "metadata",
  "name",
  "corpus-dir",
]);
const CLI_FLAG_OPTIONS = new Set(["force", "differential"]);

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

    values.set(rawKey, value);
  }

  if (positionals.length > 1) {
    throw new CliUsageError(`Unexpected argument: ${positionals[1]}`);
  }

  return {
    sourcePath: values.get("source") ?? positionals[0],
    metadataPath: values.get("metadata"),
    name: values.get("name"),
    corpusDir:
      values.get("corpus-dir") ??
      (flags.has("differential")
        ? DEFAULT_DIFFERENTIAL_CORPUS_DIR
        : DEFAULT_CORPUS_DIR),
    force: flags.has("force"),
    differential: flags.has("differential"),
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
  --differential       Verify with O0/O3 runtime comparison before promotion
  --force              Overwrite an existing corpus file
  --help               Show this help text
`);
}

function promoteFuzzRegression(options: CliOptions): PromotionResult {
  const sourcePath = resolveSourcePath(options);
  const source = readFileSync(sourcePath, "utf8");
  const name = sanitizeName(options.name ?? inferNameFromPath(sourcePath));
  assertWritableCorpusDirectory(options.corpusDir);
  const destinationPath = join(options.corpusDir, `${name}.bpl`);

  if (existsSync(destinationPath) && !options.force) {
    throw new Error(
      `Regression corpus file already exists: ${destinationPath}. Use --force to overwrite it.`,
    );
  }

  const outcome = options.differential
    ? runBplDifferentialPipeline(source, destinationPath)
    : runCompilerPipeline(source, destinationPath, {
        skipImportResolution: true,
      });
  const cleanOutcome = options.differential
    ? outcome.ok
    : outcome.ok || outcome.expectedError === true;

  if (outcome.crash !== undefined || !cleanOutcome) {
    throw new Error(
      [
        options.differential
          ? "Refusing to promote a differential repro that does not run equivalently at -O0 and -O3."
          : "Refusing to promote a repro that still triggers an internal compiler crash.",
        `stage: ${outcome.stage}`,
        outcome.message ? `message:\n${outcome.message}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  mkdirSync(options.corpusDir, { recursive: true });
  assertWritableCorpusDirectory(options.corpusDir);
  writeFileSync(
    destinationPath,
    source.endsWith("\n") ? source : `${source}\n`,
  );
  if (options.metadataPath !== undefined) {
    markMetadataPromoted(options.metadataPath, destinationPath);
  }

  return {
    sourcePath,
    destinationPath,
    outcomeStage: outcome.stage,
    outcomeKind: options.differential
      ? "differential"
      : outcome.ok
        ? "ok"
        : "expected-error",
  };
}

function assertWritableCorpusDirectory(corpusDir: string): void {
  const absoluteCorpusDir = resolve(corpusDir);

  for (const componentPath of pathComponents(absoluteCorpusDir)) {
    const componentStats = tryLstat(componentPath);
    if (!componentStats) {
      continue;
    }

    if (componentStats.isSymbolicLink()) {
      if (componentPath === absoluteCorpusDir) {
        throw new Error(
          `Fuzz regression corpus directory is a symbolic link: ${componentPath}`,
        );
      }

      throw new Error(
        `Fuzz regression corpus directory parent contains a symbolic link: ${componentPath}`,
      );
    }

    if (!componentStats.isDirectory()) {
      throw new Error(
        `Fuzz regression corpus directory parent is not a directory: ${componentPath}`,
      );
    }
  }
}

function pathComponents(absolutePath: string): string[] {
  const parsedPath = parse(absolutePath);
  const rootPath = parsedPath.root;
  const components = relative(rootPath, absolutePath)
    .split(/[\\/]+/)
    .filter(Boolean);
  const paths = [rootPath];
  let currentPath = rootPath;

  for (const component of components) {
    currentPath = join(currentPath, component);
    paths.push(currentPath);
  }

  return paths;
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

function markMetadataPromoted(
  metadataPath: string,
  destinationPath: string,
): void {
  const metadata = readCrashMetadata(metadataPath);
  metadata.promotedTo = destinationPath;
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(error instanceof CliUsageError ? 2 : 1);
});
