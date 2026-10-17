import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PackageManager } from "../compiler/middleend/PackageManager";

test("failed project updates preserve the previous lock and discard pending state", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-lock-update-failure-"));
  try {
    const app = join(root, "app");
    const source = join(root, "source");
    mkdirSync(app);
    mkdirSync(source);
    const options = {
      globalPackageDir: join(root, "cache"),
      globalBinDir: join(root, "bin"),
    };
    writeFileSync(
      join(source, "bpl.json"),
      JSON.stringify({
        name: "dependency",
        version: "0.1.0",
        main: "index.bpl",
      }),
    );
    writeFileSync(join(source, "index.bpl"), "frame value(){}export value;");
    const archive = new PackageManager(source, options).pack(source);
    const manifestPath = join(app, "bpl.json");
    const manifest = {
      name: "app",
      version: "0.1.0",
      dependencies: { dependency: `file:${archive}` } as Record<string, string>,
    };
    const save = () => writeFileSync(manifestPath, JSON.stringify(manifest));
    save();
    const manager = new PackageManager(app, options);
    manager.installProject({ global: false, verbose: false });
    const lockPath = join(app, "bpl.lock");
    const original = readFileSync(lockPath, "utf8");
    manifest.dependencies = { missing: "file:missing-0.1.0.tgz" };
    save();
    expect(() =>
      manager.installProject({ global: false, verbose: false, update: true }),
    ).toThrow();
    expect(readFileSync(lockPath, "utf8")).toBe(original);
    expect(manager.loadLockFile()).toEqual(JSON.parse(original));
    manifest.dependencies = { dependency: `file:${archive}` };
    save();
    manager.installProject({ global: false, verbose: false, update: true });
    expect(manager.verifyLockFile().ok).toBe(true);
    expect(readFileSync(lockPath, "utf8").endsWith("\n")).toBe(true);
    // Serialization order must not depend on installation/insertion order.
    const lock = manager.loadLockFile();
    lock.packages.zebra = { ...lock.packages.dependency! };
    lock.packages.alpha = { ...lock.packages.dependency! };
    manager["saveLockFile"](lock);
    expect(
      Object.keys(JSON.parse(readFileSync(lockPath, "utf8")).packages),
    ).toEqual(["alpha", "dependency", "zebra"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
