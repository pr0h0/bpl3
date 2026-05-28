import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { expectSameBehaviorAtO0AndO3 } from "./helpers/compilerCorrectness";

const corpusDir = join(import.meta.dir, "fuzz-differential-regressions");
const corpusFiles = readdirSync(corpusDir)
  .filter((file) => file.endsWith(".bpl"))
  .sort();

describe("Differential fuzz regression corpus", () => {
  test("contains at least one promoted O0/O3 runtime regression", () => {
    expect(corpusFiles.length).toBeGreaterThan(0);
  });

  for (const file of corpusFiles) {
    test(`${file} behaves the same at -O0 and -O3`, () => {
      const source = readFileSync(join(corpusDir, file), "utf8");
      const result = expectSameBehaviorAtO0AndO3(source);

      expect(result.o0.exitCode).toBe(0);
      expect(result.o3.exitCode).toBe(0);
    });
  }
});
