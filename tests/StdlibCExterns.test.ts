import { describe, expect, test } from "bun:test";

import { compileAndRun } from "./helpers/compileAndRun";
import { compileToLLVM } from "./helpers";

describe("Standard library C extern declarations", () => {
  test("imports common C runtime declarations from std/c.bpl", () => {
    const output = compileAndRun(`
      import [printf], [malloc], [free], [strlen], [memset] from "std/c.bpl";

      frame main() ret int {
        local raw: *void = malloc(8);
        memset(raw, 65, 7);
        local text: string = cast<string>(raw);
        text[7] = cast<char>(0);

        printf("len=%d text=%s\\n", strlen(text), text);
        free(raw);
        return 0;
      }
    `);

    expect(output).toBe("len=7 text=AAAAAAA\n");
  });

  test("keeps std-imported printf as a direct external call shape", () => {
    const ir = compileToLLVM(`
      import [printf] from "std/c.bpl";

      frame main() ret int {
        return printf("value=%d\\n", 42);
      }
    `);

    expect(ir).toContain("declare i32 @printf(i8*, ...)");
    expect(ir).toMatch(/call i32 \(i8\*, \.\.\.\) @printf/);
    expect(ir).not.toContain("@IO_printf");
  });
});
