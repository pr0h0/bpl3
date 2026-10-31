import { describe, expect, it } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

const repoRoot = path.resolve(__dirname, "../../..");

const SOURCE = `struct Counter {
    count: int,

    frame bump(this: *Counter) {
        this.count = this.count + 1;
    }
}

frame main() ret int {
    local c: Counter = Counter { count: 0 };
    c.bump();
    c.bump();
    return c.count;
}
`;

// BUG-446: find references returned nothing for methods and fields.
describe("member references", () => {
  function references(needle: string, offset: number, source = SOURCE) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-members-"));
    const filePath = path.join(dir, "main.bpl");
    fs.writeFileSync(filePath, source);
    try {
      const symbolIndex = new SymbolIndex(repoRoot);
      const handler = new ASTRenameHandler(
        new ASTResolver(symbolIndex),
        symbolIndex,
      );
      const document = TextDocument.create(
        pathToFileURL(filePath).toString(),
        "bpl",
        1,
        source,
      );
      const position = document.positionAt(source.indexOf(needle) + offset);
      return (handler.findAllReferences(position, document) ?? [])
        .map(
          (location) =>
            `${location.range.start.line}:${document.getText(location.range)}`,
        )
        .sort();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("finds every use of a method from its declaration or a call", () => {
    const uses = ["10:bump", "11:bump", "3:bump"];
    expect(references("bump(this", 1)).toEqual(uses);
    expect(references("bump();", 1)).toEqual(uses);
  });

  it("finds every use of a field", () => {
    // Declaration, `this.count` twice, the literal key and `c.count`.
    expect(references("count: int", 1)).toEqual([
      "12:count",
      "1:count",
      "4:count",
      "4:count",
      "9:count",
    ]);
  });

  it("follows inheritance and ignores same-named members of other structs", () => {
    const source = `struct Base {
    value: int,
}

struct Child: Base {
    extra: int,
}

struct Other {
    value: int,
}

frame main() ret int {
    local child: Child = Child { value: 1, extra: 2 };
    local other: Other = Other { value: 3 };
    return child.value + other.value + child.extra;
}
`;
    // Base's declaration, Child's literal key and `child.value`, but none of
    // Other's same-named field.
    expect(references("child.value", 7, source)).toEqual([
      "13:value",
      "15:value",
      "1:value",
    ]);
    // On the object, not the member: not a member reference.
    expect(references("child.value", 2, source)).not.toContain("15:value");
  });

  it("matches literal keys only, and resolves a key under the cursor", () => {
    const source = `struct Counter {
    count: int,
    other: int,
}

frame main() ret int {
    local count: int = 3;
    local flag: bool = true;
    local c: Counter = Counter { other: flag ? count : 0, count: 1 };
    return c.count + c.other;
}
`;
    // The ternary's \`count :\` reads the local; it is not a field key.
    const expected = ["1:count", "8:count", "9:count"];
    expect(references("c.count", 3, source)).toEqual(expected);
    // From the key itself, which has no AST location of its own.
    expect(references("count: 1", 1, source)).toEqual(expected);
  });
});
