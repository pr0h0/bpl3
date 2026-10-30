import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PackageManager } from "../compiler/middleend/PackageManager";

// BUG-456: the lock hash skipped a package's nested bpl_modules/node_modules,
// although the resolver loads `<package>/bpl_modules/<dep>`, so editing or
// adding files there after install kept verifyLockFile() ok.
test("lock verification covers a package's nested bpl_modules", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-nested-modules-"));
  try {
    const app = join(root, "app");
    const source = join(root, "lib");
    mkdirSync(app);
    mkdirSync(source);
    const options = {
      globalPackageDir: join(root, "cache"),
      globalBinDir: join(root, "bin"),
    };
    writeFileSync(
      join(app, "bpl.json"),
      JSON.stringify({ name: "app", version: "0.1.0", dependencies: {} }),
    );
    writeFileSync(
      join(source, "bpl.json"),
      JSON.stringify({ name: "lib", version: "0.1.0", main: "index.bpl" }),
    );
    writeFileSync(join(source, "index.bpl"), "frame value(){}export value;");
    const archive = new PackageManager(source, options).pack(source);
    const manager = new PackageManager(app, options);
    manager.install(archive);
    expect(manager.verifyLockFile().ok).toBe(true);

    for (const nested of ["bpl_modules", "node_modules"]) {
      const injected = join(app, "bpl_modules", "lib", nested, "evil");
      mkdirSync(injected, { recursive: true });
      writeFileSync(join(injected, "index.bpl"), "frame evil(){}export evil;");
      expect({ nested, ok: manager.verifyLockFile().ok }).toEqual({
        nested,
        ok: false,
      });
      rmSync(join(app, "bpl_modules", "lib", nested), {
        recursive: true,
        force: true,
      });
      expect(manager.verifyLockFile().ok).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
