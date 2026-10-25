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
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-complex-"));
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
  for (const name of ["exp", "sin", "cos"] as const) {
    wasmTest(
      `complex ${name} retains existing hosted math providers at O${optimize}`,
      async () => {
        const expected =
          name === "exp"
            ? [Math.exp(1) * Math.cos(0.25), Math.exp(1) * Math.sin(0.25)]
            : name === "sin"
              ? [Math.sin(1) * Math.cosh(0.25), Math.cos(1) * Math.sinh(0.25)]
              : [Math.cos(1) * Math.cosh(0.25), -Math.sin(1) * Math.sinh(0.25)];
        const module = await compile(
          `
          import [Complex] from "std/complex.bpl";
          import [Math] from "std/math.bpl";
          frame main(argc: int, _argv: **char) ret int {
            local z: Complex = Complex.new(cast<float>(argc), 0.25);
            local result: Complex = z.${name}();
            if (!(Math.abs(result.real - ${expected[0]}) < 0.000000000001)) { return 1; }
            if (!(Math.abs(result.imag - ${expected[1]}) < 0.000000000001)) { return 2; }
            return 0;
          }`,
          optimize,
        );
        const names = WebAssembly.Module.imports(module).map(
          (item) => item.name,
        );
        for (const unexpected of ["sinh", "cosh", "expm1", "log1p"]) {
          expect(names).not.toContain(unexpected);
        }
        const host = adapter.createHostedWasmBrowserHost([]);
        const instance = await WebAssembly.instantiate(module, {
          env: {
            ...host.imports.env,
            fmax: Math.max,
            // Existing Complex vtable imports; these operations must not call them.
            frexp: () => {
              throw new Error("unexpected frexp call");
            },
            ldexp: () => {
              throw new Error("unexpected ldexp call");
            },
            exp: Math.exp,
            sin: Math.sin,
            cos: Math.cos,
          },
        });
        host.attach(instance.exports);
        const main = instance.exports.main as (
          argc: number,
          argv: number,
        ) => number;
        expect(main(1, 0)).toBe(0);
      },
      60000,
    );
  }
}
