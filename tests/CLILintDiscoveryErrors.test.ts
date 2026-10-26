import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

test("lint discovery reports no inputs distinctly from processing and missing-file errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-lint-empty-"));
  const run = (files: string[], json = true) =>
    Bun.spawnSync(
      [
        process.execPath,
        resolve("index.ts"),
        "lint",
        ...(json ? ["--json"] : []),
        ...files,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 15000,
      },
    );
  try {
    const empty = join(directory, "empty");
    const ignored = join(directory, "ignored");
    const dependencies = join(directory, "dependencies");
    const invalid = join(directory, "invalid");
    for (const path of [empty, ignored, dependencies, invalid]) mkdirSync(path);
    writeFileSync(join(ignored, "main.bpl"), "frame main() {}");
    writeFileSync(join(ignored, "module.x"), "frame helper() {}");
    writeFileSync(join(ignored, ".bplignore"), "*.bpl\n*.x\n");
    for (const path of ["node_modules", "bpl_modules", ".hidden"]) {
      mkdirSync(join(dependencies, path));
      writeFileSync(join(dependencies, path, "main.bpl"), "frame main() {}");
    }
    writeFileSync(join(invalid, ".bplignore"), "!main.bpl\n");
    for (const files of [
      [],
      [empty],
      [ignored],
      [dependencies],
      [empty, ignored],
    ]) {
      const result = run(files);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toBe("");
      const report = JSON.parse(result.stdout.toString());
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "lint",
        success: false,
        totalFiles: 0,
        errorCount: 1,
        files: [],
        errorCode: "BPL_LINT_NO_INPUTS",
      });
    }
    const plain = run([empty], false);
    expect(plain.exitCode).toBe(1);
    expect(plain.stdout.toString()).toBe("");
    expect(plain.stderr.toString()).toContain("No BPL sources found");

    const badConfig = run([invalid]);
    expect(badConfig.exitCode).toBe(1);
    expect(badConfig.stderr.toString()).toBe("");
    expect(JSON.parse(badConfig.stdout.toString()).error).toContain(
      "negated patterns",
    );
    const plainConfig = run([invalid], false);
    expect(plainConfig.exitCode).toBe(1);
    expect(plainConfig.stdout.toString()).toBe("");
    expect(plainConfig.stderr.toString()).toContain("negated patterns");
    expect(JSON.parse(badConfig.stdout.toString()).errorCode).toBe(
      "BPL_LINT_PROCESSING_ERROR",
    );
    const missing = run([join(directory, "missing.bpl")]);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout.toString()).files[0].errorCode).toBe(
      "BPL_LINT_INPUT_NOT_FOUND",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
