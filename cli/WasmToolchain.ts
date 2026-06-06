import { spawnSync } from "child_process";
import { accessSync, constants, statSync } from "fs";
import { delimiter, isAbsolute, join, resolve, sep } from "path";
import {
  getPositiveIntegerEnv,
  TIMEOUT_ENV_DEFAULTS,
} from "../compiler/common/Env";

export const DEFAULT_WASM_LINKER_CANDIDATES: string[] = [
  "wasm-ld",
  "wasm-ld-18",
  "wasm-ld-17",
  "wasm-ld-16",
  "ld.lld",
];

const DEFAULT_WASM_LINKER_PROBE_TIMEOUT_MS =
  TIMEOUT_ENV_DEFAULTS.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;

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
  const executable = resolveExecutablePath(candidate);
  if (!executable) return false;

  const result = spawnSync(executable, ["--version"], {
    stdio: "ignore",
    timeout: timeoutMs,
  });
  return result.status === 0;
}

function resolveExecutablePath(command: string): string | undefined {
  if (isAbsolute(command) || command.includes(sep)) {
    const resolved = resolve(command);
    return isExecutableFile(resolved) ? resolved : undefined;
  }

  for (const entry of process.env.PATH?.split(delimiter) ?? []) {
    if (!entry) continue;
    const candidate = join(entry, command);
    if (isExecutableFile(candidate)) return candidate;
  }

  return undefined;
}

function isExecutableFile(filePath: string): boolean {
  try {
    if (!statSync(filePath).isFile()) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
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
    "Reproduce required-linker failures: BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
    "Inspect toolchain state: bun index.ts doctor --json",
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
    "Reproduce as a hard failure: BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
    "Inspect toolchain state: bun index.ts doctor --json",
    "Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
  ].join("\n");
}
