import { existsSync } from "fs";
import { resolve } from "path";

export interface NamedTestFileReference {
  sourceName: string;
  file: string;
}

const TEST_FILE_REFERENCE_PATTERN = /\btests\/[A-Za-z0-9._/-]+\.test\.ts\b/g;

export function extractTestFileReferencesFromText(
  sourceName: string,
  text: string,
): NamedTestFileReference[] {
  const references: NamedTestFileReference[] = [];

  for (const match of text.matchAll(TEST_FILE_REFERENCE_PATTERN)) {
    references.push({ sourceName, file: match[0] });
  }

  return references;
}

export function extractTestFileReferencesFromPackageScripts(
  scripts: Record<string, string>,
): NamedTestFileReference[] {
  return Object.entries(scripts)
    .flatMap(([sourceName, command]) =>
      extractTestFileReferencesFromText(sourceName, command),
    )
    .sort(compareNamedTestFileReferences);
}

export function findMissingTestFileReferences(
  references: NamedTestFileReference[],
  repoRoot: string,
): NamedTestFileReference[] {
  return references
    .filter((reference) => !existsSync(resolve(repoRoot, reference.file)))
    .sort(compareNamedTestFileReferences);
}

export function formatMissingTestFileReferenceDiagnostics(
  missing: NamedTestFileReference[],
): string {
  if (missing.length === 0) {
    return "";
  }

  return [
    "Stale test file references:",
    ...missing.map(
      (reference) => `- ${reference.sourceName}: ${reference.file}`,
    ),
  ].join("\n");
}

function compareNamedTestFileReferences(
  left: NamedTestFileReference,
  right: NamedTestFileReference,
): number {
  const bySource = left.sourceName.localeCompare(right.sourceName);
  if (bySource !== 0) {
    return bySource;
  }

  return left.file.localeCompare(right.file);
}
