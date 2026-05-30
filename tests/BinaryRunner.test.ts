import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { compileToBinary, runExecutable } from "../cli/BinaryRunner";

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

  test("reports missing link object inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-object-"));
    const irPath = path.join(tempDir, "main.ll");
    const missingObjectPath = path.join(tempDir, "missing.o");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        object: missingObjectPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Link object input not found");
      expect(result.error).toContain(missingObjectPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports directory link object inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-object-dir-"),
    );
    const irPath = path.join(tempDir, "main.ll");
    const objectPath = path.join(tempDir, "object.o");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      fs.mkdirSync(objectPath);

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        object: objectPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Link object input is not a file");
      expect(result.error).toContain(objectPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports missing sysroot inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-sysroot-"),
    );
    const irPath = path.join(tempDir, "main.ll");
    const sysrootPath = path.join(tempDir, "missing-sysroot");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        sysroot: sysrootPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Sysroot input not found");
      expect(result.error).toContain(sysrootPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports file library search paths before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-libpath-"),
    );
    const irPath = path.join(tempDir, "main.ll");
    const libPath = path.join(tempDir, "not-a-directory");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      fs.writeFileSync(libPath, "not a directory\n");
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        libPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Library search path input is not a directory",
      );
      expect(result.error).toContain(libPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports compiler driver spawn failures", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-cc-"));
    const irPath = path.join(tempDir, "main.ll");
    const missingCompiler = path.join(tempDir, "missing-cc");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = missingCompiler;

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to compile LLVM IR");
      expect(result.error).toContain(missingCompiler);
      expect(result.error).toContain("command not found");
      expect(result.error).not.toContain("ENOENT");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports executable spawn failures", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-missing-"));
    const missingExecutable = path.join(tempDir, "missing-program");

    try {
      const result = runExecutable(missingExecutable);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain("Executable not found");
      expect(result.error).toContain(missingExecutable);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
