import { describe, test, expect } from "bun:test";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";

// Configuration
// Use a smaller number for CI/regular tests, but allow override
const ITERATIONS = process.env.FUZZ_ITERATIONS
  ? parseInt(process.env.FUZZ_ITERATIONS)
  : 1000;
const FUZZ_SEED = process.env.FUZZ_SEED
  ? parseInt(process.env.FUZZ_SEED)
  : 0x5eed1234;
const MIN_TOKENS = 20;
const MAX_TOKENS = 100;

// Token definitions for generation
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

type FuzzStage = "lexer" | "parser" | "typecheck" | "codegen";

interface PipelineOutcome {
  ok: boolean;
  stage: FuzzStage;
  expectedError?: boolean;
  crash?: unknown;
  message?: string;
}

interface MutationOptions {
  seed: number;
  validSourceCount: number;
  mutationsPerSource: number;
}

function createSeededRandom(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function getRandomInt(rng: () => number, min: number, max: number): number {
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

function generateRandomSource(rng: () => number): string {
  const length = getRandomInt(rng, MIN_TOKENS, MAX_TOKENS);
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

function isExpectedCompilerError(error: unknown): boolean {
  if (error instanceof CompilerError) {
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

function runCompilerPipeline(
  source: string,
  filePath: string,
): PipelineOutcome {
  let stage: FuzzStage = "lexer";

  try {
    const tokens = lexWithGrammar(source, filePath);

    stage = "parser";
    const parser = new Parser(source, filePath, tokens);
    const ast = parser.parse();

    stage = "typecheck";
    const typeChecker = new TypeChecker({ collectAllErrors: false });
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

function generateStructuredValidSources(seed: number, count: number): string[] {
  const rng = createSeededRandom(seed);
  const generators = [
    generateArithmeticLoopSource,
    generateStructArraySource,
    generateEnumMatchSource,
    generateGenericBranchSource,
    generateLambdaCaptureSource,
    generateTupleSource,
  ];

  return Array.from({ length: count }, (_, index) => {
    const source = generators[index % generators.length]!(rng);
    return source.trim();
  });
}

const TOKEN_PATTERN =
  /"[^"\\]*(?:\\.[^"\\]*)*"|[A-Za-z_][A-Za-z0-9_]*|\d+\.\d+|\d+|==|!=|<=|>=|\|\||&&|\+=|-=|\*=|\/=|%=|<<|>>|=>|->|\.\.\.|[{}()[\],:;.?=+\-*/%&|^!~<>]/g;

function tokenizeForMutation(source: string): string[] {
  return source.match(TOKEN_PATTERN) ?? [];
}

function mutateTokens(tokens: readonly string[], rng: () => number): string[] {
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

function generateMutatedStructuredSources(options: MutationOptions): string[] {
  const rng = createSeededRandom(options.seed);
  const validSources = generateStructuredValidSources(
    options.seed ^ 0xa5a5a5a5,
    options.validSourceCount,
  );
  const mutatedSources: string[] = [];

  for (const source of validSources) {
    const tokens = tokenizeForMutation(source);

    for (let i = 0; i < options.mutationsPerSource; i++) {
      mutatedSources.push(mutateTokens(tokens, rng).join(" "));
    }
  }

  return mutatedSources;
}

describe("Compiler Fuzzing", () => {
  test("should generate structured valid programs that reach codegen", () => {
    const programs = generateStructuredValidSources(0xc0ffee, 12);

    expect(new Set(programs).size).toBe(programs.length);

    for (const [index, source] of programs.entries()) {
      const result = runCompilerPipeline(
        source,
        `structured_fuzzer_${index}.bpl`,
      );
      expect(result).toMatchObject({
        ok: true,
        stage: "codegen",
      });
    }
  });

  test("should mutate structured programs without crashing the compiler", () => {
    const sources = generateMutatedStructuredSources({
      seed: 0xbad5eed,
      validSourceCount: 8,
      mutationsPerSource: 4,
    });
    const outcomes = sources.map((source, index) =>
      runCompilerPipeline(source, `mutated_fuzzer_${index}.bpl`),
    );

    expect(sources.length).toBe(32);
    expect(outcomes.every((outcome) => outcome.crash === undefined)).toBe(true);
    expect(
      outcomes.some((outcome) => !outcome.ok && outcome.expectedError === true),
    ).toBe(true);
  });

  test(
    `should handle ${ITERATIONS} random token sequences gracefully`,
    () => {
      console.log(`Starting fuzzer for ${ITERATIONS} iterations...`);
      console.log(
        `Generating ${MIN_TOKENS}-${MAX_TOKENS} tokens per iteration with seed ${FUZZ_SEED}.`,
      );

      let passed = 0;
      let caughtCompilerErrors = 0;
      let crashes = 0;
      const stageCounts: Record<FuzzStage, number> = {
        lexer: 0,
        parser: 0,
        typecheck: 0,
        codegen: 0,
      };
      const rng = createSeededRandom(FUZZ_SEED);

      const startTime = Date.now();

      for (let i = 0; i < ITERATIONS; i++) {
        if (i % 1000 === 0 && i > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(
            `Iteration ${i}/${ITERATIONS} (${((i / ITERATIONS) * 100).toFixed(1)}%) - ${elapsed.toFixed(1)}s`,
          );
        }

        const source = generateRandomSource(rng);
        const filePath = "fuzzer_test.bpl";
        const result = runCompilerPipeline(source, filePath);
        stageCounts[result.stage]++;

        if (result.ok) {
          passed++;
        } else if (result.expectedError === true) {
          caughtCompilerErrors++;
        } else {
          console.error(`\nCRASH at iteration ${i}!`);
          console.error("Stage:", result.stage);
          console.error("Source code:");
          console.error(source);
          console.error("\nError:");
          console.error(result.message);
          crashes++;
        }
      }

      console.log("\n--- Fuzzer Results ---");
      console.log(`Total Iterations: ${ITERATIONS}`);
      console.log(`Passed (Valid Code Generated?): ${passed}`);
      console.log(`Caught Expected Errors: ${caughtCompilerErrors}`);
      console.log(`Crashes (Unhandled Exceptions): ${crashes}`);
      console.log(`Stage Counts: ${JSON.stringify(stageCounts)}`);

      expect(crashes).toBe(0);
    },
    10 * 60 * 1000,
  ); // Increase timeout to 10 minutes
});
