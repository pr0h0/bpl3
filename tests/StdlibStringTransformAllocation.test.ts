import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const operations = [
  ["fromInt", "String.fromInt(-42)", "-42"],
  ["fromAddress", "String.fromAddress(255)", "0xff"],
  ["substring", "text.substring(1, 1)", "B"],
  ["toUpper", "text.toUpper()", "ABC"],
  ["toLower", "text.toLower()", "abc"],
  ["padLeft", "text.padLeft(5, '_')", "__aBc"],
  ["padRight", "text.padRight(5, '_')", "aBc__"],
  ["reverse", "text.reverse()", "cBa"],
];
test("String transformations report allocation failure and retain their source", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-string-transform-allocation-"));
  try {
    const source = readFileSync(resolve("lib/string.bpl"), "utf8")
      .replace(/\bmalloc\b/g, "transformTestAllocate")
      .replace("extern transformTestAllocate(size: long) ret string;", `
        extern malloc(size: long) ret string;
        global transformTestShouldFail: bool = false;
        export transformTestFail;
        frame transformTestFail(fail: bool) { transformTestShouldFail = fail; }
        frame transformTestAllocate(size: long) ret string {
          if (transformTestShouldFail || size > 1000) { return nullptr; }
          if (size <= 0) { throw "wrapped allocation size"; }
          return malloc(size);
        }`);
    const module = join(dir, "string.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "string-transform-allocation",
      validateLlvm: true,
      source: `
        import [String], transformTestFail from "${module}";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local text: String = String.new("aBc");
          defer { text.destroy(); }
          transformTestFail(true);
          ${operations.map(([method, expression], i) => `
            local caught${i}: bool = false;
            try { ${expression}; }
            catch (error: string) { caught${i} = strcmp(error, "String.${method} allocation failed") == 0; }
            if (!caught${i} || text.length != 3 || strcmp(text.data, "aBc") != 0) { return 1; }
          `).join("\n")}
          ${["padLeft", "padRight"].map((method, i) => `
            local oversized${i}: bool = false;
            try { text.${method}(2147483647, '_'); }
            catch (error: string) { oversized${i} = strcmp(error, "String.${method} result too large") == 0; }
            if (!oversized${i}) { return 2; }
          `).join("\n")}
          transformTestFail(false);
          ${operations.map(([, expression, expected], i) => `
            local result${i}: String = ${expression};
            if (strcmp(result${i}.data, "${expected}") != 0 || result${i}.length != ${expected!.length}) { return 3; }
            result${i}.destroy();
          `).join("\n")}
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
