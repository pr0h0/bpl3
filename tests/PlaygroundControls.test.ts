import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { createContext, runInContext } from "vm";

function controls(fetch: (url: string, init: RequestInit) => Promise<unknown>) {
  const handlers = new Map<string, () => Promise<void>>();
  const nodes = new Map<
    string,
    {
      value: string;
      textContent: string;
      checked: boolean;
      style: Record<string, string>;
      classList: { add(): void; remove(): void };
      addEventListener(event: string, handler: () => Promise<void>): void;
      appendChild(): void;
      querySelector(): { addEventListener(): void };
    }
  >();
  function node(id: string) {
    if (!nodes.has(id))
      nodes.set(id, {
        value: "",
        textContent: "",
        checked: false,
        style: {},
        classList: { add() {}, remove() {} },
        addEventListener: (event, handler) => {
          handlers.set(`${id}:${event}`, handler);
        },
        appendChild() {},
        querySelector: () => ({ addEventListener() {} }),
      });
    return nodes.get(id)!;
  }
  const requireStub = Object.assign(() => {}, { config() {} });
  const context = createContext({
    window: {
      location: { protocol: "http:" },
      addEventListener() {},
      BplWasmHostAdapter: {},
      BplBrowserWasmRuntime: {},
    },
    document: {
      getElementById: node,
      querySelector: node,
      querySelectorAll: () => [],
      createElement: node,
    },
    require: requireStub,
    AbortController,
    fetch,
    setTimeout: () => 0,
    console,
  });
  runInContext(readFileSync("playground/frontend/app.js", "utf8"), context);
  runInContext(
    'editor = { value: "original", getValue() { return this.value; }, setValue(value) { this.value = value; } }',
    context,
  );
  return { handlers, node };
}

test("Run waits for auto-format completion and compiles the formatted source", async () => {
  const calls: string[] = [];
  let finishFormat!: (value: unknown) => void;
  const ui = controls(async (url, init) => {
    calls.push(url);
    if (url === "/format")
      return new Promise((resolve) => {
        finishFormat = resolve;
      });
    expect(JSON.parse(String(init.body)).code).toBe("formatted");
    return { json: async () => ({ success: true, output: "done" }) };
  });
  ui.node("auto-format-checkbox").checked = true;
  const run = ui.handlers.get("run-btn:click")!();
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(calls).toEqual(["/format"]);
  finishFormat({ json: async () => ({ success: true, code: "formatted" }) });
  await run;
  expect(calls).toEqual(["/format", "/compile"]);
  expect(ui.node("output-content").textContent).toBe("done");
});

test("Stop aborts the active request, suppresses duplicate Run, and restores controls", async () => {
  let calls = 0;
  const ui = controls(async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init.signal!.addEventListener("abort", () =>
        reject(new DOMException("cancelled", "AbortError")),
      ),
    );
  });
  const run = ui.handlers.get("run-btn:click")!();
  await ui.handlers.get("run-btn:click")!();
  expect(calls).toBe(1);
  await ui.handlers.get("stop-btn:click")!();
  await run;
  expect(ui.node("output-content").textContent).toBe("Execution cancelled.");
  expect(ui.node("loading").style.display).toBe("none");
  const next = ui.handlers.get("run-btn:click")!();
  expect(calls).toBe(2);
  await ui.handlers.get("stop-btn:click")!();
  await next;
});

test("browser Wasm workers terminate on success, cancellation, and watchdog expiry", async () => {
  const workers: FakeWorker[] = [];
  const timers = new Map<number, () => void>();
  class FakeWorker {
    terminated = false;
    onmessage?: (event: { data: { result: string } }) => void;
    onerror?: (event: { message: string }) => void;
    constructor() {
      workers.push(this);
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  }
  const context = createContext({
    Worker: FakeWorker,
    DOMException,
    setTimeout: (fn: () => void) => {
      const id = timers.size + 1;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  runInContext(
    readFileSync("playground/frontend/wasmHostAdapter.js", "utf8"),
    context,
  );
  for (const kind of ["success", "cancel", "timeout"]) {
    const controller = new AbortController();
    context.signal = controller.signal;
    const run = runInContext(
      'BplWasmHostAdapter.runHostedWasmInWorker("wasm", [], { signal })',
      context,
    ) as Promise<unknown>;
    const worker = workers.at(-1)!;
    if (kind === "success") {
      worker.onmessage!({ data: { result: "done" } });
      expect(await run).toBe("done");
    } else if (kind === "cancel") {
      controller.abort();
      await expect(run).rejects.toMatchObject({ name: "AbortError" });
    } else {
      [...timers.values()][0]!();
      await expect(run).rejects.toThrow("timeout");
    }
    expect(worker.terminated).toBe(true);
    expect(timers.size).toBe(0);
  }
});
