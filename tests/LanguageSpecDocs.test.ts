import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";

const specPath = path.resolve(__dirname, "../LANGUAGE_SPEC.md");

function readSpec(): string {
  return fs.readFileSync(specPath, "utf8");
}

describe("Language specification semantic contract", () => {
  it("documents the semantic core and ABI lowering contract", () => {
    const spec = readSpec();

    for (const heading of [
      "## 2. Semantic Core",
      "### Array, Pointer, and Slice Semantics",
      "### Conversion Semantics",
      "## 3. ABI Lowering Contract",
      "### Function and Lambda ABI",
      "### Slice ABI",
      "## 4. Compiler Pipeline Contract",
    ]) {
      expect(spec).toContain(heading);
    }
  });

  it("defines the current low-level type commitments", () => {
    const spec = readSpec();

    expect(spec).toContain("`int` and `uint` are 32-bit");
    expect(spec).toContain("`T[N]` is a fixed-size value array");
    expect(spec).toContain("`T[]` is a non-owning slice");
    expect(spec).toContain("`*T` is a raw pointer");
    expect(spec).toContain("`Func<R>(...)` lowers to a thin function pointer");
    expect(spec).toContain("`Lambda<R>(...)` lowers to a closure value");
  });
});
