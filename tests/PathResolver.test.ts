import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import "../cli/EmbeddedResources";
import {
  getEmbeddedHome,
  isEmbeddedHome,
} from "../compiler/common/EmbeddedHome";
import { getNativeRuntimeSupportObjectPath } from "../compiler/common/NativeRuntime";
import {
  findBplHome,
  findBplHomeWithSource,
  getBplHome,
} from "../compiler/common/PathResolver";

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

  function makeInstall(root: string): void {
    fs.mkdirSync(path.join(root, "lib"), { recursive: true });
    fs.writeFileSync(path.join(root, "lib", "errors.bpl"), "");
  }

  const noEmbeddedHome = (): string => {
    throw new Error("unexpected embedded fallback");
  };

  test("finds the installation through a symlink to the compiled binary", () => {
    const tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-resolver-")),
    );
    const install = path.join(tempDir, "checkout");
    const binDir = path.join(tempDir, "bin");

    try {
      makeInstall(install);
      fs.mkdirSync(binDir);
      fs.writeFileSync(path.join(install, "bpl"), "");
      fs.symlinkSync(path.join(install, "bpl"), path.join(binDir, "bpl"));

      expect(
        findBplHome({
          execPath: path.join(binDir, "bpl"),
          // Compiled Bun executables report a virtual entry script.
          scriptPath: "/$bunfs/root/bpl",
          sourceRoot: path.join(tempDir, "no-source"),
          cwd: tempDir,
          compiled: true,
          embeddedHome: noEmbeddedHome,
        }),
      ).toBe(install);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("prefers the entry script's checkout over the source tree", () => {
    const tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-resolver-")),
    );
    const checkout = path.join(tempDir, "checkout");
    const source = path.join(tempDir, "source");

    try {
      makeInstall(checkout);
      makeInstall(source);
      fs.writeFileSync(path.join(checkout, "index.ts"), "");

      expect(
        findBplHome({
          execPath: path.join(tempDir, "no-such-bun"),
          scriptPath: path.join(checkout, "index.ts"),
          sourceRoot: source,
          cwd: source,
          compiled: false,
          embeddedHome: noEmbeddedHome,
        }),
      ).toBe(checkout);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("a lone compiled binary uses the embedded library, not the build checkout", () => {
    const tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "bpl-path-resolver-")),
    );
    const binDir = path.join(tempDir, "bin");
    const buildCheckout = path.join(tempDir, "checkout");

    try {
      fs.mkdirSync(binDir);
      fs.writeFileSync(path.join(binDir, "bpl"), "");
      // A `lib/` without the prelude, such as a project's, is not an install.
      fs.mkdirSync(path.join(binDir, "lib"));
      makeInstall(buildCheckout);

      expect(
        findBplHomeWithSource({
          execPath: path.join(binDir, "bpl"),
          scriptPath: "/$bunfs/root/bpl",
          sourceRoot: buildCheckout,
          cwd: buildCheckout,
          compiled: true,
          embeddedHome: () => "/embedded",
        }),
      ).toEqual({ path: "/embedded", source: "embedded" });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("embedded standard library", () => {
  const originalCacheDir = process.env.BPL_CACHE_DIR;

  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.BPL_CACHE_DIR;
    } else {
      process.env.BPL_CACHE_DIR = originalCacheDir;
    }
  });

  test("unpacks every library file once and builds the runtime on demand", () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-embedded-"));
    try {
      process.env.BPL_CACHE_DIR = cacheDir;
      const home = getEmbeddedHome();
      expect(home.startsWith(path.join(cacheDir, "home"))).toBe(true);
      expect(isEmbeddedHome(home)).toBe(true);
      expect(getEmbeddedHome()).toBe(home);

      const repoLib = path.resolve(import.meta.dir, "..", "lib");
      for (const file of [
        "errors.bpl",
        "memory/allocator.bpl",
        "runtime_support.c",
        "runtime_wasm.ll",
      ]) {
        expect(fs.readFileSync(path.join(home, "lib", file), "utf8")).toBe(
          fs.readFileSync(path.join(repoLib, file), "utf8"),
        );
      }

      const object = getNativeRuntimeSupportObjectPath(home);
      expect(object).toBe(path.join(home, "lib", "runtime_support.o"));
      expect(fs.statSync(object).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  }, 60_000);

  test("leaves a missing runtime object alone outside an unpacked install", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-embedded-"));
    try {
      expect(getNativeRuntimeSupportObjectPath(tempDir)).toBe(
        path.join(tempDir, "lib", "runtime_support.o"),
      );
      expect(fs.existsSync(path.join(tempDir, "lib"))).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
