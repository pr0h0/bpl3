import { describe, expect, test } from "bun:test";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type HostEnv = {
  __bpl_host_write(fd: number, ptr: number, len: number): void;
  __bpl_host_exit(code: number): never;
  __bpl_host_argc(): number;
  __bpl_host_argv_len(index: number): number;
  __bpl_host_argv_copy(index: number, ptr: number): void;
  __bpl_host_error(
    code: number,
    detailPtr: number,
    funcPtr: number,
    line: number,
    col: number,
  ): void;
};

type PlaygroundWasmHost = {
  imports: { env: HostEnv };
  attach(moduleExports: { memory: WebAssembly.Memory }): void;
  captureException(error: unknown): void;
  result(): {
    stdout: string;
    stderr: string;
    returnCode: number | null;
    trapped: boolean;
    error: string;
  };
};

type PlaygroundWasmHostAdapter = {
  HOSTED_WASM_ENV_IMPORTS: readonly string[];
  assertHostedWasmEnvImports(env: Record<string, unknown>): void;
  createHostedWasmBrowserHost(argv?: string[]): PlaygroundWasmHost;
};

const wasmHostAdapter = require(
  "../playground/frontend/wasmHostAdapter.js",
) as PlaygroundWasmHostAdapter;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function writeBytes(memory: WebAssembly.Memory, ptr: number, value: string) {
  new Uint8Array(memory.buffer, ptr, value.length).set(encoder.encode(value));
}

function writeCString(memory: WebAssembly.Memory, ptr: number, value: string) {
  const bytes = encoder.encode(`${value}\0`);
  new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
}

function readString(memory: WebAssembly.Memory, ptr: number, len: number) {
  return decoder.decode(new Uint8Array(memory.buffer, ptr, len));
}

describe("Playground hosted wasm browser adapter", () => {
  test("exports the full host import contract used by hosted wasm", () => {
    expect(wasmHostAdapter.HOSTED_WASM_ENV_IMPORTS).toEqual([
      "__bpl_host_write",
      "__bpl_host_exit",
      "__bpl_host_argc",
      "__bpl_host_argv_len",
      "__bpl_host_argv_copy",
      "__bpl_host_error",
    ]);

    expect(() =>
      wasmHostAdapter.assertHostedWasmEnvImports({
        __bpl_host_write() {},
      }),
    ).toThrow(
      "missing __bpl_host_exit, __bpl_host_argc, __bpl_host_argv_len, __bpl_host_argv_copy, __bpl_host_error",
    );
  });

  test("routes writes, argv, exit, and BPL errors through browser-safe hooks", () => {
    const host = wasmHostAdapter.createHostedWasmBrowserHost([
      "alpha",
      "beta",
    ]);
    const memory = new WebAssembly.Memory({ initial: 1 });
    host.attach({ memory });

    writeBytes(memory, 16, "hello");
    host.imports.env.__bpl_host_write(1, 16, 5);
    writeBytes(memory, 32, "warn");
    host.imports.env.__bpl_host_write(2, 32, 4);

    expect(host.imports.env.__bpl_host_argc()).toBe(3);
    expect(host.imports.env.__bpl_host_argv_len(0)).toBe("program".length);
    expect(host.imports.env.__bpl_host_argv_len(1)).toBe("alpha".length);
    expect(host.imports.env.__bpl_host_argv_len(2)).toBe("beta".length);
    expect(host.imports.env.__bpl_host_argv_len(3)).toBe(-1);

    host.imports.env.__bpl_host_argv_copy(2, 64);
    expect(readString(memory, 64, "beta".length)).toBe("beta");

    writeCString(memory, 96, "division by zero");
    writeCString(memory, 128, "main");
    host.imports.env.__bpl_host_error(3, 96, 128, 12, 7);

    let exitError: unknown;
    try {
      host.imports.env.__bpl_host_exit(42);
    } catch (error) {
      exitError = error;
    }
    expect(exitError).toBeInstanceOf(Error);
    host.captureException(exitError);

    expect(host.result()).toEqual({
      stdout: "hello",
      stderr: "warnBPL runtime error 3 division by zero in main at 12:7\n",
      returnCode: 42,
      trapped: false,
      error: "",
    });
  });
});
