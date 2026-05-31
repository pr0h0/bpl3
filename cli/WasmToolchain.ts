import { spawnSync } from "child_process";
import { getPositiveIntegerEnv } from "../compiler/common/Env";

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
  const envCandidate = env.WASM_LD;

  if (envCandidate) {
    return [envCandidate];
  }

  return [...DEFAULT_WASM_LINKER_CANDIDATES];
}

export function getWasmLinkerProbeTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  warn?: (message: string) => void,
): number {
  return getPositiveIntegerEnv(
    "BPL_WASM_LINKER_PROBE_TIMEOUT_MS",
    DEFAULT_WASM_LINKER_PROBE_TIMEOUT_MS,
    {
      env,
      warn,
    },
  );
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
