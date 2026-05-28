import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { dirname, join, normalize } from "path";
import { spawnSync } from "child_process";

function trackedMarkdownFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "*.md"], {
    encoding: "utf8",
  });

  expect(result.status).toBe(0);

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

describe("Markdown documentation", () => {
  test("local markdown links resolve", () => {
    const files = trackedMarkdownFiles();
    const headings = new Map<string, Set<string>>();

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const slugs = new Set<string>();

      for (const line of text.split(/\r?\n/)) {
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (match?.[2]) {
          slugs.add(headingSlug(match[2]));
        }
      }

      headings.set(file, slugs);
    }

    const failures: string[] = [];
    const linkPattern =
      /!?(?:\[[^\]\n]+\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

    for (const file of files) {
      const text = readFileSync(file, "utf8");

      for (const match of text.matchAll(linkPattern)) {
        const raw = match[1]?.replace(/^<|>$/g, "");
        if (
          !raw ||
          raw.startsWith("http://") ||
          raw.startsWith("https://") ||
          raw.startsWith("mailto:") ||
          raw.startsWith("#")
        ) {
          continue;
        }

        const [target, anchor] = raw.split("#");
        if (!target) continue;

        const resolvedPath = normalize(join(dirname(file), target));
        if (!existsSync(resolvedPath)) {
          failures.push(`${file} -> ${raw}`);
          continue;
        }

        if (anchor && resolvedPath.endsWith(".md")) {
          const expectedAnchor = anchor.toLowerCase();
          if (!headings.get(resolvedPath)?.has(expectedAnchor)) {
            failures.push(`${file} -> ${raw}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("current docs avoid removed CLI and import spellings", () => {
    const files = trackedMarkdownFiles();
    const failures: string[] = [];
    const removedPatterns = [
      /^\s*(?:\$ )?bpl\s+[^\n]*--run/m,
      /^\s*(?:\$ )?bpl\s+[^\n]*--watch/m,
      /\bbpl\s+compile\b/,
      /\bbpl\s+package\s+install\b/,
      /std\/vec\.bpl/,
      /\bimport\s+\[[a-z][A-Za-z0-9_]*(?:\s*,[^\]]*)?\]\s+from\b/,
      /\bimport\s+\[HTMLEscape_appendEscaped\]\s+from\s+"bpl-templ"/,
      /"std\/reflection"/,
    ];

    for (const file of files) {
      const text = readFileSync(file, "utf8");

      for (const pattern of removedPatterns) {
        if (pattern.test(text)) {
          failures.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
