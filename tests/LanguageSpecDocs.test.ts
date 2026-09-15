import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";

const specPath = path.resolve(__dirname, "../LANGUAGE_SPEC.md");

function readSpec(): string {
  return fs.readFileSync(specPath, "utf8");
}

function sectionBody(spec: string, heading: string): string {
  const start = spec.indexOf(`\n${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = spec.slice(start + heading.length + 2);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

// Rule-level coverage lives in tests/LanguageSpecRules.test.ts. These checks
// keep the document structure that other guides link to.
describe("Language specification structure", () => {
  it("keeps the semantic core, ABI, and linked section headings", () => {
    const spec = readSpec();

    for (const heading of [
      "## Conventions",
      "## 1. Lexical Structure",
      "## 2. Semantic Core",
      "### Primitive Type Commitments",
      "### Array, Pointer, and Slice Semantics",
      "### Conversion Semantics",
      "## 3. ABI Lowering Contract",
      "### Function and Lambda ABI",
      "### External ABI restrictions",
      "### Slice ABI",
      "## 4. Compiler Pipeline Contract",
      "## 10. Modules and Imports",
      "## 11. Inline Assembly",
      "## 12. Standard Library Overview",
    ]) {
      expect(spec).toContain(`\n${heading}\n`);
    }
  });

  it("labels informative sections and keeps rule markers out of them", () => {
    const spec = readSpec();

    for (const heading of [
      "## 4. Compiler Pipeline Contract",
      "## 12. Standard Library Overview",
    ]) {
      const body = sectionBody(spec, heading);
      expect(body.trimStart().startsWith("_Informative._"), heading).toBe(true);
      expect(body).not.toMatch(/\*\*\[R-[A-Z]+-\d+\]\*\*/);
    }
  });

  it("keeps assembly text inside code fences", () => {
    const withoutFences = readSpec().replace(/```[^]*?```/g, "");
    expect(withoutFences).not.toMatch(/^\s*asm\(/m);
    expect(withoutFences).not.toMatch(/^\s*"(?:mov|movl|store) /m);
  });
});
