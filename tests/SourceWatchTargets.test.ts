import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSourceWatchTargets } from "../cli/SourceWatchTargets";
import { createSourceWatcher } from "../cli/SourceWatcher";

function fixture(run: (root: string) => void | Promise<void>) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "bpl-watch-targets-")),
  );
  return Promise.resolve()
    .then(() => run(root))
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
}
test("watch targets follow transitive imports, cycles and extensionless modules", () =>
  fixture((root) => {
    const app = path.join(root, "app");
    const shared = path.join(root, "shared");
    fs.mkdirSync(app);
    fs.mkdirSync(shared);
    const entry = path.join(app, "main.bpl");
    const dependency = path.join(shared, "first.x");
    const nested = path.join(shared, "second");
    fs.writeFileSync(
      entry,
      'import first from "../shared/first.x";frame main(){}',
    );
    fs.writeFileSync(
      dependency,
      'import second from "./second";frame first(){}export first;',
    );
    fs.writeFileSync(
      nested,
      'import first from "./first.x";frame second(){}export second;',
    );
    const targets = collectSourceWatchTargets(entry);
    expect([...targets.sources]).toEqual(
      expect.arrayContaining([entry, dependency, nested]),
    );
    expect(targets.directories.has(shared)).toBe(true);
  }));
test("watch targets include new source directories and ignore dependency/vendor scans", () =>
  fixture((root) => {
    const entry = path.join(root, "main.bpl");
    fs.writeFileSync(entry, "frame main(){}");
    for (const name of ["src", "node_modules", "bpl_modules", ".hidden"]) {
      fs.mkdirSync(path.join(root, name));
      fs.writeFileSync(path.join(root, name, "other.x"), "frame other(){}");
    }
    const targets = collectSourceWatchTargets(entry);
    expect(targets.sources.has(path.join(root, "src/other.x"))).toBe(true);
    for (const name of ["node_modules", "bpl_modules", ".hidden"])
      expect(targets.directories.has(path.join(root, name))).toBe(false);
  }));
test("missing external imports retain observable parents and recover after directory creation", () =>
  fixture((root) => {
    const app = path.join(root, "app");
    fs.mkdirSync(app);
    const entry = path.join(app, "main.bpl");
    fs.writeFileSync(
      entry,
      'import value from "../shared/new/value.bpl";frame main(){}',
    );
    expect(collectSourceWatchTargets(entry).directories.has(root)).toBe(true);
    fs.mkdirSync(path.join(root, "shared/new"), { recursive: true });
    expect(
      collectSourceWatchTargets(entry).directories.has(
        path.join(root, "shared/new"),
      ),
    ).toBe(true);
  }));
test("imports inside comments and strings do not create dependency watches", () =>
  fixture((root) => {
    const app = path.join(root, "app");
    fs.mkdirSync(app);
    const entry = path.join(app, "main.bpl");
    fs.writeFileSync(
      entry,
      '# import value from "../outside/value.bpl";\nframe main(){local text:string="import value from outside";}',
    );
    expect([...collectSourceWatchTargets(entry).directories]).toEqual([app]);
  }));
test("closing a watcher cancels a queued rebuild", () =>
  fixture(async (root) => {
    const entry = path.join(root, "main.bpl");
    fs.writeFileSync(entry, "frame main(){}");
    const changes: string[] = [];
    const errors: unknown[] = [];
    const watcher = createSourceWatcher(
      entry,
      (file) => changes.push(file),
      (_file, error) => errors.push(error),
    );
    try {
      watcher.refresh();
      fs.writeFileSync(entry, "frame main(){return;}");
      await Bun.sleep(30);
      watcher.close();
      await Bun.sleep(150);
      expect(changes).toEqual([]);
      expect(errors).toEqual([]);
      expect(watcher.refresh()).toBe(0);
    } finally {
      watcher.close();
    }
  }));

