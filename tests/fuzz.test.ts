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

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateRandomIdentifier(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
  const len = getRandomInt(1, 10);
  let res = "";
  for (let i = 0; i < len; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

function generateRandomNumber(): string {
  return Math.floor(Math.random() * 1000).toString();
}

function generateRandomString(): string {
  return '"' + generateRandomIdentifier() + '"';
}

function generateRandomToken(): string {
  const type = Math.random();
  if (type < 0.4) {
    return getRandomElement(KEYWORDS);
  } else if (type < 0.7) {
    return getRandomElement(SYMBOLS);
  } else if (type < 0.8) {
    return getRandomElement(TYPES);
  } else if (type < 0.9) {
    return generateRandomIdentifier();
  } else if (type < 0.95) {
    return generateRandomNumber();
  } else {
    return generateRandomString();
  }
}

function generateRandomSource(): string {
  const length = getRandomInt(MIN_TOKENS, MAX_TOKENS);
  const tokens: string[] = [];
  for (let i = 0; i < length; i++) {
    tokens.push(generateRandomToken());
  }
  return tokens.join(" ");
}

describe("Compiler Fuzzing", () => {
  test(
    `should handle ${ITERATIONS} random token sequences gracefully`,
    () => {
      console.log(`Starting fuzzer for ${ITERATIONS} iterations...`);
      console.log(
        `Generating ${MIN_TOKENS}-${MAX_TOKENS} tokens per iteration.`,
      );

      let passed = 0;
      let caughtCompilerErrors = 0;
      let crashes = 0;

      const startTime = Date.now();

      for (let i = 0; i < ITERATIONS; i++) {
        if (i % 1000 === 0 && i > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(
            `Iteration ${i}/${ITERATIONS} (${((i / ITERATIONS) * 100).toFixed(1)}%) - ${elapsed.toFixed(1)}s`,
          );
        }

        const source = generateRandomSource();
        const filePath = "fuzzer_test.bpl";

        try {
          // 1. Lexer
          const tokens = lexWithGrammar(source, filePath);

          // 2. Parser
          const parser = new Parser(source, filePath, tokens);
          const ast = parser.parse();

          // 3. Type Checker
          const typeChecker = new TypeChecker({ collectAllErrors: false });
          typeChecker.checkProgram(ast);

          const typeErrors = typeChecker.getErrors();
          if (typeErrors.length > 0) {
            caughtCompilerErrors++;
            continue;
          }

          // 4. Code Generator
          const codeGenerator = new CodeGenerator();
          codeGenerator.generate(ast, filePath);

          passed++;
        } catch (e: any) {
          if (e instanceof CompilerError) {
            caughtCompilerErrors++;
          } else if (e.name === "CompilerError") {
            caughtCompilerErrors++;
          } else if (
            e.message &&
            (e.message.includes("Syntax error") ||
              e.message.includes("Unexpected token") ||
              e.message.includes("Expected"))
          ) {
            caughtCompilerErrors++;
          } else {
            console.error(`\nCRASH at iteration ${i}!`);
            console.error("Source code:");
            console.error(source);
            console.error("\nError:");
            console.error(e);
            crashes++;
          }
        }
      }

      console.log("\n--- Fuzzer Results ---");
      console.log(`Total Iterations: ${ITERATIONS}`);
      console.log(`Passed (Valid Code Generated?): ${passed}`);
      console.log(`Caught Expected Errors: ${caughtCompilerErrors}`);
      console.log(`Crashes (Unhandled Exceptions): ${crashes}`);

      expect(crashes).toBe(0);
    },
    10 * 60 * 1000,
  ); // Increase timeout to 10 minutes
});
