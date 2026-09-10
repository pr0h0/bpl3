import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("uses floating-point instructions for f32 and f64 compound assignments", () => {
  expectCorrectnessSuite([
    {
      name: "floating compound assignments",
      validateLlvm: true,
      expectedStdout: "0.5 0.5 1\n",
      source: `
      extern printf(fmt: string, ...);
      global calls: int = 0;
      frame index() ret int { calls += 1; return 0; }
      frame main() ret int {
        local narrow: f32 = cast<f32>(5.5);
        narrow += cast<f32>(0.5);
        narrow -= cast<f32>(1.5);
        narrow *= cast<f32>(2.0);
        narrow /= cast<f32>(2.0);
        narrow %= cast<f32>(2.0);
        local wide: f64 = 5.5;
        wide += 0.5; wide -= 1.5; wide *= 2.0; wide /= 2.0; wide %= 2.0;
        local values: f32[1] = [cast<f32>(0.0)];
        values[index()] += narrow;
        printf("%.1f %.1f %d\\n", values[0], wide, calls);
        return 0;
      }
    `,
    },
  ]);
}, 60000);
