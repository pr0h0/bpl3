import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

test("invalid lambda signatures cannot leak parameters into the enclosing scope", () => {
  const source = `frame main(){local callback:Lambda<int>(int)=|secret:int,bad|ret int{return secret;};secret;}`;
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      source,
      "lambda-recovery.bpl",
      lexWithGrammar(source, "lambda-recovery.bpl"),
    ).parse(),
  );
  expect(
    checker
      .getErrors()
      .map((error) => ({ code: error.code, message: error.message })),
  ).toContainEqual(
    expect.objectContaining({
      code: "BPL_SYMBOL_NOT_FOUND",
      message: "Undefined symbol 'secret'",
    }),
  );
});

test("a failed lambda body restores the caller's checking context", () => {
  const source =
    "frame main()ret int{local callback:Lambda<u8>()=||ret u8{return 300;};return 0;}";
  const program = new Parser(
    source,
    "lambda-recovery.bpl",
    lexWithGrammar(source, "lambda-recovery.bpl"),
  ).parse();
  const main = program.statements.find(
    (statement) => statement.kind === "FunctionDecl",
  );
  if (!main || main.kind !== "FunctionDecl")
    throw new Error("Missing main fixture");
  const declaration = main.body.statements[0];
  if (
    !declaration ||
    declaration.kind !== "VariableDecl" ||
    !declaration.initializer
  )
    throw new Error("Missing lambda fixture");
  const checker = new TypeChecker({ collectAllErrors: false });
  checker.loopDepth = 3;
  checker.switchDepth = 2;
  checker.inDefer = true;
  checker.currentFunctionReturnType = main.returnType;
  checker.matchContext.push({ inferredTypes: [] });
  const previousScope = checker.currentScope;
  const previousMatch = checker.matchContext;
  expect(() => checker.checkExpression(declaration.initializer!)).toThrow(
    "Integer overflow",
  );
  expect(checker.currentScope).toBe(previousScope);
  expect(checker.currentFunctionReturnType).toBe(main.returnType);
  expect(checker.loopDepth).toBe(3);
  expect(checker.switchDepth).toBe(2);
  expect(checker.inDefer).toBe(true);
  expect(checker.matchContext).toBe(previousMatch);
});
