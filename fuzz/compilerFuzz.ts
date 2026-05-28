import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

export const DEFAULT_MIN_TOKENS = 20;
export const DEFAULT_MAX_TOKENS = 100;

const KEYWORDS = [
  "global",
  "local",
  "const",
  "type",
  "frame",
  "static",
  "ret",
  "struct",
  "enum",
  "import",
  "from",
  "export",
  "extern",
  "asm",
  "as",
  "this",
  "loop",
  "if",
  "else",
  "break",
  "continue",
  "try",
  "catch",
  "return",
  "throw",
  "switch",
  "case",
  "default",
  "cast",
  "sizeof",
  "match",
  "func",
  "nullptr",
  "true",
  "false",
  "spec",
  "self",
];

const SYMBOLS = [
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  ",",
  ":",
  ";",
  ".",
  "...",
  "?",
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "||",
  "&&",
  "|",
  "^",
  "&",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "<<",
  ">>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "~",
  "->",
  "=>",
];

const TYPES = [
  "int",
  "float",
  "bool",
  "string",
  "void",
  "char",
  "u8",
  "u16",
  "u32",
  "u64",
];

export type FuzzStage = "lexer" | "parser" | "typecheck" | "codegen";
export type FuzzInputKind = "structured" | "mutated" | "tokens";

export interface PipelineOutcome {
  ok: boolean;
  stage: FuzzStage;
  expectedError?: boolean;
  crash?: unknown;
  message?: string;
}

export interface CompilerPipelineOptions {
  skipImportResolution?: boolean;
}

export interface MutationOptions {
  seed: number;
  validSourceCount: number;
  mutationsPerSource: number;
}

export interface FuzzInput {
  seed: number;
  iteration: number;
  kind: FuzzInputKind;
  filePath: string;
  source: string;
}

export interface FuzzIterationContext {
  seed: number;
  iteration: number;
}

export type FuzzRunner = (
  source: string,
  filePath: string,
  input: FuzzInput,
) => PipelineOutcome;

export interface FuzzSeedSummary {
  seed: number;
  totalIterations: number;
  validPrograms: number;
  expectedErrors: number;
  crashes: number;
}

export interface CrashArtifact {
  sourcePath: string;
  metadataPath: string;
}

export interface FuzzCampaignSummary {
  totalIterations: number;
  validPrograms: number;
  expectedErrors: number;
  crashes: number;
  stageCounts: Record<FuzzStage, number>;
  seedSummaries: FuzzSeedSummary[];
  crashArtifacts: CrashArtifact[];
}

export interface FuzzCampaignOptions {
  seeds: number[];
  iterationsPerSeed: number;
  crashDir?: string;
  progressInterval?: number;
  logProgress?: (message: string) => void;
  runner?: FuzzRunner;
  inputForIteration?: (context: FuzzIterationContext) => FuzzInput;
}

export interface FuzzCrashReplayOptions {
  sourcePath?: string;
  metadataPath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  runner?: FuzzRunner;
}

export interface FuzzCrashReplayResult {
  sourcePath: string;
  metadataPath?: string;
  source: string;
  outcome: PipelineOutcome;
  crashed: boolean;
  signatureMatches: boolean;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
}

export interface FuzzCrashMinimizeOptions {
  source: string;
  filePath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  runner?: FuzzRunner;
  maxPasses?: number;
}

export interface FuzzCrashMinimizeResult {
  originalSource: string;
  minimizedSource: string;
  originalTokenCount: number;
  minimizedTokenCount: number;
  attempts: number;
  changed: boolean;
  outcome: PipelineOutcome;
}

interface CrashMetadata {
  seed?: number;
  iteration?: number;
  kind?: FuzzInputKind;
  filePath?: string;
  sourcePath?: string;
  stage?: FuzzStage;
  message?: string;
}

