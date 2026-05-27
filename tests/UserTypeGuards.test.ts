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

describe("User-defined type guards", () => {
  it("parses guard return metadata as a boolean-returning function", () => {
    const program = parse(`
      struct Animal { name: string }
      struct Dog : Animal { breed: string }
      frame isDog(value: *Animal) ret value is *Dog {
        return value is *Dog;
      }
    `);

    const guard = program.statements[2] as AST.FunctionDecl;
    const returnType = guard.returnType as AST.BasicTypeNode;
    const targetType = guard.typeGuard?.targetType as AST.BasicTypeNode;

    expect(guard.typeGuard?.parameterName).toBe("value");
    expect(returnType.name).toBe("bool");
    expect(targetType.name).toBe("Dog");
    expect(targetType.pointerDepth).toBe(1);
  });

  it("formats guard return syntax without erasing metadata", () => {
    const formatted = format(`
      struct Animal { name: string }
      struct Dog : Animal { breed: string }
      frame isDog(value: *Animal) ret value is *Dog { return value is *Dog; }
    `);

    expect(formatted).toContain("frame isDog(value: *Animal) ret value is *Dog");
  });

  it("narrows a guarded identifier inside the true branch", () => {
    expect(() =>
      check(`
        struct Animal { name: string }
        struct Dog : Animal { breed: string }

        frame isDog(value: *Animal) ret value is *Dog {
          return value is *Dog;
        }

        frame describe(animal: *Animal) ret string {
          if (isDog(animal)) {
            return animal.breed;
          }
          return animal.name;
        }
      `),
    ).not.toThrow();
  });

  it("generates a cast when loading a narrowed pointer identifier", () => {
    const ir = compile(`
      struct Animal { name: string }
      struct Dog : Animal { breed: string }

      frame isDog(value: *Animal) ret value is *Dog {
        return value is *Dog;
      }

      frame describe(animal: *Animal) ret string {
        if (isDog(animal)) {
          return animal.breed;
        }
        return animal.name;
      }
    `);

    expect(ir).toContain("bitcast %struct.Animal*");
    expect(ir).toContain("to %struct.Dog*");
  });

  it("uses narrowed fields at runtime after a guard call", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Animal {
        name: string,
      }

      struct Dog : Animal {
        breed: string,
      }

      frame isDog(value: *Animal) ret value is *Dog {
        return value is *Dog;
      }

      frame describe(animal: *Animal) ret string {
        if (isDog(animal)) {
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
