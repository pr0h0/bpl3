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
});
