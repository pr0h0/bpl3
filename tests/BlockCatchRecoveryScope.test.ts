import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function firstStatement(source: string) {
  const program = new Parser(
    source,
    "block-recovery.bpl",
    lexWithGrammar(source, "block-recovery.bpl"),
  ).parse();
  const main = program.statements.find((stmt) => stmt.kind === "FunctionDecl");
  if (!main || main.kind !== "FunctionDecl") throw new Error("Missing main");
  return main.body.statements[0]!;
}

for (const source of [
  "{missing;}",
  "if(true){missing;}else{}",
  "if(true) missing;",
  "if(true) {} else missing;",
  "if(false) {} else if(true){missing;}",
  "{local unused:int=0;}",
  "{return;missing;}",
  "try {} catch(secret:int){missing;}",
  "try {} catch(secret:int){local unused:int=0;}",
  "try {} catch {missing;}",
]) {
  test(`failed block checking restores the enclosing scope: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: false });
    const scope = checker.currentScope;
    expect(() =>
      checker.checkStatement(firstStatement(`frame main(){${source}}`)),
    ).toThrow();
    expect(checker.currentScope === scope).toBe(true);
  });
}

test("checking a block without a new scope preserves caller-owned bindings", () => {
  const checker = new TypeChecker({ collectAllErrors: false });
  const scope = checker.currentScope;
  const block = firstStatement("frame main(){{local value:int=1;missing;}}");
  if (block.kind !== "Block") throw new Error("Missing block");
  expect(() => checker.checkBlock(block, false)).toThrow();
  expect(checker.currentScope === scope).toBe(true);
  expect(() =>
    checker.checkExpression({
      kind: "Identifier",
      name: "value",
      location: block.location,
    }),
  ).not.toThrow();
});

test("catch bindings stay inside their clause during diagnostic collection", () => {
  const source = `frame main(){
    try {} catch(secret:int){secret;missing;}
    secret;
    try {} catch(secret:int){secret;missingToo;}
    secret;
  }`;
  const program = new Parser(
    source,
    "catch-recovery.bpl",
    lexWithGrammar(source, "catch-recovery.bpl"),
  ).parse();
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(program);
  expect(checker.getErrors().map((error) => error.message)).toEqual([
    "Undefined symbol 'missing'",
    "Undefined symbol 'secret'",
    "Undefined symbol 'missingToo'",
    "Undefined symbol 'secret'",
  ]);
});

test("successful catch checking restores the enclosing scope", () => {
  const checker = new TypeChecker({ collectAllErrors: false });
  const scope = checker.currentScope;
  expect(() =>
    checker.checkStatement(
      firstStatement("frame main(){try {} catch(secret:int){secret;}}"),
    ),
  ).not.toThrow();
  expect(checker.currentScope === scope).toBe(true);
});
