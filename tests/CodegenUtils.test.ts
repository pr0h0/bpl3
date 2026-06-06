import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { isIntegerType } from "../compiler/backend/codegen/utils";

describe("Codegen utilities", () => {
  it("recognizes only scalar LLVM integer type names", () => {
    for (const type of ["i1", "i8", "i16", "i32", "i64", "i128"]) {
      expect(isIntegerType(type)).toBe(true);
    }

    for (const type of ["", "i", "int", "i32*", "i-32", "i3x", "I32"]) {
      expect(isIntegerType(type)).toBe(false);
    }
  });

  it("classifies hot LLVM integer types without regular expressions", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/backend/codegen/utils.ts"),
      "utf8",
    );
    const start = source.indexOf("export function isIntegerType");
    const end = source.indexOf("\n/**", start);
    const methodSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(methodSource).toContain("charCodeAt");
    expect(methodSource).not.toContain("/^i\\d+$/");
  });
});
