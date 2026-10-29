import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { PackageManager } from "../compiler/middleend/PackageManager";

test("portable tree hashes include assets and native files in normalized codepoint order", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-portable-hash-"));
  try {
    const files: Record<string, string> = {
      "bpl.json": '{"name":"fixture","version":"0.1.0"}',
      "z.x": "module",
      "A.c": "native",
      "a.o": "object",
      "data/README": "documentation",
      ".config": "hidden",
      "index.bpl": "frame main(){}",
    };
    mkdirSync(join(root, "data"));
    for (const [file, contents] of Object.entries(files))
      writeFileSync(join(root, file), contents);
    const manager = new PackageManager(root, { ensureDirectories: false });
    const expected = createHash("sha256").update("bpl-tree-v2\0");
    for (const name of [
      ".config",
      "A.c",
      "a.o",
      "bpl.json",
      "data/README",
      "index.bpl",
      "z.x",
    ]) {
      expected.update(`file\0${name}\0`);
      expected.update(createHash("sha256").update(files[name]!).digest());
    }
    const locale = spyOn(String.prototype, "localeCompare").mockImplementation(
      () => {
        throw new Error("locale must not affect package hashes");
      },
    );
    let original: string;
    try {
      original = manager["calculatePackageHash"](root, true);
    } finally {
      locale.mockRestore();
    }
    expect(original).toBe(expected.digest("hex"));
    for (const [file, contents] of Object.entries(files)) {
      writeFileSync(join(root, file), contents + "changed");
      expect(manager["calculatePackageHash"](root, true)).not.toBe(original!);
      writeFileSync(join(root, file), contents);
    }
    // VCS metadata and the compiler cache are never loaded, so they are
    // ignored; nested dependency trees are loaded and hashed (BUG-456).
    for (const ignored of [".git", ".bpl-cache"]) {
      mkdirSync(join(root, ignored));
      writeFileSync(join(root, ignored, "state"), "ignored");
      expect(manager["calculatePackageHash"](root, true)).toBe(original!);
      rmSync(join(root, ignored), { recursive: true });
    }
    for (const nested of ["bpl_modules", "node_modules"]) {
      mkdirSync(join(root, nested));
      writeFileSync(join(root, nested, "generated.o"), "dependency storage");
      expect(manager["calculatePackageHash"](root, true)).not.toBe(original!);
      rmSync(join(root, nested), { recursive: true });
    }
    expect(manager["calculatePackageHash"](root, true)).toBe(original!);
    // Hash link identity without following it into an external directory.
    symlinkSync(join(root, "data"), join(root, "linked"), "dir");
    expect(manager["calculatePackageHash"](root, true)).not.toBe(original!);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
