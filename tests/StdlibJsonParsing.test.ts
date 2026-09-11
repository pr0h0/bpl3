import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

const invalidCases = [
  ...[
    "[1,2,3]",
    "[",
    "[1",
    "[1,",
    "[1,]",
    "[1 2]",
    "[,1]",
    "[true]",
    "[{}]",
  ].map((input) => ({ type: "Pair", input })),
  ...[
    "[",
    "[1",
    "[1,",
    "[1,]",
    "[1 2]",
    "[,1]",
    "[true]",
    "[{}]",
    "[1e]",
    "[01]",
  ].map((input) => ({ type: "Array<int>", input })),
  { type: "FloatPair", input: "[1.25]" },
  { type: "Array<float>", input: "[1.25]" },
  ...[
    '{"id":1,}',
    '{"id":1 "extra":2}',
    '{"extra":}',
    '{"extra":wat}',
    '{"extra":[1,]}',
    '{"extra":{"nested":true,}}',
    '{"extra":[1}',
    '{"extra":[1e]}',
    '{"extra":01}',
    '{"extra":nullx}',
  ].map((input) => ({ type: "Record", input })),
  { type: "PointerRecord", input: '{"value":nope}' },
  { type: "PointerRecord", input: '{"value":nul}' },
];

test("JSON rejects malformed containers, unsupported elements, and invalid skipped values without hanging", () => {
  const source = `
    import [JSON] from "std/json.bpl";
    import [Array] from "std/array.bpl";
    import printf from "std/c.bpl";
    type Pair = int[2];
    type FloatPair = float[2];
    struct Record { id: int }
    struct PointerRecord { value: *int }
    frame main() ret int {
      ${invalidCases
        .map(
          ({ type, input }, index) => `
        local value${index}: *${type} = JSON.parse<${type === "Pair" ? "int[2]" : type === "FloatPair" ? "float[2]" : type}>(${JSON.stringify(input)});
        if (value${index} != nullptr) { JSON.free<${type === "Pair" ? "int[2]" : type === "FloatPair" ? "float[2]" : type}>(value${index}); return ${index + 1}; }
      `,
        )
        .join("\n")}
      printf("rejected malformed values\\n");
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.match(/JSON Parse Error:/g)?.length).toBe(
      invalidCases.length,
    );
    expect(result.stdout.endsWith("rejected malformed values\n")).toBe(true);
  }
}, 90000);

test("JSON preserves valid empty, partial, nested, dynamic, and skipped-field parsing", () => {
  const source = `
    import [JSON] from "std/json.bpl";
    import [Array] from "std/array.bpl";
    import printf from "std/c.bpl";
    type Pair = int[2];
    struct Record { values: Array<string>, pair: int[2], ptr: *int }
    frame main() ret int {
      local empty: *Pair = JSON.parse<int[2]>("[]");
      if (empty == nullptr || empty[0] != 0 || empty[1] != 0) { return 1; }
      JSON.free<int[2]>(empty);
      local partial: *Pair = JSON.parse<int[2]>("[7]");
      if (partial == nullptr || partial[0] != 7 || partial[1] != 0) { return 2; }
      JSON.free<int[2]>(partial);
      local record: *Record = JSON.parse<Record>(${JSON.stringify('{"values":["one","two"],"pair":[5,6],"ptr":null,"extra":{"items":[-1.2e+3,true,false,null,{},[]]}}')});
      if (record == nullptr || record.values.length != 2 || record.pair[1] != 6 || record.ptr != nullptr) { return 3; }
      JSON.free<Record>(record);
      local array: *Array<int> = JSON.parse<Array<int>>("[1,2,3]");
      if (array == nullptr || array.length != 3 || array.data[2] != 3) { return 4; }
      JSON.free<Array<int>>(array);
      local zero: *Array<int> = JSON.parse<Array<int>>("[]");
      if (zero == nullptr || zero.length != 0) { return 5; }
      JSON.free<Array<int>>(zero);
      printf("valid values preserved\\n"); return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    expect(runBplAtOptimization(source, opt)).toMatchObject({
      exitCode: 0,
      stdout: "valid values preserved\n",
      stderr: "",
    });
  }
}, 90000);
