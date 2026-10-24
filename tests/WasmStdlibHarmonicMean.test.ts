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
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-harmonic-mean-"));
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

// Use the fixed-point literal syntax accepted by BPL.
const largestFiniteLiteral = "17976931348623157" + "0".repeat(292) + ".0";
const adjacentLowerLiteral = "17976931348623155" + "0".repeat(292) + ".0";

for (const optimize of [0, 3]) {
  wasmTest(
    `harmonic mean retains finite bounds without additional host providers at O${optimize}`,
    async () => {
      const module = await compile(
        `
        import [Stats] from "std/stats.bpl";
        frame main(argc: int, _argv: **char) ret int {
          local values: float[7];
          local upper: float = ${largestFiniteLiteral};
          local lower: float = ${adjacentLowerLiteral};
          loop(local i: int = 0; i < 7; i = i + 1) { values[i] = upper; }
          values[argc] = lower;
          local result: float = Stats.harmonicMean(&values[0], 7);
          if (!(result >= lower && result <= upper)) { return 1; }
          return 0;
        }`,
        optimize,
      );
      const names = WebAssembly.Module.imports(module).map((item) => item.name);
      for (const unexpected of ["log", "exp", "pow", "frexp", "ldexp"]) {
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
      expect(main(6, 0)).toBe(0);
    },
    60000,
  );
}
