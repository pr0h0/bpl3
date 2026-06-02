import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("Codegen drift guards", () => {
  it("does not keep approximate LLVM string size helpers", () => {
    const source = readFileSync(
      "compiler/backend/codegen/StructEnumGenerator.ts",
      "utf8",
    );

    expect(source).not.toContain("getTypeSize(llvmType");
    expect(source).not.toContain("Approximate struct size");
    expect(source).not.toContain("Approximate enum size");
  });
});
