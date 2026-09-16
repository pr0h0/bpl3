import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { runSpecModules } from "./helpers/languageSpec";

const values = `export value; global const value:int=42;
export items; global const items:int[2]=[1,2];
struct Pair {x:int} export pair; global const pair:Pair=Pair{x:7};
export pointer; global const pointer:*int=nullptr;`;
const bridge =
  'import "./values.bpl"; export value; export items; export pair; export pointer;';

// spec: R-DECL-7, R-MOD-2, R-MOD-6, R-MOD-7
test("imports and re-exports retain constant mutation and address protection", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-import-constants-"));
  try {
    writeFileSync(join(directory, "values.bpl"), values);
    writeFileSync(join(directory, "bridge.bpl"), bridge);
    const cases: { file: string; code: string }[] = [];
    for (const module of ["values", "bridge"]) {
      for (const namespace of [false, true]) {
        const prefix = namespace ? "constants." : "";
        const imports = namespace
          ? `import * as constants from "./${module}.bpl";`
          : `import "./${module}.bpl";`;
        for (const [index, statement] of [
          `${prefix}value=0;`,
          `${prefix}value+=1;`,
          `${prefix}value++;`,
          `${prefix}items[0]=0;`,
          `${prefix}pair.x=0;`,
          `${prefix}pointer=nullptr;`,
          `local p:*int=&${prefix}value;return *p;`,
          `local p:*int=&${prefix}items[0];return *p;`,
          `local p:*int=&${prefix}pair.x;return *p;`,
        ].entries()) {
          const file = `${module}-${namespace}-${index}.bpl`;
          writeFileSync(
            join(directory, file),
            `${imports}\nframe main() ret int {${statement}${index >= 6 ? "" : "return 0;"}}`,
          );
          cases.push({
            file,
            code:
              index >= 6
                ? "BPL_ADDRESS_OF_CONSTANT"
                : "BPL_ASSIGNMENT_TARGET_CONSTANT",
          });
        }
      }
    }
    writeFileSync(
      join(directory, "alias.bpl"),
      'import value as renamed from "./bridge.bpl"; frame main() ret int {renamed=0;return renamed;}',
    );
    cases.push({ file: "alias.bpl", code: "BPL_ASSIGNMENT_TARGET_CONSTANT" });
    const result = spawnSync(
      process.execPath,
      [
        resolve("index.ts"),
        "check",
        ...cases.map((entry) => entry.file),
        "--json",
      ],
      { cwd: directory, encoding: "utf8", timeout: 60000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    for (const entry of cases) {
      const file = report.files.find(
        (file: { file: string }) => file.file === entry.file,
      );
      expect(
        file?.diagnostics?.some(
          (diagnostic: { code: string }) => diagnostic.code === entry.code,
        ),
        JSON.stringify(file),
      ).toBe(true);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// spec: R-DECL-7
test("module builds reject writes to namespace constants", () => {
  const result = runSpecModules(
    {
      "values.bpl": "export value;global const value:int=42;",
      "main.bpl":
        'import * as constants from "./values.bpl"; frame main() ret int {constants.value=0;return 0;}',
    },
    "main.bpl",
    0,
  );
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Cannot assign to constant 'value'");
});

// spec: R-DECL-7, R-DECL-8
test("imported constants remain readable and constant pointers allow pointee updates at O0/O3", () => {
  for (const level of [0, 3] as const) {
    const result = runSpecModules(
      {
        "values.bpl":
          "export value;global const value:int=42;export pointer;global const pointer:*int=nullptr;",
        "bridge.bpl":
          'import value, pointer from "./values.bpl"; export value;export pointer;',
        "main.bpl": `import value as renamed from "./bridge.bpl";
import * as constants from "./bridge.bpl";
frame main() ret int {
 local value:int=5;local const pointer:*int=&value;*pointer=8;
 if(renamed!=42 || constants.value!=42)return 1;
 if(constants.pointer!=nullptr)return 2;
 return value-8;
}`,
      },
      "main.bpl",
      level,
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  }
});
