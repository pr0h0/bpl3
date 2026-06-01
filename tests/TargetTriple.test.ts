import { describe, expect, test } from "bun:test";

import {
  hasHostedWasmRuntimeComponent,
  isWasmTargetArch,
  parseTargetTriple,
  targetHasAnyComponent,
  targetHasComponent,
} from "../compiler/common/TargetTriple";

describe("target triple helpers", () => {
  test("parses target arch and components with strict malformed-target rejection", () => {
    const parsed = parseTargetTriple("X86_64-PC-LINUX-GNU");

    expect(parsed?.arch).toBe("x86_64");
    expect(parsed?.normalized).toBe("x86_64-pc-linux-gnu");
    expect(targetHasComponent(parsed, "linux")).toBe(true);
    expect(targetHasAnyComponent(parsed, ["darwin", "linux"])).toBe(true);

    expect(parseTargetTriple("")).toBeUndefined();
    expect(parseTargetTriple(" x86_64-pc-linux-gnu ")).toBeUndefined();
    expect(parseTargetTriple("x86_64--linux")).toBeUndefined();
    expect(parseTargetTriple("wasm32-")).toBeUndefined();
  });

  test("detects wasm targets by architecture component only", () => {
    expect(isWasmTargetArch("wasm32-unknown-unknown")).toBe(true);
    expect(isWasmTargetArch("wasm64-unknown-unknown")).toBe(true);
    expect(isWasmTargetArch("notwasm32-unknown-unknown")).toBe(false);
    expect(isWasmTargetArch("x86_64-unknown-wasmish")).toBe(false);
    expect(isWasmTargetArch("wasm32-")).toBe(false);
  });

  test("detects hosted wasm runtime components without substring matches", () => {
    expect(hasHostedWasmRuntimeComponent("wasm32-wasi")).toBe(true);
    expect(hasHostedWasmRuntimeComponent("wasm32-wasip1")).toBe(true);
    expect(hasHostedWasmRuntimeComponent("wasm32-unknown-emscripten")).toBe(
      true,
    );

    expect(hasHostedWasmRuntimeComponent("wasm32-unknown-unknown")).toBe(false);
    expect(hasHostedWasmRuntimeComponent("wasm32-notwasi")).toBe(false);
    expect(hasHostedWasmRuntimeComponent("wasm32-unknown-notemscripten")).toBe(
      false,
    );
  });
});
