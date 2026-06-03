import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { Compiler } from "../compiler";

describe("Compiler frontend fast path", () => {
  const originalBplHome = process.env.BPL_HOME;

  afterEach(() => {
    if (originalBplHome === undefined) {
      delete process.env.BPL_HOME;
    } else {
      process.env.BPL_HOME = originalBplHome;
    }
  });

  test("emits AST without loading the separate token grammar", () => {
    const bplHome = mkdtempSync(join(tmpdir(), "bpl-no-token-grammar-"));

    try {
      process.env.BPL_HOME = bplHome;

      const compiler = new Compiler({
        filePath: join(bplHome, "main.bpl"),
        emitType: "ast",
      });
      const result = compiler.compile(
        ["/# Entry point docs #/", "frame main() ret int { return 0; }"].join(
          "\n",
        ),
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('"kind": "Program"');
      expect(result.output).toContain('"documentation": "Entry point docs"');
    } finally {
      rmSync(bplHome, { recursive: true, force: true });
    }
  });
});