export function createSeededRandom(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function getRandomInt(
  rng: () => number,
  min: number,
  max: number,
): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function getRandomElement<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function generateRandomIdentifier(rng: () => number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
  const len = getRandomInt(rng, 1, 10);
  let res = "";
  for (let i = 0; i < len; i++) {
    res += chars[Math.floor(rng() * chars.length)];
  }
  return res;
}

function generateRandomNumber(rng: () => number): string {
  return Math.floor(rng() * 1000).toString();
}

function generateRandomString(rng: () => number): string {
  return '"' + generateRandomIdentifier(rng) + '"';
}

function generateRandomToken(rng: () => number): string {
  const type = rng();
  if (type < 0.4) {
    return getRandomElement(rng, KEYWORDS);
  } else if (type < 0.7) {
    return getRandomElement(rng, SYMBOLS);
  } else if (type < 0.8) {
    return getRandomElement(rng, TYPES);
  } else if (type < 0.9) {
    return generateRandomIdentifier(rng);
  } else if (type < 0.95) {
    return generateRandomNumber(rng);
  } else {
    return generateRandomString(rng);
  }
}

export function generateRandomSource(
  rng: () => number,
  minTokens = DEFAULT_MIN_TOKENS,
  maxTokens = DEFAULT_MAX_TOKENS,
): string {
  const length = getRandomInt(rng, minTokens, maxTokens);
  const tokens: string[] = [];
  for (let i = 0; i < length; i++) {
    tokens.push(generateRandomToken(rng));
  }
  return tokens.join(" ");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function isCompilerErrorList(error: unknown): boolean {
  return (
    Array.isArray(error) &&
    error.length > 0 &&
    error.every((item) => item instanceof CompilerError)
  );
}

function isExpectedCompilerError(error: unknown): boolean {
  if (error instanceof CompilerError || isCompilerErrorList(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "CompilerError" ||
    error.message.includes("Syntax error") ||
    error.message.includes("Unexpected token") ||
    error.message.includes("Expected")
  );
}

export function runCompilerPipeline(
  source: string,
  filePath: string,
  options: CompilerPipelineOptions = {},
): PipelineOutcome {
  let stage: FuzzStage = "lexer";

  try {
    const tokens = lexWithGrammar(source, filePath);

    stage = "parser";
    const parser = new Parser(source, filePath, tokens);
    const ast = parser.parse();

    stage = "typecheck";
    const typeChecker = new TypeChecker({
      collectAllErrors: false,
      skipImportResolution: options.skipImportResolution,
    });
    typeChecker.checkProgram(ast);

    const typeErrors = typeChecker.getErrors();
    if (typeErrors.length > 0) {
      return {
        ok: false,
        stage,
        expectedError: true,
        message: typeErrors.map((error) => error.message).join("\n"),
      };
    }

    stage = "codegen";
    const codeGenerator = new CodeGenerator();
    codeGenerator.generate(ast, filePath);

    return { ok: true, stage };
  } catch (error) {
    if (isExpectedCompilerError(error)) {
      return {
        ok: false,
        stage,
        expectedError: true,
        message: formatError(error),
      };
    }

    return {
      ok: false,
      stage,
      crash: error,
      message: formatError(error),
    };
  }
}

function generateArithmeticLoopSource(rng: () => number): string {
  const limit = getRandomInt(rng, 3, 8);
  const scale = getRandomInt(rng, 2, 7);
  const offset = getRandomInt(rng, 1, 9);
  const seedValue = getRandomInt(rng, 0, 30);

  return `
    frame helper(value: int) ret int {
      return (value * ${scale}) + ${offset};
    }

    frame main() ret int {
      local total: int = ${seedValue};
      local i: int = 0;

      loop (i < ${limit}) {
        total = total + helper(i);
        i = i + 1;
      }

      return total;
    }
  `;
}

function generateStructArraySource(rng: () => number): string {
  const left = getRandomInt(rng, 1, 9);
  const right = getRandomInt(rng, 1, 9);
  const values = Array.from({ length: 4 }, () => getRandomInt(rng, 1, 6));

  return `
    struct Pair {
      left: int,
      right: int,
    }

    frame bump(pair: *Pair, value: int) ret void {
      pair.left = pair.left + value;
      pair.right = pair.right + (value * 2);
    }

    frame main() ret int {
      local pair: Pair = Pair { left: ${left}, right: ${right} };
      local values: int[4] = [${values.join(", ")}];
      local i: int = 0;

      loop (i < 4) {
        bump(&pair, values[i]);
        i = i + 1;
      }

      return pair.left + pair.right;
    }
  `;
}

function generateEnumMatchSource(rng: () => number): string {
  const red = getRandomInt(rng, 1, 8);
  const green = getRandomInt(rng, 9, 16);
  const blue = getRandomInt(rng, 17, 24);
  const base = getRandomInt(rng, 1, 12);
  const variants = ["Red", "Green", "Blue"] as const;
  const first = getRandomElement(rng, variants);
  const second = getRandomElement(rng, variants);

  return `
    enum Color { Red, Green, Blue }

    frame score(color: Color, base: int) ret int {
      return match (color) {
        Color.Red => base + ${red},
        Color.Green => base + ${green},
        Color.Blue => base + ${blue},
      };
    }

    frame main() ret int {
      return score(Color.${first}, ${base}) + score(Color.${second}, ${base + 1});
    }
  `;
}

function generateGenericBranchSource(rng: () => number): string {
  const left = getRandomInt(rng, 2, 40);
  const right = getRandomInt(rng, 2, 40);
  const fallback = getRandomInt(rng, 1, 20);

  return `
    frame id<T>(value: T) ret T {
      return value;
    }

    frame distance(a: int, b: int) ret int {
      if (a > b) {
        return id<int>(a - b);
      }

      return id<int>((b - a) + ${fallback});
    }

    frame main() ret int {
      local left: int = id<int>(${left});
      local right: int = id<int>(${right});
      return distance(left, right);
    }
  `;
}

function generateLambdaCaptureSource(rng: () => number): string {
  const base = getRandomInt(rng, 1, 15);
  const input = getRandomInt(rng, 1, 15);
  const multiplier = getRandomInt(rng, 2, 5);

  return `
    frame main() ret int {
      local base: int = ${base};
      local transform: Lambda<int>(int) = |value: int| ret int {
        return (value * ${multiplier}) + base;
      };

      return transform(${input});
    }
  `;
}

function generateTupleSource(rng: () => number): string {
  const left = getRandomInt(rng, 1, 20);
  const right = getRandomInt(rng, 1, 20);

  return `
    frame main() ret int {
      local pair: (int, int) = (${left}, ${right});
      return pair.0 + pair.1;
    }
  `;
}

const STRUCTURED_GENERATORS = [
  generateArithmeticLoopSource,
  generateStructArraySource,
  generateEnumMatchSource,
  generateGenericBranchSource,
  generateLambdaCaptureSource,
  generateTupleSource,
];

export function generateStructuredValidSource(
  seed: number,
  index: number,
): string {
  const rng = createSeededRandom(mixSeed(seed, index));
  const generator =
    STRUCTURED_GENERATORS[index % STRUCTURED_GENERATORS.length]!;
  return generator(rng).trim();
}

export function generateStructuredValidSources(
  seed: number,
  count: number,
): string[] {
  return Array.from({ length: count }, (_, index) =>
    generateStructuredValidSource(seed, index),
  );
}

const TOKEN_PATTERN =
  /"[^"\\]*(?:\\.[^"\\]*)*"|[A-Za-z_][A-Za-z0-9_]*|\d+\.\d+|\d+|==|!=|<=|>=|\|\||&&|\+=|-=|\*=|\/=|%=|<<|>>|=>|->|\.\.\.|[{}()[\],:;.?=+\-*/%&|^!~<>]/g;

export function tokenizeForMutation(source: string): string[] {
  return source.match(TOKEN_PATTERN) ?? [];
}

export function mutateTokens(
  tokens: readonly string[],
  rng: () => number,
): string[] {
  const mutated = [...tokens];
  const mutationCount = getRandomInt(rng, 1, 3);

  for (let i = 0; i < mutationCount; i++) {
    const operation = getRandomInt(rng, 0, 3);
    const index = getRandomInt(rng, 0, Math.max(mutated.length - 1, 0));

    if (operation === 0 && mutated.length > 1) {
      mutated.splice(index, 1);
    } else if (operation === 1) {
      mutated.splice(index, 0, generateRandomToken(rng));
    } else if (operation === 2 && mutated.length > 0) {
      mutated[index] = generateRandomToken(rng);
    } else if (mutated.length > 0) {
      mutated.splice(index, 0, mutated[index]!);
    }
  }

  return mutated;
}

export function generateMutatedStructuredSource(
  seed: number,
  iteration: number,
): string {
  const baseSource = generateStructuredValidSource(seed ^ 0xa5a5a5a5, iteration);
  const rng = createSeededRandom(mixSeed(seed ^ 0xbad5eed, iteration));
  return mutateTokens(tokenizeForMutation(baseSource), rng).join(" ");
}

export function generateMutatedStructuredSources(
  options: MutationOptions,
): string[] {
  const mutatedSources: string[] = [];

  for (
    let sourceIndex = 0;
    sourceIndex < options.validSourceCount;
    sourceIndex++
  ) {
    const tokens = tokenizeForMutation(
      generateStructuredValidSource(options.seed ^ 0xa5a5a5a5, sourceIndex),
    );

    for (
      let mutationIndex = 0;
      mutationIndex < options.mutationsPerSource;
      mutationIndex++
    ) {
      const rng = createSeededRandom(
        mixSeed(options.seed ^ sourceIndex, mutationIndex),
      );
      mutatedSources.push(mutateTokens(tokens, rng).join(" "));
    }
  }

  return mutatedSources;
}

export function generateFuzzInput(seed: number, iteration: number): FuzzInput {
  const lane = iteration % 6;
  const kind: FuzzInputKind =
    lane === 0 || lane === 3
      ? "structured"
      : lane === 1 || lane === 4
        ? "mutated"
        : "tokens";
  let source: string;

  if (kind === "structured") {
    source = generateStructuredValidSource(seed, iteration);
  } else if (kind === "mutated") {
    source = generateMutatedStructuredSource(seed, iteration);
  } else {
    source = generateRandomSource(createSeededRandom(mixSeed(seed, iteration)));
  }

  return {
    seed,
    iteration,
    kind,
    source,
    filePath: `fuzz_seed_${seed.toString(16)}_iter_${iteration}_${kind}.bpl`,
  };
}

export function runFuzzCampaign(
  options: FuzzCampaignOptions,
): FuzzCampaignSummary {
  const runner =
    options.runner ??
    ((source: string, filePath: string) =>
      runCompilerPipeline(source, filePath, { skipImportResolution: true }));
  const inputForIteration =
    options.inputForIteration ??
    ((context: FuzzIterationContext) =>
      generateFuzzInput(context.seed, context.iteration));
  const stageCounts = createStageCounts();
  const seedSummaries: FuzzSeedSummary[] = [];
  const crashArtifacts: CrashArtifact[] = [];
  let validPrograms = 0;
  let expectedErrors = 0;
  let crashes = 0;

  for (const seed of options.seeds) {
    const seedSummary: FuzzSeedSummary = {
      seed,
      totalIterations: 0,
      validPrograms: 0,
      expectedErrors: 0,
      crashes: 0,
    };

    for (let iteration = 0; iteration < options.iterationsPerSeed; iteration++) {
      if (
        options.progressInterval &&
        iteration > 0 &&
        iteration % options.progressInterval === 0
      ) {
        options.logProgress?.(
          `seed ${formatSeed(seed)} iteration ${iteration}/${options.iterationsPerSeed}`,
        );
      }

      const input = inputForIteration({ seed, iteration });
      const outcome = runner(input.source, input.filePath, input);
      stageCounts[outcome.stage]++;
      seedSummary.totalIterations++;

      if (outcome.ok) {
        validPrograms++;
        seedSummary.validPrograms++;
      } else if (outcome.expectedError === true) {
        expectedErrors++;
        seedSummary.expectedErrors++;
      } else {
        crashes++;
        seedSummary.crashes++;

        if (options.crashDir) {
          crashArtifacts.push(
            writeCrashArtifact(options.crashDir, input, outcome),
          );
        }
      }
    }

    seedSummaries.push(seedSummary);
  }

  return {
    totalIterations: options.seeds.length * options.iterationsPerSeed,
    validPrograms,
    expectedErrors,
    crashes,
    stageCounts,
    seedSummaries,
    crashArtifacts,
  };
}

export function replayFuzzCrashArtifact(
  options: FuzzCrashReplayOptions,
): FuzzCrashReplayResult {
  const metadata = options.metadataPath
    ? readCrashMetadata(options.metadataPath)
    : undefined;
  const sourcePath = resolveCrashSourcePath(options, metadata);

  const source = readFileSync(sourcePath, "utf8");
  const runner = options.runner ?? defaultPipelineRunner;
  const input = inputFromCrashMetadata(source, sourcePath, metadata);
  const outcome = runner(source, metadata?.filePath ?? sourcePath, input);
  const expectedStage = options.expectedStage ?? metadata?.stage;
  const expectedMessageIncludes = options.expectedMessageIncludes;

  return {
    sourcePath,
    metadataPath: options.metadataPath,
    source,
    outcome,
    crashed: isCrashOutcome(outcome),
    signatureMatches: crashMatchesSignature(outcome, {
      expectedStage,
      expectedMessageIncludes,
    }),
    expectedStage,
    expectedMessageIncludes,
  };
}

export function minimizeFuzzCrash(
  options: FuzzCrashMinimizeOptions,
): FuzzCrashMinimizeResult {
  const runner = options.runner ?? defaultPipelineRunner;
  const filePath = options.filePath ?? "fuzz_minimize.bpl";
  const input = inputFromCrashMetadata(options.source, filePath);
  const originalOutcome = runner(options.source, filePath, input);
  const signature = {
    expectedStage: options.expectedStage ?? originalOutcome.stage,
    expectedMessageIncludes: options.expectedMessageIncludes,
  };

  if (!crashMatchesSignature(originalOutcome, signature)) {
    throw new Error(
      "Original source does not reproduce the requested crash signature.",
    );
  }

  let tokens = tokenizeForMutation(options.source);
  const originalTokenCount = tokens.length;
  let attempts = 0;
  let changed = false;
  let outcome = originalOutcome;

  if (tokens.length === 0) {
    return {
      originalSource: options.source,
      minimizedSource: options.source,
      originalTokenCount,
      minimizedTokenCount: 0,
      attempts,
      changed: false,
      outcome,
    };
  }

  let chunkSize = Math.max(1, Math.floor(tokens.length / 2));
  let passes = 0;
  const maxPasses = options.maxPasses ?? Number.POSITIVE_INFINITY;

  while (chunkSize >= 1 && passes < maxPasses) {
    passes++;
    let changedThisPass = false;

    for (let index = 0; index < tokens.length; ) {
      const candidate = [
        ...tokens.slice(0, index),
        ...tokens.slice(index + chunkSize),
      ];

      if (candidate.length === 0) {
        index += chunkSize;
        continue;
      }

      attempts++;
      const candidateSource = candidate.join(" ");
      const candidateInput = inputFromCrashMetadata(candidateSource, filePath);
      const candidateOutcome = runner(candidateSource, filePath, candidateInput);

      if (crashMatchesSignature(candidateOutcome, signature)) {
        tokens = candidate;
        outcome = candidateOutcome;
        changed = true;
        changedThisPass = true;
      } else {
        index += chunkSize;
      }
    }

    if (changedThisPass) {
      chunkSize = Math.min(
        chunkSize,
        Math.max(1, Math.floor(tokens.length / 2)),
      );
    } else if (chunkSize === 1) {
      break;
    } else {
      chunkSize = Math.max(1, Math.floor(chunkSize / 2));
    }
  }

  const minimizedSource = changed ? tokens.join(" ") : options.source;

  return {
    originalSource: options.source,
    minimizedSource,
    originalTokenCount,
    minimizedTokenCount: tokens.length,
    attempts,
    changed,
    outcome,
  };
}

function writeCrashArtifact(
  crashDir: string,
  input: FuzzInput,
  outcome: PipelineOutcome,
): CrashArtifact {
  mkdirSync(crashDir, { recursive: true });

  const baseName = [
    "crash",
    `seed-${input.seed.toString(16)}`,
    `iter-${input.iteration}`,
    input.kind,
  ].join("_");
  const sourcePath = join(crashDir, `${baseName}.bpl`);
  const metadataPath = join(crashDir, `${baseName}.json`);

  writeFileSync(sourcePath, input.source);
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        seed: input.seed,
        seedHex: formatSeed(input.seed),
        iteration: input.iteration,
        kind: input.kind,
        filePath: input.filePath,
        stage: outcome.stage,
        message: outcome.message,
        sourcePath,
      },
      null,
      2,
    ),
  );

  return { sourcePath, metadataPath };
}

function createStageCounts(): Record<FuzzStage, number> {
  return {
    lexer: 0,
    parser: 0,
    typecheck: 0,
    codegen: 0,
  };
}

function defaultPipelineRunner(source: string, filePath: string): PipelineOutcome {
  return runCompilerPipeline(source, filePath, { skipImportResolution: true });
}

function inputFromCrashMetadata(
  source: string,
  sourcePath: string,
  metadata: CrashMetadata = {},
): FuzzInput {
  return {
    seed: metadata.seed ?? 0,
    iteration: metadata.iteration ?? 0,
    kind: metadata.kind ?? "tokens",
    filePath: metadata.filePath ?? sourcePath,
    source,
  };
}

function readCrashMetadata(metadataPath: string): CrashMetadata {
  return JSON.parse(readFileSync(metadataPath, "utf8")) as CrashMetadata;
}

function resolveCrashSourcePath(
  options: FuzzCrashReplayOptions,
  metadata: CrashMetadata | undefined,
): string {
  const candidates = [
    options.sourcePath,
    metadata?.sourcePath,
    options.metadataPath ? siblingSourcePath(options.metadataPath) : undefined,
  ].filter((candidate): candidate is string => candidate !== undefined);

  if (candidates.length === 0) {
    throw new Error("sourcePath is required when metadata has no sourcePath.");
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function siblingSourcePath(metadataPath: string): string {
  return metadataPath.endsWith(".json")
    ? metadataPath.slice(0, -".json".length) + ".bpl"
    : `${metadataPath}.bpl`;
}

function isCrashOutcome(outcome: PipelineOutcome): boolean {
  return outcome.ok === false && outcome.expectedError !== true;
}

function crashMatchesSignature(
  outcome: PipelineOutcome,
  signature: {
    expectedStage?: FuzzStage;
    expectedMessageIncludes?: string;
  },
): boolean {
  if (!isCrashOutcome(outcome)) {
    return false;
  }

  if (
    signature.expectedStage !== undefined &&
    outcome.stage !== signature.expectedStage
  ) {
    return false;
  }

  if (
    signature.expectedMessageIncludes !== undefined &&
    !outcome.message?.includes(signature.expectedMessageIncludes)
  ) {
    return false;
  }

  return true;
}

function mixSeed(seed: number, iteration: number): number {
  return (
    (Math.trunc(seed) >>> 0) ^
    Math.imul((Math.trunc(iteration) >>> 0) + 1, 0x9e3779b9)
  );
}

function formatSeed(seed: number): string {
  return `0x${(Math.trunc(seed) >>> 0).toString(16)}`;
}
