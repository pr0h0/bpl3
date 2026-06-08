import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DocumentationGenerator } from "../compiler/docs/DocumentationGenerator";

describe("DocumentationGenerator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-docgen-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("resets generated output between calls on the same instance", () => {
    const firstFile = path.join(tempDir, "first.bpl");
    const secondFile = path.join(tempDir, "second.bpl");
    fs.writeFileSync(firstFile, "frame first() ret int { return 1; }\n");
    fs.writeFileSync(secondFile, "frame second() ret int { return 2; }\n");

    const generator = new DocumentationGenerator();
    const firstMarkdown = generator.generate(firstFile);
    const secondMarkdown = generator.generate(secondFile);

    expect(firstMarkdown).toContain("# Module: first.bpl");
    expect(firstMarkdown).toContain("`first`");
    expect(secondMarkdown).toContain("# Module: second.bpl");
    expect(secondMarkdown).toContain("`second`");
    expect(secondMarkdown).not.toContain("# Module: first.bpl");
    expect(secondMarkdown).not.toContain("`first`");
  });

  test("keeps documentation parsing off the redundant grammar lexer pass", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "compiler", "docs", "DocumentationGenerator.ts"),
      "utf-8",
    );

    expect(source).not.toContain('from "../frontend/GrammarLexer"');
    expect(source).toContain("new Parser(source, resolvedFilePath)");
  });

  test("rejects documentation inputs through symlinked parent directories", () => {
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const sourceFile = path.join(realRoot, "main.bpl");
    const linkedSourceFile = path.join(linkedRoot, "main.bpl");
    fs.mkdirSync(realRoot);
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.symlinkSync(realRoot, linkedRoot, "dir");

    const generator = new DocumentationGenerator();

    expect(() => generator.generate(linkedSourceFile)).toThrow(
      "Documentation input parent contains a symbolic link",
    );
  });

  test("keeps documentation input diagnostics specific", () => {
    const sourceFile = path.join(tempDir, "main.bpl");
    const linkedFile = path.join(tempDir, "linked.bpl");
    const directoryPath = path.join(tempDir, "docs-dir");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.symlinkSync(sourceFile, linkedFile, "file");
    fs.mkdirSync(directoryPath);

    const generator = new DocumentationGenerator();

    expect(() => generator.generate(linkedFile)).toThrow(
      "Documentation input is a symbolic link",
    );
    expect(() => generator.generate(directoryPath)).toThrow(
      "Documentation input is not a file",
    );
    expect(() => generator.generate(path.join(tempDir, "missing.bpl"))).toThrow(
      "Documentation input not found",
    );
  });
});
