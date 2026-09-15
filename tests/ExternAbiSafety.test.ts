import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

const invalid = [
  "extern bad(p: Pair) ret int;",
  "extern bad() ret Pair;",
  "type Alias=Pair; extern bad(p:Alias);",
  "extern bad(p:(int,int));",
  "extern bad(p:int[]);",
  "extern bad(p:int[2]);",
  "enum E { A, B } extern bad(p:E);",
  "extern bad(p:Lambda<int>(int));",
  "extern bad(p:Func<Pair>(int));",
  "extern bad(p:Func<int>(Pair));",
  "extern bad(count:int,...); frame main() {bad(1,Pair {x:7,y:11});}",
  "enum T { I(int), N } extern bad(count:int,...); frame main() {local t:T=T.N; bad(1,t);}",
];
for (const declaration of invalid) {
  test(`rejects unsupported C value ABI: ${declaration}`, () => {
    const source = `struct Pair {x:int,y:int,} ${declaration}`;
    const program = new Parser(
      source,
      "abi.bpl",
      lexWithGrammar(source, "abi.bpl"),
    ).parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_EXTERN_ABI_UNSUPPORTED"),
    ).toBe(true);
  });
}

test("C ABI diagnostics are parseable and pointer wrappers and scalar callbacks execute", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-extern-abi-"));
  try {
    const source = join(dir, "main.bpl");
    writeFileSync(
      source,
      "struct Pair {x:int,y:int,} extern bad(p:Pair) ret int;",
    );
    const checked = spawnSync(
      "bun",
      [resolve("index.ts"), "check", source, "--json"],
      { encoding: "utf8", timeout: 30000 },
    );
    expect(checked.status).toBe(1);
    expect(checked.stderr).toBe("");
    const report = JSON.parse(checked.stdout);
    expect(report.files[0].diagnostics[0].code).toBe(
      "BPL_EXTERN_ABI_UNSUPPORTED",
    );
    const native = join(dir, "native.c");
    const object = join(dir, "native.o");
    writeFileSync(
      native,
      `struct Pair {int x,y;};
int sum_pair(const struct Pair *p) {return p->x+p->y;}
int invoke(int (*fn)(int,int)) {return fn(6,7);}`,
    );
    const compiled = spawnSync(
      process.env.CC || "clang",
      ["-c", native, "-o", object],
      { encoding: "utf8" },
    );
    expect(compiled.status).toBe(0);
    expect(compiled.stderr).toBe("");
    writeFileSync(
      source,
      `struct Pair {x:int,y:int,}
extern sum_pair(p:*Pair) ret int;
extern invoke(fn:Func<int>(int,int)) ret int;
extern printf(fmt:string,...);
frame add(a:int,b:int) ret int {return a+b;}
frame echo(p:Pair) ret Pair {return p;}
frame main() ret int {
 local p:Pair=echo(Pair {x:7,y:11});
 printf("%d %d\\n",sum_pair(&p),invoke(add));return 0;
}`,
    );
    for (const opt of [0, 3]) {
      const binary = join(dir, `native-${opt}`);
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          source,
          "-O",
          String(opt),
          "--object",
          object,
          "-o",
          binary,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(build.status).toBe(0);
      expect(build.stderr).toBe("");
      const run = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 });
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      expect(run.stdout).toBe("18 13\n");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("lowered variadic extern arguments are accepted and execute", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-extern-varargs-"));
  try {
    const source = join(dir, "main.bpl");
    writeFileSync(
      source,
      `import [String] from "std/string.bpl";
extern printf(fmt:string,...) ret int;
enum Kind { A, B, C }
frame show<T: int>(value:T) { printf("%d ", value); }
frame main() ret int {
 local k:Kind=Kind.C;
 local s:String=String.new("text");
 show<int>(4);
 printf("%d %s\\n",k,s);
 s.destroy();
 return 0;
}`,
    );
    for (const opt of [0, 3]) {
      const binary = join(dir, `varargs-${opt}`);
      const build = spawnSync(
        "bun",
        [resolve("index.ts"), "build", source, "-O", String(opt), "-o", binary],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(build.stderr).toBe("");
      expect(build.status).toBe(0);
      const run = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe("4 2 text\n");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
