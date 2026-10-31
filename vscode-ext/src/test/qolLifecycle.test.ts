import { expect, test } from "bun:test";
import { ValidationScheduler } from "../ValidationScheduler";
import { FormattingFailures } from "../FormattingFailures";
import { saveAndRunDocument } from "../RunDocument";
import { SymbolIndex } from "../services/SymbolIndex";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  unlinkSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";
const pause = () => new Promise((r) => setTimeout(r, 15));
test("validation coalesces edits and invalidates work awaiting settings on close", async () => {
  const scheduler = new ValidationScheduler(1);
  const published: string[] = [];
  const fail = (e: unknown) => {
    throw e;
  };
  scheduler.schedule(
    "file",
    async (current) => {
      if (current()) published.push("old");
    },
    fail,
  );
  scheduler.schedule(
    "file",
    async (current) => {
      if (current()) published.push("new");
    },
    fail,
  );
  await pause();
  expect(published).toEqual(["new"]);
  let resume!: () => void;
  const ready = new Promise<void>((r) => {
    resume = r;
  });
  scheduler.schedule(
    "file",
    async (current) => {
      await ready;
      if (current()) published.push("closed");
    },
    fail,
  );
  await pause();
  scheduler.cancel("file");
  resume();
  await pause();
  expect(published).toEqual(["new"]);
});
test("run awaits saving and never launches after a failed or rejected save", async () => {
  const events: string[] = [];
  expect(
    await saveAndRunDocument(
      {
        isDirty: true,
        async save() {
          events.push("saved");
          return true;
        },
      },
      async () => events.push("run"),
    ),
  ).toBe(true);
  expect(events).toEqual(["saved", "run"]);
  expect(
    await saveAndRunDocument(
      {
        isDirty: true,
        async save() {
          return false;
        },
      },
      async () => events.push("bad"),
    ),
  ).toBe(false);
  let rejected = false;
  try {
    await saveAndRunDocument(
      {
        isDirty: true,
        async save() {
          throw Error("disk");
        },
      },
      async () => events.push("bad"),
    );
  } catch (error) {
    rejected = error instanceof Error && error.message === "disk";
  }
  expect(rejected).toBe(true);
  expect(events).toEqual(["saved", "run"]);
});
test("formatting failures notify once and reset after success", () => {
  const failures = new FormattingFailures();
  const messages: string[] = [];
  const notify = (m: string) => messages.push(m);
  failures.report("a", Error("bad config"), notify);
  failures.report("a", Error("bad config"), notify);
  expect(messages).toHaveLength(1);
  failures.clear("a");
  failures.report("a", Error("bad config"), notify);
  expect(messages).toHaveLength(2);
});
test("clearing filesystem caches exposes created and deleted imports", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-refresh-"));
  try {
    const index = new SymbolIndex();
    const entry = join(dir, "main.bpl");
    const child = join(dir, "child.bpl");
    writeFileSync(entry, "frame main(){}");
    expect(index.resolveAndIndex("./child.bpl", entry)).toEqual([]);
    writeFileSync(child, "export hello; frame hello(){}");
    index.getResolver().clearCache();
    index.clear();
    expect(
      index
        .resolveAndIndex("./child.bpl", entry)
        .some((x) => x.name === "hello"),
    ).toBe(true);
    unlinkSync(child);
    index.getResolver().clearCache();
    index.clear();
    expect(index.resolveAndIndex("./child.bpl", entry)).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("packaged JSON schemas are copied from schemas/ and registered", () => {
  // `npm test` compiles first, and compiling copies the schemas into out/.
  const extensionRoot = resolve(import.meta.dir, "../..");
  const root = resolve(extensionRoot, "..");
  const manifest = JSON.parse(
    readFileSync(join(extensionRoot, "package.json"), "utf8"),
  );
  const urls = manifest.contributes.jsonValidation.map(
    (entry: { url: string }) => entry.url,
  );
  expect(urls).toEqual([
    "./out/schemas/bpl-format.schema.json",
    "./out/schemas/bpl-package.schema.json",
  ]);
  for (const url of urls) {
    expect(readFileSync(join(extensionRoot, url), "utf8")).toBe(
      readFileSync(join(root, "schemas", basename(url)), "utf8"),
    );
  }
});
