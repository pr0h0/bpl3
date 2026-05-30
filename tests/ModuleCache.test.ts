import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { ModuleCache } from "../compiler/middleend/ModuleCache";

const EMPTY_MAIN_IR = `
  define i32 @main() {
  entry:
    ret i32 0
  }
`;

describe("ModuleCache", () => {
  it("keeps separate object cache entries per optimization level", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-"));

    try {
      const cache = new ModuleCache(dir);
      const o0 = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
      );
      const o3 = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        3,
      );

      expect(o3).not.toBe(o0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps separate object cache entries for compiler driver flags", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-flags-"));

    try {
      const cache = new ModuleCache(dir);
      const plain = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
      );
      const withDebugFlag = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
        { clangFlags: ["-g"] },
      );

      expect(withDebugFlag).not.toBe(plain);
      expect(existsSync(plain)).toBe(true);
      expect(existsSync(withDebugFlag)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("honors BPL_CC when compiling module objects", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-driver-"));
    const previousBplCc = process.env.BPL_CC;
    const missingCompiler = join(dir, "definitely-missing-cc");

    try {
      process.env.BPL_CC = missingCompiler;
      const cache = new ModuleCache(dir);

      expect(() =>
        cache.compileModule(
          "main.bpl",
          "frame main() ret int { return 0; }",
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        ),
      ).toThrow(missingCompiler);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("compiles multiple module objects with a bounded parallel job count", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-parallel-"));

    try {
      const cache = new ModuleCache(dir);
      const objects = await cache.compileModules(
        [
          {
            modulePath: "left.bpl",
            content: "frame left() ret int { return 1; }",
            llvmIR: "define i32 @left() { ret i32 1 }",
          },
          {
            modulePath: "right.bpl",
            content: "frame right() ret int { return 2; }",
            llvmIR: "define i32 @right() { ret i32 2 }",
          },
        ],
        { jobs: 2, optimizationLevel: 0 },
      );

      expect(objects).toHaveLength(2);
      expect(objects.every((objectFile) => existsSync(objectFile))).toBe(true);
      expect(new Set(objects).size).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles identical module objects in the same parallel batch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-identical-"));

    try {
      const cache = new ModuleCache(dir);
      const objects = await cache.compileModules(
        [
          {
            modulePath: "first.bpl",
            content: "frame same() ret int { return 7; }",
            llvmIR: "define i32 @same() { ret i32 7 }",
          },
          {
            modulePath: "second.bpl",
            content: "frame same() ret int { return 7; }",
            llvmIR: "define i32 @same() { ret i32 7 }",
          },
        ],
        { jobs: 2, optimizationLevel: 0 },
      );

      expect(objects).toHaveLength(2);
      expect(objects[0]).toBe(objects[1]);
      expect(existsSync(objects[0]!)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
