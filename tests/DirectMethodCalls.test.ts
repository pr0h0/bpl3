import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// BUG-800/801: a struct nothing inherits from has one implementation of each
// method, so calls read the struct's constant vtable instead of the object's
// vtable word. Storage from malloc then works, and LLVM can inline the call.

// spec: R-STRUCT-5, R-STRUCT-7
test("calls methods of leaf structs without reading the object's vtable", () => {
  expectCorrectnessSuite([
    {
      name: "malloc-struct-method",
      validateLlvm: true,
      source: `import printf, malloc, memset, free from "std/c.bpl";
struct Cell {
    value: long,
    frame doubled(this: *Cell) ret long { return this.value * 2; }
}
struct Animal {
    legs: int,
    frame speak(this: *Animal) ret string { return "animal"; }
}
struct Dog : Animal {
    frame speak(this: *Dog) ret string { return "dog"; }
}
frame make() ret Cell { return Cell { value: 4 }; }
frame main() ret int {
    local cells: *Cell = cast<*Cell>(malloc(sizeof(Cell) * 4));
    memset(cast<*void>(cells), 0, sizeof(Cell) * 4);
    cells[1].value = 21;
    local p: *Cell = cells + 1;
    local d: Dog = Dog { legs: 4 };
    local a: *Animal = cast<*Animal>(&d);
    local plain: Animal = Animal { legs: 2 };
    local b: *Animal = &plain;
    printf("%lld %lld %s %s\\n", p.doubled(), make().doubled(), a.speak(), b.speak());
    free(cast<*void>(cells));
    return 0;
}
`,
      expectedStdout: "42 8 dog animal\n",
    },
  ]);
}, 120000);

test("bpl build reports a parse error inside an imported module where it is", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-import-error-"));
  try {
    writeFileSync(
      join(dir, "helper.bpl"),
      "frame twice(x: int) ret int {\n    local ret: int = x;\n    return ret * 2;\n}\nexport twice;\n",
    );
    writeFileSync(
      join(dir, "middle.bpl"),
      'import twice from "./helper.bpl";\nframe quad(x: int) ret int { return twice(twice(x)); }\nexport quad;\n',
    );
    writeFileSync(
      join(dir, "main.bpl"),
      'import quad from "./middle.bpl";\nframe main() ret int { return quad(1); }\n',
    );
    const build = spawnSync(
      process.execPath,
      [
        resolve("index.ts"),
        "build",
        join(dir, "main.bpl"),
        "-o",
        join(dir, "main"),
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    const output = build.stdout + build.stderr;
    expect(build.status).not.toBe(0);
    expect(output).toContain("helper.bpl:2:11");
    expect(output).toContain("'ret' is a reserved word");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);
