import { describe, test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Nested patterns in struct variant fields (TODO: nested patterns beyond the
// supported forms). Runtime behaviour is covered by
// examples/match_nested_struct_variant.
const enums = `
enum Shade {
    Light,
    Dark(int),
}

enum Shape {
    Circle { radius: int, shade: Shade },
    Rect { width: int, height: int },
}
`;

describe("nested patterns in struct variant fields", () => {
  test("count toward exhaustiveness and reachability, and are type checked", () => {
    expectCheckDiagnostics([
      {
        name: "missing-nested-case",
        source: `${enums}
frame area(shape: Shape) ret int {
    return match (shape) {
        Shape.Circle { radius: r, shade: Shade.Light } => r,
        Shape.Rect { width: w, height: h } => w * h,
    };
}

frame main() ret int {
    return area(Shape.Rect { width: 1, height: 1 });
}
`,
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message: "Non-exhaustive match: missing variants: Circle",
      },
      {
        name: "unreachable-after-wildcard-field",
        source: `${enums}
frame area(shape: Shape) ret int {
    return match (shape) {
        Shape.Circle { radius: r, shade: _ } => r,
        Shape.Circle { radius: r, shade: Shade.Light } => r + 1,
        Shape.Rect { width: w, height: h } => w * h,
    };
}

frame main() ret int {
    return area(Shape.Rect { width: 1, height: 1 });
}
`,
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message: "Unreachable match arm: variant 'Circle'",
      },
      {
        name: "nested-pattern-of-wrong-enum",
        source: `${enums}
frame area(shape: Shape) ret int {
    return match (shape) {
        Shape.Circle { radius: r, shade: Shape.Rect { width: w, height: h } } => r + w + h,
        _ => 0,
    };
}

frame main() ret int {
    return area(Shape.Rect { width: 1, height: 1 });
}
`,
        message: "Enum 'Shade' has no variant 'Rect'",
      },
    ]);
  }, 60000);
});
