import { existsSync, readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

import {
  runCompilerPipeline,
  type FuzzStage,
} from "../../fuzz/compilerFuzz";

export interface FuzzRegressionCase {
  name: string;
  sourcePath: string;
  source: string;
}

export interface FuzzRegressionResult {
  name: string;
  sourcePath: string;
  ok: boolean;
  expectedError: boolean;
  stage: FuzzStage;
  message?: string;
}

const DEFAULT_CORPUS_DIR = join(__dirname, "../fuzz-regressions");

export function loadFuzzRegressionCorpus(
  corpusDir: string = DEFAULT_CORPUS_DIR,
): FuzzRegressionCase[] {
  if (!existsSync(corpusDir)) {
    return [];
  }

  return listBplFiles(corpusDir).map((sourcePath) => ({
    name: relative(corpusDir, sourcePath),
    sourcePath,
    source: readFileSync(sourcePath, "utf8"),
  }));
}

export function expectFuzzRegressionCorpusNoCrashes(
  cases: readonly FuzzRegressionCase[],
): FuzzRegressionResult[] {
  return cases.map((testCase) => {
    const outcome = runCompilerPipeline(testCase.source, testCase.sourcePath, {
      skipImportResolution: true,
    });
    const cleanOutcome = outcome.ok || outcome.expectedError === true;

    if (outcome.crash !== undefined || !cleanOutcome) {
      throw new Error(
        [
          `Fuzz regression surfaced an internal compiler crash: ${testCase.name}`,
          `stage: ${outcome.stage}`,
          outcome.message ? `message:\n${outcome.message}` : "",
          `source:\n${testCase.source.trim()}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    return {
      name: testCase.name,
      sourcePath: testCase.sourcePath,
      ok: outcome.ok,
      expectedError: outcome.expectedError === true,
      stage: outcome.stage,
      message: outcome.message,
    };
  });
}

function listBplFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        return listBplFiles(path);
      }

      return entry.isFile() && entry.name.endsWith(".bpl") ? [path] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}
