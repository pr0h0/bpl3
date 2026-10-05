import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { generateCExportHeader } from "../compiler/common/CExports";

for (const source of [
  "@[c_export] frame main() ret int { return 0; }",
  "@[c_export] frame id<T>(x:T) ret T { return x; }",
  "struct Box { value:int, @[c_export] frame read(this:*Box) ret int { return this.value; } }",
  "struct Pair { x:int,y:int, } @[c_export] frame pair(p:Pair) ret Pair { return p; }",
  "type Callback<T>=Func<T>(T); @[c_export] frame invoke(f:Callback<int>[2]) ret int {return 0;}",
  "@[c_export] frame callbacks(f:Func<int>(int)[2]) ret int {return f[0](1);}",
  "@[c_export] frame callbacks(f:Func<int>(int)[]) ret int {return f[0](1);}",
  "@[c_export] frame invoke(f:Func<int>(Func<int>(int)[2])) ret int {return 0;}",
  "@[c_export] frame pointers(p:*int[2]) ret int {return 0;}",
  "@[c_export] frame closure(f:Lambda<int>(int)) ret int { return f(1); }",
]) {
  test(`rejects unsupported C export: ${source}`, () => {
    const result = new Compiler({ filePath: "exports.bpl" }).compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((error) => error.code === "BPL_C_EXPORT_UNSUPPORTED"),
    ).toBe(true);
  });
}

test("rejects colliding public C names instead of generating invalid LLVM", () => {
  for (const source of [
    "@[c_export] frame value(x:int) ret int { return x; } @[c_export] frame value(x:long) ret long { return x; }",
    "extern value(x:long) ret long; @[c_export] frame value(x:int) ret int { return x; }",
    "struct Box { x:int, frame get(this:*Box) ret int { return this.x; } } @[c_export] frame Box_vtable(p:*Box) ret int { return p.get(); }",
  ]) {
    const result = new Compiler({ filePath: "exports.bpl" }).compile(source);
    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  }
});

test("C exports remain reachable when executable tree shaking is enabled", () => {
  const result = new Compiler({
    filePath: "exports.bpl",
    treeShakeTopLevelFunctions: true,
  }).compile(`
    @[c_export] frame externally_called(x: int) ret int { return x + 1; }
    frame main() ret int { return 0; }
  `);
  expect(result.success).toBe(true);
  expect(result.output).toContain("@externally_called = alias");
  expect(result.output).toContain("define i32 @externally_called_i32");
});

test("optimized C entries initialize stack guards without requiring main", () => {
  const result = new Compiler({ filePath: "exports.bpl", optimizationLevel: 3 })
    .compile(`
    @[c_export] frame recurse(n:int) ret int {
      if (n < 2) { return n; }
      return recurse(n - 1) + recurse(n - 2);
    }
  `);
  expect(result.success).toBe(true);
  expect(result.output).toContain("stack.limit.init");
});

test.skipIf(spawnSync("clang", ["--version"]).status !== 0)(
  "C export symbols compile on native target object formats",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-export-targets-"));
    try {
      for (const target of [
        "x86_64-unknown-linux-gnu",
        "x86_64-apple-darwin",
        "aarch64-unknown-linux-gnu",
        "arm64-apple-darwin",
        "x86_64-pc-windows-msvc",
        "i686-unknown-linux-gnu",
      ]) {
        const result = new Compiler({
          filePath: "exports.bpl",
          target,
          optimizationLevel: 3,
        }).compile(
          `@[c_export] frame add(a:long,b:long) ret long { return a + b; }
           type Row=int[2];
           @[c_export] frame cell(p:*Row) ret int { return p[1]; }`,
        );
        expect(result.success).toBe(true);
        const file = join(dir, "library.ll");
        writeFileSync(file, result.output!);
        const compiled = spawnSync(
          "clang",
          [`--target=${target}`, "-c", file, "-o", join(dir, "library.o")],
          { encoding: "utf8", timeout: 15000 },
        );
        if (compiled.status !== 0)
          throw new Error(`${target}: ${compiled.stderr}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

test("generated C headers reject pointers to BPL slice storage", () => {
  const result = new Compiler({ filePath: "exports.bpl" }).compile(`
    type View = int[];
    @[c_export] frame view(p:*View) ret *View { return p; }
  `);
  expect(result.success).toBe(true);
  expect(() => generateCExportHeader(result.ast!)).toThrow("slice storage");
});
