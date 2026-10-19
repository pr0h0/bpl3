import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatDocumentText } from "../vscode-ext/src/services/DocumentFormatter";
import { formatSource } from "../cli/commands/formatEngine";

const source = "frame main(){local n:int=1; # value\n}";
const preferences = { tabSize: 2, insertSpaces: true };
for (const uri of [
  "untitled:Untitled-1",
  "vscode-remote://host/work/main.bpl",
  "inmemory:buffer",
]) {
  test(`formats virtual buffer ${uri}`, () => {
    expect(formatDocumentText(source, uri, preferences)).toBe(
      formatSource(source, uri, { indentWidth: 2 }),
    );
  });
}
test("editor formats current buffer with nearest project config and reloads changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-editor-format-"));
  try {
    const file = path.join(dir, "main.bpl");
    const uri = pathToFileURL(file).href;
    fs.writeFileSync(file, "frame old(){}");
    const config = path.join(dir, ".bplfmt.json");
    fs.writeFileSync(config, '{"indentWidth":3,"lineEnding":"crlf"}');
    expect(formatDocumentText(source, uri, preferences)).toBe(
      formatSource(source, file, { indentWidth: 3, lineEnding: "crlf" }),
    );
    fs.writeFileSync(config, '{"useTabs":true}');
    expect(formatDocumentText(source, uri, preferences)).toBe(
      formatSource(source, file, { useTabs: true }),
    );
    fs.writeFileSync(config, "{}");
    expect(formatDocumentText(source, uri, preferences)).toBe(
      formatSource(source, file),
    );
    fs.unlinkSync(config);
    expect(
      formatDocumentText(source, uri, { tabSize: 4, insertSpaces: false }),
    ).toBe(formatSource(source, file, { useTabs: true }));
    expect(fs.readFileSync(file, "utf8")).toBe("frame old(){}");
    fs.writeFileSync(config, '{"indentWidth":0}');
    expect(() => formatDocumentText(source, uri, preferences)).toThrow(
      "indentWidth",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("editor syntax failures produce no replacement text", () => {
  expect(() =>
    formatDocumentText("frame main({", "untitled:Untitled-1", preferences),
  ).toThrow();
});
