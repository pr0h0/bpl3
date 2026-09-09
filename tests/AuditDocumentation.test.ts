import { it, expect } from "bun:test";
import { readFileSync } from "fs";
import { expectCorrectnessSuite, runBplAtOptimization } from "./helpers/compilerCorrectness";

it("executes the README introduction and documented explicit generic call example", () => {
  const readme = readFileSync("README.md", "utf8");
  const guide = readFileSync("docs/05-types-variables.md", "utf8");
  const introductorySource = readme.match(/```bpl\n([\s\S]*?)\n```/)![1]!;
  const explicitSource = guide.match(/<!-- executable-example: explicit-locals -->\s*```bpl\n([\s\S]*?)\n```/)![1]!;
  expectCorrectnessSuite([
    { name: "README introduction", source: introductorySource, expectedStdout: "Hello from BPL!\n" },
    { name: "explicit locals and explicit generic call", source: explicitSource, expectedStdout: "42\n" },
  ]);
}, 60000);

it("checks the documented missing-type diagnostic", () => {
  const guide = readFileSync("docs/05-types-variables.md", "utf8");
  const source = guide.match(/<!-- rejected-example: missing-local-type -->\s*```bpl\n([\s\S]*?)\n```/)![1]!;
  const result = runBplAtOptimization(source, 0);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("BPL_VARIABLE_TYPE_ANNOTATION_MISSING");
});
