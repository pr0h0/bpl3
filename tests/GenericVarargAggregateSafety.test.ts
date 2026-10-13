import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cases = [
  ["struct", "struct Pair {x:int,y:int,}", "Pair", "Pair {x:1,y:2}"],
  ["tuple", "", "(int,int)", "(1,2)"],
  ["array", "", "int[2]", "[1,2]"],
  ["slice", "", "int[]", "[1,2]"],
  ["callback array", "frame inc(value:int) ret int {return value+1;}", "Func<int>(int)[2]", "[inc,inc]"],
  ["aggregate callback", "struct Pair {x:int,y:int,} frame sum(value:Pair) ret int {return value.x+value.y;}", "Func<int>(Pair)", "sum"],
  ["lambda", "", "Lambda<int>(int)", "|value:int| ret int {return value;}"],
  ["payload enum", "enum Event {Value(int),None}", "Event", "Event.Value(1)"],
  ["generic struct", "struct Box<T> {value:T,}", "Box<int>", "Box<int> {value:1}"],
] as const;
for (const [label, declaration, type, value] of cases) {
  test(`generic extern varargs reject instantiated ${label} values`, () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-vararg-aggregate-"));
    try {
      const source = join(dir, "main.bpl");
      writeFileSync(source, `
        extern printf(format:string,...) ret int;
        ${declaration}
        frame emit<T>(value:T) {printf("ignored\\n",value);}
        frame relay<U>(value:U) {emit<U>(value);}
        frame main() ret int {relay<${type}>(${value}); return 0;}
      `);
      for (const opt of [0, 3]) {
        const output = join(dir, "out");
        const result = spawnSync("bun", [resolve("index.ts"), "build", source, "--json", "-O", String(opt), "-o", output], {encoding:"utf8",timeout:30000});
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("BPL_EXTERN_ABI_UNSUPPORTED");
        expect(result.stderr).toBe("");
        expect(existsSync(output)).toBe(false);
      }
    } finally {
      rmSync(dir, {recursive:true,force:true});
    }
  }, 90000);
}

test("generic extern varargs retain String, enum tags, and scalar pointers", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-vararg-generic-valid-"));
  try {
    const source = join(dir, "main.bpl");
    writeFileSync(source, `
      import [String] from "std/string.bpl";
      extern printf(format:string,...) ret int;
      enum Color {Red,Green}
      frame emit<T>(format:string,value:T) {printf(format,value);}
      frame relay<U>(format:string,value:U) {emit<U>(format,value);}
      frame main() ret int {
        local text:String=String.new("generic text");
        relay<String>("%s\\n",text);
        relay<Color>("%d\\n",Color.Green);
        local value:int=42;
        relay<*int>("%p\\n",&value);
        text.destroy(); return 0;
      }
    `);
    for (const opt of [0, 3]) {
      const output = join(dir, "out");
      const build = spawnSync("bun", [resolve("index.ts"), "build", source, "-O", String(opt), "-o", output], {encoding:"utf8",timeout:30000});
      if(build.status!==0) throw new Error(`${build.stdout}\n${build.stderr}`);
      const ran = spawnSync(output, [], {encoding:"utf8",timeout:30000});
      expect(ran.status).toBe(0);
      expect(ran.stdout).toMatch(/^generic text\n1\n0x[0-9a-f]+\n$/i);
    }
  } finally {
    rmSync(dir, {recursive:true,force:true});
  }
}, 90000);
