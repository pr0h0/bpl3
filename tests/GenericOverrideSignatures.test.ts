import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

/** Collect ordinary source diagnostics for an inherited-method declaration. */
function diagnostics(source: string): string[] {
  const file = "generic-override-signature.bpl";
  const program = new Parser(
    source,
    file,
    lexWithGrammar(source, file),
  ).parse();
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(program, file);
  return checker.getErrors().map((error) => error.message);
}

const parent = `
struct Parent<T> {
  frame value(this: *Parent<T>) ret T { return cast<T>(1); }
}
`;

for (const type of ["int", "float"]) {
  test(`concrete ${type} override uses its parent argument`, () => {
    expect(
      diagnostics(
        parent +
          `
      struct Child: Parent<${type}> {
        frame value(this: *Child) ret ${type} { return cast<${type}>(2); }
      }`,
      ),
    ).toEqual([]);
  });
}

test("transitive generic parent arguments reach override signatures", () => {
  expect(
    diagnostics(
      parent +
        `
    struct Middle<U>: Parent<U> {}
    struct Child: Middle<int> {
      frame value(this: *Child) ret int { return 2; }
    }`,
    ),
  ).toEqual([]);
});

test("parent templates remain independent across concrete children", () => {
  expect(
    diagnostics(
      parent +
        `
    struct IntegerChild: Parent<int> {
      frame value(this: *IntegerChild) ret int { return 2; }
    }
    struct FloatChild: Parent<float> {
      frame value(this: *FloatChild) ret float { return 2.0; }
    }`,
    ),
  ).toEqual([]);
});

test("nested generic return components are substituted for overrides", () => {
  expect(
    diagnostics(`
    struct PairParent<T> {
      frame value(this: *PairParent<T>) ret (T, T) { return (cast<T>(1), cast<T>(2)); }
    }
    struct Child: PairParent<int> {
      frame value(this: *Child) ret (int, int) { return (3, 4); }
    }`),
  ).toEqual([]);
});

test("matching instantiated parameters still reject an incompatible return", () => {
  expect(
    diagnostics(`
    struct Parent<T> {
      frame value(this: *Parent<T>, input: T) ret T { return input; }
    }
    struct Child: Parent<int> {
      frame value(this: *Child, _input: int) ret float { return 2.0; }
    }`).join("\n"),
  ).toContain("Invalid override");
});

test("non-generic incompatible return overrides remain rejected", () => {
  expect(
    diagnostics(`
    struct Parent {
      frame value(this: *Parent) ret int { return 1; }
    }
    struct Child: Parent {
      frame value(this: *Child) ret float { return 2.0; }
    }`).join("\n"),
  ).toContain("Invalid override");
});

test("accepted concrete generic overrides execute through a parent reference", () => {
  expectCorrectnessSuite([
    {
      name: "concrete-generic-override-runtime",
      source:
        parent +
        `
      struct Child: Parent<int> {
        frame value(this: *Child) ret int { return 2; }
      }
      frame main() ret int {
        local value: Child;
        local base: *Parent<int> = &value;
        if (value.value() != 2 || base.value() != 2) { return 1; }
        return 0;
      }`,
    },
  ]);
}, 60000);

test("value and pointer receiver overloads remain distinct", () => {
  expect(
    diagnostics(`
    struct Parent<T> {
      frame value(this: Parent<T>, _input: T) ret float { return 1.0; }
    }
    struct Child: Parent<int> {
      frame value(this: *Child, _input: int) ret int { return 2; }
    }`),
  ).toEqual([]);
});
