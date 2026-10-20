import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadFormatterConfig } from "../compiler/formatter/FormatterConfig";

function fixture(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-formatter-config-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("finds project configuration from source location, independently of cwd", () =>
  fixture((root) => {
    const nested = path.join(root, "src", "nested");
    fs.mkdirSync(nested, { recursive: true });
    const config = path.join(root, ".bplfmt.json");
    fs.writeFileSync(config, JSON.stringify({ indentWidth: 2 }));
    expect(loadFormatterConfig(path.join(nested, "main.bpl"))).toEqual({
      configPath: config,
      options: { indentWidth: 2 },
    });
  }));

test("uses the nearest config without merging unrelated ancestor preferences", () =>
  fixture((root) => {
    const nested = path.join(root, "src");
    fs.mkdirSync(nested);
    fs.writeFileSync(
      path.join(root, ".bplfmt.json"),
      JSON.stringify({ indentWidth: 2 }),
    );
    const config = path.join(nested, ".bplfmt.json");
    fs.writeFileSync(config, JSON.stringify({ useTabs: true }));
    expect(loadFormatterConfig(path.join(nested, "main.bpl"))).toEqual({
      configPath: config,
      options: { useTabs: true },
    });
  }));

test("an explicit config overrides discovery and false selects defaults", () =>
  fixture((root) => {
    const config = path.join(root, "style.json");
    fs.writeFileSync(config, JSON.stringify({ lineEnding: "crlf" }));
    fs.writeFileSync(path.join(root, ".bplfmt.json"), "invalid JSON");
    const source = path.join(root, "main.bpl");
    expect(loadFormatterConfig(source, config)).toEqual({
      configPath: config,
      options: { lineEnding: "crlf" },
    });
    expect(loadFormatterConfig(source, false)).toEqual({ options: {} });
  }));

for (const content of [
  "bad JSON",
  "null",
  "[]",
  '{"indentWidth":0}',
  '{"useTabs":"yes"}',
  '{"unknown":true}',
]) {
  test(`reports malformed/invalid project configuration: ${content}`, () =>
    fixture((root) => {
      const config = path.join(root, ".bplfmt.json");
      fs.writeFileSync(config, content);
      expect(() => loadFormatterConfig(path.join(root, "main.bpl"))).toThrow(
        `Invalid formatter configuration '${config}'`,
      );
    }));
}

test("rejects missing explicit configs and config directories", () =>
  fixture((root) => {
    const source = path.join(root, "main.bpl");
    expect(() =>
      loadFormatterConfig(source, path.join(root, "missing.json")),
    ).toThrow("configuration not found");
    fs.mkdirSync(path.join(root, ".bplfmt.json"));
    expect(() => loadFormatterConfig(source)).toThrow(
      "configuration is not a file",
    );
  }));

test("accepts a UTF-8 BOM and schema metadata", () =>
  fixture((root) => {
    const config = path.join(root, ".bplfmt.json");
    fs.writeFileSync(config, '\uFEFF{"$schema":"schema.json","indentWidth":2}');
    expect(loadFormatterConfig(path.join(root, "main.bpl"))).toEqual({
      configPath: config,
      options: { indentWidth: 2 },
    });
  }));
