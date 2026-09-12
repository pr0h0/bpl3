import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
test("UUID v4 uses fresh entropy, preserves version/variant bits, and round-trips", () => {
  const source = `
 import [UUID] from "std/uuid.bpl";
 import printf, free from "std/c.bpl";
 frame main() ret int {
   if (UUID.tryV4(nullptr)) { return 1; }
   loop (local i:int = 0; i < 128; i = i + 1) {
     local id:UUID = UUID.v4();
     if (id.version() != 4 || id.variant() != 1) { return 2; }
     local text:string = id.toString();
     local copy:UUID = UUID.fromString(text);
     if (copy.equals(&id) == false) { return 3; }
     printf("%s\\n", text); free(cast<*void>(text));
   }
   return 0;
 }`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    const ids = result.stdout.trim().split("\n");
    expect(ids).toHaveLength(128);
    expect(new Set(ids).size).toBe(128);
    for (const id of ids)
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
  }
}, 60000);

test("UUID entropy failures preserve output and make v4 throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-uuid-failure-"));
  try {
    const shim = join(dir, "entropy.c");
    const object = join(dir, "entropy.o");
    const source = join(dir, "main.bpl");
    writeFileSync(
      shim,
      "#include <stddef.h>\n#include <string.h>\nint getentropy(void *out, size_t n) { memset(out, 0xab, n); return -1; }\n",
    );
    const build = spawnSync("clang", ["-c", shim, "-o", object], {
      encoding: "utf8",
    });
    expect({ status: build.status, stderr: build.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    writeFileSync(
      source,
      `
      import [UUID] from "std/uuid.bpl";
      frame main() ret int {
        local id:UUID = UUID.nil();
        if (UUID.tryV4(&id) || id.isNil() == false) { return 1; }
        try { UUID.v4(); }
        catch (error:string) { return 0; }
        return 2;
      }
    `,
    );
    for (const opt of [0, 3]) {
      const result = spawnSync(
        process.execPath,
        [
          resolve(import.meta.dir, "../index.ts"),
          "run",
          source,
          "-O",
          String(opt),
          "--object",
          object,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      expect({
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      }).toEqual({ status: 0, stdout: "", stderr: "" });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
