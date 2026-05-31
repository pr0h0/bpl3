import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getBplHome } from "../compiler/common/PathResolver";

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
});
