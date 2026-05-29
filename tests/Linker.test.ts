import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
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

  it("forwards optimization level to clang", () => {
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
});
