import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { generateCExportHeader } from "../compiler/common/CExports";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = `
  struct Box<T> {value:T,}
  type Number=int;
  extern malloc(size:long) ret *void;
  extern free(p:*void);
  @[c_export] frame make_i() ret *Box<int> {
    local p:*Box<int>=cast<*Box<int>>(malloc(sizeof(Box<int>)));
    p.value=42;return p;
  }
  @[c_export] frame make_d() ret *Box<double> {
    local p:*Box<double>=cast<*Box<double>>(malloc(sizeof(Box<double>)));
    p.value=2.5;return p;
  }
  @[c_export] frame read_i(p:*Box<int>) ret int {return p.value;}
  @[c_export] frame read_d(p:*Box<double>) ret double {return p.value;}
  @[c_export] frame alias_i(p:*Box<Number>) ret *Box<i32> {return p;}
  @[c_export] frame destroy_i(p:*Box<int>) {free(cast<*void>(p));}
  @[c_export] frame destroy_d(p:*Box<double>) {free(cast<*void>(p));}
`;

test("generic opaque C handles distinguish specializations and normalize scalar aliases", () => {
  const result = new Compiler({ filePath: "handles.bpl" }).compile(source);
  expect(result.success).toBe(true);
  const header = generateCExportHeader(result.ast!);
  expect(header.match(/^struct \w+;$/gm)?.length).toBe(2);
});

test.skipIf(process.platform !== "linux")(
  "C and C++ opaque generic handles reject mixed types and execute matching calls",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-c-handles-"));
    function run(command: string, args: string[]) {
      return spawnSync(command, args, { encoding: "utf8", timeout: 30000 });
    }
    function success(command: string, args: string[]) {
      const result = run(command, args);
      if (result.status !== 0)
        throw new Error(`${command}: ${result.stdout}\n${result.stderr}`);
    }
    try {
      writeFileSync(join(dir, "api.bpl"), source);
      writeFileSync(
        join(dir, "wrong.c"),
        '#include "api.h"\nint wrong(void) {return read_i(make_d());}\n',
      );
      for (const opt of [0, 3]) {
        success("bun", [
          resolve("index.ts"),
          "build",
          join(dir, "api.bpl"),
          "--shared",
          "--header",
          join(dir, "api.h"),
          "-O",
          String(opt),
          "-o",
          join(dir, "libapi.so"),
        ]);
        const header = readFileSync(join(dir, "api.h"), "utf8");
        const integerHandle = header.match(/struct (\w+) \*make_i\(/)![1];
        const doubleHandle = header.match(/struct (\w+) \*make_d\(/)![1];
        writeFileSync(
          join(dir, "host.c"),
          `#include "api.h"
          int main(void) {
            struct ${integerHandle} *integer = make_i();
            struct ${doubleHandle} *decimal = make_d();
            int failed = read_i(alias_i(integer)) != 42 || read_d(decimal) != 2.5;
            destroy_i(integer);
            destroy_d(decimal);
            return failed;
          }`,
        );
        for (const [compiler, language] of [
          ["clang", "c"],
          ["clang++", "c++"],
        ]) {
          const wrong = run(compiler!, [
            "-x",
            language!,
            "-Werror",
            "-fsyntax-only",
            join(dir, "wrong.c"),
          ]);
          expect(wrong.status).not.toBe(0);
          expect(wrong.stderr).toContain("read_i");
          success(compiler!, [
            "-x",
            language!,
            "-O3",
            "-Werror",
            join(dir, "host.c"),
            "-L",
            dir,
            "-lapi",
            `-Wl,-rpath,${dir}`,
            "-o",
            join(dir, "host"),
          ]);
          success(join(dir, "host"), []);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  180000,
);

for (const [left, right, count] of [
  ["int", "i32", 1],
  ["Pointer", "*int", 1],
  ["RowPointer", "*Row", 1],
  ["string", "*char", 1],
  ["int[2]", "int[3]", 2],
  ["*Row", "*int[2]", 2],
  ["Box<int>", "Box<double>", 2],
  ["Func<int>(int)", "Func<int>(long)", 2],
  ["(int,long)", "(long,int)", 2],
] as const) {
  test(`opaque handle identity: ${left} versus ${right}`, () => {
    const declarations = [
      `@[c_export] frame left(p:*Box<${left}>) ret *Box<${left}> {return p;}`,
      `@[c_export] frame right(p:*Box<${right}>) ret *Box<${right}> {return p;}`,
    ];
    const headers = [declarations, [...declarations].reverse()].map(
      (functions) => {
        const result = new Compiler({ filePath: "handles.bpl" }).compile(`
        struct Box<T> {value:T,}
        type Pointer=*int;type Row=int[2];type RowPointer=*Row;
        ${functions.join("\n")}
      `);
        if (!result.success)
          throw new Error(result.errors?.map((e) => e.message).join("\n"));
        return generateCExportHeader(result.ast!).match(/^struct \w+;$/gm);
      },
    );
    expect(headers[0]?.length).toBe(count);
    expect(headers[0]).toEqual(headers[1]);
  });
}

test("opaque handle tag collisions produce an error instead of merging types", () => {
  const base =
    "struct Box<T>{value:T,} @[c_export] frame original(p:*Box<int>) ret *Box<int>{return p;}";
  const initial = new Compiler({ filePath: "handles.bpl" }).compile(base);
  expect(initial.success).toBe(true);
  const tag = generateCExportHeader(initial.ast!).match(
    /^struct (\w+);$/m,
  )![1]!;
  const conflictingName = tag.slice("bpl_".length);
  const result = new Compiler({ filePath: "handles.bpl" }).compile(
    base +
      `
    struct ${conflictingName} {value:double,}
    @[c_export] frame conflicting(p:*${conflictingName}) ret *${conflictingName} {return p;}
  `,
  );
  expect(result.success).toBe(true);
  expect(() => generateCExportHeader(result.ast!)).toThrow(
    "Conflicting opaque C handle",
  );
});
