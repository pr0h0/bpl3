import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expandSourceInputs } from "../cli/SourceInputs";

for (const newline of ["\n", "\r\n", "\r", "\n\r"]) {
  test(`source ignores respect lines separated by ${JSON.stringify(newline)}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-ignore-lines-"));
    try {
      mkdirSync(join(directory, "generated"));
      const main = join(directory, "main.bpl");
      const ignored = join(directory, "ignored.x");
      const generated = join(directory, "generated/module.bpl");
      const ignore = join(directory, ".bplignore");
      writeFileSync(main, "frame main() {}\n");
      writeFileSync(ignored, "intentionally invalid ignored source");
      writeFileSync(generated, "intentionally invalid generated source");
      writeFileSync(
        ignore,
        ["# generated files", "", "ignored.x", "generated/", ""].join(newline),
      );
      expect(expandSourceInputs([directory])).toEqual([main]);
      expect(expandSourceInputs([directory, ignored])).toEqual([main, ignored]);
      const run = (args: string[]) =>
        Bun.spawnSync([process.execPath, resolve("index.ts"), ...args], {
          env: { ...process.env, NO_COLOR: "1" },
          timeout: 15000,
        });
      const format = run(["format", directory, "--write"]);
      expect(format.exitCode).toBe(0);
      expect(readFileSync(ignored, "utf8")).toBe(
        "intentionally invalid ignored source",
      );
      expect(readFileSync(generated, "utf8")).toBe(
        "intentionally invalid generated source",
      );
      const lint = run(["lint", directory, "--json"]);
      expect(lint.exitCode).toBe(0);
      expect(lint.stderr.toString()).toBe("");
      const report = JSON.parse(lint.stdout.toString());
      expect(report.totalFiles).toBe(1);
      expect(report.files[0].file).toBe(main);
      writeFileSync(ignore, ["# unsupported", "!ignored.x", ""].join(newline));
      expect(() => expandSourceInputs([directory])).toThrow("negated patterns");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
