import { describe, test, expect } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as fs from "fs";
import * as path from "path";

const EXAMPLE_DIR = path.resolve(__dirname, "../examples/bound_methods");
const CONFIG_PATH = path.join(EXAMPLE_DIR, "test_config.json");
const MAIN_PATH = path.join(EXAMPLE_DIR, "main.bpl");

describe("Bound Methods Example", () => {
  test("should compile and run correctly", async () => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const code = fs.readFileSync(MAIN_PATH, "utf-8");

    // We can't use runBpl directly with file path easily in this harness style usually
    // But let's try reading the file content.
    // The previous test used `runBpl(code, "bound_method_test")`.

    // Note: runBpl typically expects source code content.
    const result = runBpl(code, "bound_methods_main_example");

    if (result.exitCode !== 0) {
      console.error(result.stderr);
    }

    expect(result.exitCode).toBe(0);

    // Check output line by line or containment
    for (const expectedLine of config.expectedOutput) {
      expect(result.stdout).toContain(expectedLine);
    }
  });
});
