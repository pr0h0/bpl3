import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { writeFileAtomically } from "../cli/utils";

describe("CLI utils", () => {
  it("does not follow or remove pre-existing atomic-write temp symlinks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-utils-"));
    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    const fixedTimestamp = 1700000000000;
    const outputPath = path.join(dir, "output.txt");
    const outsidePath = path.join(dir, "outside.txt");
    const poisonedTempPath = path.join(
      dir,
      `.output.txt.${process.pid}-${fixedTimestamp}-8-0.tmp`,
    );

    try {
      fs.writeFileSync(outsidePath, "outside\n");
      fs.symlinkSync(outsidePath, poisonedTempPath, "file");
      Date.now = () => fixedTimestamp;
      Math.random = () => 0.5;

      writeFileAtomically(outputPath, "new content\n");

      expect(fs.readFileSync(outputPath, "utf8")).toBe("new content\n");
      expect(fs.readFileSync(outsidePath, "utf8")).toBe("outside\n");
      expect(fs.lstatSync(poisonedTempPath).isSymbolicLink()).toBe(true);
    } finally {
      Date.now = originalDateNow;
      Math.random = originalRandom;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves file permissions when replacing existing files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-utils-mode-"));
    const outputPath = path.join(dir, "script.sh");

    try {
      fs.writeFileSync(outputPath, "old\n", { mode: 0o744 });

      writeFileAtomically(outputPath, "new\n");

      expect(fs.readFileSync(outputPath, "utf8")).toBe("new\n");
      expect(fs.statSync(outputPath).mode & 0o777).toBe(0o744);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
