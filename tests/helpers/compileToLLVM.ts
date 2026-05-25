import { CodeGenerator } from "../../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";

export function compileToLLVM(
  source: string,
  fileName = "golden_shape_test.bpl",
): string {
  const tokens = lexWithGrammar(source, fileName);
  const parser = new Parser(source, fileName, tokens);
  const program = parser.parse();

  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);

  const errors = typeChecker.getErrors();
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("\n"));
  }

  const generator = new CodeGenerator();
  return generator.generate(program, fileName);
}

export function countMatches(input: string, pattern: RegExp): number {
  return [...input.matchAll(pattern)].length;
}
