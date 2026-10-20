import { expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = join(import.meta.dir, "..");
function source(marker: string) {
  return `extern printf(format:string,...)ret int;
extern fflush(stream:*void)ret int;
extern sleep(seconds:uint)ret uint;
extern getpid()ret int;
frame main()ret int{
 printf("${marker} %d\\n",getpid());fflush(nullptr);
 loop{sleep(1);}
}`;
}
function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function exitChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
  child.kill("SIGTERM");
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
async function fixture(
  extra: string[],
  run: (context: {
    file: string;
    child: ChildProcess;
    wait: (text: string) => Promise<void>;
    pid: (marker: string) => number;
    output: () => string;
  }) => Promise<void>,
  command: string[] = ["bun", join(project, "index.ts")],
) {
  const directory = mkdtempSync(join(tmpdir(), "bpl-responsive-watch-"));
  const file = join(directory, "main.bpl");
  writeFileSync(file, source("WATCH_A"));
  const child = spawn(
    command[0]!,
    [...command.slice(1), "dev", file, ...extra],
    {
      env: { ...process.env, BPL_HOME: project, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const appPids = new Set<number>();
  let spawnError: Error | undefined;
  const receive = (data: Buffer) => {
    output += data.toString();
    for (const match of output.matchAll(/WATCH_[ABC] (\d+)/g))
      appPids.add(Number(match[1]));
  };
  child.stdout!.on("data", receive);
  child.stderr!.on("data", receive);
  child.on("error", (error) => {
    spawnError = error;
  });
  const wait = async (text: string) => {
    const deadline = Date.now() + 7000;
    while (!output.includes(text)) {
      if (spawnError) throw spawnError;
      if (
        child.exitCode !== null ||
        child.signalCode !== null ||
        Date.now() > deadline
      )
        throw new Error(
          `Watch stopped/timed out waiting for ${text}: ${output}`,
        );
      await new Promise((done) => setTimeout(done, 25));
    }
  };
  try {
    await run({
      file,
      child,
      wait,
      pid: (marker) => {
        const match = output.match(new RegExp(marker + " (\\d+)"));
        if (!match) throw new Error("No PID for " + marker);
        return Number(match[1]);
      },
      output: () => output,
    });
  } finally {
    await exitChild(child);
    for (const pid of appPids)
      if (isRunning(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const extra of [[], ["--cache"]]) {
  test.skipIf(process.platform === "win32")(
    `dev restarts a running program on edits: ${extra.join(" ") || "uncached"}`,
    async () => {
      await fixture(extra, async ({ file, wait, pid }) => {
        await wait("WATCH_A ");
        const oldPid = pid("WATCH_A");
        writeFileSync(file, source("WATCH_B"));
        await wait("WATCH_B ");
        expect(pid("WATCH_B")).not.toBe(oldPid);
        expect(isRunning(oldPid)).toBe(false);
        const middlePid = pid("WATCH_B");
        writeFileSync(file, source("WATCH_C"));
        await wait("WATCH_C ");
        expect(pid("WATCH_C")).not.toBe(middlePid);
        expect(isRunning(middlePid)).toBe(false);
        await wait("Watching for changes...");
      });
    },
    30000,
  );
}
test.skipIf(process.platform === "win32")(
  "stopping dev also stops its running program",
  async () => {
    await fixture([], async ({ child, wait, pid }) => {
      await wait("WATCH_A ");
      const appPid = pid("WATCH_A");
      await exitChild(child);
      expect(isRunning(appPid)).toBe(false);
    });
  },
  30000,
);

test.skipIf(process.platform === "win32")(
  "compiled compiler can restart running dev programs",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-compiled-watch-"));
    const compiler = join(directory, "bpl");
    try {
      const build = spawnSync(
        "bun",
        [
          "build",
          join(project, "index.ts"),
          "--compile",
          "--outfile",
          compiler,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status).toBe(0);
      await fixture(
        [],
        async ({ file, wait, pid }) => {
          await wait("WATCH_A ");
          const oldPid = pid("WATCH_A");
          writeFileSync(file, source("WATCH_B"));
          await wait("WATCH_B ");
          expect(isRunning(oldPid)).toBe(false);
        },
        [compiler],
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  90000,
);
