import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

test("JSON escapes every representable control byte and preserves UTF-8", () => {
  const value =
    Array.from({ length: 31 }, (_, index) =>
      String.fromCharCode(index + 1),
    ).join("") + '"\\ café 😀';
  const bytes = [...Buffer.from(value), 0];
  const source = `
    import [JSON] from "std/json.bpl";
    import [String] from "std/string.bpl";
    import printf, strcmp from "std/c.bpl";
    frame main() ret int {
      local bytes: char[${bytes.length}] = [${bytes.map((byte) => `cast<char>(${byte})`).join(",")}];
      local text: string = cast<string>(&bytes[0]);
      local encoded: String = JSON.stringify<string>(&text);
      printf("%s\\n", encoded.toString());
      local decoded: *string = JSON.parse<string>(encoded.toString());
      if (decoded == nullptr || strcmp(*decoded, text) != 0) { return 1; }
      JSON.free<string>(decoded);
      encoded.destroy();
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify(value) + "\n",
    });
    expect(JSON.parse(result.stdout)).toBe(value);
  }
}, 60000);

const finiteNumbers = [
  "0",
  "-0",
  "0.1",
  "-0.1",
  "1.0000000000000002",
  "1e100",
  "-1e100",
  "1.7976931348623157e308",
  "-1.7976931348623157e308",
  "2.2250738585072014e-308",
  "4.9406564584124654e-324",
];

const jsonFloatSerializationSource = `
  import [JSON] from "std/json.bpl";
  import [String] from "std/string.bpl";
  import printf from "std/c.bpl";
  extern strtod(text: string, end: *void) ret float;
  frame main() ret int {
    ${[...finiteNumbers, "inf", "-inf", "nan"]
      .map(
        (text, index) => `
      local value${index}: float = strtod(${JSON.stringify(text)}, nullptr);
      local encoded${index}: String = JSON.stringify<float>(&value${index});
      printf("%s\\n", encoded${index}.toString());
      encoded${index}.destroy();
    `,
      )
      .join("\n")}
    local alias: f64 = 1.5;
    local encodedAlias: String = JSON.stringify<f64>(&alias);
    printf("%s\\n", encodedAlias.toString());
    encodedAlias.destroy();
    return 0;
  }
`;

test("JSON formats extreme binary64 values without overflow or precision loss and maps non-finite values to null", () => {
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(jsonFloatSerializationSource, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(finiteNumbers.length + 4);
    for (let index = 0; index < finiteNumbers.length; index++) {
      expect(lines[index]!.length).toBeLessThan(64);
      expect(
        Object.is(JSON.parse(lines[index]!), Number(finiteNumbers[index])),
      ).toBe(true);
    }
    expect(lines.slice(finiteNumbers.length)).toEqual([
      "null",
      "null",
      "null",
      "1.5",
    ]);
  }
}, 60000);
