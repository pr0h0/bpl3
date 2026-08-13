import { describe, expect, it, beforeAll } from "bun:test";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  PrepareRenameParams,
  RenameParams,
} from "vscode-languageserver/node";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const TMP_DIR = path.resolve(__dirname, "../../../tmp");

describe("Rename Handler - Bug Fixes", () => {
  const symbolIndex = new SymbolIndex();
  const astResolver = new ASTResolver(symbolIndex);
  const renameHandler = new ASTRenameHandler(astResolver, symbolIndex);

  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  it("should rename function parameter without removing type", () => {
    const code = `frame add(x: int, y: int) ret int {
    return x + y;
}
`;

    const filePath = path.join(TMP_DIR, "test-param-type.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(`file://${filePath}`, "bpl", 1, code);

    const prepareParams: PrepareRenameParams = {
      textDocument: { uri: doc.uri },
      position: { line: 0, character: 10 },
    };

    const prepareResult = renameHandler.prepareRename(prepareParams, doc);
    console.log("[Test] PrepareRename on parameter:", prepareResult);
    expect(prepareResult).not.toBeNull();

    if (prepareResult) {
      const selectedText = doc.getText(prepareResult);
      console.log("[Test] Selected text:", JSON.stringify(selectedText));
      expect(selectedText).toBe("x");
      expect(selectedText).not.toContain(":");
    }
  });

  it("should handle shadow variables correctly", () => {
    const code = `frame test() {
    local var: int = 5;
    printf("%d", var);
    if (true) {
        local var: int = 10;
        printf("%d", var);
    }
    printf("%d", var);
}
`;

    const filePath = path.join(TMP_DIR, "test-shadow.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(`file://${filePath}`, "bpl", 1, code);

    const renameParamsOuter: RenameParams = {
      textDocument: { uri: doc.uri },
      position: { line: 1, character: 10 },
      newName: "outerVar",
    };

    const renameResultOuter = renameHandler.rename(renameParamsOuter, doc);
    const editsOuter = renameResultOuter?.changes?.[doc.uri];
    console.log("[Test] Rename outer var edits:", editsOuter);

    expect(editsOuter?.length).toBe(3);
  });

  it("should rename parameter in function body", () => {
    const code = `frame multiply(factor: int, value: int) ret int {
    return factor * value;
}
`;

    const filePath = path.join(TMP_DIR, "test-param-body.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(`file://${filePath}`, "bpl", 1, code);

    const renameParams: RenameParams = {
      textDocument: { uri: doc.uri },
      position: { line: 1, character: 11 },
      newName: "multiplier",
    };

    const renameResult = renameHandler.rename(renameParams, doc);
    const edits = renameResult?.changes?.[doc.uri];
    console.log("[Test] Rename param from body:", edits);

    expect(edits?.length).toBe(2);

    if (edits && edits[0]) {
      const declEdit = edits.find((e) => e.range.start.line === 0);
      if (declEdit) {
        const originalText = doc.getText(declEdit.range);
        console.log("[Test] Declaration edit original text:", originalText);
        expect(originalText).toBe("factor");
        expect(declEdit.newText).toBe("multiplier");
      }
    }
  });

  it("should prepare rename from unsaved document content", () => {
    const code = `frame add(value: int) ret int {
    return value;
}
`;
    const filePath = path.join(TMP_DIR, "unsaved-rename.bpl");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const prepareResult = renameHandler.prepareRename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 10 },
      },
      doc,
    );

    expect(prepareResult).not.toBeNull();
    expect(prepareResult ? doc.getText(prepareResult) : null).toBe("value");
  });

  it("should rename enum method parameters from the method body", () => {
    const code = `enum Color {
    Red,

    frame to_code(this: Color, factor: int) ret int {
        return factor;
    }
}
`;
    const filePath = path.join(TMP_DIR, "enum-method-param-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const renameResult = renameHandler.rename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 4, character: 15 },
        newName: "multiplier",
      },
      doc,
    );
    const edits = renameResult?.changes?.[doc.uri];

    expect(edits?.length).toBe(2);

    const declEdit = edits?.find((edit) => edit.range.start.line === 3);
    expect(declEdit?.newText).toBe("multiplier");
    expect(declEdit ? doc.getText(declEdit.range) : null).toBe("factor");
  });

  it("should prepare rename for spec method declarations", () => {
    const code = `spec Reader {
    frame read(this: *Self) ret int;
}
`;
    const filePath = path.join(TMP_DIR, "spec-method-prepare-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const prepareResult = renameHandler.prepareRename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 11 },
      },
      doc,
    );

    expect(prepareResult).not.toBeNull();
    expect(prepareResult ? doc.getText(prepareResult) : null).toBe("read");
  });

  it("should rename spec method declarations and member calls", () => {
    const code = `spec Reader {
    frame read(this: *Self) ret int;
}

struct Runner {
    frame run(this: Runner, reader: *Reader) ret int {
        return reader.read();
    }
}
`;
    const filePath = path.join(TMP_DIR, "spec-method-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const renameResult = renameHandler.rename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 11 },
        newName: "load",
      },
      doc,
    );
    const edits = renameResult?.changes?.[doc.uri];

    expect(edits?.length).toBe(2);
    expect(edits?.every((edit) => edit.newText === "load")).toBe(true);
    expect(edits?.map((edit) => doc.getText(edit.range))).toEqual([
      "read",
      "read",
    ]);
  });

  it("should prepare rename for spec method parameters", () => {
    const code = `spec Writer {
    frame write(this: *Self, value: int) ret void;
}
`;
    const filePath = path.join(TMP_DIR, "spec-method-param-prepare-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const prepareResult = renameHandler.prepareRename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 30 },
      },
      doc,
    );

    expect(prepareResult).not.toBeNull();
    expect(prepareResult ? doc.getText(prepareResult) : null).toBe("value");
  });

  it("should rename spec method parameters without touching types", () => {
    const code = `spec Writer {
    frame write(this: *Self, value: int) ret void;
}
`;
    const filePath = path.join(TMP_DIR, "spec-method-param-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const renameResult = renameHandler.rename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 30 },
        newName: "data",
      },
      doc,
    );
    const edits = renameResult?.changes?.[doc.uri];

    expect(edits?.length).toBe(1);
    expect(edits?.[0]?.newText).toBe("data");
    expect(edits?.[0] ? doc.getText(edits[0].range) : null).toBe("value");
  });

  it("should rename type alias declarations and references", () => {
    const code = `type UserId = int;

frame load(value: UserId) ret UserId {
    return value;
}
`;
    const filePath = path.join(TMP_DIR, "type-alias-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const prepareResult = renameHandler.prepareRename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 6 },
      },
      doc,
    );
    expect(prepareResult ? doc.getText(prepareResult) : null).toBe("UserId");

    const renameResult = renameHandler.rename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 6 },
        newName: "AccountId",
      },
      doc,
    );
    const edits = renameResult?.changes?.[doc.uri];

    expect(edits?.length).toBe(3);
    expect(edits?.every((edit) => edit.newText === "AccountId")).toBe(true);
    expect(edits?.map((edit) => doc.getText(edit.range))).toEqual([
      "UserId",
      "UserId",
      "UserId",
    ]);
  });

  it("should rename extern declarations and calls", () => {
    const code = `extern printf(fmt: string, ...) ret int;

frame main() ret int {
    return printf("ok");
}
`;
    const filePath = path.join(TMP_DIR, "extern-rename.bpl");
    fs.writeFileSync(filePath, code);

    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      code,
    );

    const prepareResult = renameHandler.prepareRename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 8 },
      },
      doc,
    );
    expect(prepareResult ? doc.getText(prepareResult) : null).toBe("printf");

    const renameResult = renameHandler.rename(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 8 },
        newName: "print_line",
      },
      doc,
    );
    const edits = renameResult?.changes?.[doc.uri];

    expect(edits?.length).toBe(2);
    expect(edits?.every((edit) => edit.newText === "print_line")).toBe(true);
    expect(edits?.map((edit) => doc.getText(edit.range))).toEqual([
      "printf",
      "printf",
    ]);
  });
});
