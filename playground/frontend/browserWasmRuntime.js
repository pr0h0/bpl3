(function (global) {
  "use strict";

  const BROWSER_COMPILER_UNAVAILABLE_MESSAGE =
    "Browser-only BPL compilation is not available in this build. Use the playground backend /wasm endpoint or load a BplBrowserCompiler.compileToHostedWasm bundle.";

  function getHostAdapter(globalObject) {
    return globalObject.BplWasmHostAdapter;
  }

  function getBrowserCompiler(globalObject) {
    const compiler = globalObject.BplBrowserCompiler;
    if (
      compiler &&
      typeof compiler.compileToHostedWasm === "function"
    ) {
      return compiler;
    }
    return undefined;
  }

  function detectBrowserWasmCapabilities(globalObject = global) {
    const runtimeMissing = [];
    const compilerMissing = [];
    const webAssembly = globalObject.WebAssembly;
    const hostAdapter = getHostAdapter(globalObject);

    if (
      !webAssembly ||
      typeof webAssembly.instantiate !== "function"
    ) {
      runtimeMissing.push("WebAssembly.instantiate");
    }
    if (typeof globalObject.TextEncoder !== "function") {
      runtimeMissing.push("TextEncoder");
    }
    if (typeof globalObject.TextDecoder !== "function") {
      runtimeMissing.push("TextDecoder");
    }
    if (
      !hostAdapter ||
      typeof hostAdapter.runHostedWasmInBrowser !== "function"
    ) {
      runtimeMissing.push("BplWasmHostAdapter.runHostedWasmInBrowser");
    }
    if (!getBrowserCompiler(globalObject)) {
      compilerMissing.push("BplBrowserCompiler.compileToHostedWasm");
    }

    return {
      canRunHostedWasm: runtimeMissing.length === 0,
      canCompileBplInBrowser:
        runtimeMissing.length === 0 && compilerMissing.length === 0,
      missing: [...runtimeMissing, ...compilerMissing],
    };
  }

  function formatBrowserWasmCapabilitySummary(capabilities) {
    const lines = [
      `Browser wasm runtime: ${
        capabilities.canRunHostedWasm ? "available" : "unavailable"
      }`,
      `Browser BPL compiler: ${
        capabilities.canCompileBplInBrowser ? "available" : "unavailable"
      }`,
    ];

    if (capabilities.missing.length > 0) {
      lines.push(`Missing: ${capabilities.missing.join(", ")}`);
    }

    return lines.join("\n");
  }

  function formatHostedWasmRunReport(options) {
    const runResult = options.runResult;
    const imports =
      options.imports === undefined
        ? undefined
        : options.imports
            .map((entry) => `${entry.module}.${entry.name}`)
            .join("\n");
    return [
      `Compile mode: ${options.compileMode}`,
      options.capabilitySummary,
      "",
      `Return code: ${runResult.returnCode}`,
      options.wasmBytes === undefined
        ? undefined
        : `Wasm bytes: ${options.wasmBytes}`,
      imports === undefined
        ? undefined
        : imports
          ? `Imports:\n${imports}`
          : "Imports: none",
      "",
      "stdout:",
      runResult.stdout || "(empty)",
      "",
      "stderr:",
      runResult.stderr || "(empty)",
      runResult.error ? `\ntrap:\n${runResult.error}` : undefined,
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  function formatBrowserWasmFailureReport(options) {
    return [
      `WebAssembly run failed: ${options.errorMessage}`,
      "",
      options.capabilitySummary,
      "",
      `Browser-only fallback: ${
        options.fallbackError || "failed without an error message"
      }`,
    ].join("\n");
  }

  async function compileAndRunBplInBrowser(code, args = [], options = {}) {
    const argv = [...args];
    const globalObject = options.globalObject || global;
    const hostAdapter = options.hostAdapter || getHostAdapter(globalObject);
    const capabilities = detectBrowserWasmCapabilities(globalObject);
    if (!capabilities.canRunHostedWasm) {
      return {
        success: false,
        phase: "capability",
        error: `Browser hosted wasm runtime is unavailable. Missing: ${capabilities.missing.join(", ")}`,
      };
    }

    const compiler = getBrowserCompiler(globalObject);
    if (!compiler) {
      return {
        success: false,
        phase: "compile",
        error: BROWSER_COMPILER_UNAVAILABLE_MESSAGE,
      };
    }

    const compileResult = await compiler.compileToHostedWasm({
      code,
      args: [...argv],
    });
    if (!compileResult || compileResult.success === false) {
      return {
        success: false,
        phase: "compile",
        error:
          compileResult?.error ||
          "Browser BPL compiler failed without an error message.",
      };
    }
    if (typeof compileResult.wasmBase64 !== "string") {
      return {
        success: false,
        phase: "compile",
        error: "Browser BPL compiler did not return wasmBase64.",
      };
    }
    if (
      !hostAdapter ||
      typeof hostAdapter.runHostedWasmInBrowser !== "function"
    ) {
      return {
        success: false,
        phase: "capability",
        error:
          "Browser hosted wasm runtime is unavailable. Missing: BplWasmHostAdapter.runHostedWasmInBrowser",
      };
    }

    const runResult = await hostAdapter.runHostedWasmInBrowser(
      compileResult.wasmBase64,
      [...argv],
    );
    return {
      success: !runResult.trapped,
      phase: "run",
      runResult,
    };
  }

  const api = {
    BROWSER_COMPILER_UNAVAILABLE_MESSAGE,
    detectBrowserWasmCapabilities,
    formatBrowserWasmCapabilitySummary,
    formatHostedWasmRunReport,
    formatBrowserWasmFailureReport,
    compileAndRunBplInBrowser,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.BplBrowserWasmRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
