import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("floating exception transport preserves fractions, large values, and IEEE special values", () => {
  expectCorrectnessSuite([
    {
      name: "floating exception payload bits",
      validateLlvm: true,
      expectedStdout: "1.75 -2.25 1 1 1 1 1 1 1\n",
      source: `
      extern printf(fmt: string, ...);
      frame round64(value: f64) ret f64 {
        try { throw value; } catch (e: f64) { return e; }
        return 0.0;
      }
      frame round32(value: f32) ret f32 {
        try { throw value; } catch (e: f32) { return e; }
        return cast<f32>(0.0);
      }
      frame main() ret int {
        local zero: f64 = 0.0;
        local narrowZero: f32 = cast<f32>(0.0);
        local nan64: f64 = round64(zero / zero);
        local nan32: f32 = round32(narrowZero / narrowZero);
        local inf64: f64 = 1.0 / zero;
        local inf32: f32 = cast<f32>(1.0) / narrowZero;
        local large: f64 = 100000000000000000000.0;
        printf("%.2f %.2f %d %d %d %d %d %d %d\\n",
          round64(1.75), round32(cast<f32>(-2.25)), round64(large) == large,
          nan64 != nan64, nan32 != nan32,
          round64(inf64) == inf64, round32(inf32) == inf32,
          1.0 / round64(-zero) < 0.0,
          cast<f32>(1.0) / round32(-narrowZero) < narrowZero);
        return 0;
      }
    `,
    },
  ]);
}, 60000);
