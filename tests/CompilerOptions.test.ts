import { describe, expect, it } from "bun:test";

import { Compiler } from "../compiler";

describe("Compiler options", () => {
  it("requires a main entry point for direct compilation when requested", () => {
    const compiler = new Compiler({
      filePath: "test.bpl",
      requireEntryPoint: true,
    });

    const result = compiler.compile("frame helper() ret int { return 0; }");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.message).toContain(
      "Missing entry point function 'main'",
    );
  });

  it("keeps entry point validation opt-in for library-style compilation", () => {
    const compiler = new Compiler({
      filePath: "test.bpl",
    });

    const result = compiler.compile("frame helper() ret int { return 0; }");

    expect(result.success).toBe(true);
    expect(result.output).toContain("define i32 @helper_()");
  });

  it("rejects invalid direct optimization levels before compiling", () => {
    const compiler = new Compiler({
      filePath: "test.bpl",
      optimizationLevel: 4,
    });

    const result = compiler.compile("frame main() ret int { return 0; }");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.message).toContain(
      'Invalid optimization level "4"',
    );
  });

  it("rejects invalid direct jobs before cached compilation reads files", () => {
    const compiler = new Compiler({
      filePath: "missing-cache-entry.bpl",
      useCache: true,
      jobs: 0,
    });

    const result = compiler.compile("frame main() ret int { return 0; }");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.message).toContain('Invalid jobs count "0"');
  });

  it("rejects unsupported direct target triples before compiling", () => {
    const compiler = new Compiler({
      filePath: "test.bpl",
      target: "mips64-unknown-bpl",
    });

    const result = compiler.compile("frame main() ret int { return 0; }");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.message).toContain(
      'Unsupported target triple "mips64-unknown-bpl"',
    );
  });

  it("rejects empty direct target triples before compiling", () => {
    const compiler = new Compiler({
      filePath: "test.bpl",
      target: "",
    });

    const result = compiler.compile("frame main() ret int { return 0; }");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.message).toContain(
      'Unsupported target triple ""',
    );
  });
});
