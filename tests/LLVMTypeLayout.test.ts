import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { LLVMTypeLayout } from "../compiler/backend/codegen/LLVMTypeLayout";
import { getDataLayoutForTarget } from "../compiler/backend/codegen/BaseCodeGenerator";
import { compileToLLVM } from "./helpers";

const targets = [
  "x86_64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "arm64-apple-darwin",
  "i686-unknown-linux-gnu",
  "x86_64-pc-windows-msvc",
  "wasm32-unknown-unknown",
  "wasm64-unknown-unknown",
];
const bodies: Record<string, string> = {
  "%Small": "{ i8, i8, i8 }",
  "%Data": "{ [9 x i32], [3 x double], i8 }",
  "%Mixed": "{ i8, %Small, i64, %Data, i8* }",
  "%Slice": "{ i32*, i64 }",
  "%Closure": "{ i8*, i8* }",
  "%Methods": "{ i8*, i8, double }",
};
const declarations = `struct Small {char a,b,c;};
struct Data {int a[9];double b[3];char c;};
struct Mixed {char a;struct Small b;long long c;struct Data d;void *e;};
struct Slice {int *data;long long length;};
struct Closure {void *function,*context;};
struct Methods {void *vtable;char a;double b;};`;
const fields: Record<string, string[]> = {
  Small: ["a", "b", "c"],
  Data: ["a", "b", "c"],
  Mixed: ["a", "b", "c", "d", "e"],
  Slice: ["data", "length"],
  Closure: ["function", "context"],
  Methods: ["vtable", "a", "b"],
};
test("layout calculator agrees with Clang C ABI sizes, alignments, and offsets on all supported targets", () => {
  let source = declarations;
  for (const [name, members] of Object.entries(fields)) {
    source += `long long size_${name}(){return sizeof(struct ${name});} long long align_${name}(){return __alignof__(struct ${name});}`;
    for (const field of members)
      source += `long long offset_${name}_${field}(){return __builtin_offsetof(struct ${name},${field});}`;
  }
  for (const target of targets) {
    const result = spawnSync(
      process.env.CC || "clang",
      ["-target", target, "-O2", "-S", "-emit-llvm", "-x", "c", "-", "-o", "-"],
      { input: source, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    const oracle = (name: string) =>
      Number(
        new RegExp(`@${name}\\([^]*?ret i64 (\\d+)`).exec(result.stdout)?.[1],
      );
    const calculator = new LLVMTypeLayout(
      getDataLayoutForTarget(target),
      (name) => bodies[name]!,
    );
    for (const [name, members] of Object.entries(fields)) {
      expect(calculator.get(`%${name}`)).toEqual({
        size: oracle(`size_${name}`),
        alignment: oracle(`align_${name}`),
        offsets: members.map((field) => oracle(`offset_${name}_${field}`)),
      });
    }
  }
}, 30000);

test("DWARF includes natural padding, vtables, array extents, and target pointer width", () => {
  const source = `type Items=int[9];struct Data {a:char,b:long,c:Items,}
 struct Methods {a:char,frame get(this:*Methods) ret char {return this.a;}}
 enum Payload {Some(Data),None,}
 frame main() ret int {local data:Data;local methods:Methods;local pair:(char,long)=('a',2);local value:Payload=Payload.Some(data);local ptr:*Data=&data;return cast<int>(sizeof(value)+sizeof(methods)+sizeof(pair)+sizeof(ptr));}`;
  for (const target of ["x86_64-unknown-linux-gnu", "wasm32-unknown-unknown"]) {
    const ir = compileToLLVM(source, "layout.bpl", { target, dwarf: true });
    expect(ir).toMatch(/name: "Data"[^\n]*size: 448/);
    expect(ir).toMatch(/name: "b"[^\n]*size: 64, offset: 64/);
    expect(ir).toMatch(/name: "c"[^\n]*size: 288, offset: 128/);
    expect(ir).toMatch(
      new RegExp(
        `DW_TAG_pointer_type[^\\n]*size: ${target.startsWith("wasm32") ? 32 : 64}`,
      ),
    );
    expect(ir).toContain("%enum.Payload = type { i32, [7 x i64] }");
  }
});
