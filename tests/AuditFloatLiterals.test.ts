import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("rounds f32 literal patterns consistently across scalar and aggregate matches", () => {
  expectCorrectnessSuite([
    {
      name: "fractional f32 match patterns",
      validateLlvm: true,
      expectedStdout: "1 2 3 4\n",
      source: `
      extern printf(fmt: string, ...);
      enum Payload { Value(f32), Pair((f32, int)) }
      frame main() ret int {
        local x: f32 = cast<f32>(0.1);
        local scalar: int = match (x) { 0.1 => 1, _ => 0, };
        local tuple: int = match ((x, 5)) { (0.1, 5) => 2, _ => 0, };
        local e: Payload = Payload.Value(x);
        local variant: int = match (e) { Payload.Value(0.1) => 3, _ => 0, };
        local nested: Payload = Payload.Pair((x, 5));
        local pair: int = match (nested) { Payload.Pair((0.1, 5)) => 4, _ => 0, };
        printf("%d %d %d %d\\n", scalar, tuple, variant, pair);
        return 0;
      }
    `,
    },
  ]);
}, 60000);

it("emits valid scientific and small floating-point literals", () => {
  expectCorrectnessSuite([
    {
      name: "scientific floating-point literals",
      validateLlvm: true,
      expectedStdout: "0.00000010 0.00000010 1 1\n",
      source: `
      extern printf(fmt: string, ...);
      frame main() ret int {
        local small: float = 0.0000001;
        local narrow: f32 = cast<f32>(0.0000001);
        local huge: float = 1000000000000000000000.0;
        local pattern: int = match (small) { 0.0000001 => 1, _ => 0, };
        printf("%.8f %.8f %d %d\\n", small, narrow, huge > 100000000000000000000.0, pattern);
        return 0;
      }
    `,
    },
  ]);
}, 60000);
