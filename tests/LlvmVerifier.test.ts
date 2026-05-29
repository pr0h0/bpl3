import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { verifyLlvmFile } from "../compiler/common/LlvmVerifier";

function withLlvmFile(ir: string, callback: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "bpl-llvm-verifier-test-"));
  const irPath = join(dir, "module.ll");
  writeFileSync(irPath, ir);

  try {
    callback(irPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("LLVM verifier tooling", () => {
  test("accepts structurally valid LLVM IR", () => {
    withLlvmFile(
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
      (irPath) => {
        const result = verifyLlvmFile(irPath);

        expect(result.exitCode).toBe(0);
        expect(result.tool).not.toBe("none");
      },
    );
  });

  test("rejects structurally invalid LLVM IR before native linking", () => {
    withLlvmFile(
      `
        define i32 @bad() {
        entry:
          ret i64 0
        }
      `,
      (irPath) => {
        const result = verifyLlvmFile(irPath);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr + result.stdout).toMatch(/i32|result type|LLVM/i);
      },
    );
  });
});
