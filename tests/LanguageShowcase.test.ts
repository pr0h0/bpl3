import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as path from "path";

const CMP_SCRIPT = path.join(process.cwd(), "cmp.sh");

function runExample(example: string): string {
  const mainFile = path.join("examples", example, "main.bpl");
  const result = spawnSync(CMP_SCRIPT, [mainFile], {
    env: {
      ...process.env,
      BPL_HOME: process.cwd(),
    },
    encoding: "utf-8",
  });

  const output = result.stdout + result.stderr;
  expect(result.status, output).toBe(0);
  return output;
}

describe("language showcase examples", () => {
  it("runs the basics showcase from arithmetic through pattern matching", () => {
    const output = runExample("language_showcase_basics");

    expect(output).toContain("1 + 1 = 2");
    expect(output).toContain("operators: 17 9 52 3 1 64 7");
    expect(output).toContain("tuple: min=3 max=9 sum=12");
    expect(output).toContain("match: teen");
  });

  it("runs the systems showcase for memory, lifecycle, and errors", () => {
    const output = runExample("language_showcase_systems");

    expect(output).toContain("point: (8, 13)");
    expect(output).toContain("heap value: 144");
    expect(output).toContain("caught error: divide by zero");
    expect(output).toContain("defer cleanup: 15");
  });

  it("runs the abstractions showcase for OOP and FP features", () => {
    const output = runExample("language_showcase_abstractions");

    expect(output).toContain("enum guard: positive");
    expect(output).toContain("box value: 42");
    expect(output).toContain("dog says: bark");
    expect(output).toContain("lambda: 21");
  });
});
