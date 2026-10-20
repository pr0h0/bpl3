import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DocParser } from "../compiler/common/DocParser";
import { DocumentationGenerator } from "../compiler/docs/DocumentationGenerator";

const docLines = [
  "Adds values.",
  "",
  "# Parameters",
  "- left: First value.",
  "",
  "# Returns",
  "The sum.",
];
for (const newline of ["\n", "\r\n", "\r"]) {
  test(`documentation sections and parameter help for ${JSON.stringify(newline)}`, () => {
    const parsed = DocParser.parse(docLines.join(newline));
    expect(parsed).toEqual({
      description: "Adds values.",
      sections: [
        { title: "Parameters", content: "- left: First value." },
        { title: "Returns", content: "The sum." },
      ],
    });
    expect(DocParser.getArgumentDoc(parsed, "left")).toBe("First value.");
  });
}

test("generated documentation is independent of source line endings", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-doc-lines-"));
  const file = join(dir, "api.bpl");
  const sourceLines = [
    "/#",
    ...docLines,
    "#/",
    "frame add(left: int) ret int { return left + 1; }",
  ];
  try {
    const generated = ["\n", "\r\n", "\r"].map((newline) => {
      writeFileSync(file, sourceLines.join(newline));
      return new DocumentationGenerator().generate(file);
    });
    expect(generated[0]).toContain("Adds values.");
    expect(generated[0]).toContain("Parameters");
    expect(generated[1]).toBe(generated[0]!);
    expect(generated[2]).toBe(generated[0]!);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
