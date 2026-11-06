import { describe, expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import type * as AST from "../compiler/common/AST";

// Runtime behaviour is covered by examples/qualified_enum_variants.
function initializer(source: string): AST.Expression {
  const program = new Parser(source, "qualified.bpl").parse();
  const main = program.statements[0] as AST.FunctionDecl;
  const decl = main.body.statements[0] as AST.VariableDecl;
  return decl.initializer!;
}

describe("module-qualified enum struct variants", () => {
  test("parse with the dotted enum name", () => {
    const expr = initializer(
      "frame main() { local s: a.b.Shape = a.b.Shape.Circle { radius: 1 }; }",
    ) as AST.EnumStructVariantExpr;
    expect(expr.kind).toBe("EnumStructVariant");
    expect(expr.enumName).toBe("a.b.Shape");
    expect(expr.variantName).toBe("Circle");
  });

  test("still require a name before the variant", () => {
    expect(() =>
      new Parser(
        "frame main() { local s: Shape = f().Circle { radius: 1 }; }",
        "qualified.bpl",
      ).parse(),
    ).toThrow("Enum struct variant construction requires a name before '.'");
  });
});
