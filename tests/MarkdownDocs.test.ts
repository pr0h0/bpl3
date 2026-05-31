import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
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

function trackedFiles(): Set<string> {
  const result = spawnSync("git", ["ls-files"], {
    encoding: "utf8",
  });

  expect(result.status).toBe(0);

  return new Set(
    result.stdout
      .split("\n")
      .map((line) => normalize(line.trim()))
      .filter(Boolean),
  );
}

function isTrackedPath(path: string, files: Set<string>): boolean {
  const normalizedPath = normalize(path);
  if (files.has(normalizedPath)) {
    return true;
  }

  if (!existsSync(normalizedPath) || !statSync(normalizedPath).isDirectory()) {
    return false;
  }

  const prefix = normalizedPath.endsWith("/")
    ? normalizedPath
    : `${normalizedPath}/`;

  for (const file of files) {
    if (file.startsWith(prefix)) {
      return true;
    }
  }

  return false;
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
    const allTrackedFiles = trackedFiles();
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

        if (!isTrackedPath(resolvedPath, allTrackedFiles)) {
          failures.push(`${file} -> ${raw} (target is not tracked)`);
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

  test("compiler options document machine-readable JSON contracts", () => {
    const text = readFileSync("docs/39-compiler-options.md", "utf8");
    const requiredSnippets = [
      "### Machine-readable JSON contracts",
      "### CLI JSON compatibility policy",
      "bpl build --json",
      "bpl check --json",
      'check: "check"',
      "bpl lint --json",
      'check: "lint"',
      "bpl doctor --json",
      "bpl doctor packages --json",
      "bpl package-cache list [package] --json",
      "bpl package-cache verify [package] --json",
      "bpl package-cache clean [package] --json",
      "bpl package-cache repair [package] --json",
      "bpl run-script --list --json",
      "run-script-list",
      "bpl clean --dry-run --json",
      "bpl list --json",
      "package-list-tree",
      "`schemaVersion`",
      "`success`",
      "stderr",
      "Backward-compatible additions",
      "Breaking JSON shape changes",
      "ignore unknown fields",
      "bump `schemaVersion`",
    ];

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet);
    }
  });

  test("package docs document import safety rules", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const importDocs = readFileSync("docs/23-imports-exports.md", "utf8");
    const combinedDocs = `${packageDocs}\n${importDocs}`.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Package import paths cannot contain empty, `.` or `..` segments",
      "The resolver does not follow symlinked package roots, manifests, entry files, or subpath entries",
      "`bpl_modules/my-package/bpl.json` must declare `\"name\": \"my-package\"`",
      "Global versioned package directories must match their manifest `version`",
      "package metadata instead of silently importing a different package",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });
});
