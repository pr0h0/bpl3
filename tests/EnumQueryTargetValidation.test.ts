import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

for (const syntax of ["match", "is"] as const) {
  for (const generic of [false, true]) {
    for (const variant of ["Missing", "Red"]) {
      test(`${syntax} validates ${generic ? "generic" : "ordinary"} enum variant ${variant}`, () => {
        const target = `Color.${variant}`;
        const query =
          syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
        const checker = new TypeChecker({ collectAllErrors: true });
        checker.checkProgram(
          new Parser(
            `enum Color${generic ? "<T>" : ""}{Red,Blue,}frame main(){local value:Color${generic ? "<int>" : ""}=Color${generic ? "<int>" : ""}.Red;local ok:bool=${query};ok;}`,
            "enum-query.bpl",
          ).parse(),
        );
        expect(checker.getErrors().map((error) => error.code)).toEqual(
          variant === "Missing" ? ["BPL_TYPE_QUERY_TYPE_NOT_FOUND"] : [],
        );
        if (variant === "Missing")
          expect(checker.getErrors()[0]?.message).toContain("Missing");
      });
    }
  }
  for (const variant of ["Missing", "Red"]) {
    test(`${syntax} validates qualified enum variant ${variant}`, () => {
      const root = mkdtempSync(join(tmpdir(), "bpl-enum-query-"));
      try {
        const module = join(root, "colors.bpl");
        writeFileSync(module, "enum Color{Red,Blue,}export Color;");
        const target = `colors.Color.${variant}`;
        const query =
          syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
        const checker = new TypeChecker({ collectAllErrors: true });
        checker.checkProgram(
          new Parser(
            `import * as colors from ${JSON.stringify(module)};frame main(){local value:colors.Color=colors.Color.Red;local ok:bool=${query};ok;}`,
            join(root, "main.bpl"),
          ).parse(),
        );
        expect(checker.getErrors().map((error) => error.code)).toEqual(
          variant === "Missing" ? ["BPL_TYPE_QUERY_TYPE_NOT_FOUND"] : [],
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
