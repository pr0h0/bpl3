import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { compileToBinary } from "../cli/BinaryRunner";

describe("BinaryRunner", () => {
  const originalBplHome = process.env.BPL_HOME;
  const originalBplCc = process.env.BPL_CC;

  afterEach(() => {
    if (originalBplHome === undefined) {
      delete process.env.BPL_HOME;
    } else {
      process.env.BPL_HOME = originalBplHome;
    }
    if (originalBplCc === undefined) {
      delete process.env.BPL_CC;
    } else {
      process.env.BPL_CC = originalBplCc;
    }
  });

  test("reports missing LLVM IR inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-input-"));
    const irPath = path.join(tempDir, "missing.ll");

    try {
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("LLVM IR input not found");
      expect(result.error).toContain(irPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports directory LLVM IR inputs before output validation", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-dir-"));
    const irPath = path.join(tempDir, "main.ll");

    try {
      fs.mkdirSync(irPath);

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("LLVM IR input is not a file");
      expect(result.error).toContain(irPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
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
