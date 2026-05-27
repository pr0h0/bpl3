import { describe, expect, it } from "bun:test";

import * as AST from "../compiler/common/AST";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Formatter } from "../compiler/formatter/Formatter";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { compileAndRun } from "./helpers";

function parse(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

function check(source: string) {
  const program = parse(source);
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const errors = typeChecker.getErrors();
  if (errors.length > 0) {
    throw errors[0];
  }
  return program;
}

function compile(source: string) {
  const program = check(source);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

function format(source: string) {
  const program = parse(source);
  const formatter = new Formatter();
  return formatter.format(program);
}

describe("Direct type narrowing", () => {
  it("uses ordinary bool returns for helper checks", () => {
    const program = parse(`
      struct Animal { name: string }
      struct Dog : Animal { breed: string }
      frame isDog(value: *Animal) ret bool {
        return value is Dog;
      }
    `);

    const guard = program.statements[2] as AST.FunctionDecl;
    const returnType = guard.returnType as AST.BasicTypeNode;

    expect(returnType.name).toBe("bool");
    expect((guard as unknown as Record<string, unknown>).typeGuard).toBeUndefined();
  });

  it("formats helper checks as normal bool-returning functions", () => {
    const formatted = format(`
      struct Animal { name: string }
      struct Dog : Animal { breed: string }
      frame isDog(value: *Animal) ret bool { return match<Dog>(value); }
    `);

    expect(formatted).toContain("frame isDog(value: *Animal) ret bool");
    expect(formatted).toContain("return match<Dog>(value);");
  });

  it("rejects the removed guard return syntax", () => {
    expect(() =>
      parse(`
        struct Animal { name: string }
        struct Dog : Animal { breed: string }
        frame isDog(value: *Animal) ret value is *Dog {
          return value is Dog;
        }
      `),
    ).toThrow();
  });

  it("narrows an identifier inside a direct is branch", () => {
    expect(() =>
      check(`
        struct Animal { name: string }
        struct Dog : Animal { breed: string }

        frame describe(animal: *Animal) ret string {
          if (animal is Dog) {
            return animal.breed;
          }
          return animal.name;
        }
      `),
    ).not.toThrow();
  });

  it("narrows an identifier inside a direct match type branch", () => {
    expect(() =>
      check(`
        struct Animal { name: string }
        struct Dog : Animal { breed: string }

        frame describe(animal: *Animal) ret string {
          if (match<Dog>(animal)) {
            return animal.breed;
          }
          return animal.name;
        }
      `),
    ).not.toThrow();
  });

  it("keeps direct narrowing scoped to the true branch", () => {
    expect(() =>
      check(`
        struct Animal { name: string }
        struct Dog : Animal { breed: string }

        frame describe(animal: *Animal) ret string {
          if (animal is Dog) {
            return animal.breed;
          }
          return animal.breed;
        }
      `),
    ).toThrow("Cannot access member 'breed' on type '*Animal'");
  });

  it("does not infer narrowing through ordinary bool helper calls", () => {
    expect(() =>
      check(`
        struct Animal { name: string }
        struct Dog : Animal { breed: string }

        frame isDog(value: *Animal) ret bool {
          return value is Dog;
        }

        frame describe(animal: *Animal) ret string {
          if (isDog(animal)) {
            return animal.breed;
          }
          return animal.name;
        }
      `),
    ).toThrow("Cannot access member 'breed' on type '*Animal'");
  });

  it("does not narrow Any containers when checking their contained runtime type", () => {
    expect(() =>
      check(`
        import [Any] from "std/type.bpl";

        frame extract(val: *Any) ret int {
          if (match<int>(val)) {
            return cast<int>(val.data);
          }
          return 0;
        }
      `),
    ).not.toThrow();
  });

  it("generates a cast when loading an is-narrowed pointer identifier", () => {
    const ir = compile(`
      struct Animal { name: string }
      struct Dog : Animal { breed: string }

      frame describe(animal: *Animal) ret string {
        if (animal is Dog) {
          return animal.breed;
        }
        return animal.name;
      }
    `);

    expect(ir).toContain("bitcast %struct.Animal*");
    expect(ir).toContain("to %struct.Dog*");
  });

  it("uses narrowed fields at runtime after a direct is check", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Animal {
        name: string,
      }

      struct Dog : Animal {
        breed: string,
      }

      frame describe(animal: *Animal) ret string {
        if (animal is Dog) {
          return animal.breed;
        }
        return animal.name;
      }

      frame main() ret int {
        local dog: Dog;
        dog.name = "Rex";
        dog.breed = "Collie";

        local animal: *Animal = &dog;
        printf("%s\\n", describe(animal));
        return 0;
      }
    `);

    expect(output).toBe("Collie\n");
  });

  it("uses narrowed fields at runtime after a direct match type check", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Animal {
        name: string,
      }

      struct Dog : Animal {
        breed: string,
      }

      frame describe(animal: *Animal) ret string {
        if (match<Dog>(animal)) {
          return animal.breed;
        }
        return animal.name;
      }

      frame main() ret int {
        local dog: Dog;
        dog.name = "Rex";
        dog.breed = "Collie";

        local animal: *Animal = &dog;
        printf("%s\\n", describe(animal));
        return 0;
      }
    `);

    expect(output).toBe("Collie\n");
  });
});
