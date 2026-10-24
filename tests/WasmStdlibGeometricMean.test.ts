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
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-geometric-mean-"));
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

// Emit a fixed-point literal, following the current BPL numeric syntax.
const largestFiniteLiteral = "17976931348623157" + "0".repeat(292) + ".0";

for (const optimize of [0, 3]) {
  wasmTest(
    `geometric mean retains finite bounds and the existing log/exp host at O${optimize}`,
    async () => {
      const module = await compile(
        `
        import [Stats] from "std/stats.bpl";
        import [Math] from "std/math.bpl";
        frame main(argc: int, _argv: **char) ret int {
          if (argc == 0) {
            local values: float[70];
            local sample: float = ${largestFiniteLiteral};
            loop(local i: int = 0; i < 70; i = i + 1) { values[i] = sample; }
            if (Stats.geometricMean(&values[0], 70) != sample) { return 1; }
          } else {
            local values: float[2] = [cast<float>(argc), 4.0];
            if (!(Math.abs(Stats.geometricMean(&values[0], 2) - 2.0) < 0.000000000001)) { return 2; }
          }
          return 0;
        }`,
        optimize,
      );
      const names = WebAssembly.Module.imports(module).map((item) => item.name);
      expect(names).toContain("log");
      expect(names).toContain("exp");
      for (const unexpected of ["log1p", "expm1", "frexp", "ldexp", "pow"]) {
        expect(names).not.toContain(unexpected);
      }
      const host = adapter.createHostedWasmBrowserHost([]);
      const instance = await WebAssembly.instantiate(module, {
        env: { ...host.imports.env, log: Math.log, exp: Math.exp },
      });
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
