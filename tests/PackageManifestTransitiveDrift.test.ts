import { expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PackageManager } from "../compiler/middleend/PackageManager";

for (const mode of [
  "upgrade",
  "replace",
  "shared",
  "shared-conflict",
  "two-roots",
  "legacy",
] as const)
  for (const removeInstalled of [false, true]) {
    test(`manifest reconciliation updates a changed parent's transitive dependencies: ${mode} (${removeInstalled ? "missing" : "installed"})`, () => {
      const root = mkdtempSync(join(tmpdir(), "bpl-transitive-drift-"));
      try {
        const cache = join(root, "cache");
        const app = join(root, "app");
        mkdirSync(cache);
        mkdirSync(app);
        const options = {
          globalPackageDir: cache,
          globalBinDir: join(root, "bin"),
        };
        const pack = (name: string, version: string, dependencies = {}) => {
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
          const archive = new PackageManager(directory, options).pack(
            directory,
          );
          copyFileSync(archive, join(cache, `${name}-${version}.tgz`));
          return archive;
        };
        pack("child", "0.1.0");
        const parent = pack("parent", "0.1.0", { child: "0.1.0" });
        const stable = pack(
          "stable",
          "0.1.0",
          ["shared", "shared-conflict", "two-roots"].includes(mode)
            ? { child: "0.1.0" }
            : {},
        );
        const manifest = {
          name: "app",
          version: "0.1.0",
          dependencies: { parent: `file:${parent}`, stable: `file:${stable}` },
        };
        const save = () =>
          writeFileSync(join(app, "bpl.json"), JSON.stringify(manifest));
        save();
        const manager = new PackageManager(app, options);
        manager.installProject();
        const oldLock = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
        const childName = mode === "replace" ? "replacement" : "child";
        pack(childName, "0.1.1");
        const upgraded = pack("parent", "0.1.1", {
          [childName]: mode === "shared" ? "^0.1.0" : "0.1.1",
        });
        if (mode === "legacy") {
          for (const entry of Object.values(oldLock.packages) as {
            dependencies?: string[];
          }[])
            delete entry.dependencies;
          writeFileSync(join(app, "bpl.lock"), JSON.stringify(oldLock));
        }
        manifest.dependencies.parent = `file:${upgraded}`;
        if (mode === "two-roots") {
          manifest.dependencies.stable = `file:${pack("stable", "0.1.1", { child: "0.1.1" })}`;
        }
        save();
        if (removeInstalled)
          rmSync(join(app, "bpl_modules"), { recursive: true, force: true });
        if (mode === "shared-conflict") {
          const before = readFileSync(join(app, "bpl.lock"), "utf8");
          expect(() => manager.installProject()).toThrow(
            /locked child|Dependency version conflict/,
          );
          expect(readFileSync(join(app, "bpl.lock"), "utf8")).toBe(before);
          return;
        }
        if (mode === "legacy" && removeInstalled) {
          const before = readFileSync(join(app, "bpl.lock"), "utf8");
          expect(() => manager.installProject()).toThrow(
            /Cannot reconcile legacy lock entry/,
          );
          expect(readFileSync(join(app, "bpl.lock"), "utf8")).toBe(before);
          expect(existsSync(join(app, "bpl_modules"))).toBe(false);
          manager.installProject({
            verbose: false,
            global: false,
            update: true,
          });
        } else manager.installProject();
        const lock = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
        expect(lock.packages.parent.version).toBe("0.1.1");
        expect(lock.packages[childName].version).toBe(
          mode === "shared" ? "0.1.0" : "0.1.1",
        );
        if (mode === "replace") {
          expect(lock.packages.child).toBeUndefined();
          expect(existsSync(join(app, "bpl_modules", "child"))).toBe(false);
        }
        if (mode === "legacy") {
          expect(lock.packages.stable.version).toBe(
            oldLock.packages.stable.version,
          );
          expect(lock.packages.stable.hash).toBe(oldLock.packages.stable.hash);
        } else if (mode === "two-roots")
          expect(lock.packages.stable.version).toBe("0.1.1");
        else expect(lock.packages.stable).toEqual(oldLock.packages.stable);
        expect(manager.verifyLockFile().ok).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

for (const dependencies of [null, {}, "child", [1], ["../child"]]) {
  test(`rejects invalid lock dependency metadata ${JSON.stringify(dependencies)}`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-lock-dependencies-"));
    try {
      writeFileSync(
        join(root, "bpl.json"),
        JSON.stringify({ name: "app", version: "0.1.0" }),
      );
      const lock = JSON.stringify({
        lockfileVersion: 1,
        packages: {
          parent: {
            version: "0.1.0",
            source: "parent-0.1.0.tgz",
            hash: "0".repeat(64),
            dependencies,
          },
        },
      });
      writeFileSync(join(root, "bpl.lock"), lock);
      const manager = new PackageManager(root, {
        globalPackageDir: join(root, "cache"),
        globalBinDir: join(root, "bin"),
      });
      expect(() => manager.installProject()).toThrow(
        /Invalid bpl.lock dependencies/,
      );
      expect(readFileSync(join(root, "bpl.lock"), "utf8")).toBe(lock);
      expect(existsSync(join(root, "bpl_modules", "parent"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
