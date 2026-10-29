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

for (const removeInstalled of [false, true]) {
  for (const shared of [false, true, "parent"] as const) {
    test(`removed manifest roots are pruned with shared=${shared}, missing=${removeInstalled}`, () => {
      const root = mkdtempSync(join(tmpdir(), "bpl-manifest-removal-"));
      try {
        const app = join(root, "app");
        const cache = join(root, "cache");
        mkdirSync(app);
        mkdirSync(cache);
        const options = {
          globalPackageDir: cache,
          globalBinDir: join(root, "bin"),
        };
        const pack = (name: string, dependencies = {}) => {
          const dir = join(root, name);
          mkdirSync(dir);
          writeFileSync(
            join(dir, "bpl.json"),
            JSON.stringify({
              name,
              version: "0.1.0",
              main: "index.bpl",
              dependencies,
            }),
          );
          writeFileSync(join(dir, "index.bpl"), "frame value(){}export value;");
          const archive = new PackageManager(dir, options).pack(dir);
          copyFileSync(archive, join(cache, `${name}-0.1.0.tgz`));
          return archive;
        };
        pack("child");
        const parent = pack("parent", { child: "0.1.0" });
        const stable = pack(
          "stable",
          shared === "parent"
            ? { parent: "0.1.0" }
            : shared
              ? { child: "0.1.0" }
              : {},
        );
        const manual = pack("manual");
        const dependencies: Record<string, string> = {
          parent: `file:${parent}`,
          stable: `file:${stable}`,
        };
        const save = () =>
          writeFileSync(
            join(app, "bpl.json"),
            JSON.stringify({ name: "app", version: "0.1.0", dependencies }),
          );
        save();
        const manager = new PackageManager(app, options);
        manager.installProject();
        manager.install(manual);
        expect(manager.verifyLockFile().ok).toBe(true);
        const original = readFileSync(join(app, "bpl.lock"), "utf8");
        delete dependencies.parent;
        save();
        expect(manager.verifyLockFile().issues).toContainEqual(
          expect.objectContaining({
            packageName: "parent",
            kind: "manifest-dependency-mismatch",
          }),
        );
        expect(() =>
          manager.installProject({
            global: false,
            verbose: false,
            locked: true,
          }),
        ).toThrow(/removed from bpl.json/);
        expect(readFileSync(join(app, "bpl.lock"), "utf8")).toBe(original);
        if (removeInstalled)
          rmSync(join(app, "bpl_modules"), { recursive: true, force: true });
        manager.installProject();
        const lock = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
        expect(lock.manifestRoots).toEqual(["stable"]);
        if (shared === "parent")
          expect(lock.packages.parent.version).toBe("0.1.0");
        else expect(lock.packages.parent).toBeUndefined();
        expect(existsSync(join(app, "bpl_modules", "parent"))).toBe(
          shared === "parent",
        );
        expect(Boolean(lock.packages.child)).toBe(Boolean(shared));
        expect(existsSync(join(app, "bpl_modules", "child"))).toBe(
          Boolean(shared),
        );
        expect(lock.packages.manual.version).toBe("0.1.0");
        expect(manager.verifyLockFile().ok).toBe(true);
        // Removing the last declared root still runs pruning with no additions.
        delete dependencies.stable;
        save();
        manager.installProject();
        const final = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
        expect(final.manifestRoots).toEqual([]);
        expect(Object.keys(final.packages)).toEqual(["manual"]);
        expect(manager.verifyLockFile().ok).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}

test("legacy root migration preserves separately installed packages without guessing intent", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-legacy-direct-root-"));
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
      join(app, "bpl.json"),
      JSON.stringify({ name: "app", version: "0.1.0", dependencies: {} }),
    );
    writeFileSync(
      join(source, "bpl.json"),
      JSON.stringify({ name: "manual", version: "0.1.0", main: "index.bpl" }),
    );
    writeFileSync(join(source, "index.bpl"), "frame value(){}export value;");
    const archive = new PackageManager(source, options).pack(source);
    const manager = new PackageManager(app, options);
    manager.install(archive);
    // `install` now records the dependency in bpl.json; a legacy project
    // installed it without one, which is the state migrated here.
    expect(
      JSON.parse(readFileSync(join(app, "bpl.json"), "utf8")).dependencies,
    ).toEqual({ manual: "file:../source/manual-0.1.0.tgz" });
    writeFileSync(
      join(app, "bpl.json"),
      JSON.stringify({ name: "app", version: "0.1.0", dependencies: {} }),
    );
    const original = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
    expect(original.manifestRoots).toBeUndefined();
    // An unreferenced entry absent from bpl.json can be a deliberate direct
    // install. The legacy format contains no evidence that it was removed.
    rmSync(join(app, "bpl_modules"), { recursive: true, force: true });
    manager.installProject();
    const migrated = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
    expect(migrated.manifestRoots).toEqual([]);
    expect(migrated.packages.manual).toEqual({
      ...original.packages.manual,
      source: "file:../source/manual-0.1.0.tgz",
    });
    expect(existsSync(join(app, "bpl_modules", "manual", "index.bpl"))).toBe(
      true,
    );
    expect(manager.verifyLockFile().ok).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
