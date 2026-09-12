import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
const types = [
  "i8",
  "u8",
  "char",
  "uchar",
  "i16",
  "u16",
  "short",
  "ushort",
  "i32",
  "u32",
  "int",
  "uint",
  "i64",
  "u64",
  "long",
  "ulong",
  "f32",
  "f64",
  "float",
  "double",
  "bool",
];
test("primitive reflection sizes match actual storage including aliases and f32", () => {
  expectCorrectnessSuite([
    {
      name: "primitive-reflection-sizes",
      validateLlvm: true,
      source: `import [TypeInfo] from "std/reflection.bpl"; import printf from "std/c.bpl"; frame main() ret int {
   ${types.map((type, i) => `local info${i}:*TypeInfo=typeof<${type}>(); if(info${i}.size != cast<ulong>(sizeof<${type}>())) {return ${i + 1};}`).join("\n")}
   printf("primitive sizes passed\\n"); return 0;
  }`,
      expectedStdout: "primitive sizes passed\n",
    },
  ]);
}, 60000);
