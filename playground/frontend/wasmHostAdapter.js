(function (global) {
  "use strict";

  const HOSTED_WASM_ENV_IMPORTS = Object.freeze([
    "__bpl_host_write",
    "__bpl_host_exit",
    "__bpl_host_argc",
    "__bpl_host_argv_len",
    "__bpl_host_argv_copy",
    "__bpl_host_error",
  ]);

  function assertHostedWasmEnvImports(env) {
    const missing = HOSTED_WASM_ENV_IMPORTS.filter(
      (importName) => typeof env[importName] !== "function",
    );

    if (missing.length > 0) {
      throw new Error(
        `Hosted wasm env import contract mismatch: missing ${missing.join(", ")}`,
      );
    }
  }

  function decodeBase64Bytes(base64) {
    const binary = global.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function createHostedWasmBrowserHost(argv) {
    const encoder = new global.TextEncoder();
    const decoder = new global.TextDecoder();
    const encodedArgs = ["program", ...(argv || [])].map((arg) =>
      encoder.encode(String(arg)),
    );
    let exports;
    let stdout = "";
    let stderr = "";
    let returnCode = null;
    let trapped = false;
    let error = "";

    class WasmExit extends Error {
      constructor(code) {
        super(`wasm exit(${code})`);
        this.code = code;
      }
    }

    const getMemory = () => {
      if (!(exports?.memory instanceof global.WebAssembly.Memory)) {
        throw new Error("Wasm module did not export memory.");
      }
      return exports.memory;
    };

    const readBytes = (ptr, len) =>
      new Uint8Array(getMemory().buffer, ptr, len);

    const readString = (ptr) => {
      if (!ptr) return null;
      const memory = new Uint8Array(getMemory().buffer);
      let end = ptr;
      while (end < memory.length && memory[end] !== 0) {
        end++;
      }
      return decoder.decode(memory.subarray(ptr, end));
    };

    const reportUnavailableStdio = (name, detail) => {
      stderr += `Browser wasm stdio import ${name} is unavailable`;
      if (detail) stderr += ` (${detail})`;
      stderr += ".\n";
    };

    const host = {
      env: {
        __bpl_host_write(fd, ptr, len) {
          const text = decoder.decode(readBytes(ptr, len));
          if (fd === 2) {
            stderr += text;
          } else {
            stdout += text;
          }
        },
        __bpl_host_exit(code) {
          throw new WasmExit(code);
        },
        __bpl_host_argc() {
          return encodedArgs.length;
        },
        __bpl_host_argv_len(index) {
          return encodedArgs[index]?.length ?? -1;
        },
        __bpl_host_argv_copy(index, ptr) {
          const arg = encodedArgs[index];
          if (arg) {
            readBytes(ptr, arg.length).set(arg);
          }
        },
        __bpl_host_error(code, detailPtr, funcPtr, line, col) {
          stderr += `BPL runtime error ${code}`;
          const detail = readString(detailPtr);
          const func = readString(funcPtr);
          if (detail) stderr += ` ${detail}`;
          if (func) stderr += ` in ${func}`;
          if (line || col) stderr += ` at ${line}:${col}`;
          stderr += "\n";
        },
        scanf(formatPtr) {
          reportUnavailableStdio("scanf", readString(formatPtr));
          return -1;
        },
        gets(bufferPtr) {
          if (bufferPtr) {
            readBytes(bufferPtr, 1)[0] = 0;
          }
          reportUnavailableStdio("gets");
          return 0;
        },
      },
      imports: undefined,
      attach(moduleExports) {
        exports = moduleExports;
      },
      setReturnCode(code) {
        returnCode = code;
      },
      captureException(caught) {
        if (caught instanceof WasmExit) {
          returnCode = caught.code;
          return;
        }

        trapped = true;
        error = caught?.message || String(caught);
      },
      result() {
        return { stdout, stderr, returnCode, trapped, error };
      },
    };

    host.imports = { env: host.env };
    assertHostedWasmEnvImports(host.env);
    return host;
  }

  async function runHostedWasmInBrowser(wasmBase64, argv) {
    const host = createHostedWasmBrowserHost(argv);
    const instantiated = await global.WebAssembly.instantiate(
      decodeBase64Bytes(wasmBase64),
      host.imports,
    );
    const instance =
      instantiated instanceof global.WebAssembly.Instance
        ? instantiated
        : instantiated.instance;
    host.attach(instance.exports);

    try {
      const main = instance.exports.main;
      if (typeof main !== "function") {
        throw new Error("Wasm module did not export main.");
      }
      host.setReturnCode(main(0, 0));
    } catch (caught) {
      host.captureException(caught);
    }

    return host.result();
  }

  const api = {
    HOSTED_WASM_ENV_IMPORTS,
    assertHostedWasmEnvImports,
    decodeBase64Bytes,
    createHostedWasmBrowserHost,
    runHostedWasmInBrowser,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.BplWasmHostAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
