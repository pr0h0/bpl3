import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("String replacements preserve wide lengths and handle failed allocations", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-string-replacement-bounds-"));
  try {
    const source = readFileSync(resolve("lib/string.bpl"), "utf8")
      .replace(/\bstrlen\b/g, "replacementTestLength")
      .replace("extern replacementTestLength(s: string) ret long;", `
        extern strlen(s: string) ret long;
        frame replacementTestLength(s: string) ret long {
          if (strcmp(s, "n") == 0) { return cast<long>(4294967297); }
          if (strcmp(s, "huge") == 0) { return cast<long>(4294967296); }
          if (strcmp(s, "limit") == 0) { return cast<long>(2147483646); }
          return strlen(s);
        }`)
      .replace(/\bmalloc\b/g, "replacementTestAllocate")
      .replace("extern replacementTestAllocate(size: long) ret string;", `
        extern malloc(size: long) ret string;
        global replacementTestShouldFail: bool = false;
        export replacementTestFail;
        frame replacementTestFail(fail: bool) { replacementTestShouldFail = fail; }
        frame replacementTestAllocate(size: long) ret string {
          if (replacementTestShouldFail || size > 1000) { return nullptr; }
          return malloc(size);
        }`);
    const module = join(dir, "string.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "string-replacement-bounds",
      validateLlvm: true,
      source: `
        import [String], replacementTestFail from "${module}";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local text: String = String.new("needle");
          defer { text.destroy(); }
          ${["replace", "replaceAll"].map((method, i) => `
            local unchanged${i}: String = text.${method}("n", "x");
            if (strcmp(unchanged${i}.data, "needle") != 0) { return 1; }
            unchanged${i}.destroy();
            local absent${i}: String = text.${method}("absent", "huge");
            if (strcmp(absent${i}.data, "needle") != 0) { return 2; }
            absent${i}.destroy();
            ${["huge", "limit"].map((value, j) => `
              local large${i}_${j}: bool = false;
              try { text.${method}("e", "${value}"); }
              catch (error: string) { large${i}_${j} = strcmp(error, "String.${method} result too large") == 0; }
              if (!large${i}_${j}) { return 3; }
            `).join("\n")}
            replacementTestFail(true);
            local failed${i}: bool = false;
            try { text.${method}("e", "o"); }
            catch (error: string) { failed${i} = strcmp(error, "String.${method} allocation failed") == 0; }
            replacementTestFail(false);
            if (!failed${i} || text.length != 6 || strcmp(text.data, "needle") != 0) { return 4; }
          `).join("\n")}
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
