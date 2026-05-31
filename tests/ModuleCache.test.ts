import { createHash } from "crypto";
import { describe, expect, it } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { getCompilerDriver } from "../compiler/common/CompilerDriver";
import {
  MODULE_CACHE_VERSION,
  ModuleCache,
} from "../compiler/middleend/ModuleCache";
import { writeNodeCommandShim } from "./helpers/executableShim";

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

  it("ignores manifests from older module cache versions", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-version-"));

    try {
      const cacheDir = join(dir, ".bpl-cache");
      mkdirSync(cacheDir, { recursive: true });
      const staleObject = join(cacheDir, "stale.o");
      writeFileSync(staleObject, "stale object");
      writeFileSync(
        join(cacheDir, "manifest.json"),
        JSON.stringify(
          {
            version: "1.0.0",
            modules: {
              "main.bpl": {
                path: "main.bpl",
                hash: "stale",
                objectFile: staleObject,
                timestamp: 1,
              },
            },
          },
          null,
          2,
        ),
      );

      const cache = new ModuleCache(dir);

      expect(cache.getStats().totalModules).toBe(0);
      expect(cache.getCachedObjectFile("main.bpl")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the active module cache version to fresh manifests", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-version-write-"));

    try {
      const cache = new ModuleCache(dir);
      cache.clearCache();

      const manifest = JSON.parse(
        readFileSync(join(dir, ".bpl-cache", "manifest.json"), "utf-8"),
      );

      expect(manifest.version).toBe(MODULE_CACHE_VERSION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects cache manifests whose entry path does not match the key", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-path-mismatch-"));

    try {
      const cacheDir = join(dir, ".bpl-cache");
      mkdirSync(cacheDir, { recursive: true });
      const modulePath = join(dir, "main.bpl");
      const objectPath = join(cacheDir, "cached-object.o");
      writeFileSync(objectPath, "cached object");
      writeFileSync(
        join(cacheDir, "manifest.json"),
        JSON.stringify(
          {
            version: MODULE_CACHE_VERSION,
            modules: {
              [modulePath]: {
                path: join(dir, "other.bpl"),
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

      expect(cache.getStats().totalModules).toBe(0);
      expect(cache.getCachedObjectFile(modulePath)).toBeNull();
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

      let thrown: unknown;
      try {
        cache.compileModule(
          "main.bpl",
          "frame main() ret int { return 0; }",
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain(missingCompiler);
      expect(message).toContain("command not found");
      expect(message).not.toContain("ENOENT");
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

  it("times out hanging module compiler drivers", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-timeout-"));
    const previousBplCc = process.env.BPL_CC;
    const previousTimeout = process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "hanging-cc"), [
        "setInterval(() => {}, 1000);",
      ]);
      process.env.BPL_CC = fakeCompiler;
      process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS = "100";
      const cache = new ModuleCache(dir);

      let thrown: unknown;
      try {
        cache.compileModule(
          "main.bpl",
          "frame main() ret int { return 0; }",
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain(fakeCompiler);
      expect(message).toContain("timed out");
      expect(message).not.toContain("ETIMEDOUT");
      const cacheFiles = readdirSync(join(dir, ".bpl-cache"));
      expect(cacheFiles.some((file) => file.endsWith(".ll"))).toBe(false);
      expect(cacheFiles.some((file) => file.endsWith(".o"))).toBe(false);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      if (previousTimeout === undefined) {
        delete process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;
      } else {
        process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS = previousTimeout;
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

      let thrown: unknown;
      try {
        await cache.compileModules(
          [
            {
              modulePath: "main.bpl",
              content: "frame main() ret int { return 0; }",
              llvmIR: EMPTY_MAIN_IR,
            },
          ],
          { jobs: 1, optimizationLevel: 0 },
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain(missingCompiler);
      expect(message).toContain("command not found");
      expect(message).not.toContain("ENOENT");

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

  it("times out hanging async module compiler drivers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-async-timeout-"));
    const previousBplCc = process.env.BPL_CC;
    const previousTimeout = process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "hanging-cc"), [
        "setInterval(() => {}, 1000);",
      ]);
      process.env.BPL_CC = fakeCompiler;
      process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS = "100";
      const cache = new ModuleCache(dir);

      let thrown: unknown;
      try {
        await cache.compileModules(
          [
            {
              modulePath: "main.bpl",
              content: "frame main() ret int { return 0; }",
              llvmIR: EMPTY_MAIN_IR,
            },
          ],
          { jobs: 1, optimizationLevel: 0 },
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain(fakeCompiler);
      expect(message).toContain("timed out");
      expect(message).not.toContain("ETIMEDOUT");
      const cacheFiles = readdirSync(join(dir, ".bpl-cache"));
      expect(cacheFiles.some((file) => file.endsWith(".ll"))).toBe(false);
      expect(cacheFiles.some((file) => file.endsWith(".o"))).toBe(false);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      if (previousTimeout === undefined) {
        delete process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;
      } else {
        process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS = previousTimeout;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports successful compiler drivers that do not create module objects", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-missing-object-"));
    const previousBplCc = process.env.BPL_CC;

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        "process.exit(0);",
      ]);
      process.env.BPL_CC = fakeCompiler;
      const cache = new ModuleCache(dir);

      let thrown: unknown;
      try {
        cache.compileModule(
          "main.bpl",
          "frame main() ret int { return 0; }",
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain("did not create module object");
      expect(message).toContain("main.bpl");
      expect(message).not.toContain("ENOENT");

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

  it("reports async compiler drivers that do not create module objects", async () => {
    const dir = mkdtempSync(
      join(tmpdir(), "bpl-module-cache-async-missing-object-"),
    );
    const previousBplCc = process.env.BPL_CC;

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        "process.exit(0);",
      ]);
      process.env.BPL_CC = fakeCompiler;
      const cache = new ModuleCache(dir);

      let thrown: unknown;
      try {
        await cache.compileModules(
          [
            {
              modulePath: "main.bpl",
              content: "frame main() ret int { return 0; }",
              llvmIR: EMPTY_MAIN_IR,
            },
          ],
          { jobs: 1, optimizationLevel: 0 },
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain("did not create module object");
      expect(message).toContain("main.bpl");
      expect(message).not.toContain("ENOENT");

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

  it("reuses concurrently created cached module objects during finalize", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-race-object-"));
    const previousBplCc = process.env.BPL_CC;
    const content = "frame main() ret int { return 0; }";

    try {
      const fakeCompilerPath = join(dir, "fake-cc");
      process.env.BPL_CC = fakeCompilerPath;
      const hash = getModuleHashForTest(content, undefined, 0);
      const objectPath = join(dir, ".bpl-cache", `${hash}.o`);
      const fakeCompiler = writeNodeCommandShim(fakeCompilerPath, [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "new object\\n");',
        `fs.writeFileSync(${JSON.stringify(objectPath)}, "existing object\\n");`,
      ]);
      process.env.BPL_CC = fakeCompiler;
      const cache = new ModuleCache(dir);

      const objectFile = cache.compileModule(
        "main.bpl",
        content,
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
      );

      expect(objectFile).toBe(objectPath);
      expect(readFileSync(objectPath, "utf-8")).toBe("existing object\n");
      expect(
        readdirSync(join(dir, ".bpl-cache")).some((file) =>
          file.includes(".tmp-"),
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

  it("does not reuse stale deterministic IR scratch paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-stale-ll-"));
    const previousBplCc = process.env.BPL_CC;

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "object\\n");',
      ]);
      process.env.BPL_CC = fakeCompiler;

      const content = "frame main() ret int { return 0; }";
      const cache = new ModuleCache(dir);
      const hash = getModuleHashForTest(content, undefined, 0);
      const staleIrPath = join(dir, ".bpl-cache", `${hash}.ll`);
      mkdirSync(staleIrPath);

      const objectFile = cache.compileModule(
        "main.bpl",
        content,
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
      );

      expect(existsSync(objectFile)).toBe(true);
      expect(lstatSync(staleIrPath).isDirectory()).toBe(true);
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves existing linked outputs when cached module linking fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-link-partial-"));
    const previousBplCc = process.env.BPL_CC;
    const outputPath = join(dir, "app");
    const objectPath = join(dir, "module.o");

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "partial executable\\n");',
        'process.stderr.write("simulated cached link failure\\n");',
        "process.exit(1);",
      ]);
      process.env.BPL_CC = fakeCompiler;
      writeFileSync(objectPath, "object\n");
      writeFileSync(outputPath, "existing executable\n");

      const cache = new ModuleCache(dir);
      let thrown: unknown;
      try {
        cache.linkModules([objectPath], outputPath);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(
        "simulated cached link failure",
      );
      expect(readFileSync(outputPath, "utf-8")).toBe("existing executable\n");
      expect(
        readdirSync(dir).some(
          (entry) => entry.startsWith(".app.") && entry.endsWith(".tmp"),
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

  it("rejects cached link outputs through symlinked ancestors before invoking the compiler", () => {
    const dir = mkdtempSync(
      join(tmpdir(), "bpl-module-cache-link-ancestor-"),
    );
    const previousBplCc = process.env.BPL_CC;
    const realRoot = join(dir, "real-root");
    const linkedRoot = join(dir, "linked-root");
    const realNested = join(realRoot, "nested");
    const outputPath = join(linkedRoot, "nested", "app");
    const realOutput = join(realNested, "app");
    const objectPath = join(dir, "module.o");
    const compilerMarker = join(dir, "compiler-invoked");

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        `fs.writeFileSync(${JSON.stringify(compilerMarker)}, "yes\\n");`,
        'fs.writeFileSync(args[outputIndex], "linked executable\\n");',
      ]);
      process.env.BPL_CC = fakeCompiler;
      mkdirSync(realNested, { recursive: true });
      symlinkSync(realRoot, linkedRoot, "dir");
      writeFileSync(objectPath, "object\n");

      const cache = new ModuleCache(dir);
      let thrown: unknown;
      try {
        cache.linkModules([objectPath], outputPath);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(
        "Output parent path contains a symbolic link",
      );
      expect(existsSync(compilerMarker)).toBe(false);
      expect(existsSync(realOutput)).toBe(false);
      expect(
        readdirSync(realNested).some((entry) => entry.includes("app")),
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

  it("rejects successful cached link drivers that create output directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-link-dir-"));
    const previousBplCc = process.env.BPL_CC;
    const outputPath = join(dir, "app");
    const objectPath = join(dir, "module.o");

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        "fs.mkdirSync(args[outputIndex]);",
      ]);
      process.env.BPL_CC = fakeCompiler;
      writeFileSync(objectPath, "object\n");

      const cache = new ModuleCache(dir);
      let thrown: unknown;
      try {
        cache.linkModules([objectPath], outputPath);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(
        "Compiler driver did not create linked output",
      );
      expect(existsSync(outputPath)).toBe(false);
      expect(
        readdirSync(dir).some(
          (entry) => entry.startsWith(".app.") && entry.endsWith(".tmp"),
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

  it("rejects broken symlink cache directories before invoking the compiler", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-dir-link-"));

    try {
      const modulePath = join(dir, "main.bpl");
      const content = "frame main() ret int { return 0; }";
      const cache = new ModuleCache(dir);
      const cacheDir = join(dir, ".bpl-cache");
      rmSync(cacheDir, { recursive: true, force: true });
      symlinkSync(join(dir, "missing-cache-target"), cacheDir, "dir");

      expect(() =>
        cache.compileModule(
          modulePath,
          content,
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        ),
      ).toThrow(/Module cache directory is a symbolic link/);
      expect(lstatSync(cacheDir).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects cache directories through symlinked project parents during construction", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-parent-init-"));

    try {
      const realProjectDir = join(dir, "real-project");
      const linkedProjectDir = join(dir, "linked-project");
      mkdirSync(join(realProjectDir, ".bpl-cache"), { recursive: true });
      symlinkSync(realProjectDir, linkedProjectDir, "dir");

      expect(() => new ModuleCache(linkedProjectDir)).toThrow(
        /Module cache parent path is a symbolic link/,
      );
      expect(existsSync(join(realProjectDir, ".bpl-cache"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects cache object writes when the project parent becomes a symlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-parent-write-"));

    try {
      const projectDir = join(dir, "project");
      const realProjectDir = join(dir, "project-real");
      const outsideProjectDir = join(dir, "outside-project");
      const outsideCacheDir = join(outsideProjectDir, ".bpl-cache");
      mkdirSync(projectDir);
      const cache = new ModuleCache(projectDir);
      renameSync(projectDir, realProjectDir);
      mkdirSync(outsideCacheDir, { recursive: true });
      symlinkSync(outsideProjectDir, projectDir, "dir");

      expect(() =>
        cache.compileModule(
          join(projectDir, "main.bpl"),
          "frame main() ret int { return 0; }",
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        ),
      ).toThrow(/Module cache parent path is a symbolic link/);
      expect(readdirSync(outsideCacheDir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not reuse cached objects through symlinked project parents", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-parent-read-"));

    try {
      const projectDir = join(dir, "project");
      const realProjectDir = join(dir, "project-real");
      const outsideProjectDir = join(dir, "outside-project");
      const modulePath = join(projectDir, "main.bpl");
      const objectPath = join(projectDir, ".bpl-cache", "cached-object.o");
      mkdirSync(join(projectDir, ".bpl-cache"), { recursive: true });
      writeFileSync(objectPath, "cached object");
      writeFileSync(
        join(projectDir, ".bpl-cache", "manifest.json"),
        JSON.stringify({
          version: MODULE_CACHE_VERSION,
          modules: {
            [modulePath]: {
              path: modulePath,
              hash: "hash",
              objectFile: objectPath,
              timestamp: Date.now(),
            },
          },
        }),
      );
      const cache = new ModuleCache(projectDir);

      renameSync(projectDir, realProjectDir);
      const outsideCacheDir = join(outsideProjectDir, ".bpl-cache");
      mkdirSync(outsideCacheDir, { recursive: true });
      writeFileSync(join(outsideCacheDir, "cached-object.o"), "outside object");
      symlinkSync(outsideProjectDir, projectDir, "dir");

      expect(cache.getCachedObjectFile(modulePath)).toBeNull();
      expect(cache.getStats().cacheSize).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects cache clean when the project parent becomes a symlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-parent-clean-"));

    try {
      const projectDir = join(dir, "project");
      const realProjectDir = join(dir, "project-real");
      const outsideProjectDir = join(dir, "outside-project");
      const outsideCacheDir = join(outsideProjectDir, ".bpl-cache");
      const outsideObject = join(outsideCacheDir, "keep.o");
      mkdirSync(projectDir);
      const cache = new ModuleCache(projectDir);
      renameSync(projectDir, realProjectDir);
      mkdirSync(outsideCacheDir, { recursive: true });
      writeFileSync(outsideObject, "outside object");
      symlinkSync(outsideProjectDir, projectDir, "dir");

      expect(() => cache.clearCache()).toThrow(
        /Module cache parent path is a symbolic link/,
      );
      expect(readFileSync(outsideObject, "utf8")).toBe("outside object");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked temporary object cache paths before invoking the compiler", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-temp-link-"));
    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    const previousBplCc = process.env.BPL_CC;
    const fixedTimestamp = 1700000000000;
    const fixedRandomSuffix = "8";

    try {
      const modulePath = join(dir, "main.bpl");
      const content = "frame main() ret int { return 0; }";
      const cache = new ModuleCache(dir);
      process.env.BPL_CC = join(dir, "compiler-should-not-run");
      const hash = getModuleHashForTest(content, undefined, 0);
      const targetObject = join(dir, "outside-temp.o");
      const poisonedTempObject = join(
        dir,
        ".bpl-cache",
        `${hash}.${process.pid}-${fixedTimestamp}-${fixedRandomSuffix}.o`,
      );

      Date.now = () => fixedTimestamp;
      Math.random = () => 0.5;
      writeFileSync(targetObject, "outside\n");
      symlinkSync(targetObject, poisonedTempObject, "file");

      expect(() =>
        cache.compileModule(
          modulePath,
          content,
          EMPTY_MAIN_IR,
          false,
          undefined,
          0,
        ),
      ).toThrow(/Module cache temporary object path is a symbolic link/);
      expect(readFileSync(targetObject, "utf8")).toBe("outside\n");
    } finally {
      Date.now = originalDateNow;
      Math.random = originalRandom;
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
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
            version: MODULE_CACHE_VERSION,
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
            version: MODULE_CACHE_VERSION,
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

  it("does not follow symlinked temporary cache manifests while saving", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-manifest-temp-"));
    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    const previousBplCc = process.env.BPL_CC;
    const fixedTimestamp = 1700000000000;
    const poisonedSuffix = `${process.pid}-${fixedTimestamp}-8-0`;

    try {
      const fakeCompiler = writeNodeCommandShim(join(dir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "object\\n");',
      ]);
      process.env.BPL_CC = fakeCompiler;

      const cache = new ModuleCache(dir);
      const cacheDir = join(dir, ".bpl-cache");
      const outsideManifest = join(dir, "outside-manifest.json");
      const poisonedTempManifest = join(
        cacheDir,
        `manifest.${poisonedSuffix}.json.tmp`,
      );
      writeFileSync(outsideManifest, "outside\n");
      symlinkSync(outsideManifest, poisonedTempManifest, "file");
      Date.now = () => fixedTimestamp;
      Math.random = () => 0.5;

      const objectFile = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
      );

      const manifest = JSON.parse(
        readFileSync(join(cacheDir, "manifest.json"), "utf-8"),
      );
      expect(existsSync(objectFile)).toBe(true);
      expect(manifest.modules["main.bpl"].objectFile).toBe(objectFile);
      expect(readFileSync(outsideManifest, "utf-8")).toBe("outside\n");
      expect(lstatSync(poisonedTempManifest).isSymbolicLink()).toBe(true);
    } finally {
      Date.now = originalDateNow;
      Math.random = originalRandom;
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
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
        cacheVersion: MODULE_CACHE_VERSION,
        target: target ?? "",
        optimizationLevel: optimizationLevel ?? 0,
        compilerDriver: getCompilerDriver(target),
        sysroot: options.sysroot ?? "",
        clangFlags: options.clangFlags ?? [],
      }),
    )
    .digest("hex");
}
