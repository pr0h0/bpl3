import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const project = path.resolve(import.meta.dir, "..");
async function watchFixture(
  run: (
    root: string,
    start: (file: string) => {
      wait: (text: string) => Promise<void>;
      clear: () => void;
    },
  ) => Promise<void>,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-watch-files-"));
  const children: ReturnType<typeof spawn>[] = [];
  try {
    await run(root, (file) => {
      const child = spawn(
        process.execPath,
        [path.join(project, "index.ts"), "dev", file],
        {
          cwd: root,
          env: { ...process.env, BPL_HOME: project, NO_COLOR: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      children.push(child);
      let output = "";
      const listeners = new Set<() => void>();
      const receive = (data: Buffer) => {
        output += data.toString();
        for (const listener of listeners) listener();
      };
      child.stdout!.on("data", receive);
      child.stderr!.on("data", receive);
      child.on("exit", () => {
        for (const listener of listeners) listener();
      });
      return {
        clear: () => {
          output = "";
        },
        wait: (text) =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                finish(new Error(`Watch did not produce ${text}: ${output}`)),
              10000,
            );
            const finish = (error?: Error) => {
              clearTimeout(timeout);
              listeners.delete(check);
              if (error) reject(error);
              else resolve();
            };
            const check = () => {
              if (output.includes(text)) finish();
              else if (child.exitCode !== null || child.signalCode !== null)
                finish(new Error(`Watcher exited: ${output}`));
            };
            listeners.add(check);
            check();
          }),
      };
    });
  } finally {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const printing = (marker: string) =>
  `import [puts] from "std/c.bpl";frame main()ret int{puts("${marker}");return 0;}`;

test(
  "dev follows repeated atomic saves of its entry file",
  () =>
    watchFixture(async (root, start) => {
      const file = path.join(root, "main.bpl");
      fs.writeFileSync(file, printing("WATCH_FIRST"));
      const watcher = start(file);
      await watcher.wait("Watching for changes...");
      for (const marker of ["WATCH_SECOND", "WATCH_THIRD"]) {
        watcher.clear();
        const temporary = file + ".tmp";
        fs.writeFileSync(temporary, printing(marker));
        fs.renameSync(temporary, file);
        await watcher.wait(`\n${marker}\n`);
      }
    }),
  30000,
);

test(
  "dev recompiles when a missing imported source is created",
  () =>
    watchFixture(async (root, start) => {
      const file = path.join(root, "main.bpl");
      fs.writeFileSync(
        file,
        'import value from "./value.bpl";import [printf] from "std/c.bpl";frame main()ret int{printf("WATCH_VALUE_%d\\n",value());return 0;}',
      );
      const watcher = start(file);
      await watcher.wait("Watching for changes...");
      watcher.clear();
      fs.writeFileSync(
        path.join(root, "value.bpl"),
        "frame value()ret int{return 7;}export value;",
      );
      await watcher.wait("\nWATCH_VALUE_7\n");
    }),
  30000,
);

for (const suffix of [".bpl", ".x"]) {
  test(
    `dev follows an imported ${suffix} file outside the entry directory`,
    () =>
      watchFixture(async (root, start) => {
        const sourceDir = path.join(root, "src");
        const shared = path.join(root, "shared");
        fs.mkdirSync(sourceDir);
        fs.mkdirSync(shared);
        const module = path.join(shared, "value" + suffix);
        fs.writeFileSync(
          module,
          "frame value()ret int{return 1;}export value;",
        );
        const file = path.join(sourceDir, "main.bpl");
        fs.writeFileSync(
          file,
          `import value from "../shared/value${suffix}";import [printf] from "std/c.bpl";frame main()ret int{printf("WATCH_VALUE_%d\\n",value());return 0;}`,
        );
        const watcher = start(file);
        await watcher.wait("Watching for changes...");
        watcher.clear();
        fs.writeFileSync(
          module,
          "frame value()ret int{return 7;}export value;",
        );
        await watcher.wait("\nWATCH_VALUE_7\n");
      }),
    30000,
  );
}
