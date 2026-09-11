import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

export const DOCUMENTATION_ROOT = resolve(import.meta.dir, "../..");

export interface DocumentationExample {
  file: string;
  line: number;
  block: number;
  source: string;
  fixture?: string;
  fragment?: string;
  expectedError?: string;
  arch?: string;
  run?: string;
}

/** Every complete program in the current user guides is checked by default. */
export function documentationFiles(): string[] {
  return [
    "README.md",
    ...readdirSync(resolve(DOCUMENTATION_ROOT, "docs"))
      .filter((file) => /^\d.*\.md$/.test(file))
      .sort()
      .map((file) => `docs/${file}`),
    "docs/adding-primitive-types.md",
    "docs/type-matching.md",
  ];
}

export function extractDocumentationExamples(
  file: string,
  markdown: string,
): DocumentationExample[] {
  const examples: DocumentationExample[] = [];
  const pattern = /```bpl[^\n]*\n([^]*?)\n```/g;
  let block = 0;
  for (const match of markdown.matchAll(pattern)) {
    block++;
    const directives = new Map<string, string>();
    const prefix =
      markdown
        .slice(0, match.index)
        .match(/((?:<!--(?:(?!-->).)*-->\s*)+)$/s)?.[1] ?? "";
    for (const directive of prefix.matchAll(/<!-- bpl-doc: ([^]*?) -->/g)) {
      for (const field of directive[1]!.split(/\s+/)) {
        const separator = field.indexOf("=");
        const key = field.slice(0, separator);
        const value = field.slice(separator + 1);
        if (
          separator < 1 ||
          !value ||
          !["fixture", "fragment", "expect-error", "arch", "run"].includes(key)
        ) {
          throw new Error(`${file}: invalid documentation directive: ${field}`);
        }
        if (directives.has(key))
          throw new Error(`${file}: duplicate directive: ${key}`);
        directives.set(key, value);
      }
    }
    const source = match[1]!;
    if (!/\bframe\s+main\s*\(/.test(source) && directives.size === 0) continue;
    const fixture = directives.get("fixture");
    if (fixture && !/^[\w-]+\.bpl$/.test(fixture)) {
      throw new Error(`${file}: fixture must be a sibling .bpl filename`);
    }
    const arch = directives.get("arch");
    if (arch && arch !== "x64")
      throw new Error(`${file}: unknown architecture ${arch}`);
    if (
      ["fixture", "fragment", "expect-error"].filter((key) =>
        directives.has(key),
      ).length > 1
    ) {
      throw new Error(`${file}: conflicting example classifications`);
    }
    examples.push({
      file,
      block,
      line: markdown
        .slice(0, match.index! + match[0].indexOf("```bpl"))
        .split("\n").length,
      source,
      fixture,
      fragment: directives.get("fragment"),
      expectedError: directives.get("expect-error"),
      arch,
      run: directives.get("run"),
    });
  }
  return examples;
}

export function loadDocumentationExamples(): DocumentationExample[] {
  return documentationFiles().flatMap((file) =>
    extractDocumentationExamples(
      file,
      readFileSync(resolve(DOCUMENTATION_ROOT, file), "utf8"),
    ),
  );
}
