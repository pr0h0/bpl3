import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Set algebra releases partial results when custom hashers throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-set-cleanup-"));
  try {
    const allocator = join(dir, "allocator.bpl");
    writeFileSync(allocator, `
      export testAllocate; export testFree; export testBalance;
      extern malloc(size: long) ret *void;
      extern free(ptr: *void) ret void;
      global live: int = 0;
      frame testBalance() ret int { return live; }
      frame testAllocate(size: long) ret *void {
        local ptr: *void = malloc(size);
        if (ptr != nullptr) { live = live + 1; }
        return ptr;
      }
      frame testFree(ptr: *void) {
        if (ptr != nullptr) { live = live - 1; }
        free(ptr);
      }
    `);
    for (const name of ["array", "map", "set"]) {
      const source = readFileSync(resolve(`lib/${name}.bpl`), "utf8")
        .replace('"./option.bpl"', '"std/option.bpl"')
        .replace('"std/array.bpl"', `"${join(dir, "array.bpl")}"`)
        .replace('"std/map.bpl"', `"${join(dir, "map.bpl")}"`)
        .replace(/\bmalloc\b/g, "testAllocate")
        .replace(/\bfree\b/g, "testFree")
        .replace("extern testAllocate(size: long) ret *void;", `import testAllocate, testFree from "${allocator}";`)
        .replace("extern testFree(ptr: *void) ret void;", "");
      writeFileSync(join(dir, `${name}.bpl`), source);
    }
    expectCorrectnessSuite([{
      name: "set-algebra-callback-cleanup",
      validateLlvm: true,
      source: `
        import [Set] from "${join(dir, "set.bpl")}";
        import testBalance from "${allocator}";
        global calls: int = 0;
        global failAt: int = 0;
        frame hash(key: *int) ret u64 {
          calls = calls + 1;
          if (calls == failAt) { throw 42; }
          return cast<u64>(*key);
        }
        frame equal(a: *int, b: *int) ret bool { return *a == *b; }
        frame main() ret int {
          local left: Set<int> = Set<int>.new(16, hash, equal);
          local right: Set<int> = Set<int>.new(16, hash, equal);
          left.add(1); left.add(2); left.add(3);
          right.add(1); right.add(3); right.add(4);
          local baseline: int = testBalance();
          ${["union", "difference", "intersection"].map((method, i) => `
            # Each failure point must release even an already populated result.
            loop (local point: int = 1; point <= 5; point = point + 1) {
              calls = 0; failAt = point;
              local caught: bool = false;
              try { left.${method}(&right); }
              catch (error: int) { caught = error == 42; }
              failAt = 0;
              if (!caught || testBalance() != baseline) { return ${i + 1}; }
            }
            local result${i}: Set<int> = left.${method}(&right);
            if (result${i}.size() != ${[4, 1, 2][i]}) { return 4; }
            result${i}.destroy();
          `).join("\n")}
          if (left.size() != 3 || right.size() != 3 || !left.has(2) || !right.has(4)) { return 5; }
          left.destroy(); right.destroy();
          if (testBalance() != 0) { return 6; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
