import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string): string[] {
  const parser = new Parser(
    source,
    "recovery.bpl",
    lexWithGrammar(source, "recovery.bpl"),
  );
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(parser.parse());
  return checker.getErrors().map((error) => error.message);
}

test("failed return analysis does not expose parameters to following functions", () => {
  const diagnostics = errors(
    `frame broken(secret:int)ret int {} frame later()ret int{return secret;}`,
  );
  expect(
    diagnostics.some((message) => message.includes("may not return a value")),
  ).toBe(true);
  expect(
    diagnostics.some((message) =>
      message.includes("Undefined symbol 'secret'"),
    ),
  ).toBe(true);
});

test("invalid variadic parameters do not leak their preceding parameters", () => {
  const diagnostics = errors(
    `frame broken(secret:int,...values:int){} frame later()ret int{return secret;}`,
  );
  expect(
    diagnostics.some((message) =>
      message.includes("Variadic parameter must be followed"),
    ),
  ).toBe(true);
  expect(
    diagnostics.some((message) =>
      message.includes("Undefined symbol 'secret'"),
    ),
  ).toBe(true);
});
