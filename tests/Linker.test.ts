import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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
});
