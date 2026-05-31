import {
  findWasmLinker,
  formatRequiredWasmLinkerError,
  getWasmLinkerCandidates,
  getWasmLinkerProbeTimeoutMs,
} from "../../cli/WasmToolchain";

export type PlaygroundWasmLinkerResult =
  | { ok: true; linker: string }
  | { ok: false; error: string };

interface ResolvePlaygroundWasmLinkerOptions {
  env?: NodeJS.ProcessEnv;
  candidates?: string[];
  timeoutMs?: number;
  warn?: (message: string) => void;
}

export function resolvePlaygroundWasmLinker(
  options: ResolvePlaygroundWasmLinkerOptions = {},
): PlaygroundWasmLinkerResult {
  const env = options.env ?? process.env;
  const candidates = options.candidates ?? getWasmLinkerCandidates(env);
  const timeoutMs =
    options.timeoutMs ?? getWasmLinkerProbeTimeoutMs(env, options.warn);
  const linker = findWasmLinker(candidates, timeoutMs);

  if (!linker) {
    return {
      ok: false,
      error: formatRequiredWasmLinkerError(candidates),
    };
  }

  return { ok: true, linker };
}

export function createPlaygroundWasmBuildEnv(
  env: NodeJS.ProcessEnv,
  linker: string,
  repoRoot?: string,
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(repoRoot ? { BPL_HOME: repoRoot } : {}),
    NO_COLOR: "1",
    WASM_LD: linker,
  };
}
