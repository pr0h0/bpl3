import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases = [
  ["positive overflow", ["1e308", "1e308"], "1e308", true],
  ["negative overflow", ["-1e308", "-1e308"], "-1e308", true],
  [
    "largest triple",
    [
      "1.7976931348623157e308",
      "1.7976931348623157e308",
      "1.7976931348623157e308",
    ],
    "1.7976931348623157e308",
    true,
  ],
  [
    "positive cancellation",
    ["1e308", "1", "-1e308"],
    "0.3333333333333333",
    false,
  ],
  [
    "negative cancellation",
    ["-1e308", "-1", "1e308"],
    "-0.3333333333333333",
    false,
  ],
  ["smallest subnormal", ["5e-324", "5e-324"], "5e-324", true],
  ["ordinary", ["1", "2", "3"], "2", true],
  ["empty", [], "0", true],
] as const;

for (const [name, values, expected, exact] of cases) {
  test(`Algorithm.average preserves ${name} float inputs`, () => {
    expectCorrectnessSuite([
      {
        name: `algorithm-average-${name.replaceAll(" ", "-")}`,
        source: `
        import [Algorithm] from "std/algorithm.bpl";
        import [Array] from "std/array.bpl";
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          local values: Array<float> = Array<float>.new(${values.length});
          ${values.map((value) => `values.push(atof("${value}"));`).join("\n")}
          local result: float = Algorithm.average(&values);
          local unchanged: bool = values.len() == ${values.length};
          ${values.map((value, index) => `unchanged = unchanged && values.get(${index}) == atof("${value}");`).join("\n")}
          values.destroy();
          if (!unchanged) { return 2; }
          if (!(${exact ? `result == atof("${expected}")` : `Math.abs(result / atof("${expected}") - 1.0) < 0.000000000001`})) { return 1; }
          return 0;
        }`,
      },
    ]);
  }, 60000);
}

test("Algorithm.average retains nonfinite input classifications", () => {
  expectCorrectnessSuite([
    {
      name: "algorithm-average-nonfinite",
      source: `
      import [Algorithm] from "std/algorithm.bpl";
      import [Array] from "std/array.bpl";
      import [Math] from "std/math.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        local values: Array<float> = Array<float>.new(2);
        values.push(atof("inf")); values.push(4.0);
        local okay: bool = Algorithm.average(&values) == atof("inf");
        values.set(0, atof("-inf"));
        okay = okay && Algorithm.average(&values) == atof("-inf");
        values.set(1, atof("inf"));
        okay = okay && Math.isNan(Algorithm.average(&values));
        values.set(0, atof("nan")); values.set(1, 4.0);
        okay = okay && Math.isNan(Algorithm.average(&values));
        values.destroy();
        if (!okay) { return 1; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("Algorithm.average retains widened integer and empty-array behavior", () => {
  expectCorrectnessSuite([
    {
      name: "algorithm-average-integer-controls",
      source: `
      import [Algorithm] from "std/algorithm.bpl";
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local values: Array<int> = Array<int>.new(2);
        local okay: bool = Algorithm.average(&values) == 0.0;
        values.push(2147483647); values.push(2147483647);
        okay = okay && Algorithm.average(&values) == 2147483647.0 && values.len() == 2;
        values.destroy();
        if (!okay) { return 1; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("Algorithm.average honors an inherited logical-array getter", () => {
  expectCorrectnessSuite([
    {
      name: "algorithm-average-inherited-getter",
      source: `
      import [Algorithm] from "std/algorithm.bpl";
      import [Array] from "std/array.bpl";
      struct LogicalArray<T>: Array<T> {
        frame get(this: *LogicalArray<T>, _index: int) ret T { return cast<T>(2.0); }
      }
      frame main() ret int {
        local values: LogicalArray<float>;
        values.data = nullptr; values.capacity = 0; values.length = 0;
        values.push(1.0); values.push(1.0);
        local base: *Array<float> = &values;
        local getter: float = base.get(0);
        local result: float = Algorithm.average(base);
        values.destroy();
        if (getter != 2.0 || result != 2.0) { return 1; }
        return 0;
      }`,
    },
  ]);
}, 60000);
