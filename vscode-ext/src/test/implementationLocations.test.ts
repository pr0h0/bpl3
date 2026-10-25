import { expect, test } from "bun:test";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { implementationLocations } from "../services/ImplementationLocations";

test("implementation navigation handles every parent, comments, generics, specs and enums", () => {
  const resolver = new ASTResolver(new SymbolIndex());
  const lines = [
    "spec Reader {}",
    "spec Other {}",
    "# struct CommentOnly : Reader {}",
    'global text: string = "struct StringOnly : Reader {}";',
    "struct Direct : Reader {}",
    "struct Multiple : Other, /# second parent #/ Reader {}",
    "struct Generic<T> : Reader { value: T, }",
    "spec Extended : Reader {}",
    "enum Choice : Reader { Empty, }",
    "struct Prefix : ReaderExtra {}",
  ];
  const document = TextDocument.create(
    pathToFileURL(resolve("tmp/implementation navigation.bpl")).href,
    "bpl",
    1,
    lines.join("\n"),
  );
  const locations = implementationLocations("Reader", [document], resolver);
  expect(locations.map((item) => item.range.start.line)).toEqual([
    4, 5, 6, 7, 8,
  ]);
  expect(locations.every((item) => item.uri === document.uri)).toBe(true);
  expect(locations.map((item) => document.getText(item.range))).toEqual(
    lines.slice(4, 9),
  );
});

test("implementation navigation follows unsaved changes and skips broken/non-file documents", () => {
  const resolver = new ASTResolver(new SymbolIndex());
  const uri = pathToFileURL(resolve("tmp/updated-implementation.x")).href;
  const source = TextDocument.create(uri, "bpl", 1, "struct Child : Base {}");
  expect(implementationLocations("Base", [source], resolver)).toHaveLength(1);
  const updated = TextDocument.create(
    uri,
    "bpl",
    2,
    "struct Child : Different {}",
  );
  const broken = TextDocument.create(
    pathToFileURL(resolve("tmp/broken-implementation.bpl")).href,
    "bpl",
    1,
    "struct Broken : Base {",
  );
  const untitled = TextDocument.create(
    "untitled:implementation.bpl",
    "bpl",
    1,
    "struct Imaginary : Base {}",
  );
  expect(
    implementationLocations("Base", [updated, broken, untitled], resolver),
  ).toEqual([]);
  const locations = implementationLocations(
    "Different",
    [broken, untitled, updated],
    resolver,
  );
  expect(locations).toHaveLength(1);
  expect(locations[0]!.uri).toBe(uri);
});
