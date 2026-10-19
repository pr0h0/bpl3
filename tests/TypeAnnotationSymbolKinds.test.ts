import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { Compiler } from "../compiler";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function errors(source: string) {
  const filename = "annotation-symbols.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, filename, lexWithGrammar(source, filename)).parse(),
  );
  return checker.getErrors();
}

for (const source of [
  "frame main(){local value:int=1;local _bad:value;value;}",
  "frame routine(){} frame main(){local _bad:routine;}",
  "frame main(value:int){local _bad:Func<value>();value;}",
  "global value:int=1; struct Holder{field:value,} frame main(){value;}",
  "frame main(){local value:int=1;try {} catch(error:value){error;}value;}",
  "frame main(){local A:int=1;local _bad:A;A;}",
]) {
  test(`rejects value symbols used as type annotations: ${source}`, () => {
    expect(
      errors(source).some((error) => error.code === "BPL_TYPE_NOT_FOUND"),
    ).toBe(true);
  });
}

test("preserves declarations that actually denote types", () => {
  expect(
    errors(`
    struct Record{value:int,}
    enum Choice{First,Second,}
    type Number=int;
    frame generic<Element>() {
      local _callback:Func<Element>(Element);
    }
    frame main(){
      local _record:Record;
      local _choice:Choice;
      local _number:Number;
      local _callback:Func<Number>(Record);
    }
  `),
  ).toEqual([]);
});

function moduleResult(body: string) {
  const directory = mkdtempSync(join(tmpdir(), "bpl-type-symbols-"));
  try {
    writeFileSync(
      join(directory, "symbols.bpl"),
      `
      export value; global value:int=42;
      export routine; frame routine() ret int {return 42;}
      export [Record]; export [Number]; struct Record{value:int,} type Number=int;
    `,
    );
    const filePath = join(directory, "main.bpl");
    const source = `import * as symbols from "./symbols.bpl"; frame main(){${body}}`;
    writeFileSync(filePath, source);
    return new Compiler({
      filePath,
      emitType: "llvm",
      collectAllErrors: true,
    }).compile(source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const name of ["symbols", "symbols.value", "symbols.routine"]) {
  test(`rejects module and qualified value symbols as types: ${name}`, () => {
    const result = moduleResult(`local _bad:${name};`);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some(
        (error) =>
          error.code === "BPL_TYPE_NOT_FOUND" &&
          error.message.includes("not a type"),
      ),
    ).toBe(true);
  });
}

test("preserves qualified aliases, structs and function signatures", () => {
  const result = moduleResult(`
    local _record:symbols.Record;
    local _number:symbols.Number;
    local _callback:Func<symbols.Number>()=symbols.routine;
  `);
  expect(result.errors ?? []).toEqual([]);
  expect(result.success).toBe(true);
});
