import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

describe("linter type-safety guards", () => {
  test("visits function parameters without synthesizing dynamic AST nodes", () => {
    const source = readFileSync("compiler/linter/Linter.ts", "utf8");

    expect(source).not.toContain("(param as any)");
    expect(source).toContain("this.visit(param, context)");
  });
});