test(
  "atomic saves rebuild once and generated artifacts do not create a rebuild loop",
  () =>
    fixture(async (root) => {
      const entry = path.join(root, "main.bpl");
      fs.writeFileSync(entry, "frame main(){}");
      const changes: string[] = [];
      let ready: () => void = () => {};
      let timeout: ReturnType<typeof setTimeout>;
      const changed = new Promise<void>((resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Atomic source save was not observed")),
          5000,
        );
        ready = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      const watcher = createSourceWatcher(
        entry,
        (file) => {
          changes.push(file);
          fs.writeFileSync(path.join(root, "main.ll"), "; generated output");
          ready();
        },
        (_file, error) => {
          throw error;
        },
      );
      try {
        watcher.refresh();
        fs.writeFileSync(entry + ".tmp", "frame main(){return;}");
        fs.renameSync(entry + ".tmp", entry);
        await changed;
        await Bun.sleep(250);
        expect(changes).toEqual([entry]);
        fs.writeFileSync(path.join(root, "main.o"), "generated");
        await Bun.sleep(250);
        expect(changes).toEqual([entry]);
      } finally {
        clearTimeout(timeout!);
        watcher.close();
      }
    }),
  10000,
);

for (const replaceEntry of [true, false]) {
  test(
    `refresh follows a replaced ${replaceEntry ? "entry" : "dependency"} directory`,
    () =>
      fixture(async (root) => {
        const app = path.join(root, "app");
        const shared = path.join(root, "shared");
        fs.mkdirSync(app);
        fs.mkdirSync(shared);
        const entry = path.join(app, "main.bpl");
        const dependency = path.join(shared, "value.bpl");
        const entryText =
          'import value from "../shared/value.bpl";frame main(){value();}';
        fs.writeFileSync(entry, entryText);
        fs.writeFileSync(
          dependency,
          "frame value()ret int{return 1;}export value;",
        );
        let report: (file: string) => void = () => {};
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const errors: unknown[] = [];
        const watcher = createSourceWatcher(
          entry,
          (file) => report(file),
          (_directory, error) => errors.push(error),
        );
        try {
          watcher.refresh();
          const target = replaceEntry ? app : shared;
          fs.renameSync(target, target + "-previous");
          fs.mkdirSync(target);
          if (replaceEntry) fs.writeFileSync(entry, entryText);
          else
            fs.writeFileSync(
              dependency,
              "frame value()ret int{return 2;}export value;",
            );
          watcher.refresh();
          await Bun.sleep(250);
          const changed = new Promise<string>((resolve, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    "Recreated directory stopped producing source events",
                  ),
                ),
              3000,
            );
            report = (file) => {
              clearTimeout(timeout);
              resolve(file);
            };
          });
          const edited = replaceEntry ? entry : dependency;
          fs.appendFileSync(edited, "\n# changed after replacement\n");
          expect(await changed).toBe(edited);
          expect(errors).toEqual([]);
        } finally {
          clearTimeout(timeout);
          watcher.close();
        }
      }),
    10000,
  );
}

test(
  "watching recovers when the entry directory disappears before being restored",
  () =>
    fixture(async (root) => {
      const app = path.join(root, "app");
      fs.mkdirSync(app);
      const entry = path.join(app, "main.bpl");
      fs.writeFileSync(entry, "frame main(){}");
      let report: (file: string) => void = () => {};
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const watcher = createSourceWatcher(
        entry,
        (file) => report(file),
        () => {},
      );
      try {
        watcher.refresh();
        fs.renameSync(app, app + "-previous");
        watcher.refresh();
        await Bun.sleep(250);
        fs.mkdirSync(app);
        fs.writeFileSync(entry, "frame main(){return;}");
        await Bun.sleep(250);
        const changed = new Promise<string>((resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Restored entry directory was not watched")),
            3000,
          );
          report = (file) => {
            clearTimeout(timeout);
            resolve(file);
          };
        });
        fs.appendFileSync(entry, "\n# edit after directory restoration\n");
        expect(await changed).toBe(entry);
      } finally {
        clearTimeout(timeout);
        watcher.close();
      }
    }),
  10000,
);

test("missing roots observe an ancestor without scanning unrelated sources", () =>
  fixture((root) => {
    fs.mkdirSync(path.join(root, "unrelated"));
    fs.writeFileSync(path.join(root, "unrelated/other.bpl"), "frame other(){}");
    const entry = path.join(root, "missing/app/main.bpl");
    const targets = collectSourceWatchTargets(entry);
    expect([...targets.sources]).toEqual([entry]);
    expect([...targets.directories]).toEqual([root]);
  }));
test("file-valued parent paths fall back to an existing directory", () =>
  fixture((root) => {
    fs.writeFileSync(path.join(root, "app"), "not a directory");
    const entry = path.join(root, "app/main.bpl");
    const targets = collectSourceWatchTargets(entry);
    expect([...targets.sources]).toEqual([entry]);
    expect([...targets.directories]).toEqual([root]);
  }));

for (const extension of ["bpl", "x"]) {
  test(
    `missing-entry ancestor ignores unrelated .${extension} changes`,
    () =>
      fixture(async (root) => {
        const entry = path.join(root, "missing/app/main.bpl");
        const changed: string[] = [];
        const watcher = createSourceWatcher(
          entry,
          (file) => changed.push(file),
          () => {},
        );
        try {
          watcher.refresh();
          fs.writeFileSync(
            path.join(root, `unrelated.${extension}`),
            "frame other(){}",
          );
          await Bun.sleep(250);
          expect(changed).toEqual([]);
          fs.mkdirSync(path.dirname(entry), { recursive: true });
          fs.writeFileSync(entry, "frame main(){}");
          const deadline = Date.now() + 3000;
          while (!changed.includes(entry) && Date.now() < deadline)
            await Bun.sleep(20);
          expect(changed).toContain(entry);
        } finally {
          watcher.close();
        }
      }),
    10000,
  );
}

