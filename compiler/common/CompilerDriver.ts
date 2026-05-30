import { Logger } from "./Logger";

const compilerDriverLog = new Logger("CompilerDriver");
const COMPILE_DRIVER_TIMEOUT_MS = 600000;

export function isWasmTarget(target?: string): boolean {
  return target?.toLowerCase().includes("wasm") ?? false;
}

export function getCompilerDriver(target?: string): string {
  if (isWasmTarget(target)) {
    return process.env.BPL_WASM_CC || process.env.WASM_CC || "clang";
  }

  return process.env.BPL_CC || process.env.CC || "clang";
}

export function getCompilerDriverTimeoutMs(): number {
  const raw = process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;
  if (!raw) return COMPILE_DRIVER_TIMEOUT_MS;

  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  compilerDriverLog.warn(
    `Ignoring invalid BPL_COMPILE_DRIVER_TIMEOUT_MS=${raw}; using ${COMPILE_DRIVER_TIMEOUT_MS}ms`,
  );
  return COMPILE_DRIVER_TIMEOUT_MS;
}
