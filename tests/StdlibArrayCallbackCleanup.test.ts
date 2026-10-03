import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Array map and filter release result buffers when callbacks throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-array-callback-cleanup-"));
  try {
    const source = readFileSync(resolve("lib/array.bpl"), "utf8")
      .replace('"./option.bpl"', '"std/option.bpl"')
      .replace(/\bmalloc\b/g, "arrayTestAllocate")
      .replace(/\bfree\b/g, "arrayTestFree")
      .replace("extern arrayTestAllocate(size: long) ret *void;", `
        extern malloc(size: long) ret *void;
        global arrayTestLive: int = 0;
        export arrayTestBalance;
        frame arrayTestBalance() ret int { return arrayTestLive; }
        frame arrayTestAllocate(size: long) ret *void {
          local buffer: *void = malloc(size);
          if (buffer != nullptr) { arrayTestLive = arrayTestLive + 1; }
          return buffer;
        }`)
      .replace("extern arrayTestFree(ptr: *void) ret void;", `
        extern free(ptr: *void) ret void;
        frame arrayTestFree(ptr: *void) {
          if (ptr != nullptr) { arrayTestLive = arrayTestLive - 1; }
          free(ptr);
        }`);
    const module = join(dir, "array.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "array-callback-result-cleanup",
      validateLlvm: true,
      source: `
        import [Array], arrayTestBalance from "${module}";
        frame main() ret int {
          local values: Array<int> = Array<int>.new(4);
          values.push(1); values.push(2); values.push(3);
          local mappedFailure: bool = false;
          try {
            values.map<int>(|value: int, index: int| ret int {
              if (index == 1) { throw 41; }
              return value * 2;
            });
          } catch (error: int) { mappedFailure = error == 41; }
          if (!mappedFailure || arrayTestBalance() != 1) { return 1; }
          local filteredFailure: bool = false;
          try {
            values.filter(|value: int, index: int| ret bool {
              if (index == 1) { throw "predicate failed"; }
              return value > 0;
            });
          } catch (error: string) { filteredFailure = error != nullptr; }
          if (!filteredFailure || arrayTestBalance() != 1) { return 2; }
          local mapped: Array<int> = values.map<int>(|value: int, _: int| ret int { return value * 2; });
          local filtered: Array<int> = values.filter(|value: int, _: int| ret bool { return value % 2 == 1; });
          if (mapped.len() != 3 || filtered.len() != 2 || values.len() != 3) { return 3; }
          loop (local i: int = 0; i < 3; i = i + 1) {
            if (values.get(i) != i + 1 || mapped.get(i) != (i + 1) * 2) { return 4; }
          }
          if (filtered.get(0) != 1 || filtered.get(1) != 3) { return 5; }
          mapped.destroy(); filtered.destroy(); values.destroy();
          if (arrayTestBalance() != 0) { return 6; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
