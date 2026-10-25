import { expect, test } from "bun:test";
import type * as AST from "../compiler/common/AST";
import { Parser } from "../compiler/frontend/Parser";
import { uniqueModuleSymbols } from "../compiler/middleend/ModuleSymbolUniquer";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function types(node: unknown, seen = new Set<object>()): AST.BasicTypeNode[] {
  if (!node || typeof node !== "object" || seen.has(node)) return [];
  seen.add(node);
  const result: AST.BasicTypeNode[] = [];
  if ((node as AST.ASTNode).kind === "BasicType")
    result.push(node as AST.BasicTypeNode);
  for (const child of Object.values(node)) result.push(...types(child, seen));
  return result;
}

for (const [name, declaration] of [
  ["function", "frame identity<T>(value:T)ret T{return value;}"],
  ["struct", "struct Holder<T>{value:T,}"],
  ["enum", "enum Holder<T>{Value(T),}"],
  ["spec", "spec Holder<T>{frame read(this:*Holder<T>)ret T;}"],
  ["alias", "type Holder<T>=T[2];"],
  ["method", "spec Holder{frame read<T>(this:*Holder,value:T)ret T;}"],
] as const) {
  test(`module symbol uniquing preserves ${name} generic names`, () => {
    const first = new Parser("type T=long;", "first.bpl").parse();
    const second = new Parser(
      `type T=string;${declaration}type Outside=T;`,
      "second.bpl",
    ).parse();
    const references = types(second.statements[1]).filter(
      (type) => type.name === "T",
    );
    expect(references.length).toBeGreaterThan(0);
    uniqueModuleSymbols([
      {
        path: "first.bpl",
        ast: first,
        isEntry: true,
        isStandardLibrary: false,
      },
      {
        path: "second.bpl",
        ast: second,
        isEntry: false,
        isStandardLibrary: false,
      },
    ]);
    expect(references.map((type) => type.name)).toEqual(
      references.map(() => "T"),
    );
    const moduleAlias = second.statements[0] as AST.TypeAliasDecl;
    const outside = second.statements[2] as AST.TypeAliasDecl;
    expect(moduleAlias.name).not.toBe("T");
    expect((outside.type as AST.BasicTypeNode).name).toBe(moduleAlias.name);
  });
}

for (const [name, declaration, body] of [
  [
    "tuple enum",
    "enum Choice<T>{Value(T),}export Choice;",
    "local value:Choice<float>=Choice<float>.Value(7.25);local result:float=match(value){Choice.Value(data)=>data,};if(result!=7.25)return 1;return 0;",
  ],
  [
    "struct enum",
    "enum Choice<T>{Value{data:T},}export Choice;",
    "local value:Choice<float>=Choice.Value{data:7.25};value;return 0;",
  ],
  [
    "generic fields and forward aliases",
    "struct Choice<T>{data:Key,value:T,}type Key=T;export Choice;",
    "local value:Choice<float>=Choice<float>{data:\"ok\",value:7.25};if(value.value!=7.25 || value.data[0]!='o')return 1;return 0;",
  ],
] as const) {
  test(`colliding module aliases retain ${name} payloads`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-module-generic-uniquing-"));
    try {
      const first = join(root, "first.bpl"),
        second = join(root, "second.bpl");
      writeFileSync(
        first,
        "type T=long;frame marker()ret int{return 0;}export marker;",
      );
      writeFileSync(second, `type T=string;${declaration}`);
      expectCorrectnessSuite([
        {
          name: name.replaceAll(" ", "-"),
          validateLlvm: true,
          source: `import [marker] from ${JSON.stringify(first)};import [Choice] from ${JSON.stringify(second)};
     frame main()ret int{if(marker()!=0)return 9;${body}}`,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
}
