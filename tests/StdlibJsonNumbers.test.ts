import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

const integers = ["0", "-0", "2147483647", "-2147483648"];
const longs = [
  ...integers,
  "2147483648",
  "-2147483649",
  "9223372036854775807",
  "-9223372036854775808",
];
const floats = [
  "0",
  "-0",
  "0.1",
  "-0.1",
  "1.0000000000000002",
  "1E+100",
  "-1e100",
  "1.7976931348623157e308",
  "-1.7976931348623157e308",
  "2.2250738585072014e-308",
  "4.9406564584124654e-324",
  "1e-999",
];
const valid = [
  ...["int", "i32"].flatMap((type) =>
    integers.map((input) => ({ type, input })),
  ),
  ...["long", "i64"].flatMap((type) => longs.map((input) => ({ type, input }))),
  ...["float", "double", "f64"].flatMap((type) =>
    floats.map((input) => ({ type, input })),
  ),
];

test("JSON parses exact signed integer boundaries and binary64 fractions and exponents", () => {
  const source = `
    import [JSON] from "std/json.bpl";
    import [String] from "std/string.bpl";
    import printf from "std/c.bpl";
    frame main() ret int {
      ${valid
        .map(
          ({ type, input }, i) => `
        local value${i}: *${type} = JSON.parse<${type}>(${JSON.stringify(" \t" + input + "\n")});
        if (value${i} == nullptr) { return ${i + 1}; }
        local text${i}: String = JSON.stringify<${type}>(value${i});
        printf("%s\\n", text${i}.toString());
        text${i}.destroy(); JSON.free<${type}>(value${i});
      `,
        )
        .join("\n")}
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(valid.length);
    valid.forEach(({ type, input }, i) => {
      if (["float", "double", "f64"].includes(type)) {
        expect(Object.is(JSON.parse(lines[i]!), Number(input))).toBe(true);
      } else {
        expect(BigInt(lines[i]!)).toBe(BigInt(input));
      }
    });
  }
}, 90000);

const malformed = [
  "",
  "-",
  "+1",
  "01",
  "-01",
  ".1",
  "1.",
  "1e",
  "1e+",
  "1e-",
  "--1",
  "NaN",
  "Infinity",
  "0x10",
  "1 2",
];
const invalid = [
  ...["int", "long", "float"].flatMap((type) =>
    malformed.map((input) => ({ type, input })),
  ),
  ...["int", "long"].flatMap((type) =>
    [
      "1.0",
      "1e0",
      "999999999999999999999999999999999999",
      "-999999999999999999999999999999999999",
    ].map((input) => ({ type, input })),
  ),
  ...["2147483648", "-2147483649"].map((input) => ({ type: "int", input })),
  ...["9223372036854775808", "-9223372036854775809"].map((input) => ({
    type: "long",
    input,
  })),
  ...["1e309", "-1e309"].map((input) => ({ type: "float", input })),
];

test("JSON rejects malformed numbers and signed integer or binary64 overflow", () => {
  const source = `
    import [JSON] from "std/json.bpl";
    frame main() ret int {
      ${invalid
        .map(
          ({ type, input }, i) => `
        local value${i}: *${type} = JSON.parse<${type}>(${JSON.stringify(input)});
        if (value${i} != nullptr) { JSON.free<${type}>(value${i}); return ${i + 1}; }
      `,
        )
        .join("\n")}
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.match(/JSON Parse Error:/g)).toHaveLength(
      invalid.length,
    );
  }
}, 90000);

test("JSON parses numeric struct fields and fixed and dynamic arrays", () => {
  const source = `
    import [JSON] from "std/json.bpl";
    import [Array] from "std/array.bpl";
    struct Numbers { total: long, samples: float[2], dynamic: Array<float> }
    frame main() ret int {
      local value: *Numbers = JSON.parse<Numbers>("{\\"total\\":9223372036854775807,\\"samples\\":[1.25,-2e1],\\"dynamic\\":[0.5,1e2]}");
      if (value == nullptr) { return 1; }
      if (value.total != cast<long>(0x7fffffffffffffff) || value.samples[0] != 1.25 || value.samples[1] != -20.0 || value.dynamic.length != 2 || value.dynamic.data[1] != 100.0) { return 2; }
      JSON.free<Numbers>(value);
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    expect(runBplAtOptimization(source, opt)).toMatchObject({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  }
}, 90000);
