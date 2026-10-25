import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchMode, type WatchSession } from "../cli/Watcher";
import { WatchProgramRunner } from "../cli/WatchProgramRunner";

test("watch shutdown retains signal handlers until child cleanup completes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-watch-shutdown-"));
  const entry = join(directory, "main.bpl");
  writeFileSync(entry, "frame main(){}");
  let release!: () => void;
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stop = spyOn(WatchProgramRunner.prototype, "stop").mockImplementation(
    () => stopped,
  );
  const interrupts = process.listenerCount("SIGINT");
  const terminations = process.listenerCount("SIGTERM");
  let session: WatchSession | undefined;
  try {
    session = watchMode(entry, { run: false });
    const closing = session.close();
    expect(session.close()).toBe(closing);
    expect(process.listenerCount("SIGINT")).toBe(interrupts + 1);
    expect(process.listenerCount("SIGTERM")).toBe(terminations + 1);
    release();
    await closing;
    expect(process.listenerCount("SIGINT")).toBe(interrupts);
    expect(process.listenerCount("SIGTERM")).toBe(terminations);
  } finally {
    release();
    await session?.close();
    stop.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});
