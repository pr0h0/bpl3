import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WatchProgramRunner } from "../cli/WatchProgramRunner";

async function waitUntil(ready: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!ready()) {
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for watch program");
    await new Promise((done) => setTimeout(done, 20));
  }
}
test("watch runner recovers after a spawn failure and reports nonzero program exits", async () => {
  const messages: string[] = [];
  const runner = new WatchProgramRunner((message) => messages.push(message));
  try {
    runner.start(
      join(tmpdir(), "bpl-no-executable-" + crypto.randomUUID()),
      [],
    );
    await waitUntil(() =>
      messages.some((message) => message.includes("Failed to run executable")),
    );
    await runner.stop();
    runner.start(process.execPath, ["-e", "process.exit(7)"]);
    await waitUntil(() => messages.includes("Program exited with code 7"));
  } finally {
    await runner.stop();
  }
}, 15000);

test("watch runner timeouts stop programs and leave the runner reusable", async () => {
  const previous = process.env.BPL_RUN_TIMEOUT_MS;
  const messages: string[] = [];
  const runner = new WatchProgramRunner((message) => messages.push(message));
  try {
    process.env.BPL_RUN_TIMEOUT_MS = "100";
    runner.start(process.execPath, ["-e", "setInterval(()=>{},1000)"]);
    await waitUntil(() =>
      messages.some((message) => message.includes("Executable timed out")),
    );
    await runner.stop();
    delete process.env.BPL_RUN_TIMEOUT_MS;
    runner.start(process.execPath, ["-e", "process.exit(9)"]);
    await waitUntil(() => messages.includes("Program exited with code 9"));
  } finally {
    await runner.stop();
    if (previous === undefined) delete process.env.BPL_RUN_TIMEOUT_MS;
    else process.env.BPL_RUN_TIMEOUT_MS = previous;
  }
}, 15000);

test.skipIf(process.platform === "win32")(
  "watch runner coalesces stop requests and escalates an ignored termination",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-watch-stop-"));
    const ready = join(directory, "ready");
    const messages: string[] = [];
    const runner = new WatchProgramRunner((message) => messages.push(message));
    try {
      runner.start(process.execPath, [
        "-e",
        `process.on("SIGTERM",()=>{});require("fs").writeFileSync(${JSON.stringify(ready)},"");setTimeout(()=>require("fs").writeFileSync(${JSON.stringify(ready)},String(process.pid)),100);setInterval(()=>{},1000);`,
      ]);
      let pid = 0;
      await waitUntil(() => {
        if (!existsSync(ready)) return false;
        pid = Number(readFileSync(ready, "utf8"));
        return Number.isSafeInteger(pid) && pid > 0;
      });
      await Promise.all([runner.stop(), runner.stop()]);
      expect(() => process.kill(pid, 0)).toThrow();
      expect(messages).toEqual([]);
    } finally {
      await runner.stop();
      rmSync(directory, { recursive: true, force: true });
    }
  },
  15000,
);

test("long run timeout does not expire a short-lived program immediately", async () => {
  const previous = process.env.BPL_RUN_TIMEOUT_MS;
  const messages: string[] = [];
  const runner = new WatchProgramRunner((message) => messages.push(message));
  try {
    process.env.BPL_RUN_TIMEOUT_MS = "2147483648";
    runner.start(process.execPath, [
      "-e",
      "setTimeout(()=>process.exit(7),100)",
    ]);
    await waitUntil(() => messages.length > 0);
    expect(messages).toEqual(["Program exited with code 7"]);
  } finally {
    await runner.stop();
    if (previous === undefined) delete process.env.BPL_RUN_TIMEOUT_MS;
    else process.env.BPL_RUN_TIMEOUT_MS = previous;
  }
}, 15000);
