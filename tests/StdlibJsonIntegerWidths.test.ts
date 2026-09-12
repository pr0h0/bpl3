import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
const types = [
  { names: ["i8", "char"], min: -128n, max: 127n },
  { names: ["i16", "short"], min: -32768n, max: 32767n },
  { names: ["u8", "uchar"], min: 0n, max: 255n },
  { names: ["u16", "ushort"], min: 0n, max: 65535n },
  { names: ["u32", "uint"], min: 0n, max: 4294967295n },
  { names: ["u64", "ulong"], min: 0n, max: 18446744073709551615n },
];
const valid = types.flatMap(({ names, min, max }) =>
  names.flatMap((type) =>
    [min, min + 1n, 0n, max - 1n, max].map((value) => ({ type, value })),
  ),
);
test("JSON round-trips every added signed/unsigned width and alias without precision loss", () => {
  const source = `import [JSON] from "std/json.bpl"; import [String] from "std/string.bpl"; import printf from "std/c.bpl"; frame main() ret int {
 ${valid
   .map(
     ({ type, value }, i) => `
   local value${i}:*${type}=JSON.parse<${type}>("${value}"); if(value${i}==nullptr) {return ${i + 1};}
   local text${i}:String=JSON.stringify<${type}>(value${i}); printf("%s\\n",text${i}.toString());text${i}.destroy();JSON.free<${type}>(value${i});
 `,
   )
   .join("\n")} return 0;}`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.trim().split("\n")).toEqual(
      valid.map(({ value }) => String(value)),
    );
  }
}, 90000);
const invalid = types.flatMap(({ names, min, max }) =>
  names.flatMap((type) =>
    [
      String(min - 1n),
      String(max + 1n),
      "1.0",
      "1e0",
      "01",
      ...(min === 0n ? ["-0", "-1"] : []),
    ].map((input) => ({ type, input })),
  ),
);
test("JSON rejects added integer widths outside their ranges and rejects unsigned signs", () => {
  const source = `import [JSON] from "std/json.bpl"; frame main() ret int {
 ${invalid.map(({ type, input }, i) => `local value${i}:*${type}=JSON.parse<${type}>(${JSON.stringify(input)}); if(value${i}!=nullptr){JSON.free<${type}>(value${i});return ${i + 1};}`).join("\n")}
 return 0;}`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.match(/JSON Parse Error:/g)).toHaveLength(
      invalid.length,
    );
  }
}, 90000);
test("JSON uses the correct element spacing in small-integer arrays and fields", () => {
  const source = `
 import [JSON] from "std/json.bpl"; import [Array] from "std/array.bpl"; import [String] from "std/string.bpl"; import printf from "std/c.bpl";
 struct Record { first:uchar, signed:short, fixed:ushort[2], dynamic:Array<uchar>, wide:ulong }
 frame main() ret int {
  local value:*Record=JSON.parse<Record>("{\\"first\\":255,\\"signed\\":-32768,\\"fixed\\":[1,65535],\\"dynamic\\":[0,127,255],\\"wide\\":18446744073709551615}");
  if(value==nullptr || value.first!=cast<uchar>(255) || value.signed!=cast<short>(-32768) || value.fixed[1]!=cast<ushort>(65535) || value.dynamic.length!=3 || value.dynamic.data[2]!=cast<uchar>(255) || value.wide!=cast<ulong>(0xffffffffffffffff)) {return 1;}
  local text:String=JSON.stringify<Record>(value); printf("%s\\n",text.toString());text.destroy();JSON.free<Record>(value);return 0;
 }`;
  for (const opt of [0, 3] as const)
    expect(runBplAtOptimization(source, opt)).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout:
        '{"first": 255, "signed": -32768, "fixed": [1, 65535], "dynamic": [0, 127, 255], "wide": 18446744073709551615}\n',
    });
}, 90000);
