import { expect, test } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  statSync,
  existsSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
test("FS.mkdirp preserves absolute roots, handles existing directories, and rejects file collisions", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-mkdirp-"));
  try {
    writeFileSync(join(dir, "file"), "keep");
    symlinkSync(dir, join(dir, "alias"));
    const cases: [string | null, boolean][] = [
      [join(dir, "absolute/a/b"), true],
      [join(dir, "absolute/a/b"), true],
      ["relative/a//b/", true],
      ["relative/a/../c", true],
      [join(dir, "alias/via-symlink"), true],
      [join(dir, "file/child"), false],
      [join(dir, "file"), false],
      ["", false],
      [null, false],
      ["/", true],
      [".", true],
    ];
    const source = `import [FS] from "std/fs.bpl"; extern chdir(path:string) ret int; frame main() ret int {
   if(chdir(${JSON.stringify(dir)}) != 0) {return 99;}
   ${cases.map(([path, expected], i) => `if(FS.mkdirp(${path === null ? "nullptr" : JSON.stringify(path)}) != ${expected}) {return ${i + 1};}`).join("\n")}
   return 0;
  }`;
    for (const opt of [0, 3] as const) {
      expect(runBplAtOptimization(source, opt)).toMatchObject({
        exitCode: 0,
        stdout: "",
        stderr: "",
      });
      for (const path of [
        "absolute/a/b",
        "relative/a/b",
        "relative/c",
        "via-symlink",
      ])
        expect(statSync(join(dir, path)).isDirectory()).toBe(true);
      expect(statSync(join(dir, "file")).isFile()).toBe(true);
      expect(existsSync(join(dir, "file/child"))).toBe(false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
