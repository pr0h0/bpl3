import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

test("clean preserves unrelated outputs and generic build directories", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-clean-ownership-"));
  try {
    for (const dir of ["build", "dist"]) mkdirSync(join(directory, dir));
    for (const file of [
      "main",
      "manual.ll",
      "native.o",
      "other.out",
      "build/keep.txt",
      "dist/main",
    ]) {
      writeFileSync(join(directory, file), "keep");
    }
    writeFileSync(join(directory, "program.bpl"), "frame main(){}");
    for (const extension of ["", ".ll", ".o", ".exe", ".out"]) {
      writeFileSync(join(directory, `program${extension}`), "generated");
    }
    // A linked source is not evidence that an output belongs to this directory.
    symlinkSync(join(directory, "program.bpl"), join(directory, "manual.bpl"));
    const run = (dry: boolean) =>
      spawnSync(
        process.execPath,
        [resolve("index.ts"), "clean", "--json", ...(dry ? ["--dry-run"] : [])],
        {
          cwd: directory,
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
    const preview = run(true);
    expect(preview.status, preview.stdout + preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout).count).toBe(4);
    expect(existsSync(join(directory, "program.ll"))).toBe(true);
    const clean = run(false);
    expect(clean.status, clean.stdout + clean.stderr).toBe(0);
    expect(JSON.parse(clean.stdout).entries).toEqual(
      JSON.parse(preview.stdout).entries,
    );
    for (const file of [
      "main",
      "manual.ll",
      "native.o",
      "other.out",
      "build/keep.txt",
      "dist/main",
    ]) {
      expect(readFileSync(join(directory, file), "utf8")).toBe("keep");
    }
    expect(existsSync(join(directory, "program.bpl"))).toBe(true);
    expect(readFileSync(join(directory, "program"), "utf8")).toBe("generated");
    for (const extension of [".ll", ".o", ".exe", ".out"]) {
      expect(existsSync(join(directory, `program${extension}`))).toBe(false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
