import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Compiler } from "../compiler";
import { ModuleCache } from "../compiler/middleend/ModuleCache";
import { withCompilerCacheKey } from "../compiler/middleend/ModuleCacheKey";

test("changed compiler identity cannot reuse an object for unchanged BPL source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-ir-cache-"));
  try {
    const cache = new ModuleCache(dir);
    const compile = async (code: number, jobs: number) => {
      const llvmIR = `define i32 @main(){ret i32 ${code}}`;
      const content = withCompilerCacheKey("unchanged BPL source", {
        compilerFingerprint: `compiler-${code}`,
        dwarf: false,
        treeShakeTopLevelFunctions: false,
      });
      return jobs === 1
        ? cache.compileModule("main.bpl", content, llvmIR)
        : (
            await cache.compileModules(
              [{ modulePath: "main.bpl", content, llvmIR }],
              { jobs },
            )
          )[0]!;
    };
    for (const jobs of [1, 2]) {
      const first = await compile(0, jobs),
        changed = await compile(7, jobs),
        again = await compile(7, jobs);
      expect(changed).not.toBe(first);
      expect(again).toBe(changed);
      for (const [index, object] of [first, changed].entries()) {
        const binary = join(dir, `result-${jobs}-${index}`);
        cache.linkModules([object], binary);
        const result = spawnSync(binary, [], { encoding: "utf8" });
        expect(result.status, result.stderr).toBe(index === 0 ? 0 : 7);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("cached Compiler builds invalidate when tree shaking changes and reuse identical codegen", async () => {
  for (const jobs of [1, 2]) {
    const dir = mkdtempSync(join(tmpdir(), "bpl-compiler-codegen-cache-"));
    try {
      const filePath = join(dir, "main.bpl"),
        outputPath = join(dir, "main");
      const source =
        "frame unused()ret int{return 99;}frame main()ret int{return 0;}";
      writeFileSync(filePath, source);
      const compile = async (treeShakeTopLevelFunctions: boolean) => {
        const result = await new Compiler({
          filePath,
          outputPath,
          useCache: true,
          resolveImports: true,
          jobs,
          treeShakeTopLevelFunctions,
        }).compileAsync(source);
        expect(
          result.success,
          result.errors?.map((error) => error.message).join("\n"),
        ).toBe(true);
        return result.stats!.cache!;
      };
      expect((await compile(false)).misses).toBeGreaterThan(0);
      expect((await compile(true)).misses).toBeGreaterThan(0);
      expect((await compile(true)).misses).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}, 60000);
