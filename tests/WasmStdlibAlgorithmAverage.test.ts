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
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-algorithm-average-"));
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

const largeLiteral = "1" + "0".repeat(308) + ".0";

for (const optimize of [0, 3]) {
  wasmTest(
    `array average retains finite results with the existing browser host at O${optimize}`,
    async () => {
      const module = await compile(
        `
        import [Algorithm] from "std/algorithm.bpl";
        import [Array] from "std/array.bpl";
        import [Math] from "std/math.bpl";
        frame main(argc: int, _argv: **char) ret int {
          local values: Array<float> = Array<float>.new(3);
          local large: float = ${largeLiteral};
          values.push(large);
          if (argc == 0) {
            values.push(large);
          } else {
            values.push(1.0);
            values.push(-large);
          }
          local result: float = Algorithm.average(&values);
          values.destroy();
          if (argc == 0) {
            if (result != large) { return 1; }
          } else {
            if (!(Math.abs(result / (1.0 / 3.0) - 1.0) < 0.000000000001)) { return 2; }
          }
          return 0;
        }`,
        optimize,
      );
      const names = WebAssembly.Module.imports(module).map((item) => item.name);
      for (const unexpected of [
        "log",
        "exp",
        "sqrt",
        "pow",
        "frexp",
        "ldexp",
      ]) {
        expect(names).not.toContain(unexpected);
      }
      const host = adapter.createHostedWasmBrowserHost([]);
      const instance = await WebAssembly.instantiate(module, host.imports);
      host.attach(instance.exports);
      const main = instance.exports.main as (
        argc: number,
        argv: number,
      ) => number;
      expect(main(0, 0)).toBe(0);
      expect(main(1, 0)).toBe(0);
    },
    60000,
  );
}
