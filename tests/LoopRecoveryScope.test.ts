import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parse(source: string) {
  return new Parser(
    source,
    "loop-recovery.bpl",
    lexWithGrammar(source, "loop-recovery.bpl"),
  ).parse();
}

test("an invalid loop condition cannot leak its initializer or loop context", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    parse(
      `frame main(){loop(local secret:int=0;42;secret=secret+1){}secret;break;continue;}`,
    ),
  );
  const messages = checker.getErrors().map((error) => error.message);
  expect(
    messages.some((message) =>
      message.includes("Loop condition must be boolean"),
    ),
  ).toBe(true);
  expect(messages).toContain("Undefined symbol 'secret'");
  expect(
    messages.some((message) => message.includes("'break' statement outside")),
  ).toBe(true);
  expect(
    messages.some((message) =>
      message.includes("'continue' statement outside"),
    ),
  ).toBe(true);
});

for (const source of [
  "loop(local secret:int=missing;true;){}",
  "loop(local secret:int=0;42;secret=secret+1){}",
  "loop(local secret:int=0;true;missing){}",
  "loop(true){missing;}",
  "loop(true){local unused:int=0;}",
]) {
  test(`failed loop analysis restores the enclosing context: ${source}`, () => {
    const program = parse(`frame main(){${source}}`);
    const main = program.statements.find(
      (statement) => statement.kind === "FunctionDecl",
    );
    if (!main || main.kind !== "FunctionDecl")
      throw new Error("Missing main fixture");
    const checker = new TypeChecker({ collectAllErrors: false });
    checker.loopDepth = 3;
    const scope = checker.currentScope;
    expect(() => checker.checkStatement(main.body.statements[0]!)).toThrow();
    expect(checker.currentScope === scope).toBe(true);
    expect(checker.loopDepth).toBe(3);
  });
}

test("failed nested loops preserve the outer loop context and binding", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    parse(`frame main(){
    loop(local outer:int=0;outer<1;outer=outer+1){
      loop(local inner:int=0;42;inner=inner+1){}
      inner;
      outer;
      continue;
    }
    outer;
    break;
  }`),
  );
  const messages = checker.getErrors().map((error) => error.message);
  expect(messages).toContain("Undefined symbol 'inner'");
  expect(
    messages.filter((message) => message === "Undefined symbol 'outer'"),
  ).toHaveLength(1);
  expect(
    messages.filter((message) => message.includes("'break' statement outside")),
  ).toHaveLength(1);
  expect(
    messages.some((message) =>
      message.includes("'continue' statement outside"),
    ),
  ).toBe(false);
});
