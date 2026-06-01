import { existsSync } from "fs";
import { resolve } from "path";

export interface NamedTestFileReference {
  sourceName: string;
  file: string;
}

const TEST_FILE_REFERENCE_PATTERN = /\btests\/[A-Za-z0-9._/-]+\.test\.ts\b/g;
const CI_TRIAGE_LOCAL_COMMAND_SOURCE_NAME =
  "tools/ci_triage.ts local command mappings";

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

export function extractTestFileReferencesFromCiTriageSource(
  source: string,
): NamedTestFileReference[] {
  return extractTestFileReferencesFromText(
    CI_TRIAGE_LOCAL_COMMAND_SOURCE_NAME,
    extractCiTriageLocalCommandMappingsSource(source),
  ).sort(compareNamedTestFileReferences);
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

function extractCiTriageLocalCommandMappingsSource(source: string): string {
  const start = source.indexOf("const EXCLUSIVE_STEP_REPRO_COMMANDS");
  const end = source.indexOf("export function formatCiTriageHelp");

  if (start === -1 || end === -1 || end <= start) {
    return source;
  }

  return source.slice(start, end);
}
