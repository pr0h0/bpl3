import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PackageManager } from "../compiler/middleend/PackageManager";

test("locked verification rejects manifest drift and normal install reconciles it", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-manifest-drift-"));
  const cache = join(root, "cache");
  mkdirSync(cache);
  const options = { globalPackageDir: cache, globalBinDir: join(root, "bin") };
  try {
    const archive = (name: string, version: string) => {
      const source = join(root, `${name}-${version}`);
      mkdirSync(source);
      writeFileSync(
        join(source, "bpl.json"),
        JSON.stringify({ name, version, main: "index.bpl" }),
      );
      writeFileSync(
        join(source, "index.bpl"),
        "frame value()ret int{return 1;}export value;",
      );
      return new PackageManager(source, options).pack(source);
    };
    const first = archive("first", "0.1.0");
    const second = archive("second", "0.1.0");
    const upgraded = archive("first", "0.1.1");
    const app = join(root, "app");
    mkdirSync(app);
    const manifestPath = join(app, "bpl.json");
    const manifest = {
      name: "app",
      version: "0.1.0",
      description: "retain metadata",
      dependencies: { first: `file:${first}` },
      devDependencies: {} as Record<string, string>,
    };
    const save = () => writeFileSync(manifestPath, JSON.stringify(manifest));
    save();
    const manager = new PackageManager(app, options);
    manager.installProject({ verbose: false, global: false });
    expect(manager.verifyLockFile().ok).toBe(true);
    const originalLock = readFileSync(join(app, "bpl.lock"), "utf8");
    manifest.devDependencies.second = `file:${second}`;
    save();
    expect(manager.verifyLockFile().issues).toContainEqual(
      expect.objectContaining({
        packageName: "second",
        kind: "manifest-dependency-mismatch",
      }),
    );
    expect(() =>
      manager.installProject({ verbose: false, global: false, locked: true }),
    ).toThrow(/bpl.json dependency/);
    expect(readFileSync(join(app, "bpl.lock"), "utf8")).toBe(originalLock);
    expect(existsSync(join(app, "bpl_modules", "second"))).toBe(false);
    manager.installProject({ verbose: false, global: false });
    expect(manager.verifyLockFile().ok).toBe(true);
    manifest.dependencies.first = `file:${upgraded}`;
    save();
    expect(() =>
      manager.installProject({ verbose: false, global: false, locked: true }),
    ).toThrow(/bpl.json dependency/);
    manager.installProject({ verbose: false, global: false });
    expect(
      JSON.parse(
        readFileSync(join(app, "bpl_modules", "first", "bpl.json"), "utf8"),
      ).version,
    ).toBe("0.1.1");
    // Version selectors are checked against the lock without re-resolving cache.
    manifest.dependencies.first = "^0.1.0";
    save();
    expect(manager.verifyLockFile().ok).toBe(true);
    manifest.dependencies.first = "0.1.0";
    save();
    expect(manager.verifyLockFile().ok).toBe(false);
    manifest.dependencies.first = "^0.1.0";
    save();
    manager.uninstall("first");
    expect(manager.verifyLockFile().ok).toBe(true);
    manager.uninstall("second");
    expect(manager.verifyLockFile().ok).toBe(true);
    const remaining = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(remaining.dependencies).toEqual({});
    expect(remaining.devDependencies).toEqual({});
    expect(remaining.description).toBe("retain metadata");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
