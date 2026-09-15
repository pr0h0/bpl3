import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { Glob } from "bun";
import { join, resolve } from "path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const SPEC_PATH = join(REPO_ROOT, "LANGUAGE_SPEC.md");
const RULE_MARKER_PATTERN = /\*\*\[(R-[A-Z]+-\d+)\]\*\*/g;
const RULE_ID_PATTERN = /^R-[A-Z]+-\d+$/;
const ANNOTATION_PATTERN = /^\s*\/\/\s*spec:\s*(.*)$/;
const TEST_CALL_PATTERN = /^\s*(?:test|it|describe)(?:\.\w+(?:\([^)]*\))?)*\(/;

/**
 * Rules without a referencing test. Each entry must be genuinely untested and
 * explain why; the checker fails once an entry gains a test so the list only
 * shrinks.
 */
const PENDING_RULES: Record<string, string> = {
  "R-EXTERN-1":
    "Covered by tests/ExternAbiSafety.test.ts; annotation deferred while the C FFI ABI work changes that file.",
  "R-EXTERN-2":
    "Covered by tests/ExternAbiSafety.test.ts; annotation deferred while the C FFI ABI work changes that file.",
  "R-EXTERN-3":
    "Covered by tests/ExternAbiSafety.test.ts; annotation deferred while the C FFI ABI work changes that file.",
  "R-EXTERN-4":
    "Covered by tests/ExternAbiSafety.test.ts; annotation deferred while the C FFI ABI work changes that file.",
  "R-EXTERN-5":
    "Covered by tests/ExternAbiSafety.test.ts; annotation deferred while the C FFI ABI work changes that file.",
};

/** Rule IDs removed from the specification. They must never be reused. */
const RETIRED_RULES: readonly string[] = [];

interface Annotation {
  file: string;
  line: number;
  ids: string[];
}

function extractSpecRuleIds(markdown: string): string[] {
  return [...markdown.matchAll(RULE_MARKER_PATTERN)].map((match) => match[1]!);
}

function extractSpecAnnotations(
  file: string,
  source: string,
): { annotations: Annotation[]; errors: string[] } {
  const annotations: Annotation[] = [];
  const errors: string[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((text, index) => {
    const match = ANNOTATION_PATTERN.exec(text);
    if (!match) return;
    const line = index + 1;
    const ids = match[1]!
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0 || !ids.every((id) => RULE_ID_PATTERN.test(id))) {
      errors.push(`${file}:${line}: malformed spec annotation: ${text.trim()}`);
      return;
    }
    let next = index + 1;
    while (
      next < lines.length &&
      (lines[next]!.trim() === "" || ANNOTATION_PATTERN.test(lines[next]!))
    ) {
      next++;
    }
    if (next >= lines.length || !TEST_CALL_PATTERN.test(lines[next]!)) {
      errors.push(
        `${file}:${line}: spec annotation must be directly above a test, it, or describe call`,
      );
    }
    annotations.push({ file, line, ids });
  });
  return { annotations, errors };
}

function loadAnnotations(): { annotations: Annotation[]; errors: string[] } {
  const annotations: Annotation[] = [];
  const errors: string[] = [];
  const files = [
    ...new Glob("tests/**/*.test.ts").scanSync({ cwd: REPO_ROOT }),
  ].sort();
  for (const file of files) {
    const result = extractSpecAnnotations(
      file,
      readFileSync(join(REPO_ROOT, file), "utf8"),
    );
    annotations.push(...result.annotations);
    errors.push(...result.errors);
  }
  return { annotations, errors };
}

describe("LANGUAGE_SPEC.md rule IDs are test-backed", () => {
  const specIds = extractSpecRuleIds(readFileSync(SPEC_PATH, "utf8"));
  const specIdSet = new Set(specIds);
  const { annotations, errors } = loadAnnotations();
  const tested = new Set(annotations.flatMap((annotation) => annotation.ids));

  test("rule extraction and annotation parsing follow the documented format", () => {
    expect(
      extractSpecRuleIds(
        "- **[R-LEX-1]** one\ntext **[R-ABI-12]** two [R-X-3]",
      ),
    ).toEqual(["R-LEX-1", "R-ABI-12"]);
    const parsed = extractSpecAnnotations(
      "sample.test.ts",
      [
        "// spec: R-LEX-1, R-ABI-2",
        'test("x", () => {});',
        "  // spec: R-LEX-3",
        "",
        '  test.skipIf(true)("y", () => {});',
        "// spec: R-LEX-4",
        "const value = 1;",
        "// spec: lex-5",
        'it("z", () => {});',
      ].join("\n"),
    );
    expect(parsed.annotations.map((annotation) => annotation.ids)).toEqual([
      ["R-LEX-1", "R-ABI-2"],
      ["R-LEX-3"],
      ["R-LEX-4"],
    ]);
    expect(parsed.errors).toHaveLength(2);
  });

  test("the specification defines rules without duplicate or retired IDs", () => {
    expect(specIds.length).toBeGreaterThan(100);
    const seen = new Set<string>();
    const duplicates = specIds.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    expect(duplicates).toEqual([]);
    expect(RETIRED_RULES.filter((id) => specIdSet.has(id))).toEqual([]);
  });

  test("spec annotations are well formed and reference existing rules", () => {
    expect(errors).toEqual([]);
    const unknown = annotations.flatMap((annotation) =>
      annotation.ids
        .filter((id) => !specIdSet.has(id))
        .map((id) => `${annotation.file}:${annotation.line}: ${id}`),
    );
    expect(unknown).toEqual([]);
  });

  test("every rule has a referencing test or a justified pending entry", () => {
    const untested = specIds.filter(
      (id) => !tested.has(id) && !(id in PENDING_RULES),
    );
    expect(untested).toEqual([]);
  });

  test("the pending allowlist only contains existing, untested rules", () => {
    const pending = Object.keys(PENDING_RULES);
    expect(pending.filter((id) => !specIdSet.has(id))).toEqual([]);
    expect(pending.filter((id) => tested.has(id))).toEqual([]);
    expect(
      Object.entries(PENDING_RULES)
        .filter(([, reason]) => reason.trim().length === 0)
        .map(([id]) => id),
    ).toEqual([]);
  });
});
