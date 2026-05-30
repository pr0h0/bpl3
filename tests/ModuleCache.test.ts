import { createHash } from "crypto";
import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { getCompilerDriver } from "../compiler/common/CompilerDriver";
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
      expect(
        readdirSync(join(dir, ".bpl-cache")).some((file) =>
          file.endsWith(".ll"),
        ),
      ).toBe(false);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleans async cache temp files after compiler driver failures", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-async-fail-"));
    const previousBplCc = process.env.BPL_CC;
    const missingCompiler = join(dir, "definitely-missing-cc");

    try {
      process.env.BPL_CC = missingCompiler;
      const cache = new ModuleCache(dir);

      await expect(
        cache.compileModules(
          [
            {
              modulePath: "main.bpl",
              content: "frame main() ret int { return 0; }",
              llvmIR: EMPTY_MAIN_IR,
            },
          ],
          { jobs: 1, optimizationLevel: 0 },
        ),
      ).rejects.toThrow(missingCompiler);

      const cacheFiles = readdirSync(join(dir, ".bpl-cache"));
      expect(cacheFiles.some((file) => file.endsWith(".ll"))).toBe(false);
      expect(cacheFiles.some((file) => file.endsWith(".o"))).toBe(false);
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

  it("rejects malformed object cache paths before invoking the compiler", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-object-dir-"));

    try {
      const modulePath = join(dir, "main.bpl");
      const content = "frame main() ret int { return 0; }";
      const cache = new ModuleCache(dir);
      const hash = getModuleHashForTest(content, undefined, 0);
      mkdirSync(join(dir, ".bpl-cache", `${hash}.o`));

      expect(() =>
        cache.compileModule(
          modulePath,
          content,
          "; intentionally not compiled\n",
          false,
          undefined,
          0,
        ),
      ).toThrow(/Module cache object path is not a file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked object cache paths before invoking the compiler", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-object-link-"));

    try {
      const modulePath = join(dir, "main.bpl");
      const content = "frame main() ret int { return 0; }";
      const cache = new ModuleCache(dir);
      const hash = getModuleHashForTest(content, undefined, 0);
      const targetObject = join(dir, "outside.o");
      writeFileSync(targetObject, "outside\n");
      symlinkSync(targetObject, join(dir, ".bpl-cache", `${hash}.o`), "file");

      expect(() =>
        cache.compileModule(
          modulePath,
          content,
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        ),
      ).toThrow(/Module cache object path is a symbolic link/);
      expect(readFileSync(targetObject, "utf8")).toBe("outside\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-file cached object paths in lookups and stats", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-stats-dir-"));

    try {
      const cacheDir = join(dir, ".bpl-cache");
      const objectPath = join(cacheDir, "cached-object.o");
      const modulePath = join(dir, "main.bpl");
      mkdirSync(objectPath, { recursive: true });
      writeFileSync(
        join(cacheDir, "manifest.json"),
        JSON.stringify(
          {
            version: "1.0.0",
            modules: {
              [modulePath]: {
                path: modulePath,
                hash: "hash",
                objectFile: objectPath,
                timestamp: 1,
              },
            },
          },
          null,
          2,
        ),
      );

      const cache = new ModuleCache(dir);

      expect(cache.getCachedObjectFile(modulePath)).toBeNull();
      expect(cache.getStats().cacheSize).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores cached object paths outside the cache directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-outside-object-"));

    try {
      const cacheDir = join(dir, ".bpl-cache");
      const objectPath = join(dir, "outside.o");
      const modulePath = join(dir, "main.bpl");
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(objectPath, "outside object\n");
      writeFileSync(
        join(cacheDir, "manifest.json"),
        JSON.stringify(
          {
            version: "1.0.0",
            modules: {
              [modulePath]: {
                path: modulePath,
                hash: "hash",
                objectFile: objectPath,
                timestamp: 1,
              },
            },
          },
          null,
          2,
        ),
      );

      const cache = new ModuleCache(dir);

      expect(cache.getCachedObjectFile(modulePath)).toBeNull();
      expect(cache.getStats().cacheSize).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked cache manifests before saving", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-manifest-link-"));

    try {
      const cache = new ModuleCache(dir);
      const cacheDir = join(dir, ".bpl-cache");
      const manifestPath = join(cacheDir, "manifest.json");
      const targetPath = join(dir, "outside-manifest.json");
      writeFileSync(targetPath, "outside\n");
      rmSync(manifestPath, { force: true });
      symlinkSync(targetPath, manifestPath, "file");

      expect(() =>
        cache.compileModule(
          "main.bpl",
          "frame main() ret int { return 0; }",
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        ),
      ).toThrow(/Module cache manifest path is a symbolic link/);
      expect(readFileSync(targetPath, "utf8")).toBe("outside\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function getModuleHashForTest(
  content: string,
  target?: string,
  optimizationLevel?: number,
  options: { sysroot?: string; clangFlags?: string[] } = {},
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        content,
        target: target ?? "",
        optimizationLevel: optimizationLevel ?? 0,
        compilerDriver: getCompilerDriver(target),
        sysroot: options.sysroot ?? "",
        clangFlags: options.clangFlags ?? [],
      }),
    )
    .digest("hex");
}
