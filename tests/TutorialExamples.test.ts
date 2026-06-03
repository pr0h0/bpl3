import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  setDefaultTimeout,
} from "bun:test";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { Compiler } from "../compiler/index";
import { runProcessFile } from "../playground/backend/processRunner";

const execFileAsync = promisify(execFile);
const TUTORIAL_COMPILE_RUN_TIMEOUT_MS = 15000;

setDefaultTimeout(TUTORIAL_COMPILE_RUN_TIMEOUT_MS);

interface CodeSection {
  type: "code";
  title: string;
  code: string;
  runnable?: boolean;
  expectedOutput?: string;
}

interface ChallengeSection {
  type: "challenge";
  title: string;
  solution?: string;
}

interface Section {
  type: string;
  title: string;
  code?: string;
  runnable?: boolean;
  expectedOutput?: string;
  solution?: string;
}

interface Tutorial {
  id: string;
  order: number;
  title: string;
  category: string;
  difficulty: string;
  sections: Section[];
}

interface CompileResponse {
  success: boolean;
  output?: string;
  error?: string;
  ir?: string;
}

interface TestableCode {
  tutorialTitle: string;
  tutorialOrder: number;
  sectionTitle: string;
  code: string;
  expectedOutput?: string;
  isChallengeSolution: boolean;
}

const centralizedTutorialCExterns = [
  /\bextern printf\(fmt: string, \.\.\.\)(?: ret int)?;/,
  /\bextern scanf\(fmt: string, \.\.\.\)(?: ret int)?;/,
  /\bextern puts\((?:s|value): string\) ret int;/,
  /\bextern malloc\(size: (?:int|long|u64)\) ret \*void;/,
  /\bextern free\(ptr: \*void\)(?: ret void)?;/,
  /\bextern strlen\(s: string\) ret int;/,
  /\bextern strcmp\([A-Za-z_][A-Za-z0-9_]*: string, [A-Za-z_][A-Za-z0-9_]*: string\) ret int;/,
  /\bextern strcpy\((?:dst|dest): string, src: string\) ret string;/,
  /\bextern strcat\((?:dst|dest): string, src: string\) ret string;/,
  /\bextern atoi\(s: string\) ret int;/,
  /\bextern memcpy\(dest: \*void, src: \*void, (?:n|size): (?:int|long|u64)\) ret \*void;/,
  /\bextern memmove\(dest: \*void, src: \*void, (?:n|size): (?:int|long|u64)\) ret \*void;/,
  /\bextern memset\((?:dest|ptr): \*void, (?:value|c): int, (?:n|size): (?:int|long|u64)\) ret \*void;/,
];

async function compileAndRunCode(code: string): Promise<CompileResponse> {
  const tempDir = path.join(
    "/tmp",
    `bpl-tutorial-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const sourceFile = path.join(tempDir, "main.bpl");
  const irFile = path.join(tempDir, "main.ll");
  const binFile = path.join(tempDir, "main");

  try {
    fs.writeFileSync(sourceFile, code, "utf-8");

    const compiler = new Compiler({
      filePath: sourceFile,
      outputPath: irFile,
      emitType: "llvm",
      resolveImports: true,
      verbose: false,
    });

    const result = compiler.compile(code);

    if (!result.success) {
      return {
        success: false,
        error: result.errors
          ? result.errors.map((e) => e.toString()).join("\n")
          : "Unknown compilation error",
      };
    }

    const ir = result.output || "";
    fs.writeFileSync(irFile, ir, "utf-8");

    // Compile IR to binary using clang
    try {
      const runtimePath = path.resolve("lib/runtime.ll");
      const runtimeSupportPath = path.resolve("lib/runtime_support.o");
      await execFileAsync("clang", [
        "-o",
        binFile,
        irFile,
        runtimePath,
        runtimeSupportPath,
        "-Wno-override-module",
        "-lm",
        "-rdynamic",
      ]);
    } catch (e: any) {
      return {
        success: false,
        error: `LLVM compilation failed: ${e.stderr || e.message}`,
        ir,
      };
    }

    // Run the binary
    try {
      const { stdout, stderr } = await runProcessFile(binFile, [], {
        timeout: 5000,
      });

      return {
        success: true,
        output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
        ir,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Runtime error: ${e.stderr || e.message}`,
        output: e.stdout || "",
        ir,
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: (e.message || String(e)) + (e.stack ? `\n${e.stack}` : ""),
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

function loadTutorials(): Tutorial[] {
  const tutorialsDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "../playground/tutorials",
  );
  const tutorials: Tutorial[] = [];

  if (!fs.existsSync(tutorialsDir)) {
    console.warn("Tutorials directory not found:", tutorialsDir);
    return tutorials;
  }

  const files = fs
    .readdirSync(tutorialsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(tutorialsDir, file), "utf-8");
      const tutorial = JSON.parse(content);
      tutorials.push(tutorial);
    } catch (e) {
      console.error(`Failed to load tutorial ${file}:`, e);
    }
  }

  return tutorials.sort((a, b) => a.order - b.order);
}

