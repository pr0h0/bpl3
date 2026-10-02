import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [type, method, value] of [
  ["int", "siftDown", "7"],
  ["float", "siftDownFloat", "7.0"],
] as const) {
  test(`statistics ${type} heap leaves stop before overflowing child indices`, () => {
    expectCorrectnessSuite([{
      name: `stats-${type}-large-leaf`,
      validateLlvm: true,
      source: `
        import [Stats] from "std/stats.bpl";
        frame main() ret int {
          local sentinel: ${type}[1] = [${value}];
          # These indices are leaves of a conceptual large heap. Sifting a
          # leaf must not access storage, so no large allocation is needed.
          Stats.${method}(&sentinel[0], 1073741823, 2147483647);
          Stats.${method}(&sentinel[0], 1073741824, 2147483647);
          Stats.${method}(&sentinel[0], 2147483646, 2147483647);
          if (sentinel[0] != ${value}) { return 1; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  }, 60000);
}

const values = Array.from({ length: 257 }, (_, i) => ((i * 73) % 67) - 33);
const sorted = [...values].sort((a, b) => a - b);
test("statistics heapsort preserves integer and float ordering across uneven heap sizes", () => {
  expectCorrectnessSuite([{
    name: "stats-sort-order-model",
    validateLlvm: true,
    source: `
      import [Stats] from "std/stats.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local ints: int[257] = [${values.join(", ")}];
        local floats: float[257];
        loop (local i: int = 0; i < 257; i = i + 1) { floats[i] = cast<float>(ints[i]) / 4.0; }
        Stats.sortInPlace(&ints[0], 257);
        Stats.sortInPlace(&floats[0], 257);
        loop (local i: int = 0; i < 257; i = i + 1) { printf("%d %.2f\\n", ints[i], floats[i]); }
        Stats.sortInPlace(&ints[0], 1);
        Stats.sortInPlace(&floats[0], 0);
        return 0;
      }`,
    expectedStdout: sorted.map(x => `${x} ${(x / 4).toFixed(2)}\n`).join(""),
  }]);
}, 60000);
