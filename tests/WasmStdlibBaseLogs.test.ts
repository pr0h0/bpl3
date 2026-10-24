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

async function compile(
  source: string,
  optimize: number,
): Promise<WebAssembly.Module> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-base-logs-"));
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
  for (const [name, expected] of [
    ["log10", Math.log10(1000)],
    ["log2", Math.log2(1000)],
  ] as const) {
    wasmTest(
      `stdlib ${name} preserves the existing hosted natural-log provider at O${optimize}`,
      async () => {
        const module = await compile(
          `
        import [Math] from "std/math.bpl";
        frame main(argc: int, _argv: **char) ret int {
          local value: float = cast<float>(argc) + 1000.0;
          if (!(Math.abs(Math.${name}(value) - ${expected.toFixed(16)}) < 0.000000000001)) { return 1; }
          return 0;
        }`,
          optimize,
        );
        const names = WebAssembly.Module.imports(module).map(
          (item) => item.name,
        );
        expect(names).toContain("log");
        expect(names).not.toContain("log10");
        expect(names).not.toContain("log2");
        const host = adapter.createHostedWasmBrowserHost([]);
        const instance = await WebAssembly.instantiate(module, {
          env: { ...host.imports.env, log: Math.log },
        });
        host.attach(instance.exports);
        const main = instance.exports.main as (
          argc: number,
          argv: number,
        ) => number;
        expect(main(0, 0)).toBe(0);
      },
      60000,
    );
  }

  wasmTest(
    `ordinary user log2 extern keeps its explicit host binding at O${optimize}`,
    async () => {
      const module = await compile(
        `
      extern log2(value: float) ret float;
      frame main(argc: int, _argv: **char) ret int {
        return cast<int>(log2(cast<float>(argc)));
      }`,
        optimize,
      );
      const names = WebAssembly.Module.imports(module).map((item) => item.name);
      expect(names).toContain("log2");
      expect(names).not.toContain("log");
      const host = adapter.createHostedWasmBrowserHost([]);
      const instance = await WebAssembly.instantiate(module, {
        env: { ...host.imports.env, log2: (value: number) => value + 7 },
      });
      host.attach(instance.exports);
      const main = instance.exports.main as (
        argc: number,
        argv: number,
      ) => number;
      expect(main(4, 0)).toBe(11);
    },
    60000,
  );
}
