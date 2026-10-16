import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

test("invalid match guards cannot expose arm bindings outside the match", () => {
  const source =
    "frame main(){local value:int=match(1){secret if 42=>secret,_=>0,};secret;}";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      source,
      "match-recovery.bpl",
      lexWithGrammar(source, "match-recovery.bpl"),
    ).parse(),
  );
  const messages = checker.getErrors().map((error) => error.message);
  expect(
    messages.some((message) =>
      message.includes("Match guard must be a boolean"),
    ),
  ).toBe(true);
  expect(messages).toContain("Undefined symbol 'secret'");
});
