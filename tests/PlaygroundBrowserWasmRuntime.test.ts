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
  formatHostedWasmRunReport(options: {
    compileMode: string;
    capabilitySummary: string;
    wasmBytes?: number;
    imports?: Array<{ module: string; name: string }>;
    runResult: {
      stdout: string;
      stderr: string;
      returnCode: number | null;
      trapped: boolean;
      error: string;
    };
  }): string;
  formatBrowserWasmFailureReport(options: {
    errorMessage: string;
    capabilitySummary: string;
    fallbackError?: string;
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

  test("formats backend and browser compiler wasm run output without DOM state", () => {
    const backendReport = browserWasmRuntime.formatHostedWasmRunReport({
      compileMode: "backend /wasm",
      capabilitySummary:
        "Browser wasm runtime: available\nBrowser BPL compiler: unavailable",
      wasmBytes: 1234,
      imports: [{ module: "env", name: "__bpl_host_write" }],
      runResult: {
        stdout: "ok\n",
        stderr: "",
        returnCode: 0,
        trapped: false,
        error: "",
      },
    });

    expect(backendReport).toBe(
      [
        "Compile mode: backend /wasm",
        "Browser wasm runtime: available\nBrowser BPL compiler: unavailable",
        "",
        "Return code: 0",
        "Wasm bytes: 1234",
        "Imports:\nenv.__bpl_host_write",
        "",
        "stdout:",
        "ok\n",
        "",
        "stderr:",
        "(empty)",
      ].join("\n"),
    );

    const browserReport = browserWasmRuntime.formatHostedWasmRunReport({
      compileMode: "browser",
      capabilitySummary:
        "Browser wasm runtime: available\nBrowser BPL compiler: available",
      runResult: {
        stdout: "from browser",
        stderr: "warn",
        returnCode: 7,
        trapped: false,
        error: "",
      },
    });

    expect(browserReport).toBe(
      [
        "Compile mode: browser",
        "Browser wasm runtime: available\nBrowser BPL compiler: available",
        "",
        "Return code: 7",
        "",
        "stdout:",
        "from browser",
        "",
        "stderr:",
        "warn",
      ].join("\n"),
    );
  });

  test("formats browser fallback and trapped wasm output without DOM state", () => {
    expect(
      browserWasmRuntime.formatBrowserWasmFailureReport({
        errorMessage: "Failed to fetch",
        capabilitySummary:
          "Browser wasm runtime: available\nBrowser BPL compiler: unavailable",
        fallbackError:
          browserWasmRuntime.BROWSER_COMPILER_UNAVAILABLE_MESSAGE,
      }),
    ).toBe(
      [
        "WebAssembly run failed: Failed to fetch",
        "",
        "Browser wasm runtime: available\nBrowser BPL compiler: unavailable",
        "",
        `Browser-only fallback: ${browserWasmRuntime.BROWSER_COMPILER_UNAVAILABLE_MESSAGE}`,
      ].join("\n"),
    );

    expect(
      browserWasmRuntime.formatHostedWasmRunReport({
        compileMode: "backend /wasm",
        capabilitySummary: "Browser wasm runtime: available",
        runResult: {
          stdout: "",
          stderr: "before trap",
          returnCode: null,
          trapped: true,
          error: "unreachable",
        },
      }),
    ).toContain("trap:\nunreachable");
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
