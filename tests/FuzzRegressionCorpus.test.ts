import { describe, expect, test } from "bun:test";

import {
  expectFuzzRegressionCorpusNoCrashes,
  loadFuzzRegressionCorpus,
} from "./helpers/fuzzRegressionCorpus";

describe("Fuzz regression corpus", () => {
  test("keeps minimized fuzz repros from surfacing internal compiler crashes", () => {
    const cases = loadFuzzRegressionCorpus();
    const results = expectFuzzRegressionCorpusNoCrashes(cases);

    expect(cases.length).toBeGreaterThan(0);
    expect(results.map((result) => result.name)).toEqual(
      cases.map((testCase) => testCase.name),
    );
  });
});
