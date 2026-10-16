import { expect, test } from "bun:test";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PackageManager } from "../compiler/middleend/PackageManager";

test("project restoration rejects changed archives before replacing installed contents", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-restore-integrity-"));
  try {
    const source = join(root, "source");
    const app = join(root, "app");
    const cache = join(root, "cache");
    for (const dir of [source, app, cache]) mkdirSync(dir);
    const options = {
      globalPackageDir: cache,
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
    const original = "frame value()ret int{return 1;}export value;";
    writeFileSync(join(source, "index.bpl"), original);
    const packer = new PackageManager(source, options);
    const archive = packer.pack(source);
    writeFileSync(
      join(app, "bpl.json"),
      JSON.stringify({
        name: "app",
        version: "0.1.0",
        dependencies: { dependency: `file:${archive}` },
      }),
    );
    const manager = new PackageManager(app, options);
    manager.installProject({ global: false, verbose: false });
    const lockPath = join(app, "bpl.lock");
    const originalLock = readFileSync(lockPath, "utf8");
    expect(JSON.parse(originalLock).packages.dependency.archiveSha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
    const changed = "frame value()ret int{return 2;}export value;";
    writeFileSync(join(source, "index.bpl"), changed);
    packer.pack(source); // Even a freshly valid provenance sidecar cannot override the lock.
    expect(() =>
      manager.installProject({ global: false, verbose: false }),
    ).toThrow(/archive hash/);
    const installed = join(app, "bpl_modules", "dependency", "index.bpl");
    expect(readFileSync(installed, "utf8")).toBe(original);
    expect(readFileSync(lockPath, "utf8")).toBe(originalLock);
    // Legacy locks without an archive checksum still enforce their tree hash.
    const legacy = JSON.parse(originalLock);
    delete legacy.packages.dependency.archiveSha256;
    const legacyText = JSON.stringify(legacy);
    writeFileSync(lockPath, legacyText);
    expect(() =>
      manager.installProject({ global: false, verbose: false }),
    ).toThrow(/content hash/);
    expect(readFileSync(installed, "utf8")).toBe(original);
    expect(readFileSync(lockPath, "utf8")).toBe(legacyText);
    manager.installProject({ global: false, verbose: false, update: true });
    expect(readFileSync(installed, "utf8")).toBe(changed);
    expect(manager.verifyLockFile().ok).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restoration does not resolve locked transitive ranges against newer cache entries", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-restore-transitive-"));
  try {
    const cache = join(root, "cache");
    const app = join(root, "app");
    mkdirSync(cache);
    mkdirSync(app);
    const options = {
      globalPackageDir: cache,
      globalBinDir: join(root, "bin"),
    };
    const make = (name: string, version: string, dependencies = {}) => {
      const directory = join(root, `${name}-${version}`);
      mkdirSync(directory);
      writeFileSync(
        join(directory, "bpl.json"),
        JSON.stringify({ name, version, main: "index.bpl", dependencies }),
      );
      writeFileSync(
        join(directory, "index.bpl"),
        "frame value(){}export value;",
      );
      return new PackageManager(directory, options).pack(directory);
    };
    const first = make("dependency", "0.1.0");
    copyFileSync(first, join(cache, "dependency-0.1.0.tgz"));
    const parent = make("parent", "0.1.0", { dependency: "^0.1.0" });
    writeFileSync(
      join(app, "bpl.json"),
      JSON.stringify({
        name: "app",
        version: "0.1.0",
        dependencies: { parent: `file:${parent}` },
      }),
    );
    const manager = new PackageManager(app, options);
    manager.installProject({ global: false, verbose: false });
    const original = readFileSync(join(app, "bpl.lock"), "utf8");
    // If the range is re-resolved, this newer but invalid archive is selected.
    writeFileSync(join(cache, "dependency-0.1.1.tgz"), "not an archive");
    rmSync(join(app, "bpl_modules"), { recursive: true, force: true });
    manager.installProject({ global: false, verbose: false });
    expect(readFileSync(join(app, "bpl.lock"), "utf8")).toBe(original);
    expect(manager.verifyLockFile().ok).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
