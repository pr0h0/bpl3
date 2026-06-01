import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  extractTestFileReferencesFromPackageScripts,
  findMissingTestFileReferences,
  formatMissingTestFileReferenceDiagnostics,
} from "../tools/test_reference_inventory";

const REPO_ROOT = resolve(import.meta.dir, "..");

interface PackageJson {
  scripts?: Record<string, string>;
}

function loadPackageScripts(): Record<string, string> {
  const packageJson = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
  ) as PackageJson;
  return packageJson.scripts ?? {};
}

describe("Package script test references", () => {
  test("extracts tests from package.json scripts without hard-coding one script", () => {
    const references =
      extractTestFileReferencesFromPackageScripts(loadPackageScripts());

    expect(references.length).toBeGreaterThan(10);
    expect(references).toContainEqual({
      sourceName: "test:correctness",
      file: "tests/CompilerCorrectnessCorpus.test.ts",
    });
    expect(references).toContainEqual({
      sourceName: "test:wasm",
      file: "tests/PlaygroundWasmExamples.test.ts",
    });
    expect(references).toContainEqual({
      sourceName: "release:check",
      file: "tests/ReleaseMetadata.test.ts",
    });
  });

  test("verifies every package script test file still exists", () => {
    const references =
      extractTestFileReferencesFromPackageScripts(loadPackageScripts());
    const missing = findMissingTestFileReferences(references, REPO_ROOT);
    const diagnostics = formatMissingTestFileReferenceDiagnostics(missing);

    expect(diagnostics).toBe("");
  });

  test("formats stale test references with script context", () => {
    const diagnostics = formatMissingTestFileReferenceDiagnostics([
      {
        sourceName: "test:missing",
        file: "tests/MissingCoverage.test.ts",
      },
      {
        sourceName: "release:check",
        file: "tests/RenamedReleaseSmoke.test.ts",
      },
    ]);

    expect(diagnostics).toBe(
      [
        "Stale test file references:",
        "- test:missing: tests/MissingCoverage.test.ts",
        "- release:check: tests/RenamedReleaseSmoke.test.ts",
      ].join("\n"),
    );
  });
});
