import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { Compiler } from "../compiler";
import { getNativeLinkerFlags } from "../cli/utils";
import { Linker } from "../compiler/middleend/Linker";

describe("Linker", () => {
  it("uses platform-specific native linker flags", () => {
    expect(getNativeLinkerFlags("linux")).toEqual(["-lm", "-ldl", "-rdynamic"]);
    expect(getNativeLinkerFlags("darwin")).toEqual(["-lm"]);
    expect(getNativeLinkerFlags("win32")).toEqual([]);
  });

  it("forwards optimization level to the compiler driver", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-linker-"));
    const irPath = join(dir, "main.ll");
    const outputPath = join(dir, "main");
    const logs: string[] = [];
    const originalLog = console.log;

    writeFileSync(
      irPath,
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
    );

    try {
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };

      const ok = new Linker().link({
        irFiles: [irPath],
        outputPath,
        verbose: true,
        optimizationLevel: 3,
        clangFlags: ["-Wno-override-module"],
      });

      expect(ok).toBe(true);
      expect(logs.join("\n")).toContain("-O3");
    } finally {
      console.log = originalLog;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not clobber an output sibling .ll file while linking", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-linker-no-clobber-"));
    const irPath = join(dir, "input.ll");
    const outputPath = join(dir, "main");
    const siblingLl = `${outputPath}.ll`;

    writeFileSync(
      irPath,
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
    );
    writeFileSync(siblingLl, "keep me");

    try {
      const ok = new Linker().link({
        irFiles: [irPath],
        outputPath,
        clangFlags: ["-Wno-override-module"],
      });

      expect(ok).toBe(true);
      expect(readFileSync(siblingLl, "utf-8")).toBe("keep me");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not leave requested compiler output as IR after object-link failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-compiler-link-fail-"));
    const sourceFile = join(dir, "main.bpl");
    const outputPath = join(dir, "app");
    const missingCompiler = join(dir, "definitely-missing-cc");
    const previousBplCc = process.env.BPL_CC;
    const originalError = console.error;
    const errors: string[] = [];

    writeFileSync(
      sourceFile,
      ["frame main() ret int {", "    return 0;", "}"].join("\n"),
    );

    try {
      process.env.BPL_CC = missingCompiler;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };
      const compiler = new Compiler({
        filePath: sourceFile,
        outputPath,
        libraries: ["m"],
      });

      const result = compiler.compile(readFileSync(sourceFile, "utf-8"));

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.message).toBe("Linking failed");
      expect(errors.join("\n")).toContain(missingCompiler);
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      console.error = originalError;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("honors BPL_CC when linking object files", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-linker-driver-"));
    const irPath = join(dir, "main.ll");
    const outputPath = join(dir, "main");
    const missingCompiler = join(dir, "definitely-missing-cc");
    const originalLog = console.log;
    const previousBplCc = process.env.BPL_CC;
    const logs: string[] = [];

    writeFileSync(
      irPath,
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
    );

    try {
      process.env.BPL_CC = missingCompiler;
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };

      const ok = new Linker().link({
        irFiles: [irPath],
        outputPath,
        verbose: true,
      });

      expect(ok).toBe(false);
      expect(logs.join("\n")).toContain(`Running: ${missingCompiler}`);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      console.log = originalLog;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing and directory IR inputs before linking", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-linker-ir-input-"));
    const outputPath = join(dir, "main");
    const missingIr = join(dir, "missing.ll");
    const irDir = join(dir, "ir");
    const targetIr = join(dir, "target.ll");
    const linkedIr = join(dir, "linked.ll");
    const originalError = console.error;
    mkdirSync(irDir);
    writeFileSync(
      targetIr,
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
    );
    symlinkSync(targetIr, linkedIr, "file");

    try {
      console.error = () => {};

      const missingOk = new Linker().link({
        irFiles: [missingIr],
        outputPath,
        clangFlags: ["-Wno-override-module"],
      });
      expect(missingOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);

      const directoryOk = new Linker().link({
        irFiles: [irDir],
        outputPath,
        clangFlags: ["-Wno-override-module"],
      });
      expect(directoryOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);

      const symlinkOk = new Linker().link({
        irFiles: [linkedIr],
        outputPath,
        clangFlags: ["-Wno-override-module"],
      });
      expect(symlinkOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      console.error = originalError;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing and directory object files before linking", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-linker-object-input-"));
    const irPath = join(dir, "main.ll");
    const outputPath = join(dir, "main");
    const missingObject = join(dir, "missing.o");
    const objectDir = join(dir, "objects");
    const unsupportedObject = join(dir, "notes.txt");
    const targetObject = join(dir, "target.ll");
    const linkedObject = join(dir, "linked.ll");
    const originalError = console.error;

    writeFileSync(
      irPath,
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
    );
    mkdirSync(objectDir);
    writeFileSync(unsupportedObject, "not an object");
    writeFileSync(targetObject, "declare void @external_symbol()\n");
    symlinkSync(targetObject, linkedObject, "file");

    try {
      console.error = () => {};

      const missingOk = new Linker().link({
        irFiles: [irPath],
        outputPath,
        objectFiles: [missingObject],
        clangFlags: ["-Wno-override-module"],
      });
      expect(missingOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);

      const directoryOk = new Linker().link({
        irFiles: [irPath],
        outputPath,
        objectFiles: [objectDir],
        clangFlags: ["-Wno-override-module"],
      });
      expect(directoryOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);

      const unsupportedOk = new Linker().link({
        irFiles: [irPath],
        outputPath,
        objectFiles: [unsupportedObject],
        clangFlags: ["-Wno-override-module"],
      });
      expect(unsupportedOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);

      const symlinkOk = new Linker().link({
        irFiles: [irPath],
        outputPath,
        objectFiles: [linkedObject],
        clangFlags: ["-Wno-override-module"],
      });
      expect(symlinkOk).toBe(false);
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      console.error = originalError;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid output paths before linking", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-linker-output-"));
    const irPath = join(dir, "main.ll");
    const outputDir = join(dir, "out-dir");
    const outputLink = join(dir, "out-link");
    const outputLinkTarget = join(dir, "out-link-target");
    const missingParentOutput = join(dir, "missing", "app");
    const parentFile = join(dir, "not-a-dir");
    const parentFileOutput = join(parentFile, "app");
    const realParentDir = join(dir, "real-parent");
    const linkedParentDir = join(dir, "linked-parent");
    const linkedParentOutput = join(linkedParentDir, "app");
    const originalError = console.error;
    const errors: string[] = [];

    writeFileSync(
      irPath,
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
    );
    mkdirSync(outputDir);
    mkdirSync(realParentDir);
    writeFileSync(parentFile, "not a directory\n");
    symlinkSync(outputLinkTarget, outputLink, "file");
    symlinkSync(realParentDir, linkedParentDir, "dir");

    try {
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };

      const directoryOk = new Linker().link({
        irFiles: [irPath],
        outputPath: outputDir,
        clangFlags: ["-Wno-override-module"],
      });
      expect(directoryOk).toBe(false);

      const symlinkOk = new Linker().link({
        irFiles: [irPath],
        outputPath: outputLink,
        clangFlags: ["-Wno-override-module"],
      });
      expect(symlinkOk).toBe(false);
      expect(existsSync(outputLinkTarget)).toBe(false);

      const missingParentOk = new Linker().link({
        irFiles: [irPath],
        outputPath: missingParentOutput,
        clangFlags: ["-Wno-override-module"],
      });
      expect(missingParentOk).toBe(false);
      expect(existsSync(missingParentOutput)).toBe(false);

      const parentFileOk = new Linker().link({
        irFiles: [irPath],
        outputPath: parentFileOutput,
        clangFlags: ["-Wno-override-module"],
      });
      expect(parentFileOk).toBe(false);
      expect(existsSync(parentFileOutput)).toBe(false);

      const symlinkParentOk = new Linker().link({
        irFiles: [irPath],
        outputPath: linkedParentOutput,
        clangFlags: ["-Wno-override-module"],
      });
      expect(symlinkParentOk).toBe(false);
      expect(existsSync(linkedParentOutput)).toBe(false);
      expect(errors.join("\n")).toContain("Output path is a directory");
      expect(errors.join("\n")).toContain("Output path is a symbolic link");
      expect(errors.join("\n")).toContain("Output directory not found");
      expect(errors.join("\n")).toContain(
        "Output parent path is not a directory",
      );
      expect(errors.join("\n")).toContain(
        "Output parent path is a symbolic link",
      );
      expect(errors.join("\n")).not.toContain("EISDIR");
      expect(errors.join("\n")).not.toContain("ENOENT");
      expect(errors.join("\n")).not.toContain("ENOTDIR");
    } finally {
      console.error = originalError;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
