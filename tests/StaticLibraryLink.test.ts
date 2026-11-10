import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const archiver = ["ar", "llvm-ar"].find(
  (command) => spawnSync(command, ["--version"]).status === 0,
);

// A linker takes from a static archive only what earlier inputs need, so
// `-l` libraries must follow the program's own code on the clang command line.
test.skipIf(process.platform === "win32" || !archiver)(
  "-l links a static archive that the program needs",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-static-lib-"));
    try {
      writeFileSync(
        join(directory, "helper.c"),
        "int helperC(void) { return 41; }\n",
      );
      writeFileSync(
        join(directory, "main.bpl"),
        "extern helperC() ret int;\nframe main() ret int {\n    return helperC();\n}\n",
      );
      const object = join(directory, "helper.o");
      expect(
        spawnSync(process.env.CC || "clang", [
          "-c",
          "-fPIC",
          join(directory, "helper.c"),
          "-o",
          object,
        ]).status,
      ).toBe(0);
      expect(
        spawnSync(archiver!, ["rcs", join(directory, "libhelper.a"), object])
          .status,
      ).toBe(0);
      const binary = join(directory, "main");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          join(directory, "main.bpl"),
          "-l",
          "helper",
          "-L",
          directory,
          "-o",
          binary,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.stdout + build.stderr).not.toContain("undefined reference");
      expect(build.status).toBe(0);
      expect(spawnSync(binary).status).toBe(41);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  90000,
);
