import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_FORMATTER_OPTIONS,
  validateFormatterOptions,
} from "../compiler/formatter/FormatterOptions";

const root = path.resolve(import.meta.dir, "..");
test("formatter schema ships with the compiler and editor and matches API defaults", () => {
  const source = fs.readFileSync(
    path.join(root, "schemas/bpl-format.schema.json"),
    "utf8",
  );
  // The extension copies this file into out/schemas/ when it compiles.
  expect(
    fs.readFileSync(
      path.join(root, "vscode-ext/scripts/copy-assets.js"),
      "utf8",
    ),
  ).toContain('"schemas/bpl-format.schema.json"');
  const schema = JSON.parse(source);
  const defaults = Object.fromEntries(
    Object.entries(schema.properties)
      .filter(([key]) => key !== "$schema")
      .map(([key, value]) => [key, (value as { default: unknown }).default]),
  );
  expect(validateFormatterOptions(defaults)).toEqual(DEFAULT_FORMATTER_OPTIONS);
  expect(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).files,
  ).toContain("schemas");
  const extension = JSON.parse(
    fs.readFileSync(path.join(root, "vscode-ext/package.json"), "utf8"),
  );
  const association = extension.contributes.jsonValidation.find(
    (entry: { fileMatch: string }) => entry.fileMatch === ".bplfmt.json",
  );
  // The registered path is the copy that compiling the extension writes to
  // out/schemas/; it need not exist before the extension is built.
  expect(association.url).toBe("./out/schemas/bpl-format.schema.json");
});
