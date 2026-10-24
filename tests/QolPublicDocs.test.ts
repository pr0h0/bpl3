import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DocumentationGenerator } from "../compiler/docs/DocumentationGenerator";
test("public docs retain exported global destructuring bindings without exposing siblings", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-public-docs-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(
      file,
      "global (visible:int, (hidden:int, nested:int)) = (1,(2,3)); export visible; export nested;",
    );
    const generator = new DocumentationGenerator();
    const output = generator.generate(file, { publicOnly: true });
    expect(output).toContain("visible, nested");
    expect(output).not.toContain("hidden");
    expect(output).not.toContain("undefined");
    const all = generator.generate(file);
    expect(all).toContain("visible, hidden, nested");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
