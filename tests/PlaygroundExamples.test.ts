import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { Compiler } from "../compiler/index";

const execAsync = promisify(exec);

interface Example {
  order: number;
  title: string;
  snippet: string;
  description: string;
  code: string | string[];
  input?: string;
  args?: string[];
}

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
  const inputFile = path.join(tempDir, "input.txt");

  const codeStr = Array.isArray(code) ? code.join("\n") : code;

  try {
    fs.writeFileSync(sourceFile, codeStr, "utf-8");
    if (input) {
      fs.writeFileSync(inputFile, input, "utf-8");
    }

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
      await execAsync(
        `clang -o "${binFile}" "${irFile}" "${runtimePath}" "${runtimeSupportPath}" -Wno-override-module -lm -rdynamic`,
      );
    } catch (e: any) {
      return {
        success: false,
        error: `LLVM compilation failed: ${e.stderr || e.message}`,
        ir,
      };
    }

    // Run the binary
    try {
      const argsStr = (args || [])
        .map((a) => `"${a.replace(/"/g, '\\"')}"`)
        .join(" ");
      const inputRedirect = input ? ` < "${inputFile}"` : "";
      const cmd = `"${binFile}" ${argsStr}${inputRedirect}`;

      const { stdout, stderr } = await execAsync(cmd, {
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

function loadExamples(): Example[] {
  const examplesDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "../playground/examples",
  );
  const examples: Example[] = [];

  if (!fs.existsSync(examplesDir)) {
    console.warn("Examples directory not found:", examplesDir);
    return examples;
  }

  const files = fs
    .readdirSync(examplesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(examplesDir, file), "utf-8");
      const example = JSON.parse(content);
      examples.push(example);
    } catch (e) {
      console.error(`Failed to load example ${file}:`, e);
    }
  }

  return examples.sort((a, b) => a.order - b.order);
}

describe("BPL Playground Examples", () => {
  const examples = loadExamples();
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
      ]),
    );
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

        results.set(testName, { passed: true });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        results.set(testName, { passed: false, error: errorMsg });
        throw error;
      }
    });
  });
});
