import { spawnSync } from "child_process";

export const DEFAULT_WASM_LINKER_CANDIDATES: string[] = [
  "wasm-ld",
  "wasm-ld-18",
  "wasm-ld-17",
  "wasm-ld-16",
  "ld.lld",
];

const DEFAULT_WASM_LINKER_PROBE_TIMEOUT_MS = 5000;

export function getWasmLinkerCandidates(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates = [...DEFAULT_WASM_LINKER_CANDIDATES];
  const envCandidate = env.WASM_LD;

  if (envCandidate && !candidates.includes(envCandidate)) {
    candidates.unshift(envCandidate);
  }

  return candidates;
}

export function getWasmLinkerProbeTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  warn?: (message: string) => void,
): number {
  const raw = env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;
  if (!raw) return DEFAULT_WASM_LINKER_PROBE_TIMEOUT_MS;

  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  warn?.(
    `Ignoring invalid BPL_WASM_LINKER_PROBE_TIMEOUT_MS=${raw}; using ${DEFAULT_WASM_LINKER_PROBE_TIMEOUT_MS}ms`,
  );
  return DEFAULT_WASM_LINKER_PROBE_TIMEOUT_MS;
}

export function isUsableWasmLinker(
  candidate: string,
  timeoutMs = getWasmLinkerProbeTimeoutMs(),
): boolean {
  const result = spawnSync(candidate, ["--version"], {
    stdio: "ignore",
    timeout: timeoutMs,
  });
  return result.status === 0;
}

export function findWasmLinker(
  candidates = getWasmLinkerCandidates(),
  timeoutMs = getWasmLinkerProbeTimeoutMs(),
): string | undefined {
  return candidates.find((candidate) =>
    isUsableWasmLinker(candidate, timeoutMs),
  );
}

export function formatRequiredWasmLinkerError(
  candidates = getWasmLinkerCandidates(),
): string {
  return [
    "BPL_REQUIRE_WASM_LD=1 requires a wasm linker.",
    `Checked candidates: ${candidates.join(", ")}`,
    "Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
  ].join("\n");
}

export function formatOptionalWasmRuntimeSkipMessage(
  candidates = getWasmLinkerCandidates(),
): string {
  return [
    "Skipping wasm runtime execution: no usable standalone wasm linker found.",
    "This is an optional prerequisite skip, not a successful wasm execution.",
    `Checked candidates: ${candidates.join(", ")}`,
    "Set BPL_REQUIRE_WASM_LD=1 to fail instead of skipping.",
    "Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
  ].join("\n");
}
