export function isWasmTarget(target?: string): boolean {
  return target?.toLowerCase().includes("wasm") ?? false;
}

export function getCompilerDriver(target?: string): string {
  if (isWasmTarget(target)) {
    return process.env.BPL_WASM_CC || process.env.WASM_CC || "clang";
  }

  return process.env.BPL_CC || process.env.CC || "clang";
}
