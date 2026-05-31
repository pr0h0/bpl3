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
      fs.chmodSync(outputPath, 0o744);

      writeFileAtomically(outputPath, "new\n");

      expect(fs.readFileSync(outputPath, "utf8")).toBe("new\n");
      expect(fs.statSync(outputPath).mode & 0o777).toBe(0o744);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects destination symlinks before writing atomic output", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-utils-link-"));
    const outputPath = path.join(dir, "output.txt");
    const targetPath = path.join(dir, "target.txt");

    try {
      fs.writeFileSync(targetPath, "target\n");
      fs.symlinkSync(targetPath, outputPath, "file");

      expect(() => writeFileAtomically(outputPath, "new\n")).toThrow(
        "Output path is a symbolic link",
      );
      expect(fs.lstatSync(outputPath).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(targetPath, "utf8")).toBe("target\n");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked parent directories before writing atomic output", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cli-utils-parent-link-"),
    );
    const realParent = path.join(dir, "real");
    const linkedParent = path.join(dir, "linked");
    const outputPath = path.join(linkedParent, "output.txt");

    try {
      fs.mkdirSync(realParent);
      fs.symlinkSync(realParent, linkedParent, "dir");

      expect(() => writeFileAtomically(outputPath, "new\n")).toThrow(
        "Output parent path is a symbolic link",
      );
      expect(fs.existsSync(path.join(realParent, "output.txt"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked output ancestors before creating atomic temp files", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cli-utils-ancestor-link-"),
    );
    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    const fixedTimestamp = 1700000000000;
    const realRoot = path.join(dir, "real-root");
    const linkedRoot = path.join(dir, "linked-root");
    const realProject = path.join(realRoot, "project");
    const outputPath = path.join(linkedRoot, "project", "output.txt");
    const redirectedOutput = path.join(realProject, "output.txt");
    const outsidePath = path.join(dir, "outside.txt");
    const poisonedTempPath = path.join(
      realProject,
      `.output.txt.${process.pid}-${fixedTimestamp}-8-0.tmp`,
    );

    try {
      fs.mkdirSync(realProject, { recursive: true });
      fs.writeFileSync(outsidePath, "outside\n");
      fs.symlinkSync(realRoot, linkedRoot, "dir");
      fs.symlinkSync(outsidePath, poisonedTempPath, "file");
      Date.now = () => fixedTimestamp;
      Math.random = () => 0.5;

      expect(() => writeFileAtomically(outputPath, "new\n")).toThrow(
        "Output parent path contains a symbolic link",
      );
      expect(fs.lstatSync(poisonedTempPath).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(outsidePath, "utf8")).toBe("outside\n");
      expect(fs.existsSync(redirectedOutput)).toBe(false);
    } finally {
      Date.now = originalDateNow;
      Math.random = originalRandom;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
