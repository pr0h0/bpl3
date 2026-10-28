import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { findBplHome, getBplHome } from "../compiler/common/PathResolver";

describe("PathResolver", () => {
  const originalBplHome = process.env.BPL_HOME;

  afterEach(() => {
    if (originalBplHome === undefined) {
      delete process.env.BPL_HOME;
    } else {
      process.env.BPL_HOME = originalBplHome;
    }
  });

  test("rejects BPL_HOME paths reached through symlinked parents", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-path-resolver-"),
    );
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const bplHome = path.join(linkedRoot, "bpl-home");

    try {
      fs.mkdirSync(path.join(realRoot, "bpl-home", "grammar"), {
        recursive: true,
      });
      fs.symlinkSync(realRoot, linkedRoot, "dir");
      process.env.BPL_HOME = bplHome;

      expect(() => getBplHome()).toThrow(
        `BPL_HOME parent path contains a symbolic link: ${linkedRoot}`,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("finds the installation through a symlink to the compiled binary", () => {
    const tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-resolver-")),
    );
    const install = path.join(tempDir, "checkout");
    const binDir = path.join(tempDir, "bin");
    const elsewhere = path.join(tempDir, "elsewhere");

    try {
      fs.mkdirSync(path.join(install, "grammar"), { recursive: true });
      fs.mkdirSync(binDir);
      fs.mkdirSync(elsewhere);
      fs.writeFileSync(path.join(install, "bpl"), "");
      fs.symlinkSync(path.join(install, "bpl"), path.join(binDir, "bpl"));

      expect(
        findBplHome({
          execPath: path.join(binDir, "bpl"),
          // Compiled Bun executables report a virtual entry script.
          scriptPath: "/$bunfs/root/bpl",
          cwd: elsewhere,
          sourceRoot: path.join(tempDir, "no-source"),
        }),
      ).toBe(install);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prefers the entry script's checkout over the working directory", () => {
    const tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-resolver-")),
    );
    const checkout = path.join(tempDir, "checkout");
    const project = path.join(tempDir, "project");

    try {
      fs.mkdirSync(path.join(checkout, "grammar"), { recursive: true });
      fs.mkdirSync(path.join(project, "grammar"), { recursive: true });
      fs.writeFileSync(path.join(checkout, "index.ts"), "");

      expect(
        findBplHome({
          execPath: path.join(tempDir, "no-such-bun"),
          scriptPath: path.join(checkout, "index.ts"),
          cwd: project,
          sourceRoot: path.join(tempDir, "no-source"),
        }),
      ).toBe(checkout);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
