import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Double toString handles the full finite double range", () => {
  expectCorrectnessSuite([{
    name: "double-formatting-full-range",
    validateLlvm: true,
    source: `
      import [Double] from "std/primitives.bpl";
      import [String] from "std/string.bpl";
      extern atof(s: string) ret double;
      extern snprintf(buffer: string, size: long, format: string, ...) ret int;
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        local inputs: string[7] = ["1e100", "1.7976931348623157e308", "-1.7976931348623157e308", "1.25", "-0.0", "inf", "nan"];
        loop (local i: int = 0; i < 7; i = i + 1) {
          local number: Double = Double { value: atof(inputs[i]) };
          local expected: char[512];
          local length: int = snprintf(cast<string>(&expected[0]), 512, "%f", number.value);
          local actual: String = number.toString();
          if (actual.length != length || strcmp(actual.data, cast<string>(&expected[0])) != 0) { return 1; }
          actual.destroy();
        }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);


test("Primitive wrapper formatting preserves integer boundaries and characters", () => {
  const cases = [
    ["Int", "cast<int>(-2147483648)", "-2147483648"],
    ["Long", "cast<long>(-9223372036854775807) - cast<long>(1)", "-9223372036854775808"],
    ["UInt", "cast<uint>(4294967295)", "4294967295"],
    ["ULong", "cast<ulong>(18446744073709551615)", "18446744073709551615"],
    ["Short", "cast<short>(-32768)", "-32768"],
    ["UShort", "cast<ushort>(65535)", "65535"],
    ["Char", "cast<char>(65)", "A"],
    ["Char", "cast<char>(0)", ""],
    ["UChar", "cast<uchar>(90)", "Z"],
    ["UChar", "cast<uchar>(0)", ""],
  ];
  expectCorrectnessSuite([{
    name: "primitive-wrapper-formatting",
    validateLlvm: true,
    source: `
      import [Int], [Long], [UInt], [ULong], [Short], [UShort], [Char], [UChar] from "std/primitives.bpl";
      import [String] from "std/string.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame main() ret int {
        ${cases.map(([type, value, expected], i) => `
          local value${i}: ${type} = ${type} { value: ${value} };
          local text${i}: String = value${i}.toString();
          if (text${i}.length != ${expected!.length} || strcmp(text${i}.data, "${expected}") != 0) { return ${i + 1}; }
          text${i}.destroy();
        `).join("\n")}
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
