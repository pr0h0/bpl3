import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";

import { ASTCompletionHandler } from "../services/ASTCompletionHandler";
import { ASTHoverHandler } from "../services/ASTHoverHandler";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

/** A document on disk with a fresh index, as the server has when one opens. */
function open(source: string) {
  const path = join(mkdtempSync(join(tmpdir(), "bpl-ls-fuzz-")), "main.bpl");
  writeFileSync(path, source);
  const index = new SymbolIndex();
  index.indexFile(path, false);
  const uri = pathToFileURL(path).toString();
  return {
    uri,
    resolver: new ASTResolver(index),
    index,
    document: TextDocument.create(uri, "bpl", 1, source),
  };
}

// Found by running the language services over generated programs.
describe("language services on generated programs", () => {
  it("completes inside a function with a nested destructuring", () => {
    const source = `frame pair() ret ((int, int), int) { return ((1, 2), 3); }
frame main() ret int {
    local ((left: int, right: int), last: int) = pair();
    return left + right + last;
}
`;
    const { uri, resolver, index, document } = open(source);
    const items = new ASTCompletionHandler(resolver, index).handle(
      { textDocument: { uri }, position: { line: 3, character: 11 } },
      document,
    );
    const labels = items.map((item) => item.label);
    expect(labels).toContain("left");
    expect(labels).toContain("right");
    expect(labels).toContain("last");
  });

  it("resolves through a one-line match on a member scrutinee", () => {
    const source = `struct S { f: int, }
frame main() ret int {
    local s: S = S { f: 1 };
    local y: int = match (s.f) { 1 => 2, _ => s.f };
    return y;
}
`;
    const { uri, resolver, index, document } = open(source);
    const hover = new ASTHoverHandler(resolver, index);
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      source.split("\n").forEach((text, line) => {
        for (let character = 0; character <= text.length; character++) {
          hover.handle(
            { textDocument: { uri }, position: { line, character } },
            document,
          );
        }
      });
    } finally {
      console.error = original;
    }
    expect(errors).toEqual([]);
  });

  /** `source` after renaming the symbol at `line`:`character` to `next`. */
  function renamed(source: string, line: number, character: number) {
    const { uri, resolver, index, document } = open(source);
    const edit = new ASTRenameHandler(resolver, index).rename(
      {
        textDocument: { uri },
        position: { line, character },
        newName: "next",
      },
      document,
    );
    return TextDocument.applyEdits(document, edit?.changes?.[uri] ?? []);
  }

  it("renames every overload of a function together", () => {
    const source = `frame pick(_a: u8) ret int { return 1; }
frame pick(_a: i8) ret int { return 2; }
frame main() ret int { return pick(cast<u8>(0)) + pick(cast<i8>(0)); }
`;
    for (const line of [0, 1]) {
      const result = renamed(source, line, 7);
      expect(result).not.toContain("pick");
      expect(result.match(/next/g)?.length).toBe(4);
    }
  });

  it("renames a spec method on its implementations, not unrelated structs", () => {
    const source = `spec Value {
    frame val(this: *Self) ret int;
}
struct Good : Value {
    frame val(this: *Good) ret int { return 1; }
}
struct Other {
    frame val(this: *Other) ret int { return 2; }
}
frame main() ret int {
    local good: Good;
    local other: Other;
    return good.val() + other.val();
}
`;
    const result = renamed(source, 1, 11);
    expect(result).toContain("frame next(this: *Self)");
    expect(result).toContain("frame next(this: *Good)");
    expect(result).toContain("frame val(this: *Other)");
    expect(result).toContain("good.next() + other.val()");
  });

  it("renames a local used in a throw", () => {
    const source = `frame main() ret int {
    local code: int = 1;
    try {
        throw code;
    } catch (e: int) {
        return e;
    }
    return 0;
}
`;
    const result = renamed(source, 1, 11);
    expect(result).toContain("throw next;");
    expect(result).not.toContain("code");
  });
});
