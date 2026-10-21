import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "path";
import { Parser } from "../../../compiler/frontend/Parser";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

function rename(source: string, offset: number) {
  expect(() => new Parser(source, "patterns.bpl").parse()).not.toThrow();
  const document = TextDocument.create(
    "file:///tmp/bpl-pattern-rename.bpl",
    "bpl",
    1,
    source,
  );
  const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
  const handler = new ASTRenameHandler(new ASTResolver(index), index);
  const position = document.positionAt(offset);
  expect(
    handler.prepareRename(
      { textDocument: { uri: document.uri }, position },
      document,
    ),
  ).not.toBeNull();
  const result = handler.rename(
    { textDocument: { uri: document.uri }, position, newName: "updated" },
    document,
  );
  const edits = result?.changes?.[document.uri];
  expect(edits).toBeDefined();
  const references = handler.findAllReferences(position, document);
  expect(references?.map((ref) => ref.range)).toEqual(
    edits?.map((edit) => edit.range),
  );
  return TextDocument.applyEdits(document, edits!);
}

for (const newline of ["", "\n", "\r\n", "\r"]) {
  for (const outer of ["global", "parameter", "local"]) {
    for (const [value, pattern] of [
      ["1", "target"],
      ["(1, 2)", "(target, _)"],
      ["Choice.Some(1)", "Choice.Some(target)"],
    ]) {
      let header = "frame run()ret int{local target:int=10;";
      if (outer === "global")
        header = "global target:int=10;frame run()ret int{";
      if (outer === "parameter") header = "frame run(target:int)ret int{";
      const arm = `${pattern} if target>0=>target,`;
      const lines = [
        "enum Choice{Some(int),None,}",
        header,
        `local result:int=match(${value}){`,
        arm,
        "_=>0,};",
        "return target+result;}",
      ];
      const source = lines.join(newline);
      const armStart = source.indexOf(arm);
      for (const cursor of [
        arm.indexOf("target"),
        arm.indexOf("target", pattern!.length),
        arm.lastIndexOf("target"),
      ]) {
        test(`pattern rename preserves ${outer} ${pattern} ${JSON.stringify(newline)} at ${cursor}`, () => {
          expect(rename(source, armStart + cursor + 1)).toBe(
            source.replace(arm, arm.replaceAll("target", "updated")),
          );
        });
      }
      test(`outer ${outer} rename preserves ${pattern} ${JSON.stringify(newline)}`, () => {
        const expected = lines
          .map((line, i) =>
            i === 1 || i === 5 ? line.replaceAll("target", "updated") : line,
          )
          .join(newline);
        expect(rename(source, source.lastIndexOf("target") + 1)).toBe(expected);
      });
    }
  }
  test(`pattern references respect nested scopes ${JSON.stringify(newline)}`, () => {
    const lines = [
      "frame run()ret int{",
      "return match(1){target if target>0=>{",
      "match(target){target=>target,};",
      "{local target:int=target+1;target;}",
      "loop(local target:int=target;target<2;target=target+1){target;}",
      "local f:Lambda<int>(int)=|target:int|ret int{return target;};",
      "try{target;}catch(target:int){target;}",
      "return target;},_=>0,};}",
    ];
    const expected = [...lines];
    expected[1] = "return match(1){updated if updated>0=>{";
    expected[2] = "match(updated){target=>target,};";
    expected[3] = "{local target:int=updated+1;target;}";
    expected[4] =
      "loop(local target:int=updated;target<2;target=target+1){target;}";
    expected[6] = "try{updated;}catch(target:int){target;}";
    expected[7] = "return updated;},_=>0,};}";
    const source = lines.join(newline);
    expect(rename(source, source.indexOf("target") + 1)).toBe(
      expected.join(newline),
    );
  });
}

for (const pattern of ["(target,target)", "Choice.Some{field:target}"]) {
  test(`unsupported pattern declines use rename: ${pattern}`, () => {
    const source = `global target:int=1;frame run(){match(1){${pattern}=>target,_=>0,};target;}`;
    expect(() => new Parser(source, "patterns.bpl").parse()).not.toThrow();
    const document = TextDocument.create(
      "file:///tmp/bpl-pattern-unsupported.bpl",
      "bpl",
      1,
      source,
    );
    const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
    const handler = new ASTRenameHandler(new ASTResolver(index), index);
    const position = document.positionAt(source.indexOf("=>target") + 3);
    expect(
      handler.prepareRename(
        { textDocument: { uri: document.uri }, position },
        document,
      ),
    ).toBeNull();
    expect(
      handler.rename(
        { textDocument: { uri: document.uri }, position, newName: "updated" },
        document,
      ),
    ).toBeNull();
  });
}

for (const newline of ["", "\n", "\r\n", "\r"]) {
  for (const selected of [0, 1]) {
    test(`rename selects only sibling arm ${selected} ${JSON.stringify(newline)}`, () => {
      const arms = ["target if target>0=>target,", "target=>target,"];
      const lines = ["frame run()ret int{return match(1){", ...arms, "};}"];
      const source = lines.join(newline);
      const arm = arms[selected]!;
      expect(rename(source, source.indexOf(arm) + 1)).toBe(
        source.replace(arm, arm.replaceAll("target", "updated")),
      );
    });
  }
  test(`catch rename preserves inner match bindings ${JSON.stringify(newline)}`, () => {
    const lines = [
      "frame run(){try{throw 1;}catch(target:int){",
      "match(1){target=>target,};",
      "target;}}",
    ];
    const source = lines.join(newline);
    expect(rename(source, source.lastIndexOf("target") + 1)).toBe(
      [lines[0]!.replace("target", "updated"), lines[1]!, "updated;}}"].join(
        newline,
      ),
    );
  });
}

test("duplicate pattern declarations decline rename preparation", () => {
  const source = "frame run(){match((1,2)){(target,target)=>target,};}";
  const document = TextDocument.create(
    "file:///tmp/bpl-pattern-duplicate-declaration.bpl",
    "bpl",
    1,
    source,
  );
  const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
  const handler = new ASTRenameHandler(new ASTResolver(index), index);
  for (const offset of [
    source.indexOf("target"),
    source.indexOf("target", source.indexOf("target") + 1),
  ]) {
    const position = document.positionAt(offset + 1);
    expect(
      handler.prepareRename(
        { textDocument: { uri: document.uri }, position },
        document,
      ),
    ).toBeNull();
    expect(
      handler.rename(
        { textDocument: { uri: document.uri }, position, newName: "updated" },
        document,
      ),
    ).toBeNull();
  }
});
