export const TIMEOUT_ENV_DEFAULTS = {
  BPL_COMPILE_DRIVER_TIMEOUT_MS: 600000,
  BPL_CLEAN_GIT_TIMEOUT_MS: 5000,
  BPL_PACKAGE_TOOL_TIMEOUT_MS: 300000,
  BPL_OBJECT_SYMBOL_TIMEOUT_MS: 30000,
  BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS: 30000,
  BPL_WASM_LINKER_PROBE_TIMEOUT_MS: 5000,
} as const;

export interface TimeoutEnvDiagnostic {
  name: string;
  raw: string | null;
  isValid: boolean;
  defaultMs: number | null;
  effectiveMs: number | null;
  fallbackAction: string;
}

interface TimeoutEnvConfig {
  name: string;
  defaultMs: number | null;
  fallbackAction: string;
}

const TIMEOUT_ENV_CONFIGS: TimeoutEnvConfig[] = [
  {
    name: "BPL_COMPILE_DRIVER_TIMEOUT_MS",
    defaultMs: TIMEOUT_ENV_DEFAULTS.BPL_COMPILE_DRIVER_TIMEOUT_MS,
    fallbackAction: `using ${TIMEOUT_ENV_DEFAULTS.BPL_COMPILE_DRIVER_TIMEOUT_MS}ms`,
  },
  {
    name: "BPL_CLEAN_GIT_TIMEOUT_MS",
    defaultMs: TIMEOUT_ENV_DEFAULTS.BPL_CLEAN_GIT_TIMEOUT_MS,
    fallbackAction: `using ${TIMEOUT_ENV_DEFAULTS.BPL_CLEAN_GIT_TIMEOUT_MS}ms`,
  },
  {
    name: "BPL_PACKAGE_TOOL_TIMEOUT_MS",
    defaultMs: TIMEOUT_ENV_DEFAULTS.BPL_PACKAGE_TOOL_TIMEOUT_MS,
    fallbackAction: `using ${TIMEOUT_ENV_DEFAULTS.BPL_PACKAGE_TOOL_TIMEOUT_MS}ms`,
  },
  {
    name: "BPL_OBJECT_SYMBOL_TIMEOUT_MS",
    defaultMs: TIMEOUT_ENV_DEFAULTS.BPL_OBJECT_SYMBOL_TIMEOUT_MS,
    fallbackAction: `using ${TIMEOUT_ENV_DEFAULTS.BPL_OBJECT_SYMBOL_TIMEOUT_MS}ms`,
  },
  {
    name: "BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS",
    defaultMs: TIMEOUT_ENV_DEFAULTS.BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS,
    fallbackAction: `using ${TIMEOUT_ENV_DEFAULTS.BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS}ms`,
  },
  {
    name: "BPL_RUN_TIMEOUT_MS",
    defaultMs: null,
    fallbackAction: "running without timeout",
  },
  {
    name: "BPL_WASM_LINKER_PROBE_TIMEOUT_MS",
    defaultMs: TIMEOUT_ENV_DEFAULTS.BPL_WASM_LINKER_PROBE_TIMEOUT_MS,
    fallbackAction: `using ${TIMEOUT_ENV_DEFAULTS.BPL_WASM_LINKER_PROBE_TIMEOUT_MS}ms`,
  },
];

export function formatInvalidPositiveIntegerEnv(
  name: string,
  raw: string,
  fallbackAction: string,
): string {
  return `Ignoring invalid ${name}=${raw}; expected a positive integer; ${fallbackAction}`;
}

export function getPositiveIntegerEnv(
  name: string,
  defaultValue: number,
  options: {
    env?: NodeJS.ProcessEnv;
    warn?: (message: string) => void;
  } = {},
): number {
  const env = options.env ?? process.env;
  const raw = env[name];
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  options.warn?.(
    formatInvalidPositiveIntegerEnv(name, raw, `using ${defaultValue}ms`),
  );
  return defaultValue;
}

export function getOptionalPositiveIntegerEnv(
  name: string,
  options: {
    env?: NodeJS.ProcessEnv;
    warn?: (message: string) => void;
    fallbackAction: string;
  },
): number | undefined {
  const env = options.env ?? process.env;
  const raw = env[name];
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  options.warn?.(
    formatInvalidPositiveIntegerEnv(name, raw, options.fallbackAction),
  );
  return undefined;
}

export function getTimeoutEnvDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): TimeoutEnvDiagnostic[] {
  return TIMEOUT_ENV_CONFIGS.map((config) =>
    describeTimeoutEnv(config, env),
  );
}

function describeTimeoutEnv(
  config: TimeoutEnvConfig,
  env: NodeJS.ProcessEnv,
): TimeoutEnvDiagnostic {
  const raw = env[config.name];
  if (!raw) {
    return {
      name: config.name,
      raw: null,
      isValid: true,
      defaultMs: config.defaultMs,
      effectiveMs: config.defaultMs,
      fallbackAction: config.fallbackAction,
    };
  }

  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return {
      name: config.name,
      raw,
      isValid: true,
      defaultMs: config.defaultMs,
      effectiveMs: parsed,
      fallbackAction: config.fallbackAction,
    };
  }

  return {
    name: config.name,
    raw,
    isValid: false,
    defaultMs: config.defaultMs,
    effectiveMs: config.defaultMs,
    fallbackAction: config.fallbackAction,
  };
}
