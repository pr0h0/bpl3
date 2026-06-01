import { describe, expect, test } from "bun:test";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type BrowserWasmRuntime = {
  BROWSER_COMPILER_UNAVAILABLE_MESSAGE: string;
  detectBrowserWasmCapabilities(globalObject?: Record<string, unknown>): {
    canRunHostedWasm: boolean;
    canCompileBplInBrowser: boolean;
    missing: string[];
  };
  formatBrowserWasmCapabilitySummary(capabilities: {
    canRunHostedWasm: boolean;
    canCompileBplInBrowser: boolean;
    missing: string[];
  }): string;
  compileAndRunBplInBrowser(
    code: string,
    args?: string[],
    options?: {
      globalObject?: Record<string, unknown>;
      hostAdapter?: {
        runHostedWasmInBrowser(
          wasmBase64: string,
          argv: string[],
        ): Promise<{
          stdout: string;
          stderr: string;
          returnCode: number | null;
          trapped: boolean;
          error: string;
        }>;
      };
    },
  ): Promise<{
    success: boolean;
    phase: "capability" | "compile" | "run";
    error?: string;
    runResult?: {
      stdout: string;
      stderr: string;
      returnCode: number | null;
      trapped: boolean;
      error: string;
    };
  }>;
};

const browserWasmRuntime = require(
  "../playground/frontend/browserWasmRuntime.js",
) as BrowserWasmRuntime;

function makeBrowserGlobal(overrides: Record<string, unknown> = {}) {
  return {
    WebAssembly: {
      instantiate() {},
      Memory: class {},
      Instance: class {},
    },
    TextEncoder,
    TextDecoder,
    BplWasmHostAdapter: {
      runHostedWasmInBrowser() {},
    },
    ...overrides,
  };
}

describe("Playground browser wasm runtime", () => {
  test("detects browser-hosted wasm execution separately from browser compilation", () => {
    const capabilities = browserWasmRuntime.detectBrowserWasmCapabilities(
      makeBrowserGlobal(),
    );

    expect(capabilities).toEqual({
      canRunHostedWasm: true,
      canCompileBplInBrowser: false,
      missing: ["BplBrowserCompiler.compileToHostedWasm"],
    });
    expect(
      browserWasmRuntime.formatBrowserWasmCapabilitySummary(capabilities),
    ).toContain("Browser wasm runtime: available");
    expect(
      browserWasmRuntime.formatBrowserWasmCapabilitySummary(capabilities),
    ).toContain("Browser BPL compiler: unavailable");
  });

  test("reports missing browser runtime prerequisites without pretending compilation can run", () => {
    const capabilities = browserWasmRuntime.detectBrowserWasmCapabilities({});

    expect(capabilities.canRunHostedWasm).toBe(false);
    expect(capabilities.canCompileBplInBrowser).toBe(false);
    expect(capabilities.missing).toContain("WebAssembly.instantiate");
    expect(capabilities.missing).toContain("TextEncoder");
    expect(capabilities.missing).toContain(
      "BplWasmHostAdapter.runHostedWasmInBrowser",
    );
  });

  test("returns an actionable browser compiler diagnostic when only wasm execution is available", async () => {
    const result = await browserWasmRuntime.compileAndRunBplInBrowser(
      "frame main() ret int { return 0; }",
      [],
      { globalObject: makeBrowserGlobal() },
    );

    expect(result).toEqual({
      success: false,
      phase: "compile",
      error: browserWasmRuntime.BROWSER_COMPILER_UNAVAILABLE_MESSAGE,
    });
  });

  test("uses an injected browser compiler bundle and host adapter when both are available", async () => {
    const calls: string[] = [];
    const globalObject = makeBrowserGlobal({
      BplBrowserCompiler: {
        async compileToHostedWasm(request: { code: string; args: string[] }) {
          calls.push(`${request.code}:${request.args.join(",")}`);
          return {
            success: true,
            wasmBase64: "AGFzbQ==",
            wasmBytes: 8,
            imports: [],
          };
        },
      },
    });
    const hostAdapter = {
      async runHostedWasmInBrowser(wasmBase64: string, argv: string[]) {
        return {
          stdout: `${wasmBase64}:${argv.join(",")}`,
          stderr: "",
          returnCode: 7,
          trapped: false,
          error: "",
        };
      },
    };

    const result = await browserWasmRuntime.compileAndRunBplInBrowser(
      "source",
      ["alpha", "beta"],
      { globalObject, hostAdapter },
    );

    expect(calls).toEqual(["source:alpha,beta"]);
    expect(result).toEqual({
      success: true,
      phase: "run",
      runResult: {
        stdout: "AGFzbQ==:alpha,beta",
        stderr: "",
        returnCode: 7,
        trapped: false,
        error: "",
      },
    });
  });
});
