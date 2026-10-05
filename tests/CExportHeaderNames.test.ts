import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { generateCExportHeader } from "../compiler/common/CExports";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function compile(source: string) {
  const result = new Compiler({ filePath: "names.bpl" }).compile(source);
  if (!result.success)
    throw new Error(result.errors?.map((error) => error.message).join("\n"));
  return result.ast!;
}

for (const name of [
  "constexpr",
  "concept",
  "alignas",
  "alignof",
  "consteval",
  "constinit",
  "co_await",
  "co_return",
  "co_yield",
  "char8_t",
  "char16_t",
  "char32_t",
  "noexcept",
  "decltype",
  "thread_local",
  "static_assert",
  "_Atomic",
  "_BitInt",
  "int32_t",
  "uint_fast64_t",
  "int_least16_t",
  "intptr_t",
  "uintmax_t",
  "INT64_C",
  "UINT32_MAX",
  "INT_FAST16_MIN",
  "INTPTR_MAX",
  "SIZE_MAX",
]) {
  test(`rejects unrepresentable C header export name ${name}`, () => {
    const ast = compile(`@[c_export] frame ${name}() ret int {return 42;}`);
    expect(() => generateCExportHeader(ast)).toThrow(
      `Cannot represent '${name}'`,
    );
  });
}

test.skipIf(spawnSync("clang", ["--version"]).status !== 0)(
  "C headers preserve contextual identifiers and prefix opaque type names before validation",
  () => {
    const ast = compile(`
      struct class { value:int, }
      @[c_export] frame read(p:*class) ret int {return p.value;}
      @[c_export] frame final() ret int {return 1;}
      @[c_export] frame override() ret int {return 2;}
      @[c_export] frame module() ret int {return 3;}
      @[c_export] frame import_name() ret int {return 4;}
      @[c_export] frame INT64_CUSTOM() ret int {return 5;}
      @[c_export] frame int32_helper() ret int {return 6;}
    `);
    const dir = mkdtempSync(join(tmpdir(), "bpl-header-names-"));
    try {
      writeFileSync(join(dir, "api.h"), generateCExportHeader(ast));
      const source = join(dir, "host.c");
      writeFileSync(
        source,
        '#include "api.h"\nint check(void) {return final()+override()+module()+import_name()+INT64_CUSTOM()+int32_helper();}\n',
      );
      for (const [language, standard] of [
        ["c", "c17"],
        ["c", "c2x"],
        ["c++", "c++17"],
        ["c++", "c++20"],
      ]) {
        const result = spawnSync(
          "clang",
          [
            "-x",
            language!,
            `-std=${standard}`,
            "-Werror",
            "-fsyntax-only",
            source,
          ],
          { encoding: "utf8", timeout: 15000 },
        );
        if (result.status !== 0) throw new Error(result.stderr);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("invalid header names preserve JSON diagnostics and existing header files", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-header-name-json-"));
  try {
    const source = join(dir, "api.bpl");
    const header = join(dir, "api.h");
    for (const name of ["concept", "INT64_C"]) {
      writeFileSync(source, `@[c_export] frame ${name}() ret int {return 42;}`);
      writeFileSync(header, "existing header\n");
      const result = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          source,
          "--shared",
          "--header",
          header,
          "-o",
          join(dir, "libapi.so"),
          "--json",
        ],
        { encoding: "utf8", timeout: 15000 },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.stringify(JSON.parse(result.stdout))).toContain(
        `Cannot represent '${name}'`,
      );
      expect(readFileSync(header, "utf8")).toBe("existing header\n");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 45000);
