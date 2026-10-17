import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { CompilerError } from "../compiler/common/CompilerError";
import { Parser } from "../compiler/frontend/Parser";
import { SOURCE_COMPLEXITY_LIMIT_CODE } from "../compiler/frontend/SyntaxDepth";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases = [
  {
    name: "parentheses",
    expression: "(".repeat(3000) + "1" + ")".repeat(3000),
  },
  { name: "binary-chain", expression: Array(20000).fill("1").join("+") },
];

for (const { name, expression } of cases) {
  const source = `frame main() ret int {\n return ${expression};\n}`;
  test(`${name} produces a located frontend diagnostic instead of stack exhaustion`, () => {
    try {
      new Parser(source, `${name}.bpl`).parse();
      throw new Error("Expected an excessive-depth diagnostic");
    } catch (error) {
      expect(error).toBeInstanceOf(CompilerError);
      const diagnostic = error as CompilerError;
      expect(diagnostic.code).toBe(SOURCE_COMPLEXITY_LIMIT_CODE);
      expect(diagnostic.location.file).toBe(`${name}.bpl`);
      expect(diagnostic.location.startLine).toBeGreaterThan(0);
      expect(diagnostic.location.startColumn).toBeGreaterThan(0);
    }
  });

  test(`${name} keeps check and build JSON failures parseable`, () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-syntax-depth-"));
    try {
      const file = join(directory, `${name}.bpl`);
      writeFileSync(file, source);
      for (const command of ["check", "build"]) {
        const result = spawnSync(
          "bun",
          [resolve("index.ts"), command, file, "--json"],
          {
            encoding: "utf8",
            timeout: 20000,
          },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).not.toMatch(/RangeError|Maximum call stack/);
        const report = JSON.parse(result.stdout);
        expect(report.success).toBe(false);
        const diagnostics =
          command === "check"
            ? report.files[0].diagnostics
            : report.diagnostics;
        expect(diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: SOURCE_COMPLEXITY_LIMIT_CODE }),
          ]),
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);
}

test("moderate nesting and expression chains still run at O0 and O3", () => {
  const expression =
    "(".repeat(32) + Array(200).fill("1").join("+") + ")".repeat(32);
  expectCorrectnessSuite([
    {
      name: "moderate-syntax-depth",
      validateLlvm: true,
      source: `frame main() ret int {if (${expression} != 200) {return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

test("wide shallow syntax is not treated as excessive nesting", () => {
  const source = `frame main() ret int {local _values:int[2000]=[${Array(2000).fill("1").join(",")}];return 0;}`;
  expect(new Parser(source, "wide-array.bpl").parse().statements.length).toBe(
    1,
  );
});
