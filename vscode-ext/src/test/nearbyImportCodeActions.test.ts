import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver/node";
import {
  nearbyImportCodeActions,
  importableTypeName,
  type NearbyImportCache,
} from "../services/NearbyImportCodeActions";
import { DiagnosticsProvider } from "../services/DiagnosticsProvider";
import { SymbolIndex } from "../services/SymbolIndex";

const testPosix = process.platform === "win32" ? test.skip : test;

test("a request reuses successful and failed sibling parses; the next request observes edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-import-cache-"));
  try {
    const module = join(directory, "module.x");
    const broken = join(directory, "broken.bpl");
    writeFileSync(module, "struct Widget {} export [Widget];");
    writeFileSync(broken, "struct Broken {");
    const document = TextDocument.create(
      pathToFileURL(join(directory, "main.bpl")).href,
      "bpl",
      1,
      "",
    );
    const diagnostic = {
      range: Range.create(0, 0, 0, 0),
      message: "Undefined type 'Widget'",
    };
    const cache: NearbyImportCache = new Map();
    expect(
      nearbyImportCodeActions(document, diagnostic, "Widget", true, cache),
    ).toHaveLength(1);
    writeFileSync(module, "struct Replacement {} export [Replacement];");
    writeFileSync(broken, "struct Repaired {} export [Repaired];");
    // One request keeps a consistent snapshot, including negative parse results.
    expect(
      nearbyImportCodeActions(document, diagnostic, "Widget", true, cache),
    ).toHaveLength(1);
    expect(
      nearbyImportCodeActions(document, diagnostic, "Replacement", true, cache),
    ).toEqual([]);
    expect(
      nearbyImportCodeActions(document, diagnostic, "Repaired", true, cache),
    ).toEqual([]);
    const nextRequest: NearbyImportCache = new Map();
    expect(
      nearbyImportCodeActions(
        document,
        diagnostic,
        "Widget",
        true,
        nextRequest,
      ),
    ).toEqual([]);
    expect(
      nearbyImportCodeActions(
        document,
        diagnostic,
        "Replacement",
        true,
        nextRequest,
      ),
    ).toHaveLength(1);
    expect(
      nearbyImportCodeActions(
        document,
        diagnostic,
        "Repaired",
        true,
        nextRequest,
      ),
    ).toHaveLength(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

testPosix(
  "nearby imports escape quoted and control-character filenames",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-import-escapes-"));
    try {
      for (const name of [
        'quoted"module.bpl',
        "back\bspace.bpl",
        "form\ffeed.bpl",
      ]) {
        writeFileSync(
          join(directory, name),
          "frame helper() ret int { return 7; } export helper;",
        );
      }
      const document = TextDocument.create(
        pathToFileURL(join(directory, "main.bpl")).href,
        "bpl",
        1,
        "frame main() ret int { return helper(); }",
      );
      const provider = new DiagnosticsProvider(new SymbolIndex());
      const diagnostic = provider
        .validate(document)
        .find((item) => item.message.includes("Undefined symbol 'helper'"));
      expect(diagnostic).toBeDefined();
      const actions = nearbyImportCodeActions(
        document,
        diagnostic!,
        "helper",
        false,
      );
      expect(actions).toHaveLength(3);
      for (const action of actions) {
        const fixed = TextDocument.create(
          document.uri,
          "bpl",
          2,
          TextDocument.applyEdits(
            document,
            action.edit!.changes![document.uri]!,
          ),
        );
        expect(provider.validate(fixed)).toEqual([]);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("nearby auto-imports use actual BPL/X exports and produce compiler-valid edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-nearby-imports-"));
  try {
    const current = join(directory, "main.bpl");
    const source =
      "frame main() ret int { local value: Widget = Widget { number: 42 }; return value.number; }";
    const document = TextDocument.create(
      pathToFileURL(current).href,
      "bpl",
      1,
      source,
    );
    writeFileSync(current, source);
    // Comment/string lookalikes are not exports; invalid siblings are skipped.
    writeFileSync(join(directory, "a-broken.bpl"), "frame broken(");
    writeFileSync(
      join(directory, "b-comment.bpl"),
      "# export [Widget];\nstruct Widget { number: int, }",
    );
    writeFileSync(
      join(directory, "c-string.bpl"),
      'global text: string = "export [Widget];";',
    );
    mkdirSync(join(directory, "d-directory.bpl"));
    const module =
      "export /# public API #/ [Widget]; struct Widget { number: int, }";
    writeFileSync(join(directory, "e-real.x"), module);
    writeFileSync(join(directory, "f-real.bpl"), module);
    const provider = new DiagnosticsProvider(new SymbolIndex());
    const diagnostic = provider
      .validate(document)
      .find((item) => item.message.includes("Undefined type 'Widget'"));
    expect(diagnostic).toBeDefined();
    const typeName = importableTypeName(diagnostic!);
    expect(typeName).toBe("Widget");
    const actions = nearbyImportCodeActions(
      document,
      diagnostic!,
      typeName!,
      true,
    );
    expect(actions.map((action) => action.title)).toEqual([
      "Import Widget from ./e-real.x",
      "Import Widget from ./f-real.bpl",
    ]);
    for (const action of actions) {
      const edits = action.edit!.changes![document.uri]!;
      const fixed = TextDocument.create(
        document.uri,
        "bpl",
        2,
        TextDocument.applyEdits(document, edits),
      );
      expect(provider.validate(fixed)).toEqual([]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("value import suggestions accept comments and reject type-only exports", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-value-imports-"));
  try {
    writeFileSync(
      join(directory, "value.x"),
      "frame helper() ret int { return 7; } export /# API #/ helper;",
    );
    writeFileSync(
      join(directory, "type.bpl"),
      "struct helper { number: int, } export [helper];",
    );
    const document = TextDocument.create(
      pathToFileURL(join(directory, "main.bpl")).href,
      "bpl",
      1,
      "frame main() ret int { return helper(); }",
    );
    const provider = new DiagnosticsProvider(new SymbolIndex());
    const diagnostic = provider
      .validate(document)
      .find((item) => item.message.includes("Undefined symbol 'helper'"));
    expect(diagnostic).toBeDefined();
    const actions = nearbyImportCodeActions(
      document,
      diagnostic!,
      "helper",
      false,
    );
    expect(actions.map((action) => action.title)).toEqual([
      "Import helper from ./value.x",
    ]);
    const fixed = TextDocument.create(
      document.uri,
      "bpl",
      2,
      TextDocument.applyEdits(
        document,
        actions[0]!.edit!.changes![document.uri]!,
      ),
    );
    expect(provider.validate(fixed)).toEqual([]);
    const untitled = TextDocument.create("untitled:main.bpl", "bpl", 1, "");
    expect(
      nearbyImportCodeActions(
        untitled,
        { range: Range.create(0, 0, 0, 0), message: "Unknown type 'Widget'" },
        "Widget",
        true,
      ),
    ).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
