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
});
