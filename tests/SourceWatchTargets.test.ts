import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSourceWatchTargets } from "../cli/SourceWatchTargets";
import { createSourceWatcher } from "../cli/SourceWatcher";

function fixture(run: (root: string) => void | Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-watch-targets-"));
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
