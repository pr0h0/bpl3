import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { findWasmLinker } from "../cli/WasmToolchain";

const require = createRequire(import.meta.url);
const adapter = require("../playground/frontend/wasmHostAdapter.js") as {
  createHostedWasmBrowserHost(argv: string[]): {
    imports: NonNullable<Parameters<typeof WebAssembly.instantiate>[1]>;
    attach(exports: WebAssembly.Instance["exports"]): void;
  };
};
const wasmTest = findWasmLinker() ? test : test.skip;

/** Build a hosted BPL application and load its module, removing temporary files. */
async function compile(
  source: string,
  optimize: number,
): Promise<WebAssembly.Module> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-bound-virtual-"));
  try {
    const input = join(dir, "main.bpl");
    const output = join(dir, "main.wasm");
    writeFileSync(input, source);
    const result = spawnSync(
      "bun",
      [
        resolve("index.ts"),
        "build",
        input,
        "--target",
        "wasm32-unknown-unknown",
        "--wasm-runtime",
        "host",
        `-O${optimize}`,
        "-o",
        output,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return await WebAssembly.compile(new Uint8Array(readFileSync(output)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const optimize of [0, 3]) {
  wasmTest(
    `bound parent methods preserve virtual overrides on Wasm at O${optimize}`,
    async () => {
      const module = await compile(
        `
        struct Parent<T> {
          frame value(this: *Parent<T>) ret T { return cast<T>(1); }
        }
        struct Child<T>: Parent<T> {
          frame value(this: *Child<T>) ret T { return cast<T>(2); }
        }
        struct ValueParent {
          item: int,
          frame total(this: ValueParent) ret int { return this.item; }
        }
        struct ValueChild: ValueParent {
          extra: int,
          frame total(this: ValueChild) ret int {
            this.item = this.item + this.extra; return this.item;
          }
        }
        frame read(value: *Parent<int>) ret int {
          local call: Lambda<int>() = value.value;
          return call();
        }
        frame main() ret int {
          local child: Child<int>;
          local base: *Parent<int> = &child;
          local call: Lambda<int>() = base.value;
          if (call() != 2 || read(base) != 2) { return 1; }
          local value: ValueChild;
          value.item = 3; value.extra = 7;
          local parent: *ValueParent = &value;
          local total: Lambda<int>() = parent.total;
          if (total() != 10 || value.item != 3) { return 2; }
          value.extra = 11;
          if (total() != 14 || value.item != 3) { return 3; }
          return 0;
        }`,
        optimize,
      );
      const host = adapter.createHostedWasmBrowserHost([]);
      const instance = await WebAssembly.instantiate(module, host.imports);
      host.attach(instance.exports);
      const main = instance.exports.main as () => number;
      expect(main()).toBe(0);
    },
    60000,
  );
}
