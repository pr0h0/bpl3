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
