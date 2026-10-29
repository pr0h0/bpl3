import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

test("check quiet mode hides success output but preserves input and compiler errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-quiet-check-"));
  const valid = join(directory, "valid.bpl");
  const invalid = join(directory, "invalid.bpl");
  const missing = join(directory, "missing.bpl");
  writeFileSync(valid, "frame main() ret int { return 0; }");
  writeFileSync(invalid, "frame main() ret int { return unknownValue; }");
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, resolve("index.ts"), ...args], {
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    });
  try {
    for (const prefix of [
      ["check", "--quiet"],
      ["--quiet", "check"],
    ]) {
      const success = run([...prefix, valid]);
      expect(success.exitCode).toBe(0);
      expect(success.stdout.toString()).toBe("");
      expect(success.stderr.toString()).toBe("");
      for (const [files, message] of [
        [[missing], "File not found"],
        // A directory is expanded; it contains the invalid file.
        [[directory], "Undefined symbol 'unknownValue'"],
        [[], "No files specified"],
        [[invalid], "Undefined symbol 'unknownValue'"],
      ] as const) {
        const result = run([...prefix, ...files]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout.toString()).toBe("");
        expect(result.stderr.toString()).toContain(message);
      }
      const json = run([...prefix, "--json", missing]);
      expect(json.exitCode).toBe(1);
      expect(json.stderr.toString()).toBe("");
      expect(JSON.parse(json.stdout.toString())).toMatchObject({
        success: false,
        totalFiles: 1,
        files: [{ errorCode: "BPL_CHECK_INPUT_NOT_FOUND" }],
      });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
