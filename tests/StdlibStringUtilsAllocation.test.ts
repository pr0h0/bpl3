import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("StringUtils transformations check lengths and allocation failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-string-utils-allocation-"));
  try {
    const source = readFileSync(resolve("lib/string_utils.bpl"), "utf8")
      .replace(/\bstrlen\b/g, "utilsTestLength")
      .replace("extern utilsTestLength(s: string) ret long;", `
        extern strlen(s: string) ret long;
        frame utilsTestLength(s: string) ret long {
          if (s[0] == 'X') { return cast<long>(4294967296); }
          if (s[0] == 'Y') { return cast<long>(2147483647); }
          return strlen(s);
        }`)
      .replace(/\bmalloc\b/g, "utilsTestAllocate")
      .replace("extern utilsTestAllocate(size: long) ret string;", `
        extern malloc(size: long) ret string;
        global utilsTestShouldFail: bool = false;
        export utilsTestFail;
        frame utilsTestFail(fail: bool) { utilsTestShouldFail = fail; }
        frame utilsTestAllocate(size: long) ret string {
          if (utilsTestShouldFail || size > 1000) { return nullptr; }
          return malloc(size);
        }`);
    const module = join(dir, "string_utils.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "string-utils-allocation",
      validateLlvm: true,
      source: `
        import [StringUtils], utilsTestFail from "${module}";
        import [String] from "std/string.bpl";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          utilsTestFail(true);
          ${["trim", "replaceChar"].map((method, i) => `
            local failed${i}: bool = false;
            try { StringUtils.${method}(" a b "${method === "replaceChar" ? ", 'a', 'x'" : ""}); }
            catch (error: string) { failed${i} = strcmp(error, "StringUtils.${method} allocation failed") == 0; }
            if (!failed${i}) { return 1; }
            ${["X", "Y"].map((text, j) => `
              local large${i}_${j}: bool = false;
              try { StringUtils.${method}("${text}"${method === "replaceChar" ? ", 'a', 'x'" : ""}); }
              catch (error: string) { large${i}_${j} = strcmp(error, "StringUtils.${method} input too large") == 0; }
              if (!large${i}_${j}) { return 2; }
            `).join("\n")}
          `).join("\n")}
          utilsTestFail(false);
          local trimmed: String = StringUtils.trim("  a b  ");
          local replaced: String = StringUtils.replaceChar(" a b ", 'a', 'x');
          if (trimmed.length != 3 || strcmp(trimmed.data, "a b") != 0) { return 3; }
          if (replaced.length != 5 || strcmp(replaced.data, " x b ") != 0) { return 4; }
          trimmed.destroy();
          replaced.destroy();
          local empty: String = StringUtils.trim("   ");
          if (empty.length != 0 || strcmp(empty.data, "") != 0) { return 5; }
          empty.destroy();
          local truncated: String = StringUtils.replaceChar("before after", ' ', cast<char>(0));
          if (truncated.length != 6 || strcmp(truncated.data, "before") != 0) { return 6; }
          truncated.destroy();
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
