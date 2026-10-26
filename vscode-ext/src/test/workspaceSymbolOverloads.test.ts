import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { WorkspaceSymbolProvider } from "../services/WorkspaceSymbolProvider";

for (const separator of [" ", "\n", "\r\n", "\r"]) {
  test(`workspace search retains overloads separated by ${JSON.stringify(separator)}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-symbol-overloads-"));
    try {
      const file = join(dir, "main.bpl");
      const source = [
        "frame convert(value: int) ret int { return value; }",
        "frame convert(value: float) ret float { return value; }",
      ].join(separator);
      writeFileSync(file, source);
      const index = new SymbolIndex();
      index.indexFile(file, false);
      const resolver = new ASTResolver(index);
      expect(resolver.parseDocumentContent(file, source)).not.toBeNull();
      const provider = new WorkspaceSymbolProvider(resolver, index);
      for (const query of ["convert", "CONVERT", ""]) {
        const results = await provider.search({ query });
        expect(results).toHaveLength(2);
        expect(results.map((symbol) => symbol.name)).toEqual([
          "convert",
          "convert",
        ]);
        const starts = results.map((symbol) =>
          "range" in symbol.location ? symbol.location.range.start : null,
        );
        expect(starts[0]).not.toEqual(starts[1]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
