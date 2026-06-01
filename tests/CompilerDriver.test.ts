import { afterEach, describe, expect, test } from "bun:test";

import {
  getCompilerDriver,
  isWasmTarget,
} from "../compiler/common/CompilerDriver";

describe("Compiler driver target selection", () => {
  const originalBplCc = process.env.BPL_CC;
  const originalBplWasmCc = process.env.BPL_WASM_CC;

  afterEach(() => {
    restoreEnv("BPL_CC", originalBplCc);
    restoreEnv("BPL_WASM_CC", originalBplWasmCc);
  });

  test("selects the wasm compiler driver only for wasm target architectures", () => {
    process.env.BPL_CC = "native-clang";
    process.env.BPL_WASM_CC = "wasm-clang";

    expect(isWasmTarget("wasm32-unknown-unknown")).toBe(true);
    expect(isWasmTarget("wasm64-unknown-unknown")).toBe(true);
    expect(getCompilerDriver("wasm32-unknown-unknown")).toBe("wasm-clang");

    expect(isWasmTarget("notwasm32-unknown-unknown")).toBe(false);
    expect(isWasmTarget("x86_64-unknown-wasmish")).toBe(false);
    expect(getCompilerDriver("notwasm32-unknown-unknown")).toBe(
      "native-clang",
    );
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
