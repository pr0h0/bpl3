import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { PackageManager } from "../compiler/middleend/PackageManager";

for (const parentFirst of [false, true]) {
  for (const compatible of [false, true]) {
    test(`shared dependencies ${compatible ? "unify" : "reject conflicts"} with parentFirst=${parentFirst}`, () => {
      const root = mkdtempSync(join(tmpdir(), "bpl-dependency-conflict-"));
      try {
        const app = join(root, "app");
        const cache = join(root, "cache");
        mkdirSync(app);
        mkdirSync(cache);
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
            `frame value(){}export value; # ${version}`,
          );
          const archive = new PackageManager(directory, options).pack(
            directory,
          );
          copyFileSync(archive, join(cache, basename(archive)));
          copyFileSync(
            `${archive}.bplmeta.json`,
            join(cache, `${basename(archive)}.bplmeta.json`),
          );
          return archive;
        };
        const first = make("shared", "0.1.0");
        make("shared", "0.1.1");
        const parent = make("parent", "0.1.0", { shared: `file:${first}` });
        const dependencies: Record<string, string> = {};
        if (parentFirst) dependencies.parent = `file:${parent}`;
        dependencies.shared = compatible ? "^0.1.0" : "^0.1.1";
        if (!parentFirst) dependencies.parent = `file:${parent}`;
        writeFileSync(
          join(app, "bpl.json"),
          JSON.stringify({ name: "app", version: "0.1.0", dependencies }),
        );
        const manager = new PackageManager(app, options);
        const install = () =>
          manager.installProject({ global: false, verbose: false });
        const installed = join(app, "bpl_modules", "shared", "bpl.json");
        if (compatible) {
          install();
          expect(JSON.parse(readFileSync(installed, "utf8")).version).toBe(
            "0.1.0",
          );
          expect(manager.verifyLockFile().ok).toBe(true);
          // Verification also rejects a lock with an incompatible transitive version.
          const lock = manager.loadLockFile();
          lock.packages.shared!.version = "0.1.1";
          manager["saveLockFile"](lock);
          expect(manager.verifyLockFile().issues).toContainEqual(
            expect.objectContaining({
              dependencyOf: "parent",
              kind: "version-mismatch",
            }),
          );
        } else {
          expect(install).toThrow(/Dependency version conflict/);
          if (!parentFirst)
            expect(JSON.parse(readFileSync(installed, "utf8")).version).toBe(
              "0.1.1",
            );
          else expect(existsSync(installed)).toBe(false);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
