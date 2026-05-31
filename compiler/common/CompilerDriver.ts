import { Logger } from "./Logger";
import { getPositiveIntegerEnv } from "./Env";

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
  return getPositiveIntegerEnv(
    "BPL_COMPILE_DRIVER_TIMEOUT_MS",
    COMPILE_DRIVER_TIMEOUT_MS,
    {
      warn: (message) => compilerDriverLog.warn(message),
    },
  );
}
