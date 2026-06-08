import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  findCaseMismatchPath,
  findNonDirectoryPathComponent,
  findSymlinkedParentPath,
  findSymlinkedPathComponent,
} from "../compiler/common/PathSafety";

describe("Path safety helpers", () => {
  it("allows trusted platform root symlinks while rejecting nested symlink ancestors", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-safety-"));
    const privateVar = path.join(tempDir, "private", "var");
    const trustedVar = path.join(tempDir, "var");
    const outputDir = path.join(trustedVar, "folders", "runner", "project");
    const outsideDir = path.join(tempDir, "outside");
    const nestedSymlink = path.join(outputDir, "linked-output");
    const trustedSymlinks = [{ path: trustedVar, realPath: privateVar }];

    try {
      fs.mkdirSync(privateVar, { recursive: true });
      fs.mkdirSync(outsideDir);
      fs.symlinkSync(privateVar, trustedVar, "dir");
      fs.mkdirSync(outputDir, { recursive: true });

      expect(
        findSymlinkedPathComponent(outputDir, { trustedSymlinks }),
      ).toBeNull();
      expect(
        findSymlinkedParentPath(path.join(outputDir, "main.wasm"), {
          trustedSymlinks,
        }),
      ).toBeNull();

      fs.symlinkSync(outsideDir, nestedSymlink, "dir");

      expect(
        findSymlinkedPathComponent(path.join(nestedSymlink, "main.wasm"), {
          trustedSymlinks,
        }),
      ).toBe(nestedSymlink);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("finds the first existing non-directory path component", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-safety-"));
    const fileParent = path.join(tempDir, "plain-file");

    try {
      fs.writeFileSync(fileParent, "not a directory");

      expect(
        findNonDirectoryPathComponent(path.join(fileParent, "child", "out")),
      ).toBe(fileParent);
      expect(
        findNonDirectoryPathComponent(path.join(tempDir, "missing", "child")),
      ).toBeNull();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("finds existing paths that differ only by filesystem casing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-safety-"));
    const realDir = path.join(tempDir, "ActualDir");
    const realFile = path.join(realDir, "Module.bpl");

    try {
      fs.mkdirSync(realDir, { recursive: true });
      fs.writeFileSync(realFile, "export value;");

      expect(findCaseMismatchPath(realFile)).toBeNull();
      expect(
        findCaseMismatchPath(path.join(tempDir, "actualdir", "Module.bpl")),
      ).toBe(realDir);
      expect(
        findCaseMismatchPath(path.join(tempDir, "ActualDir", "module.bpl")),
      ).toBe(realFile);
      expect(
        findCaseMismatchPath(path.join(tempDir, "missing", "module.bpl")),
      ).toBeNull();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reuses explicitly cached directory entries across case checks", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-safety-"));
    const realFile = path.join(tempDir, "Module.bpl");
    const directoryEntries = new Map<string, string[] | null>();
    const originalReaddirSync = fs.readdirSync;
    const readdirSpy = spyOn(fs, "readdirSync").mockImplementation(
      ((directoryPath: fs.PathLike) =>
        originalReaddirSync(directoryPath)) as typeof fs.readdirSync,
    );

    try {
      fs.writeFileSync(realFile, "export value;");

      expect(findCaseMismatchPath(realFile, { directoryEntries })).toBeNull();
      const readsAfterFirstCheck = readdirSpy.mock.calls.length;

      expect(findCaseMismatchPath(realFile, { directoryEntries })).toBeNull();
      expect(readdirSpy.mock.calls.length).toBe(readsAfterFirstCheck);
    } finally {
      readdirSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
