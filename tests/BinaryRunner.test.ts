import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { compileToBinary } from "../cli/BinaryRunner";

describe("BinaryRunner", () => {
  const originalBplHome = process.env.BPL_HOME;

  afterEach(() => {
    if (originalBplHome === undefined) {
      delete process.env.BPL_HOME;
    } else {
      process.env.BPL_HOME = originalBplHome;
    }
  });

  test("reports malformed native runtime inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-runner-"));
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");

    try {
      fs.mkdirSync(path.join(libDir, "runtime.ll"), { recursive: true });
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_HOME = bplHome;

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Runtime IR is not a file");
      expect(result.error).toContain(path.join(libDir, "runtime.ll"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
