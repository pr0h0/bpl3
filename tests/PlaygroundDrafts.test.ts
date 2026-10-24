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

test("untouched examples remain clean after restore and failed reset warns", () => {
  const values = new Map<string, string>();
  let failClear = false;
  const handlers = new Map<string, () => void>();
  const notices: Array<{ message: string; type: string }> = [];
  const node = (id: string) => ({
    value: "",
    textContent: "",
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener(event: string, handler: () => void) {
      handlers.set(`${id}:${event}`, handler);
    },
  });
  const nodes = new Map<string, ReturnType<typeof node>>();
  const getNode = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, node(id));
    return nodes.get(id)!;
  };
  const storage = {
    getItem: (k: string) => values.get(k),
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem(k: string) {
      if (failClear) throw Error("denied");
      values.delete(k);
    },
  };
  const loader = Object.assign(() => {}, { config() {} });
  const ctx = createContext({
    window: {
      location: new URL("http://localhost"),
      localStorage: storage,
      BplWasmHostAdapter: {},
      BplBrowserWasmRuntime: {},
      addEventListener() {},
    },
    document: {
      getElementById: getNode,
      querySelector: () => getNode("selected"),
      querySelectorAll: () => [],
    },
    require: loader,
    confirm: () => true,
    notices,
    console,
  });
  runInContext(script, ctx);
  runInContext(
    readFileSync(
      resolve(import.meta.dir, "../playground/frontend/app.js"),
      "utf8",
    ),
    ctx,
  );
  runInContext(
    'editor={value:"",getValue(){return this.value;},setValue(value){this.value=value;}};showToast=(message,type)=>notices.push({message,type});draftReady=true;',
    ctx,
  );
  runInContext(
    'loadExample({title:"example",description:"",code:["frame main(){}"]},null);restoreDraft();',
    ctx,
  );
  expect(runInContext("draftChanged", ctx)).toBe(false);
  expect(JSON.parse([...values.values()][0]!).edited).toBe(false);
  runInContext("persistDraft();restoreDraft();setupQuickActions();", ctx);
  expect(runInContext("draftChanged", ctx)).toBe(true);
  failClear = true;
  handlers.get("clear-editor-btn:click")!();
  expect(runInContext("draftChanged && !draftPersisted", ctx)).toBe(true);
  expect(notices.at(-1)?.message).toContain("could not be removed");
  expect(notices.at(-1)?.type).toBe("warning");
  failClear = false;
  handlers.get("clear-editor-btn:click")!();
  expect(values.size).toBe(0);
  expect(runInContext("draftChanged", ctx)).toBe(false);
  expect(notices.at(-1)?.message).toBe("Editor and saved draft cleared");
});
