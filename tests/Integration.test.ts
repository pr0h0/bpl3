import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const EXAMPLES_DIR = path.join(process.cwd(), "examples");
const CMP_SCRIPT = path.join(process.cwd(), "cmp.sh");

// Helper to find example directories
function getExampleDirectories(dir = EXAMPLES_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (fs.existsSync(path.join(fullPath, "main.bpl"))) {
        results.push(path.relative(EXAMPLES_DIR, fullPath));
      }
      results = results.concat(getExampleDirectories(fullPath));
    }
  }
  return results;
}

describe("Integration Tests", () => {
  const examples = getExampleDirectories();

  for (const example of examples) {
    const exampleDir = path.join(EXAMPLES_DIR, example);
    const relativeMainFile = path.relative(
      process.cwd(),
      path.join(exampleDir, "main.bpl"),
    );
    const configFile = path.join(exampleDir, "test_config.json");

    if (
      fs.existsSync(path.join(exampleDir, "main.bpl")) &&
      fs.existsSync(configFile)
    ) {
      const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));

      if (config.skip_compilation) {
        it.skip(`should run example: ${example}`, () => {});
        continue;
      }

      it(`should run example: ${example}`, () => {
        // Prepare command
        // We use cmp.sh which runs bun index.ts then lli
        const result = spawnSync(
          CMP_SCRIPT,
          [relativeMainFile, ...(config.args || [])],
          {
            env: { ...process.env, ...(config.env || {}) },
            input: config.input || "",
            encoding: "utf-8",
          },
        );

        if (result.error) {
          throw new Error(`Failed to run cmp.sh: ${result.error.message}`);
        }

        // Check exit code
        // cmp.sh returns the exit code of the program
        // But if compilation fails, it returns 1.
        // We assume the example should compile and run successfully (exit code 0) unless specified otherwise?
        // For now assume success.
        expect(result.status).toBe(0);

        // Check output
        // cmp.sh appends "Program exited with code X"
        // We should filter that out or check if output contains expected output.
        // The user's hello world prints "Hello, World!\n"
        // cmp.sh prints "Program exited with code 0\n"

        const output = result.stdout;
        if (config.expectedOutput) {
          if (Array.isArray(config.expectedOutput)) {
            config.expectedOutput.forEach((expectedLine: string) => {
              expect(output).toContain(expectedLine);
            });
          } else if (typeof config.expectedOutput === "string") {
            expect(output).toContain(config.expectedOutput);
          }
        }
      });
    }
  }
});
