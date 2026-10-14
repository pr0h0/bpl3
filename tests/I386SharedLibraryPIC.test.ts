import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "optimized i686 BPL shared libraries link with read-only text",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-i686-shared-pic-"));
    try {
      for (const optimizationLevel of [0, 2, 3]) {
        const result = new Compiler({
          filePath: "pic.bpl",
          target: "i686-unknown-linux-gnu",
          resolveImports: true,
          optimizationLevel,
        }).compile(`
    @[c_export] frame checked(callback:Func<int>()) ret int {
     try {return callback();}
     catch(error:NullAccessError) {return -error.code;}
     return -99;
    }
   `);
        expect(result.success).toBe(true);
        const llvm = join(dir, "pic.ll"),
          library = join(dir, "libpic.so");
        writeFileSync(llvm, result.output!);
        // No libc/startup objects or multilib headers are needed for this link.
        // Runtime symbols remain unresolved until a host loads the library.
        const linked = spawnSync(
          "clang",
          [
            "--target=i686-unknown-linux-gnu",
            `-O${optimizationLevel}`,
            "-fPIC",
            "-shared",
            "-nostdlib",
            "-Wl,-z,text",
            llvm,
            "-o",
            library,
          ],
          { encoding: "utf8", timeout: 30000 },
        );
        if (linked.status !== 0) throw new Error(linked.stderr);
        expect(linked.stderr).toBe("");
        const dynamic = spawnSync("readelf", ["-d", library], {
          encoding: "utf8",
          timeout: 10000,
        });
        expect(dynamic.status).toBe(0);
        expect(dynamic.stdout).not.toContain("TEXTREL");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
