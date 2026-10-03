import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Map reports node allocation failure and preserves existing entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-map-allocation-"));
  try {
    const source = readFileSync(resolve("lib/map.bpl"), "utf8")
      .replace(/\bmalloc\b/g, "mapTestAllocate")
      .replace("extern mapTestAllocate(size: long) ret *void;", `
        extern malloc(size: long) ret *void;
        global mapTestShouldFail: bool = false;
        export mapTestFail;
        frame mapTestFail(fail: bool) { mapTestShouldFail = fail; }
        frame mapTestAllocate(size: long) ret *void {
          if (mapTestShouldFail) { return nullptr; }
          return malloc(size);
        }`);
    const module = join(dir, "map.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "map-node-allocation-failure",
      validateLlvm: true,
      source: `
        import [Map], mapTestFail from "${module}";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local values: Map<int, int> = Map<int, int>.new();
          loop (local i: int = 0; i < 12; i = i + 1) { values.set(i, i * 10); }
          mapTestFail(true);
          local caught: bool = false;
          try { values.set(12, 120); }
          catch (error: string) { caught = strcmp(error, "Map node allocation failed") == 0; }
          if (!caught || values.size() != 12 || values.has(12)) { return 1; }
          loop (local i: int = 0; i < 12; i = i + 1) {
            if (values.get(i).unwrap() != i * 10) { return 2; }
          }
          # Updating an existing key does not allocate a node.
          values.set(0, 99);
          if (values.get(0).unwrap() != 99 || values.size() != 12) { return 3; }
          mapTestFail(false);
          values.set(12, 120);
          if (values.size() != 13 || values.get(12).unwrap() != 120) { return 4; }
          values.destroy();
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
