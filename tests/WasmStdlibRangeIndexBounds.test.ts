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
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-range-index-"));
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
    `range indexing preserves valid results and rejects invalid indices in hosted Wasm at O${optimize}`,
    async () => {
      const module = await compile(
        `
        import [Range] from "std/range.bpl";
        frame main(argc: int, _argv: **char) ret int {
          local wide: Range = Range.betweenInclusive(-2147483648, 2147483647);
          if (wide[2147483647] != -1) { return 99; }
          local range: Range = Range.new(1, 5, 2);
          return range[argc];
        }`,
        optimize,
      );
      for (const [index, expected] of [
        [0, 1],
        [1, 3],
        [-1, null],
        [2, null],
      ] as const) {
        const host = adapter.createHostedWasmBrowserHost([]);
        const instance = await WebAssembly.instantiate(module, host.imports);
        host.attach(instance.exports);
        const main = instance.exports.main as (
          argc: number,
          argv: number,
        ) => number;
        if (expected === null) {
          expect(() => main(index, 0)).toThrow("wasm exit(1)");
        } else {
          expect(main(index, 0)).toBe(expected);
        }
      }
    },
    60000,
  );
}
