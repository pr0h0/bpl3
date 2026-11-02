import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { fixUnusedImports } from "../compiler/linter/LintFixes";

function fix(source: string): string | undefined {
  return fixUnusedImports(new Parser(source, "fix.bpl").parse(), source);
}

test("removes unused names and whole unused imports", () => {
  expect(
    fix(`import printf, free, malloc from "std/c.bpl";
import [Array], [Map] from "std";
import [Regex] from "std/regex.bpl";
import * as shapes from "./shapes.bpl";
import puts as say from "std/c.bpl";

frame main() ret int {
    local a: Array<int> = Array<int>.new(0);
    printf("%d\\n", a.len());
    a.destroy();
    return 0;
}
`),
  ).toBe(`import printf from "std/c.bpl";
import [Array] from "std";

frame main() ret int {
    local a: Array<int> = Array<int>.new(0);
    printf("%d\\n", a.len());
    a.destroy();
    return 0;
}
`);
});

test("keeps aliases and wrapped constants that are used, and CRLF lines", () => {
  expect(
    fix(
      'import [TypeInfo], {TYPE_KIND_ENUM}, {TYPE_KIND_POINTER} from "std/reflection.bpl";\r\nimport printf as say, puts from "std/c.bpl";\r\n\r\nframe main() ret int {\r\n    say("%d\\n", TYPE_KIND_ENUM);\r\n    return 0;\r\n}\r\n',
    ),
  ).toBe(
    'import {TYPE_KIND_ENUM} from "std/reflection.bpl";\r\nimport printf as say from "std/c.bpl";\r\n\r\nframe main() ret int {\r\n    say("%d\\n", TYPE_KIND_ENUM);\r\n    return 0;\r\n}\r\n',
  );
});

test("returns undefined when every import is used, and leaves import * alone", () => {
  expect(
    fix(
      'import printf from "std/c.bpl";\nimport "std/c.bpl";\n\nframe main() ret int {\n    printf("x\\n");\n    return 0;\n}\n',
    ),
  ).toBeUndefined();
});

test("bpl lint --fix rewrites the file unless L002 is disabled", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-lint-fix-"));
  try {
    const source =
      'import printf, free from "std/c.bpl";\n\nframe main() ret int {\n    printf("hi\\n");\n    return 0;\n}\n';
    const fixedFile = join(directory, "fixed.bpl");
    const keptFile = join(directory, "kept.bpl");
    writeFileSync(fixedFile, source);
    writeFileSync(keptFile, source);
    const run = (args: string[]) =>
      Bun.spawnSync(
        [process.execPath, resolve("index.ts"), "lint", "--json", ...args],
        { cwd: process.cwd(), env: { ...process.env, NO_COLOR: "1" } },
      );
    const fixed = run(["--fix", fixedFile]);
    expect(fixed.exitCode).toBe(0);
    expect(readFileSync(fixedFile, "utf8")).toStartWith(
      'import printf from "std/c.bpl";\n',
    );
    const kept = run(["--fix", "--disable", "L002", keptFile]);
    expect(kept.exitCode).toBe(0);
    expect(readFileSync(keptFile, "utf8")).toBe(source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);
