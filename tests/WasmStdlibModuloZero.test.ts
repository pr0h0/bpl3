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
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-modulo-zero-"));
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
    `floor modulo zero keeps infinite divisor signs with the existing host at O${optimize}`,
    async () => {
      const module = await compile(
        `
        import [Math] from "std/math.bpl";
        frame main(argc: int, _argv: **char) ret int {
          local divisor: float = 1.0 / cast<float>(argc);
          local positive: float = Math.mod(-0.0, divisor);
          local negative: float = Math.mod(0.0, -divisor);
          if (positive != 0.0 || Math.copysign(1.0, positive) != 1.0) { return 1; }
          if (negative != 0.0 || Math.copysign(1.0, negative) != -1.0) { return 2; }
          return 0;
        }`,
        optimize,
      );
      const names = WebAssembly.Module.imports(module).map((item) => item.name);
      expect(names).toContain("fmod");
      expect(names).not.toContain("copysign");
      const host = adapter.createHostedWasmBrowserHost([]);
      const instance = await WebAssembly.instantiate(module, {
        env: { ...host.imports.env, fmod: (x: number, y: number) => x % y },
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
