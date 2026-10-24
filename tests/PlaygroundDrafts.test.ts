import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createContext, runInContext } from "vm";
const script = readFileSync(
  resolve(import.meta.dir, "../playground/frontend/draftStore.js"),
  "utf8",
);
function store() {
  const ctx = createContext({});
  runInContext(script, ctx);
  return ctx.BplDraftStore;
}
test("drafts restore exact code, stdin and arguments and can be reset", () => {
  const values = new Map();
  const storage = {
    getItem: (k: string) => values.get(k),
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
  const api = store();
  const draft = {
    code: "frame main(){}\r\n",
    stdin: "hello\n",
    args: '"two words"',
  };
  expect(api.save(storage, draft)).toBe(true);
  expect(api.load(storage)).toEqual({ ...draft, version: 1 });
  expect(api.clear(storage)).toBe(true);
  expect(api.load(storage)).toBeNull();
});
test("unavailable or malformed storage never blocks editing", () => {
  const api = store();
  const denied = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("quota");
    },
    removeItem() {
      throw Error("denied");
    },
  };
  expect(api.load(denied)).toBeNull();
  expect(api.save(denied, {})).toBe(false);
  expect(api.clear(denied)).toBe(false);
  for (const value of ["invalid", '{"version":2}', '{"version":1,"code":3}'])
    expect(api.load({ getItem: () => value })).toBeNull();
});