test.skipIf(process.platform === "win32")(
  "symlinked project roots collect each real source once",
  () =>
    fixture((root) => {
      const real = path.join(root, "real");
      const linked = path.join(root, "linked");
      fs.mkdirSync(real);
      fs.symlinkSync(real, linked, "dir");
      fs.writeFileSync(
        path.join(real, "main.bpl"),
        'import dependency from "./dependency.bpl";frame main(){}',
      );
      fs.writeFileSync(
        path.join(real, "dependency.bpl"),
        "frame dependency(){}export dependency;",
      );
      const targets = collectSourceWatchTargets(path.join(linked, "main.bpl"));
      expect([...targets.sources].sort()).toEqual(
        [path.join(real, "main.bpl"), path.join(real, "dependency.bpl")].sort(),
      );
      expect([...targets.directories].sort()).toEqual([real, root].sort());
    }),
);

test.skipIf(process.platform === "win32")(
  "symlinked project watches report the canonical changed source",
  () =>
    fixture(async (root) => {
      const real = path.join(root, "real");
      const linked = path.join(root, "linked");
      fs.mkdirSync(real);
      fs.symlinkSync(real, linked, "dir");
      const dependency = path.join(real, "dependency.bpl");
      fs.writeFileSync(
        path.join(real, "main.bpl"),
        'import dependency from "./dependency.bpl";frame main(){}',
      );
      fs.writeFileSync(dependency, "frame dependency(){}export dependency;");
      const changed: string[] = [];
      const watcher = createSourceWatcher(
        path.join(linked, "main.bpl"),
        (file) => changed.push(file),
        () => {},
      );
      try {
        watcher.refresh();
        fs.appendFileSync(dependency, "\n# changed\n");
        const deadline = Date.now() + 3000;
        while (changed.length === 0 && Date.now() < deadline)
          await Bun.sleep(20);
        expect(changed).toEqual([dependency]);
      } finally {
        watcher.close();
      }
    }),
);

// Directory links can be replaced without modifying either target directory.
test.skipIf(process.platform === "win32")(
  "watch follows a retargeted project directory link",
  () =>
    fixture(async (root) => {
      const first = path.join(root, "first");
      const second = path.join(root, "second");
      const linked = path.join(root, "project");
      fs.mkdirSync(first);
      fs.mkdirSync(second);
      fs.writeFileSync(path.join(first, "main.bpl"), "frame main(){}");
      fs.writeFileSync(path.join(second, "main.bpl"), "frame main(){return;}");
      fs.symlinkSync(first, linked, "dir");
      const changed: string[] = [];
      const watcher = createSourceWatcher(
        path.join(linked, "main.bpl"),
        (file) => changed.push(file),
        () => {},
      );
      try {
        watcher.refresh();
        fs.unlinkSync(linked);
        fs.symlinkSync(second, linked, "dir");
        const deadline = Date.now() + 3000;
        while (!changed.length && Date.now() < deadline)
          await new Promise((done) => setTimeout(done, 20));
        expect(changed.length).toBeGreaterThan(0);
        changed.length = 0;
        fs.writeFileSync(
          path.join(second, "main.bpl"),
          "frame main(){local x:int=1;}",
        );
        const editDeadline = Date.now() + 3000;
        while (!changed.length && Date.now() < editDeadline)
          await new Promise((done) => setTimeout(done, 20));
        expect(changed).toContain(path.join(second, "main.bpl"));
      } finally {
        watcher.close();
      }
    }),
  10000,
);

test.skipIf(process.platform === "win32")(
  "a linked entry preserves its supplied project scan root",
  () =>
    fixture((root) => {
      const app = path.join(root, "app");
      const shared = path.join(root, "shared");
      fs.mkdirSync(app);
      fs.mkdirSync(shared);
      const target = path.join(shared, "entry.bpl");
      const local = path.join(app, "local.bpl");
      const unrelated = path.join(shared, "unrelated.bpl");
      fs.writeFileSync(target, "frame main(){}");
      fs.writeFileSync(local, "frame localValue(){}");
      fs.writeFileSync(unrelated, "frame unrelated(){}");
      fs.symlinkSync(target, path.join(app, "main.bpl"));
      const targets = collectSourceWatchTargets(path.join(app, "main.bpl"));
      expect(targets.sources.has(target)).toBe(true);
      expect(targets.sources.has(local)).toBe(true);
      expect(targets.sources.has(unrelated)).toBe(false);
    }),
);
