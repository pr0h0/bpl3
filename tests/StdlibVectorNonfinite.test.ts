import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("vector lengths classify infinities and NaNs before scaling", () => {
  expectCorrectnessSuite([{
    name: "vector-nonfinite-values",
    validateLlvm: true,
    source: `
      import [Vec2] from "std/vec2.bpl";
      import [Vec3] from "std/vec3.bpl";
      import [Math] from "std/math.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local inf: float = atof("inf");
        local nan: float = atof("nan");
        local axis: Vec3 = Vec3.new(inf, 0.0, 0.0);
        if (!Math.isInfinite(axis.length())) { return 1; }
        local both: Vec2 = Vec2.new(inf, -inf);
        if (both.length() != inf) { return 2; }
        local mixed2: Vec2 = Vec2.new(nan, -inf);
        local mixed3: Vec3 = Vec3.new(nan, 0.0, -inf);
        if ((mixed2.length() != inf) || (mixed3.length() != inf)) { return 3; }
        local invalid2: Vec2 = Vec2.new(0.0, nan);
        local invalid3: Vec3 = Vec3.new(0.0, 0.0, nan);
        if (!Math.isNan(invalid2.length()) || !Math.isNan(invalid3.length())) { return 4; }
        local normal2: Vec2 = invalid2.normalize();
        local normal3: Vec3 = invalid3.normalize();
        if (!Math.isNan(normal2.x) || !Math.isNan(normal2.y)) { return 5; }
        if (!Math.isNan(normal3.x) || !Math.isNan(normal3.y) || !Math.isNan(normal3.z)) { return 6; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
