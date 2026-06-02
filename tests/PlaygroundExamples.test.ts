import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { Compiler } from "../compiler/index";
import { runProcessFile } from "../playground/backend/processRunner";
import {
  expectedOutputSnippets,
  loadPlaygroundExamples,
  type PlaygroundExample,
} from "./helpers/playgroundExamples";

const execFileAsync = promisify(execFile);

interface CompileResponse {
  success: boolean;
  output?: string;
  error?: string;
  warnings?: string[];
  ir?: string;
  ast?: string;
  tokens?: string;
}

function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }

      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    },
    2,
  );
}

async function compileAndRunExample(
  code: string | string[],
  input?: string,
  args?: string[],
): Promise<CompileResponse> {
  const tempDir = path.join(
    "/tmp",
    `bpl-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const sourceFile = path.join(tempDir, "main.bpl");
  const irFile = path.join(tempDir, "main.ll");
  const binFile = path.join(tempDir, "main");

  const codeStr = Array.isArray(code) ? code.join("\n") : code;

  try {
    fs.writeFileSync(sourceFile, codeStr, "utf-8");

    const compiler = new Compiler({
      filePath: sourceFile,
      outputPath: irFile,
      emitType: "llvm",
      resolveImports: true,
      verbose: false,
    });

    const result = compiler.compile(codeStr);

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
      const { stdout, stderr } = await runProcessFile(binFile, args || [], {
        input,
        timeout: 5000,
      });

      return {
        success: true,
        output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
        ir,
        ast: safeStringify(result.ast),
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

describe("BPL Playground Examples", () => {
  const examples: PlaygroundExample[] = loadPlaygroundExamples();
  const results: Map<string, { passed: boolean; error?: string }> = new Map();

  beforeAll(() => {
    console.log(`\n📚 Testing ${examples.length} examples...\n`);
  });

  afterAll(() => {
    console.log("\n📊 Test Summary:");
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
      `\n📈 Results: ${passed} passed, ${failed} failed out of ${examples.length}`,
    );
  });

  it("includes advanced examples for lifecycle, type guards, and native variadics", () => {
    expect(examples.map((example) => example.title)).toEqual(
      expect.arrayContaining([
        "RAII Auto Destroy",
        "Runtime Type Guards",
        "Native Variadic Functions",
        "Runtime Correctness Patterns",
        "Tooling Friendly Modules",
        "Release Package Checksums",
        "Browser WebAssembly Showcase",
      ]),
    );
  });

  it("passes shell metacharacter args literally and preserves stdin", async () => {
    const result = await compileAndRunExample(
      [
        "extern printf(fmt: string, ...);",
        "extern scanf(fmt: string, ...);",
        "",
        "frame main(argc: int, argv: **char) ret int {",
        "    local value: i32;",
        "    printf(\"argc=%d\\n\", argc);",
        "    printf(\"arg1=%s\\n\", argv[1]);",
        "    printf(\"arg2=%s\\n\", argv[2]);",
        "    scanf(\"%d\", &value);",
        "    printf(\"stdin=%d\\n\", value);",
        "    return 0;",
        "}",
      ],
      "42\n",
      ["$(printf mutated)", "`printf ticked`"],
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("argc=3");
    expect(result.output).toContain("arg1=$(printf mutated)");
    expect(result.output).toContain("arg2=`printf ticked`");
    expect(result.output).toContain("stdin=42");
  });

  it("uses argv-vector execution instead of runtime shell strings", () => {
    const source = fs.readFileSync(import.meta.path, "utf8");

    expect(source).toContain("runProcessFile(binFile, args || []");
    expect(source).not.toMatch(/const\s+argsStr\s*=/);
    expect(source).not.toMatch(/\binputRedirect\b\s*=/);
    expect(source).not.toMatch(/execAsync\s*\(\s*cmd/);
  });

  examples.forEach((example) => {
    it(`Example ${example.order}: ${example.title}`, async () => {
      const testName = `${example.order}. ${example.title}`;

      try {
        const result = await compileAndRunExample(
          example.code,
          example.input,
          example.args,
        );

        if (!result.success) {
          const errorMsg = result.error || "Unknown compilation error";
          results.set(testName, {
            passed: false,
            error: errorMsg,
          });
          console.error(errorMsg); // Print full error
          throw new Error(`Compilation failed: ${errorMsg}`);
        }

        const codeStr = Array.isArray(example.code)
          ? example.code.join("\n")
          : example.code;
        if (
          codeStr.includes("printf") ||
          codeStr.includes("IO.log") ||
          codeStr.includes("IO.print")
        ) {
          expect(result.output).toBeDefined();
          if (!result.output || result.output.trim() === "") {
            throw new Error("No output produced");
          }
        }

        if (example.expectedOutput !== undefined) {
          expect(result.output).toBeDefined();
          for (const expected of expectedOutputSnippets(
            example.expectedOutput,
          )) {
            expect(result.output).toContain(expected);
          }
        }

        results.set(testName, { passed: true });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        results.set(testName, { passed: false, error: errorMsg });
        throw error;
      }
    });
  });
});
