import { describe, expect, it } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { ASTResolver } from "../services/ASTResolver";
import { SignatureHelpProvider } from "../services/SignatureHelpProvider";
import { SymbolIndex } from "../services/SymbolIndex";

const repoRoot = path.resolve(__dirname, "../../..");

const SOURCE = `struct Box {
    value: int,
    frame set(this: *Box, value: int) {
        this.value = value;
    }
}

struct Table {
    size: int,
    frame set(this: *Table, key: string, value: int) {
        this.size = value;
    }
}

frame add(a: int, b: int) ret int {
    return a + b;
}

extern puts2(text: string, count: int) ret int;

frame main() ret int {
    local b: Box = Box { value: 0 };
    local x: int = 1;
    local y: int = 2;
    b.set(CURSOR_SET);
    add("a,b(", CURSOR_STRING);
    add(x < y, CURSOR_COMPARE);
    add(/# a, ( #/ 1, CURSOR_BLOCK);
    add(/# outer /# inner #/ ,( #/ 1, CURSOR_NESTED_BLOCK);
    add(\`x\${ \`,(\` }y\`, CURSOR_NESTED_TEMPLATE);
    add(\`x,(\${y}\`, CURSOR_TEMPLATE);
    b.missing(CURSOR_MISSING);
    puts2("a", CURSOR_EXTERN);
    return 0;
}
`;

// BUG-446: signature help matched callees by bare name, counted commas in
// strings and `<` comparisons, and read signatures from the file on disk.
describe("signature help matching", () => {
  function help(marker: string, disk = SOURCE, buffer = SOURCE) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-sighelp-"));
    const filePath = path.join(dir, "main.bpl");
    const strip = (text: string) => text.replace(/CURSOR_\w+/g, "");
    fs.writeFileSync(filePath, strip(disk));
    try {
      const symbolIndex = new SymbolIndex(repoRoot);
      symbolIndex.indexFile(filePath, false);
      const provider = new SignatureHelpProvider(
        new ASTResolver(symbolIndex),
        symbolIndex,
      );
      const offset = buffer.indexOf(marker);
      const text = strip(buffer);
      const document = TextDocument.create(
        pathToFileURL(filePath).toString(),
        "bpl",
        1,
        text,
      );
      const before = buffer.slice(0, offset).replace(/CURSOR_\w+/g, "");
      const result = provider.handle(
        {
          textDocument: { uri: document.uri },
          position: document.positionAt(before.length),
          context: { isRetrigger: false, triggerKind: 1 },
        },
        document,
      );
      return result
        ? {
            labels: result.signatures.map((signature) => signature.label),
            active: result.activeParameter,
          }
        : null;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("shows only the receiver type's method, without `this`", () => {
    expect(help("CURSOR_SET")).toEqual({
      labels: ["set(value: int) ret void"],
      active: 0,
    });
  });

  it("ignores commas and parentheses inside strings", () => {
    expect(help("CURSOR_STRING")?.active).toBe(1);
  });

  it("treats a spaced `<` as a comparison, not a generic bracket", () => {
    expect(help("CURSOR_COMPARE")?.active).toBe(1);
  });

  it("uses the open buffer's declaration over the saved file", () => {
    const saved = SOURCE.replace(
      "frame add(a: int, b: int)",
      "frame add(a: int)",
    );
    expect(help("CURSOR_COMPARE", saved)?.labels).toEqual([
      "add(a: int, b: int) ret int",
    ]);
  });

  it("skips block comments and interpolated strings", () => {
    expect(help("CURSOR_BLOCK")?.active).toBe(1);
    expect(help("CURSOR_TEMPLATE")?.active).toBe(1);
    expect(help("CURSOR_NESTED_BLOCK")?.active).toBe(1);
    expect(help("CURSOR_NESTED_TEMPLATE")?.active).toBe(1);
  });

  it("shows nothing for a known receiver without that method", () => {
    expect(help("CURSOR_MISSING")).toBeNull();
  });

  it("uses extern declarations from the open buffer", () => {
    const saved = SOURCE.replace(
      "extern puts2(text: string, count: int) ret int;",
      "extern puts2(text: string) ret int;",
    );
    expect(help("CURSOR_EXTERN", saved)).toEqual({
      labels: ["puts2(text: string, count: int) ret int"],
      active: 1,
    });
  });
});
