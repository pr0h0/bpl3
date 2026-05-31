export const CLI_JSON_SCHEMA_VERSION = 1 as const;

export const CLI_JSON_CHECKS = {
  build: "build",
  clean: "clean",
  doctor: "doctor",
  packageCacheList: "package-cache-list",
  packageList: "package-list",
  packageListTree: "package-list-tree",
  toolchain: "toolchain",
} as const;

export function createJsonReport<
  Check extends string,
  Payload extends Record<string, unknown>,
>(
  check: Check,
  success: boolean,
  payload: Payload,
): {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: Check;
  success: boolean;
} & Payload {
  return {
    schemaVersion: CLI_JSON_SCHEMA_VERSION,
    check,
    success,
    ...payload,
  };
}
