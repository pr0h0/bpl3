import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { getCompilerDriver } from "../compiler/common/CompilerDriver";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const project = path.resolve(import.meta.dir, "..");
async function watchFixture(
  run: (
    root: string,
    start: (
      file: string,
      env?: NodeJS.ProcessEnv,
    ) => {
      wait: (text: string) => Promise<void>;
      clear: () => void;
    },
  ) => Promise<void>,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-watch-files-"));
  const children: ReturnType<typeof spawn>[] = [];
  try {
    await run(root, (file, env) => {
      const child = spawn(
        process.execPath,
        [path.join(project, "index.ts"), "dev", file],
        {
          cwd: root,
          env: { ...process.env, BPL_HOME: project, NO_COLOR: "1", ...env },
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

test(
  "dev resumes after the entry directory is removed and recreated",
  () =>
    watchFixture(async (root, start) => {
      const app = path.join(root, "app");
      fs.mkdirSync(app);
      const entry = path.join(app, "main.bpl");
      fs.writeFileSync(entry, printing("WATCH_ORIGINAL"));
      const watcher = start(entry);
      await watcher.wait("Watching for changes...");
      watcher.clear();
      fs.renameSync(app, app + "-previous");
      await watcher.wait("Compilation failed");
      watcher.clear();
      fs.mkdirSync(app);
      fs.writeFileSync(entry, printing("WATCH_RESTORED"));
      await watcher.wait("\nWATCH_RESTORED\n");
      watcher.clear();
      fs.writeFileSync(entry, printing("WATCH_AFTER_RESTORATION"));
      await watcher.wait("\nWATCH_AFTER_RESTORATION\n");
    }),
  30000,
);

test(
  "dev detects source edits made during its initial native build",
  () =>
    watchFixture(async (root, start) => {
      const file = path.join(root, "main.bpl");
      const ready = path.join(root, "driver-ready");
      const release = path.join(root, "driver-release");
      const driverSource = path.join(root, "compile-driver.js");
      fs.writeFileSync(
        driverSource,
        [
          'const fs=require("node:fs");const {spawnSync}=require("node:child_process");',
          "const args=process.argv.slice(2);",
          `const ready=${JSON.stringify(ready)};const release=${JSON.stringify(release)};`,
          'if(args.some(arg=>arg.endsWith(".ll"))&&!fs.existsSync(ready)){fs.writeFileSync(ready,"ready");const deadline=Date.now()+10000;while(!fs.existsSync(release)&&Date.now()<deadline)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);if(!fs.existsSync(release))process.exit(1);}',
          `const result=spawnSync(${JSON.stringify(getCompilerDriver())},args,{stdio:"inherit"});process.exit(result.status??1);`,
        ].join("\n"),
      );
      const driver = path.join(
        root,
        process.platform === "win32" ? "compile-driver.exe" : "compile-driver",
      );
      const build = spawnSync(
        process.execPath,
        ["build", "--compile", driverSource, "--outfile", driver],
        { encoding: "utf8", timeout: 20000 },
      );
      if (build.status !== 0)
        throw new Error(`Cannot build test driver: ${build.stderr}`);
      fs.writeFileSync(file, printing("WATCH_BUILD_BEFORE"));
      const watcher = start(file, { BPL_CC: driver });
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(ready) && Date.now() < deadline)
        await Bun.sleep(20);
      expect(fs.existsSync(ready)).toBe(true);
      fs.writeFileSync(file, printing("WATCH_BUILD_AFTER"));
      fs.writeFileSync(release, "release");
      await watcher.wait("\nWATCH_BUILD_AFTER\n");
    }),
  60000,
);
