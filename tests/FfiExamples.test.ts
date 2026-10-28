import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

// Replaces the former examples/test_ffi/test.sh, which nothing ran.
const exampleDir = "examples/test_ffi";

// Programs that declare and call libc externs.
const llvmExamples = [
  "extern_strlen.bpl",
  "variadic_extern.bpl",
  "multiple_externs.bpl",
  "extern_with_type.bpl",
  "mixed_functions.bpl",
  "multifile/main.bpl",
];

// Declares an extern without an implementation, so only the parse is checked.
const astExamples = ["extern_struct_param.bpl"];

function runCli(args: string[]) {
  return Bun.spawnSync([process.execPath, resolve("index.ts"), ...args], {
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 30000,
  });
}

describe("FFI examples", () => {
  for (const file of llvmExamples) {
    test(`emits LLVM IR for ${file}`, () => {
      const directory = mkdtempSync(join(tmpdir(), "bpl-ffi-example-"));
      const output = join(directory, "out.ll");
      try {
        const result = runCli([
          "build",
          join(exampleDir, file),
          "--emit",
          "llvm",
          "-o",
          output,
        ]);
        expect(result.stderr.toString()).toBe("");
        expect(result.exitCode).toBe(0);
        expect(existsSync(output)).toBe(true);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  for (const file of astExamples) {
    test(`parses ${file}`, () => {
      const result = runCli(["build", join(exampleDir, file), "--emit", "ast"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Program");
    });
  }
});
