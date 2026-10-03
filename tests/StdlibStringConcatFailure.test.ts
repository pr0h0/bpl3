import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("String concatenation checks sizes and releases temporaries when allocation fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-string-concat-"));
  try {
    const source = readFileSync(resolve("lib/string.bpl"), "utf8")
      .replace(/\bmalloc\b/g, "concatTestAllocate")
      .replace(/\bfree\b/g, "concatTestFree")
      .replace("extern concatTestAllocate(size: long) ret string;", `
        extern malloc(size: long) ret string;
        global concatTestLive: int = 0;
        export concatTestBalance;
        frame concatTestBalance() ret int { return concatTestLive; }
        frame concatTestAllocate(size: long) ret string {
          if (size <= 0) { throw "wrapped allocation size"; }
          if (size == 9 || size > 1000) { return nullptr; }
          local buffer: string = malloc(size);
          if (buffer != nullptr) { concatTestLive = concatTestLive + 1; }
          return buffer;
        }`)
      .replace("extern concatTestFree(ptr: string) ret void;", `
        extern free(ptr: string) ret void;
        frame concatTestFree(ptr: string) {
          if (ptr != nullptr) { concatTestLive = concatTestLive - 1; }
          free(ptr);
        }`);
    const module = join(dir, "string.bpl");
    writeFileSync(module, source);
    const operations = [
      'left.__add__(right)', 'left.__lshift__(right)',
      'left.__add__("side")', 'left.__lshift__("side")',
    ];
    expectCorrectnessSuite([{
      name: "string-concat-failures",
      validateLlvm: true,
      source: `
        import [String], concatTestBalance from "${module}";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local left: String = String.new("left");
          local right: String = String.new("side");
          ${operations.map((op, i) => `
            local caught${i}: bool = false;
            try { ${op}; }
            catch (error: string) { caught${i} = strcmp(error, "String concatenation allocation failed") == 0; }
            if (!caught${i}) { return 1; }
            if (concatTestBalance() != 2) { return 2; }
            if (left.length != 4 || strcmp(left.data, "left") != 0) { return 3; }
          `).join("\n")}
          # Synthetic lengths isolate the arithmetic; no large buffer is read.
          right.length = 2147483643;
          local caught: bool = false;
          try { left.__add__(right); }
          catch (error: string) { caught = strcmp(error, "String concatenation result too large") == 0; }
          if (!caught) { return 4; }
          right.length = 2147483647;
          caught = false;
          try { left.__lshift__(right); }
          catch (error: string) { caught = strcmp(error, "String concatenation result too large") == 0; }
          if (!caught || left.length != 4) { return 5; }
          right.length = 4;
          left.destroy();
          right.destroy();
          if (concatTestBalance() != 0) { return 6; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
