import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const source of [
  "frame bad()ret int[]{return [1,2];}",
  "frame bad()ret *int{return [1,2];}",
  "frame bad()ret int[]{local a:int[2]=[1,2];return a;}",
  "frame bad(a:int[2])ret int[]{return a;}",
  "frame bad()ret int[]{return (([1,2]));}",
  "frame bad()ret int[]{return true?[1,2]:[3,4];}",
  "frame bad()ret u8[]{return [1,2];}",
  "type View=int[];frame bad()ret View{return [1,2];}",
]) {
  test(`rejects returned array views of frame-local temporary storage: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        source,
        "array-return.bpl",
        lexWithGrammar(source, "array-return.bpl"),
      ).parse(),
    );
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_RETURN_ARRAY_VIEW_ESCAPES"),
    ).toBe(true);
  });
}

test("fixed-array values and caller-owned views can still return at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "return-safe-array-values",
      validateLlvm: true,
      source: `import printf from "std/c.bpl";
      frame values()ret int[2]{return [11,12];}
      frame borrow(v:int[])ret int[]{return v;}
      frame pointer(v:*int)ret *int{return v;}
      frame main()ret int{
        local a:int[2]=values();
        local view:int[]=borrow(a);
        printf("%d %d\\n",view[0],*pointer(&a[1]));return 0;
      }`,
      expectedStdout: "11 12\n",
    },
  ]);
}, 60000);

test("CLI JSON reports the array-view lifetime diagnostic", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-return-array-json-"));
  try {
    const file = join(root, "main.bpl");
    writeFileSync(
      file,
      "frame bad()ret int[]{return [1,2];}frame main(){bad();}",
    );
    const result = spawnSync(
      "bun",
      [resolve(__dirname, "../index.ts"), "check", file, "--json"],
      { encoding: "utf8", timeout: 20000 },
    );
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(false);
    expect(report.errorCount).toBe(1);
    expect(report.files[0].diagnostics[0].code).toBe(
      "BPL_RETURN_ARRAY_VIEW_ESCAPES",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
