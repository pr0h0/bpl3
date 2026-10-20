import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSourceWatcher } from "../cli/SourceWatcher";

async function waitFor(ready: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error("Watcher did not recover");
    await new Promise((done) => setTimeout(done, 20));
  }
}

test("a watch handle error recovers without another filesystem event", async () => {
  const directory = fs.realpathSync(
    mkdtempSync(join(tmpdir(), "bpl-watch-error-")),
  );
  const entry = join(directory, "main.bpl");
  writeFileSync(entry, "frame main(){}");
  const watchSpy = spyOn(fs, "watch");
  const errors: unknown[] = [];
  const changed: string[] = [];
  const watcher = createSourceWatcher(
    entry,
    (file) => changed.push(file),
    (_path, error) => errors.push(error),
  );
  try {
    watcher.refresh();
    const initialCalls = watchSpy.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);
    const handle = watchSpy.mock.results.at(-1)?.value as fs.FSWatcher;
    handle.emit("error", new Error("temporary watcher failure"));
    expect(errors).toHaveLength(1);
    await waitFor(() => watchSpy.mock.calls.length > initialCalls);
    writeFileSync(entry, "frame main(){return;}");
    await waitFor(() => changed.includes(entry));
  } finally {
    watcher.close();
    watchSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10000);

test("an initial watch creation failure retries without a source change", async () => {
  const directory = fs.realpathSync(
    mkdtempSync(join(tmpdir(), "bpl-watch-create-error-")),
  );
  const entry = join(directory, "main.bpl");
  writeFileSync(entry, "frame main(){}");
  const watchSpy = spyOn(fs, "watch").mockImplementationOnce(() => {
    throw new Error("temporary create failure");
  });
  const errors: unknown[] = [];
  const changed: string[] = [];
  const watcher = createSourceWatcher(
    entry,
    (file) => changed.push(file),
    (_path, error) => errors.push(error),
  );
  try {
    watcher.refresh();
    expect(errors).toHaveLength(1);
    await waitFor(() => watchSpy.mock.calls.length > 1);
    writeFileSync(entry, "frame main(){return;}");
    await waitFor(() => changed.includes(entry));
  } finally {
    watcher.close();
    watchSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10000);

test("closing a failed watcher cancels its pending recovery", async () => {
  const directory = fs.realpathSync(
    mkdtempSync(join(tmpdir(), "bpl-watch-cancel-recovery-")),
  );
  const entry = join(directory, "main.bpl");
  writeFileSync(entry, "frame main(){}");
  const watchSpy = spyOn(fs, "watch");
  const watcher = createSourceWatcher(
    entry,
    () => {},
    () => {},
  );
  try {
    watcher.refresh();
    const handle = watchSpy.mock.results.at(-1)?.value as fs.FSWatcher;
    handle.emit("error", new Error("temporary failure"));
    const before = watchSpy.mock.calls.length;
    watcher.close();
    await new Promise((done) => setTimeout(done, 1200));
    expect(watchSpy.mock.calls.length).toBe(before);
  } finally {
    watcher.close();
    watchSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10000);

test("recovery reports an edit made while the handle was unavailable", async () => {
  const directory = fs.realpathSync(
    mkdtempSync(join(tmpdir(), "bpl-watch-gap-")),
  );
  const entry = join(directory, "main.bpl");
  writeFileSync(entry, "frame main(){}");
  const watchSpy = spyOn(fs, "watch");
  const changed: string[] = [];
  const watcher = createSourceWatcher(
    entry,
    (file) => changed.push(file),
    () => {},
  );
  try {
    watcher.refresh();
    const handle = watchSpy.mock.results.at(-1)?.value as fs.FSWatcher;
    handle.emit("error", new Error("temporary failure"));
    writeFileSync(entry, "frame main(){return;}");
    await waitFor(() => changed.includes(entry));
  } finally {
    watcher.close();
    watchSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10000);

test("persistent watch failures back off and report each directory once", async () => {
  const directory = fs.realpathSync(
    mkdtempSync(join(tmpdir(), "bpl-watch-backoff-")),
  );
  const entry = join(directory, "main.bpl");
  writeFileSync(entry, "frame main(){}");
  const watchSpy = spyOn(fs, "watch").mockImplementation(() => {
    throw new Error("persistent watch failure");
  });
  const timers = spyOn(globalThis, "setTimeout");
  const errors: unknown[] = [];
  const watcher = createSourceWatcher(
    entry,
    () => {},
    (_path, error) => errors.push(error),
  );
  try {
    watcher.refresh();
    await waitFor(() => watchSpy.mock.calls.length >= 2);
    expect(timers.mock.calls.map((call) => call[1])).toContain(2000);
    expect(errors).toHaveLength(1);
  } finally {
    watcher.close();
    timers.mockRestore();
    watchSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10000);
