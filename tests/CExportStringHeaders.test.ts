import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { generateCExportHeader } from "../compiler/common/CExports";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("C string spelling survives aliases, callbacks, and array pointers", () => {
  const result = new Compiler({ filePath: "strings.bpl" }).compile(`
    type Text=string;type Texts=Text[2];type Callback<T>=Func<T>(T);
    @[c_export] frame echo(text:Text) ret string {return text;}
    @[c_export] frame invoke(f:Callback<string>,text:string) ret Text {return f(text);}
    @[c_export] frame bytes(data:*char) ret *char {return data;}
    @[c_export] frame slots(values:*Texts) ret *Texts {return values;}
  `);
  expect(result.success).toBe(true);
  const header = generateCExportHeader(result.ast!);
  expect(header).toMatch(/char\s*\*\s*echo\(char\s*\*\s*p0\)/);
  expect(header).toMatch(/int8_t\s*\*bytes\(int8_t\s*\*p0\)/);
  const dir = mkdtempSync(join(tmpdir(), "bpl-string-headers-"));
  try {
    writeFileSync(join(dir, "api.h"), header);
    writeFileSync(
      join(dir, "host.c"),
      `
      #include "api.h"
      static char *identity(char *text) {return text;}
      int main(void) {
        char text[]="hello";
        char *values[2]={text,text};
        int8_t byte=1;
        if(echo(text)!=text || invoke(identity,text)!=text) return 1;
        if(bytes(&byte)!=&byte || slots(&values)!=&values) return 2;
        return 0;
      }
    `,
    );
    for (const [compiler, language] of [
      ["clang", "c"],
      ["clang++", "c++"],
    ] as const) {
      const compiled = spawnSync(
        compiler,
        [
          "-x",
          language,
          "-Wall",
          "-Wextra",
          "-Werror",
          "-fsyntax-only",
          join(dir, "host.c"),
        ],
        { encoding: "utf8", timeout: 15000 },
      );
      if (compiled.status !== 0)
        throw new Error(`${compiler}: ${compiled.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
