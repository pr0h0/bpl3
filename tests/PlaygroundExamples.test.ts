import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "path";
import fs from "fs";

interface Example {
  order: number;
  title: string;
  snippet: string;
  description: string;
  code: string;
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

const SERVER_URL = "http://localhost:3001";
let serverReady = false;

async function checkServerReady(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await Promise.race([
        fetch(`${SERVER_URL}/examples`),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000),
        ),
      ]);
      if (response.ok) {
        serverReady = true;
        `${SERVER_URL}/compile`;
        return;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Server not ready after ${
      maxAttempts * 100
    }ms. Make sure server is running with: cd playground/backend && bun run dev`,
  );
}

const failedCompilation: { name: string; error?: string }[] = [];

async function compileExample(
  code: string,
  input?: string,
  args?: string[],
): Promise<CompileResponse> {
  const response = await fetch("http://localhost:3001/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, input, args }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json() as unknown as CompileResponse;
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
      failedCompilation.push({
        name: `Loading Example ${file}`,
        error: `Failed to load example ${file}: ${e}`,
      });
    }
  }

  return examples;
}

describe("BPL Playground Examples", () => {
  const examples = loadExamples();
  const results: Map<string, { passed: boolean; error?: string }> = new Map();

  beforeAll(async () => {
    console.log(`\n📚 Testing ${examples.length} examples...\n`);
    await checkServerReady();
    console.log("✅ Server is ready!\n");
  });

  afterAll(() => {
    // Print summary
    console.log("\n📊 Test Summary:");
    console.log("=".repeat(60));

    let passed = 0;
    let failed = failedCompilation.length;
    const failedExamples: string[] = [];

    failedCompilation.forEach((f) => {
      failedExamples.push(f.name);
      console.log(`❌ ${f.name}`);
      if (f.error) {
        console.log(`   Error: ${f.error.split("\n")[0]?.substring(0, 80)}`);
      }
    });

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

    if (failedExamples.length > 0) {
      console.log("\n❌ Failed Examples:");
      failedExamples.forEach((name) => console.log(`   - ${name}`));
    }
  });

  examples.forEach((example) => {
    it(`Example ${example.order}: ${example.title}`, async () => {
      const testName = `${example.order}. ${example.title}`;

      try {
        // Test compilation and execution
        const result = await compileExample(
          example.code,
          example.input,
          example.args,
        );

        // Check if compilation was successful
        if (!result.success) {
          const errorMsg = result.error || "Unknown compilation error";
          results.set(testName, {
            passed: false,
            error: errorMsg,
          });
          throw new Error(`Compilation failed: ${errorMsg}`);
        }

        // For programs that should produce output, check that they did
        if (
          example.code.includes("printf") ||
          example.code.includes("IO.log")
        ) {
          expect(result.output).toBeDefined();
          if (!result.output || result.output.trim() === "") {
            throw new Error("No output produced");
          }
        }

        // Check that IR was generated
        expect(result.ir).toBeDefined();
        expect(result.ir?.length || 0).toBeGreaterThan(0);

        // Check that AST was generated
        expect(result.ast).toBeDefined();
        expect(result.ast?.length || 0).toBeGreaterThan(0);

        // Check that tokens were extracted
        expect(result.tokens).toBeDefined();

        results.set(testName, { passed: true });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        results.set(testName, { passed: false, error: errorMsg });
        throw error;
      }
    });
  });
});
