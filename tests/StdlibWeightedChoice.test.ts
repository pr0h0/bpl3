import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("weighted choice rejects invalid totals without consuming randomness", () => {
  expectCorrectnessSuite([{
    name: "weighted-choice-contract",
    validateLlvm: true,
    source: `
      import [Rand] from "std/rand.bpl";
      import [Array] from "std/array.bpl";
      extern strcmp(a: string, b: string) ret int;
      frame rejected(a: int, b: int, message: string) ret bool {
        local weights: Array<int> = Array<int>.new(2);
        weights.push(a); weights.push(b);
        local rng: Rand = Rand.seed(123);
        local caught: bool = false;
        try { rng.weightedChoice(&weights); }
        catch (error: string) { caught = strcmp(error, message) == 0; }
        weights.destroy();
        return caught && (rng.state == cast<ulong>(123));
      }
      frame main() ret int {
        if (!rejected(2147483647, 1, "Rand.weightedChoice total exceeds int")) { return 1; }
        if (!rejected(-1, 2, "Rand.weightedChoice requires nonnegative weights")) { return 2; }
        if (!rejected(0, 0, "Rand.weightedChoice requires a positive total")) { return 3; }
        local weights: Array<int> = Array<int>.new(4);
        local rng: Rand = Rand.seed(123);
        local caught: bool = false;
        try { rng.weightedChoice(&weights); }
        catch (error: string) { caught = strcmp(error, "Rand.weightedChoice requires a positive total") == 0; }
        if (!caught) { return 4; }
        weights.push(0); weights.push(5); weights.push(0); weights.push(7);
        local control: Rand = Rand.seed(123);
        loop (local i: int = 0; i < 100; i = i + 1) {
          local expected: int = 3;
          if (control.range(0, 12) < 5) { expected = 1; }
          if (rng.weightedChoice(&weights) != expected) { return 5; }
        }
        weights.set(1, 2147483647); weights.set(3, 0);
        if (rng.weightedChoice(&weights) != 1) { return 6; }
        weights.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