function collectTutorialSnippetExterns(): string[] {
  const tutorialsDir = path.join(import.meta.dir, "../playground/tutorials");

  return fs
    .readdirSync(tutorialsDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      if (file === "21-ffi.json") {
        return [];
      }

      const content = fs.readFileSync(path.join(tutorialsDir, file), "utf8");
      const tutorial = JSON.parse(content) as Tutorial;

      return tutorial.sections.flatMap((section) => {
        const snippets = [
          ["code", section.code],
          ["solution", section.solution],
        ] as const;

        return snippets.flatMap(([field, snippet]) => {
          if (!snippet) {
            return [];
          }

          return centralizedTutorialCExterns.flatMap((pattern) => {
            const match = snippet.match(pattern);
            return match
              ? [
                  `playground/tutorials/${file} ${section.title} ${field}: ${match[0]}`,
                ]
              : [];
          });
        });
      });
    });
}

function extractTestableCode(tutorials: Tutorial[]): TestableCode[] {
  const testable: TestableCode[] = [];

  for (const tutorial of tutorials) {
    for (const section of tutorial.sections) {
      // Extract runnable code sections
      if (section.type === "code" && section.runnable && section.code) {
        testable.push({
          tutorialTitle: tutorial.title,
          tutorialOrder: tutorial.order,
          sectionTitle: section.title,
          code: section.code,
          expectedOutput: section.expectedOutput,
          isChallengeSolution: false,
        });
      }

      // Extract challenge solutions (only if runnable is not explicitly false)
      if (
        section.type === "challenge" &&
        section.solution &&
        section.runnable !== false
      ) {
        testable.push({
          tutorialTitle: tutorial.title,
          tutorialOrder: tutorial.order,
          sectionTitle: `${section.title} (Solution)`,
          code: section.solution,
          expectedOutput: undefined, // Solutions don't have expected output defined
          isChallengeSolution: true,
        });
      }
    }
  }

  return testable;
}

describe("BPL Tutorial Examples", () => {
  const tutorials = loadTutorials();
  const testableCode = extractTestableCode(tutorials);
  const results: Map<string, { passed: boolean; error?: string }> = new Map();

  beforeAll(() => {
    console.log(
      `\n📖 Testing ${testableCode.length} tutorial code examples from ${tutorials.length} tutorials...\n`,
    );
  });

  afterAll(() => {
    console.log("\n📊 Tutorial Test Summary:");
    console.log("=".repeat(60));

    let passed = 0;
    let failed = 0;
    const failedExamples: string[] = [];

    for (const [name, result] of results) {
      if (result.passed) {
        passed++;
        console.log(`✅ ${name}`);
      } else {
        failed++;
        failedExamples.push(name);
        console.log(`❌ ${name}`);
        if (result.error) {
          console.log(
            `   Error: ${result.error.split("\n")[0]?.substring(0, 80)}`,
          );
        }
      }
    }

    console.log("=".repeat(60));
    console.log(
      `\n📈 Results: ${passed} passed, ${failed} failed out of ${testableCode.length}`,
    );
  });

  it("uses argv-vector execution instead of tutorial runtime shell strings", () => {
    const source = fs.readFileSync(import.meta.path, "utf8");

    expect(source).not.toMatch(/promisify\s*\(\s*exec\s*\)/);
    expect(source).not.toMatch(/execAsync\s*\(/);
    expect(source).not.toMatch(/`"\$\{binFile\}"`/);
  });

  it("uses std/c.bpl for canonical C externs outside the FFI tutorial", () => {
    expect(collectTutorialSnippetExterns()).toEqual([]);
  });

  testableCode.forEach((item, index) => {
    const testName = `Tutorial ${item.tutorialOrder}: ${item.tutorialTitle} - ${item.sectionTitle}`;

    it(testName, async () => {
      try {
        const result = await compileAndRunCode(item.code);

        if (!result.success) {
          const errorMsg = result.error || "Unknown compilation error";
          results.set(testName, {
            passed: false,
            error: errorMsg,
          });
          console.error(`\nFailed: ${testName}`);
          console.error(errorMsg);
          throw new Error(`Compilation failed: ${errorMsg}`);
        }

        // Verify output if expected output is provided
        if (item.expectedOutput) {
          const actualOutput = (result.output || "").trim();
          const expectedOutput = item.expectedOutput.trim();

          // Normalize both outputs for comparison:
          // - Replace memory addresses (0x...) with placeholder
          // - Normalize floating point precision differences
          const normalizeOutput = (s: string): string => {
            return s
              .replace(/0x[0-9a-fA-F]+/g, "0x...")
              .replace(/\d+\.\d{6,}/g, (m) => parseFloat(m).toFixed(2));
          };

          const normalizedActual = normalizeOutput(actualOutput);
          const normalizedExpected = normalizeOutput(expectedOutput);

          if (normalizedActual !== normalizedExpected) {
            const errorMsg = `Output mismatch:\nExpected:\n${expectedOutput}\n\nActual:\n${actualOutput}`;
            results.set(testName, {
              passed: false,
              error: errorMsg,
            });
            throw new Error(errorMsg);
          }
        }

        // For challenge solutions, just verify they compile and run
        if (item.isChallengeSolution) {
          // Challenge solutions just need to run without crashing
          if (item.code.includes("printf") || item.code.includes("IO.")) {
            expect(result.output).toBeDefined();
          }
        }

        results.set(testName, { passed: true });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        if (!results.has(testName)) {
          results.set(testName, { passed: false, error: errorMsg });
        }
        throw error;
      }
    });
  });
});
