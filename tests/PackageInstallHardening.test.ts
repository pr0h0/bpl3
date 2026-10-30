import { expect, test } from "bun:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { gzipSync } from "zlib";
import { PackageManager } from "../compiler/middleend/PackageManager";

// BUG-462: package installation hardening.
function withProject(
  run: (paths: { root: string; app: string; archive: string }) => void,
) {
  const root = mkdtempSync(join(tmpdir(), "bpl-install-hardening-"));
  try {
    const app = join(root, "app");
    const source = join(root, "lib");
    mkdirSync(app);
    mkdirSync(source);
    writeFileSync(
      join(app, "bpl.json"),
      JSON.stringify({ name: "app", version: "0.1.0", dependencies: {} }),
    );
    writeFileSync(
      join(source, "bpl.json"),
      JSON.stringify({ name: "lib", version: "0.1.0", main: "index.bpl" }),
    );
    writeFileSync(join(source, "index.bpl"), "frame value(){}export value;");
    const archive = new PackageManager(source, options(root)).pack(source);
    run({ root, app, archive });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const options = (root: string) => ({
  globalPackageDir: join(root, "cache"),
  globalBinDir: join(root, "bin"),
});

test("a bare package name never resolves to a file in the current directory", () => {
  withProject(({ root, app, archive }) => {
    // A file named like the package sits in the working directory, and the
    // package cache is empty.
    copyFileSync(archive, join(app, "lib"));
    const cwd = process.cwd();
    process.chdir(app);
    try {
      const manager = new PackageManager(app, {
        ...options(root),
        globalPackageDir: join(root, "empty-cache"),
      });
      expect(() => manager.install("lib")).toThrow(/Package not found: lib/);
      // An explicit path still installs the file.
      manager.install("./lib");
      expect(manager.verifyLockFile().ok).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });
});

test("legacy lock entries fail verification until refreshed", () => {
  withProject(({ root, app, archive }) => {
    const manager = new PackageManager(app, options(root));
    manager.install(archive);
    const lockPath = join(app, "bpl.lock");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    // Even a legacy hash that matches its own algorithm is not trusted: it
    // does not cover `.x` and native files.
    lock.packages.lib.hash = manager["calculatePackageHash"](
      join(app, "bpl_modules", "lib"),
    );
    delete lock.packages.lib.hashAlgorithm;
    writeFileSync(lockPath, JSON.stringify(lock));
    const report = manager.verifyLockFile();
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("legacy content hash");
    manager.installProject({ global: false, verbose: false, update: true });
    expect(manager.verifyLockFile().ok).toBe(true);
  });
});

test("archives that expand past the size cap are rejected before extraction", () => {
  withProject(({ root, app }) => {
    // 300 MiB of zeros compresses to about 300 KB.
    const bomb = join(root, "bomb-0.1.0.tgz");
    writeFileSync(bomb, gzipSync(Buffer.alloc(300 * 1024 * 1024)));
    const manager = new PackageManager(app, options(root));
    expect(() => manager.install(bomb)).toThrow(/expands to more than 256 MiB/);
  });
});

const gnuTar = (() => {
  const version = Bun.spawnSync(["tar", "--version"]);
  return (
    version.exitCode === 0 && version.stdout.toString().includes("GNU tar")
  );
})();

test.skipIf(!gnuTar)("sparse members are rejected before extraction", () => {
  withProject(({ root, app }) => {
    // 300 MiB of holes stored in a few hundred bytes: the stream cap alone
    // would not bound what tar writes.
    const source = join(root, "sparse-src");
    mkdirSync(join(source, "package"), { recursive: true });
    writeFileSync(
      join(source, "package", "bpl.json"),
      JSON.stringify({ name: "sparse", version: "0.1.0", main: "index.bpl" }),
    );
    writeFileSync(
      join(source, "package", "index.bpl"),
      "frame value(){}export value;",
    );
    Bun.spawnSync([
      "truncate",
      "-s",
      "300M",
      join(source, "package", "big.bin"),
    ]);
    for (const format of ["gnu", "posix"]) {
      const archive = join(root, `sparse-${format}-0.1.0.tgz`);
      const packed = Bun.spawnSync(
        ["tar", "--sparse", `--format=${format}`, "-czf", archive, "package"],
        { cwd: source },
      );
      expect(packed.exitCode).toBe(0);
      const manager = new PackageManager(app, options(root));
      expect(() => manager.install(archive)).toThrow(/sparse file/);
    }
  });
});
