import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCheckDiagnostics, runSpecModules } from "./helpers/languageSpec";

// spec: R-MOD-2
test("undefined exports are diagnosed in the exporting module", () => {
  expectCheckDiagnostics(
    ["export missing;", "export [Missing];", "export { missing };"].map(
      (declaration, index) => ({
        name: `missing-export-${index}`,
        source: `${declaration}\nframe main() ret int {return 0;}`,
        code: "BPL_EXPORT_SYMBOL_NOT_FOUND",
        message: "Cannot export undefined symbol",
      }),
    ),
  );
});

// spec: R-MOD-2
test("forward exports and imported aliases remain valid at O0/O3", () => {
  for (const level of [0, 3] as const) {
    const result = runSpecModules(
      {
        "values.bpl":
          "export value; global value:int=42; export [ID]; type ID=int;",
        "bridge.bpl":
          'export forwarded; import value as forwarded from "./values.bpl";',
        "main.bpl":
          'import forwarded from "./bridge.bpl"; frame main() ret int {return forwarded-42;}',
      },
      "main.bpl",
      level,
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  }
});

test("failed imported-module validation restores checker context and clears its cache", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-export-validation-"));
  try {
    const badPath = join(directory, "bad.bpl");
    writeFileSync(badPath, "export missing;");
    const mainPath = join(directory, "main.bpl");
    const source =
      'import "./bad.bpl"; export present; global present:int=1; frame main() ret int {return present-1;}';
    const program = new Parser(source, mainPath).parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program, mainPath);
    const errors = checker.getErrors();
    expect(errors.map((error) => error.code)).toEqual([
      "BPL_EXPORT_SYMBOL_NOT_FOUND",
    ]);
    expect(errors[0]!.location.file).toBe(badPath);
    expect(checker.modules.has(badPath)).toBe(false);
    expect(checker.modules.get(mainPath)?.resolve("present")).toBeDefined();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
