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
});
