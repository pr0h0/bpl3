import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";

test("failed imports expose configured package and extra search candidates", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bpl-resolver-watch-")));
  try {
    const library = join(root, "lib");
    const globalPackages = join(root, "global-packages");
    const extra = join(root, "extra");
    for (const directory of [library, globalPackages, extra])
      mkdirSync(directory);
    const resolver = new ModuleResolver({
      stdLibPath: library,
      searchPaths: [extra],
      packageManagerOptions: { globalPackageDir: globalPackages },
    });
    const name = `watch-missing-${crypto.randomUUID()}`;
    const candidates: string[] = [];
    expect(() =>
      resolver.resolveModulePath(name, join(root, "main.bpl"), (candidate) =>
        candidates.push(candidate),
      ),
    ).toThrow();
    expect(candidates).toContain(globalPackages);
    expect(candidates).toContain(join(extra, name));
    expect(candidates).toContain(join(library, name));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit std candidates use resolver configuration and stop reporting after recovery", () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "bpl-resolver-std-watch-")),
  );
  try {
    const resolver = new ModuleResolver({ stdLibPath: root });
    const entry = join(root, "main.bpl");
    const candidates: string[] = [];
    expect(() =>
      resolver.resolveModulePath("std/new.bpl", entry, (candidate) =>
        candidates.push(candidate),
      ),
    ).toThrow();
    expect(candidates).toEqual([join(root, "new.bpl")]);
    writeFileSync(join(root, "new.bpl"), "frame value(){}");
    const successfulCandidates: string[] = [];
    expect(
      resolver.resolveModulePath("std/new.bpl", entry, (candidate) =>
        successfulCandidates.push(candidate),
      ),
    ).toBe(join(root, "new.bpl"));
    expect(successfulCandidates).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
